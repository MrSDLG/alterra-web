import { reticle as makeReticle, triOutline, hoverShape } from './util.js';

const TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
const FAST = !document.documentElement.classList.contains('lite');
const HOME = [140, 22];
const SPIN = 4;
const LABEL_ZOOM = 5.2;
const ICON = [.62, .84, 1.16];
const iconScale = z => z <= 5 ? ICON[0] + (Math.max(z, 1) - 1) * (ICON[1] - ICON[0]) / 4 : z <= 9 ? ICON[1] + (z - 5) * (ICON[2] - ICON[1]) / 4 : ICON[2];
const RAD = Math.PI / 180;

function triangle(size, fill, stroke, line) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const m = size * 0.16;
  g.beginPath();
  g.moveTo(size / 2, m);
  g.lineTo(size - m, size - m * 1.5);
  g.lineTo(m, size - m * 1.5);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = line;
  g.strokeStyle = stroke;
  g.stroke();
  if (fill) { g.fillStyle = fill; g.fill(); }
  return g.getImageData(0, 0, size, size);
}

const unit = (lat, lon) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];

export class GlobeMap {
  constructor(el, { rows, onPick, onOpen, onHover }) {
    this.el = el;
    this.rows = rows;
    this.onPick = onPick;
    this.onOpen = onOpen;
    this.onHover = onHover;
    this.vec = rows.map(r => unit(r.lat, r.lon));
    this.vis = new Uint8Array(rows.length).fill(1);
    this.byElev = rows.map((_, i) => i).sort((a, b) => (rows[b].elev ?? 0) - (rows[a].elev ?? 0));
    this.sel = null;
    this.hover = null;
    this.pool = [];
    this.labelAt = 0;
    this.labelTimer = 0;
    this.lastTouch = 0;
    this.over = false;
    this.dataTimer = 0;
    this.map = new maplibregl.Map({
      container: el, center: HOME, zoom: 1.7, attributionControl: false, pixelRatio: Math.min(window.devicePixelRatio || 1, FAST ? 2.5 : 1.5), fadeDuration: FAST ? 250 : 0, canvasContextAttributes: { antialias: FAST }, dragRotate: false, pitchWithRotate: false, maxPitch: 0, ...(FAST ? {} : { maxTileCacheSize: 80 }),
      style: {
        version: 8,
        projection: { type: 'globe' },
        sky: { 'atmosphere-blend': 0 },
        sources: { sat: { type: 'raster', tileSize: 256, maxzoom: 13, tiles: [TILES] } },
        layers: [{ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': 0.92, 'raster-saturation': -0.05, 'raster-fade-duration': FAST ? 250 : 0 } }],
      },
    });
    this.labels = document.createElement('div');
    this.labels.className = 'mlabels';
    el.parentElement.append(this.labels);
    this.hoverEl = hoverShape();
    this.labels.append(this.hoverEl);
    this.marker = this.reticle();
    this.map.on('load', () => this.init());
  }

  get z() { return this.map.getZoom(); }

  init() {
    const map = this.map;
    map.addImage('tri-cool', triangle(40, '#4fa8c9', 'rgba(2,9,17,.85)', 5), { pixelRatio: 2 });
    map.addImage('tri-hot', triangle(56, '#ff5a4a', 'rgba(2,9,17,.85)', 6), { pixelRatio: 2 });
    this.fc = {
      type: 'FeatureCollection',
      features: this.rows.map(r => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: { tier: r.tier, vis: true } })),
    };
    map.addSource('volcanoes', { type: 'geojson', data: this.fc });
    const size = ['interpolate', ['linear'], ['zoom'], 1, ICON[0], 5, ICON[1], 9, ICON[2]];
    map.addLayer({ id: 'faint', type: 'circle', source: 'volcanoes', filter: ['==', ['get', 'vis'], false], paint: { 'circle-radius': 1.6, 'circle-color': 'rgba(160,190,205,.4)' } });
    map.addLayer({ id: 'halo', type: 'circle', source: 'volcanoes', filter: ['all', ['==', ['get', 'vis'], true], ['==', ['get', 'tier'], 0]], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 9, 6, 24], 'circle-color': 'rgba(255,90,74,.3)', 'circle-blur': 0.9 } });
    map.addLayer({
      id: 'dots', type: 'symbol', source: 'volcanoes', filter: ['==', ['get', 'vis'], true],
      layout: { 'icon-image': ['case', ['==', ['get', 'tier'], 0], 'tri-hot', 'tri-cool'], 'icon-size': size, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['case', ['==', ['get', 'tier'], 0], 1, 0] },
    });

    let queued = false, at = null;
    map.on('mousemove', e => {
      at = e.point;
      if (queued || map.isMoving()) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; this.setHover(this.hit(at), at.x, at.y); });
    });
    map.on('mouseout', () => this.setHover(null, 0, 0));
    map.on('click', e => { const r = this.hit(e.point); if (r && this.onPick) this.onPick(r); });
    map.doubleClickZoom.disable();
    map.on('dblclick', e => {
      const r = this.hit(e.point);
      if (r && this.onOpen) this.onOpen(r);
      else map.zoomTo(map.getZoom() + 1, { around: e.lngLat, duration: 300 });
    });
    map.on('movestart', e => { if (e.originalEvent) { this.lastTouch = performance.now(); this.setHover(null, 0, 0); } });
    map.on('move', () => this.queueLabels());
    map.on('moveend', () => this.queueLabels(true));
    this.el.addEventListener('pointerenter', () => { this.over = true; });
    this.el.addEventListener('pointerleave', () => { this.over = false; });
    if (this.visibleSet) this.setVisible(this.visibleSet);
    this.spin(performance.now());
    this.queueLabels(true);
  }

  // nearest visible volcano within a few pixels, found by angles instead of asking the renderer
  hit(p) {
    const ll = this.map.unproject([p.x, p.y]);
    if (!ll || !isFinite(ll.lat) || !isFinite(ll.lng)) return null;
    const u = unit(ll.lat, ll.lng);
    const ppr = (512 * 2 ** this.map.getZoom()) / (2 * Math.PI);
    const near = Math.cos(Math.min(1, 40 / ppr));
    let best = null, bd = 144;
    for (let i = 0; i < this.vec.length; i++) {
      if (!this.vis[i]) continue;
      const v = this.vec[i];
      if (v[0] * u[0] + v[1] * u[1] + v[2] * u[2] < near) continue;
      const r = this.rows[i], q = this.map.project([r.lon, r.lat]);
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  setHover(row, x, y) {
    if (row !== this.hover) {
      this.hover = row;
      this.map.getCanvas().style.cursor = row ? 'pointer' : '';
      this.placeHover();
      if (this.onHover) this.onHover(row, x, y);
    } else if (row && this.onHover) this.onHover(row, x, y);
  }

  placeHover() {
    const r = this.hover;
    this.hoverEl.hidden = !r;
    if (!r) return;
    const p = this.map.project([r.lon, r.lat]);
    const s = iconScale(this.map.getZoom()), B = (r.tier === 0 ? 28 : 20) * s;
    this.hoverEl.path.setAttribute('d', triOutline([[0, -.34 * B], [.34 * B, .26 * B], [-.34 * B, .26 * B]], 1 + 1.4 * s));
    this.hoverEl.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }

  setVisible(set) {
    this.visibleSet = set;
    this.rows.forEach((r, i) => { this.vis[i] = !set || set.has(r.i) ? 1 : 0; });
    if (!this.fc) return;
    clearTimeout(this.dataTimer);
    this.dataTimer = setTimeout(() => {
      this.fc.features.forEach((f, i) => { f.properties.vis = !!this.vis[i]; });
      this.map.getSource('volcanoes').setData(this.fc);
      this.queueLabels(true);
    }, FAST ? 60 : 180);
  }

  setSelected(row) {
    this.sel = row;
    if (!row) { this.marker.remove(); return; }
    this.marker.getElement().querySelector('.rname').textContent = row.name;
    this.marker.setLngLat([row.lon, row.lat]).addTo(this.map);
  }

  reticle() { return new maplibregl.Marker({ element: makeReticle(), anchor: 'center' }); }

  flyTo(lat, lon, zoom, ms = 1100, padRight = 0) {
    this.lastTouch = performance.now();
    this.map.flyTo({ center: [lon, lat], zoom, duration: ms, padding: { top: 0, bottom: 0, left: 0, right: padRight }, essential: true });
  }

  fit(rows, instant = false) {
    if (!rows.length) return;
    if (rows === this.rows) { this.reset(instant); return; }
    if (rows.length === 1) { this.flyTo(rows[0].lat, rows[0].lon, 8); return; }
    const mid = rows.reduce((a, r) => a + r.lon, 0) / rows.length;
    const off = r => ((r.lon - mid + 540) % 360) - 180;
    let lo = 1e9, hi = -1e9, la0 = 90, la1 = -90;
    rows.forEach(r => { lo = Math.min(lo, off(r)); hi = Math.max(hi, off(r)); la0 = Math.min(la0, r.lat); la1 = Math.max(la1, r.lat); });
    const cam = this.map.cameraForBounds([[mid + lo, la0], [mid + hi, la1]], { padding: 80, maxZoom: 9 });
    if (!cam) return;
    this.map.flyTo({ center: cam.center, zoom: cam.zoom, duration: instant ? 0 : 1100, padding: { top: 0, bottom: 0, left: 0, right: 0 }, essential: true });
  }

  homeZoom() {
    const h = this.el.clientHeight || 700, w = this.el.clientWidth || 1000;
    return Math.max(1, Math.min(2.8, Math.log2(0.8 * Math.min(h, w) * Math.PI / 512)));
  }

  reset(instant = false) {
    const cam = { center: HOME, zoom: this.homeZoom(), padding: { top: 0, bottom: 0, left: 0, right: 0 } };
    if (instant) this.map.jumpTo(cam); else this.map.flyTo({ ...cam, duration: 1200, essential: true });
  }

  zoomBy(dz) { this.lastTouch = performance.now(); this.map.easeTo({ zoom: this.map.getZoom() + dz, duration: 350 }); }

  resize() { this.map.resize(); this.queueLabels(true); }

  spin(t) {
    let spun = 0;
    const tick = now => {
      const dt = Math.min(0.1, (now - t) / 1000);
      if (dt < (FAST ? 0.001 : 0.04)) { requestAnimationFrame(tick); return; }
      t = now;
      const calm = now - this.lastTouch > 4000;
      if (!calm) spun = 0;
      const still = !this.sel && !this.over && calm && this.map.getZoom() < 3.5 && (FAST || spun < 40);
      if (still && this.el.offsetParent && !document.hidden) {
        const c = this.map.getCenter();
        this.map.jumpTo({ center: [c.lng + SPIN * dt, c.lat] });
        spun += dt;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // labels: every frame with acceleration; ~8 updates a second in lite mode, and one when it stops
  queueLabels(now = false) {
    if (this.hover) this.placeHover();
    if (this.labelTimer) return;
    if (!document.documentElement.classList.contains('lite')) {
      this.labelTimer = requestAnimationFrame(() => { this.labelTimer = 0; this.drawLabels(); });
      return;
    }
    const wait = now ? 0 : Math.max(0, 120 - (performance.now() - this.labelAt));
    this.labelTimer = setTimeout(() => { this.labelTimer = 0; this.labelAt = performance.now(); this.drawLabels(); }, wait);
  }

  drawLabels() {
    const use = [];
    const map = this.map;
    if (map.getZoom() >= LABEL_ZOOM) {
      const c = map.getCenter(), cu = unit(c.lat, c.lng);
      const ppr = (512 * 2 ** map.getZoom()) / (2 * Math.PI);
      const reach = Math.cos(Math.min(1.4, Math.hypot(this.el.clientWidth, this.el.clientHeight) / ppr * 0.6));
      const w = this.el.clientWidth, h = this.el.clientHeight, boxes = [];
      for (const i of this.byElev) {
        if (!this.vis[i] || this.rows[i] === this.sel) continue;
        const v = this.vec[i];
        if (v[0] * cu[0] + v[1] * cu[1] + v[2] * cu[2] < reach) continue;
        const r = this.rows[i], p = map.project([r.lon, r.lat]);
        if (p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) continue;
        const width = r.name.length * 8.2 + 8, x = p.x + 12, y = p.y - 9;
        if (boxes.some(b => x < b[0] + b[2] && x + width > b[0] && y < b[1] + 18 && y + 18 > b[1])) continue;
        boxes.push([x, y, width]);
        use.push([r, x, y]);
        if (use.length >= 60) break;
      }
    }
    while (this.pool.length < use.length) {
      const d = document.createElement('div');
      d.className = 'mlabel';
      this.labels.append(d);
      this.pool.push(d);
    }
    this.pool.forEach((d, k) => {
      const u = use[k];
      d.hidden = !u;
      if (!u) return;
      if (d._name !== u[0].name) { d.textContent = u[0].name; d._name = u[0].name; }
      d.style.transform = `translate(${u[1]}px, ${u[2]}px)`;
    });
  }
}
