import { TIERS } from './store.js';
import { reticle, triOutline, boxOutline, hoverShape } from './util.js';

const TILE = 256;
const MAX_TILE_Z = 13;
const MAX_ZOOM = 14;
const CACHE = 220;
const tileUrl = (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${z}/${y}/${x}.jpg`;

const wx = lon => (lon + 180) / 360;
const wy = lat => {
  const s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const ease = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function tri(g, x, y, s) {
  g.moveTo(x, y - s);
  g.lineTo(x + s * .95, y + s * .72);
  g.lineTo(x - s * .95, y + s * .72);
  g.closePath();
}

const lite = document.documentElement.classList.contains('lite');
const K = 2.2;
const tiles = new Map();
let inflight = 0;
let tileVer = 0;

function tile(z, x, y, wake) {
  const key = `${z}/${x}/${y}`;
  let t = tiles.get(key);
  if (t) { tiles.delete(key); tiles.set(key, t); return t; }
  if (inflight >= 14) return null;
  t = { img: new Image(), ok: false };
  tiles.set(key, t);
  inflight++;
  t.img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    const x = c.getContext('2d');
    x.drawImage(t.img, 0, 0, TILE, TILE);
    x.fillStyle = 'rgba(2,9,17,.42)';
    x.fillRect(0, 0, TILE, TILE);
    t.src = c;
    t.img = null;
    t.ok = true; tileVer++; inflight--; wake();
  };
  t.img.onerror = () => { inflight--; tiles.delete(key); };
  t.img.src = tileUrl(z, x, y);
  if (tiles.size > CACHE) tiles.delete(tiles.keys().next().value);
  return t;
}

export class WorldMap {
  constructor(canvas, { rows, onPick, onOpen, onHover, palette, halo }) {
    this.halo = !!halo;
    this.palette = palette || TIERS.map(t => t.color);
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.rows = rows;
    this.onPick = onPick;
    this.onOpen = onOpen;
    this.onHover = onHover;
    rows.forEach(r => { r.mx = wx(r.lon); r.my = wy(r.lat); });
    this.visible = null;
    this.sel = null;
    this.hover = null;
    this.cx = 0.5; this.cy = 0.5; this.z = 1; this.zt = 1;
    this.W = 0; this.H = 0; this.minZ = 0;
    this.fly = null; this.inert = null; this.anchor = null;
    this.running = false;
    this.last = 0;
    this.sig = '';
    this.visVer = 0;
    this.ov = document.createElement('div');
    this.ov.className = 'mlabels';
    canvas.parentElement.append(this.ov);
    this.selWrap = document.createElement('div');
    this.selWrap.className = 'rwrap';
    this.selWrap.hidden = true;
    this.selEl = reticle();
    this.selWrap.append(this.selEl);
    this.hoverEl = hoverShape();
    this.ov.append(this.hoverEl, this.selWrap);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bind();
  }

  get scale() { return TILE * 2 ** this.z; }
  sx(r) { return (r.mx - this.cx) * this.scale + this.W / 2; }
  sy(r) { return (r.my - this.cy) * this.scale + this.H / 2; }

  resize() {
    const b = this.cv.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const first = !this.W;
    this.W = b.width; this.H = b.height;
    this.q = 0;
    this.sig = '';
    this.minZ = Math.log2(Math.max(this.W, this.H) / TILE);
    if (first && this.pendingFit) { this.fit(this.pendingFit, true); this.pendingFit = null; }
    this.z = Math.max(this.z, this.minZ);
    this.zt = Math.max(this.zt, this.minZ);
    this.clampView();
    this.wake();
  }

  clampView() {
    const s = this.scale;
    const hx = this.W / 2 / s, hy = this.H / 2 / s;
    this.cx = hx * 2 >= 1 ? 0.5 : clamp(this.cx, hx, 1 - hx);
    this.cy = hy * 2 >= 1 ? 0.5 : clamp(this.cy, hy, 1 - hy);
  }

  setVisible(set) { this.visible = set; this.visVer++; this.wake(); }
  setSelected(row) { if (row !== this.sel) this.selAt = performance.now(); this.sel = row; this.wake(); }

  flyTo(lat, lon, zoom, ms = 1100, padRight = 0) {
    const z = clamp(zoom, this.minZ, MAX_ZOOM);
    const to = { cx: wx(lon) + padRight / 2 / (TILE * 2 ** z), cy: wy(lat), z };
    const from = { cx: this.cx, cy: this.cy, z: this.z };
    const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy);
    this.fly = { t0: performance.now(), ms, from, to, dip: clamp(dist * 9, 0, 3.2) };
    this.inert = null; this.anchor = null;
    this.wake();
  }

  jump(row, zoom) {
    this.fly = null;
    this.z = this.zt = clamp(zoom, this.minZ, MAX_ZOOM);
    this.cx = row.mx; this.cy = row.my;
    this.clampView(); this.wake();
  }

  fit(rows, instant = false) {
    if (!rows.length) return;
    if (!this.W) { this.pendingFit = rows; return; }
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    rows.forEach(r => { x0 = Math.min(x0, r.mx); x1 = Math.max(x1, r.mx); y0 = Math.min(y0, r.my); y1 = Math.max(y1, r.my); });
    const spanX = Math.max(x1 - x0, 1e-4), spanY = Math.max(y1 - y0, 1e-4);
    const z = clamp(Math.log2(Math.min(this.W / (spanX * TILE), this.H / (spanY * TILE))) - 0.35, this.minZ, rows.length === 1 ? 8 : 10);
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y0 + y1) / 2))) * 180 / Math.PI;
    const lon = ((x0 + x1) / 2) * 360 - 180;
    if (instant) {
      this.z = this.zt = z; this.cx = (x0 + x1) / 2; this.cy = (y0 + y1) / 2;
      this.clampView(); this.wake();
    } else this.flyTo(lat, lon, z, 1000);
  }

  reset() { this.fit(this.rows); }

  zoomBy(dz, mx = this.W / 2, my = this.H / 2) {
    this.fly = null;
    this.zt = clamp(this.zt + dz, this.minZ, MAX_ZOOM);
    this.anchor = this.anchorAt(mx, my);
    this.wake();
  }

  anchorAt(mx, my) {
    return { mx, my, ax: this.cx + (mx - this.W / 2) / this.scale, ay: this.cy + (my - this.H / 2) / this.scale };
  }

  bind() {
    const cv = this.cv;
    const pts = new Map();
    let drag = null, pinch = 0;
    const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.dragging = true;
      pts.set(e.pointerId, pos(e));
      this.fly = null; this.inert = null;
      if (this.anchor) this.anchor = this.anchorAt(...pos(e));
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false, vx: 0, vy: 0, t: performance.now() };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = null; }
    });
    cv.addEventListener('pointermove', e => {
      const [mx, my] = pos(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, [mx, my]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) { this.zoomBy(Math.log2(d / pinch), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); this.z = this.zt; }
        pinch = d;
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) {
          const now = performance.now(), dt = Math.max(1, now - drag.t);
          drag.vx = drag.vx * .6 + (e.movementX / dt) * .4;
          drag.vy = drag.vy * .6 + (e.movementY / dt) * .4;
          drag.t = now;
          this.cx -= e.movementX / this.scale; this.cy -= e.movementY / this.scale;
          this.clampView();
          if (this.anchor) this.anchor = this.anchorAt(mx, my);
          this.wake();
          this.setHover(null, mx, my);
          return;
        }
      }
      this.setHover(this.nearest(mx, my), mx, my);
    });
    const up = e => {
      this.dragging = false;
      this.wake();
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (!drag) return;
      const d = drag; drag = null;
      if (d.moved) {
        if (Math.hypot(d.vx, d.vy) > .05) { this.inert = { vx: d.vx, vy: d.vy }; this.wake(); }
        return;
      }
      const [mx, my] = pos(e);
      const hit = this.nearest(mx, my);
      if (hit && this.onPick) this.onPick(hit);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => this.setHover(null, 0, 0));
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const [mx, my] = pos(e);
      this.zoomBy(-e.deltaY * (e.ctrlKey ? .01 : .0022), mx, my);
    }, { passive: false });
    cv.addEventListener('dblclick', e => {
      const [mx, my] = pos(e);
      const hit = this.nearest(mx, my);
      if (hit && this.onOpen) this.onOpen(hit);
      else this.zoomBy(1, mx, my);
    });
  }

  nearest(mx, my) {
    let best = null, bd = 196;
    for (const r of this.rows) {
      if (this.visible && !this.visible.has(r.i)) continue;
      const dx = this.sx(r) - mx, dy = this.sy(r) - my;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  setHover(row, mx, my) {
    if (row !== this.hover) { this.hover = row; this.cv.style.cursor = row ? 'pointer' : 'grab'; this.placeOverlay(); }
    if (this.onHover) this.onHover(row, mx, my);
  }

  wake() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(t => this.tick(t));
  }

  tick(now) {
    const dt = Math.min(50, now - this.last);
    this.last = now;
    let busy = false;
    if (this.fly) {
      const f = this.fly, k = clamp((now - f.t0) / f.ms, 0, 1), e = ease(k);
      this.cx = f.from.cx + (f.to.cx - f.from.cx) * e;
      this.cy = f.from.cy + (f.to.cy - f.from.cy) * e;
      this.z = Math.max(this.minZ, f.from.z + (f.to.z - f.from.z) * e - f.dip * Math.sin(Math.PI * k));
      this.zt = this.z;
      this.clampView();
      if (k >= 1) { this.fly = null; this.z = this.zt = f.to.z; } else busy = true;
    } else {
      if (this.inert) {
        this.cx -= this.inert.vx * dt / this.scale;
        this.cy -= this.inert.vy * dt / this.scale;
        const decay = Math.exp(-dt / 240);
        this.inert.vx *= decay; this.inert.vy *= decay;
        if (Math.hypot(this.inert.vx, this.inert.vy) < .02) this.inert = null; else busy = true;
        this.clampView();
      }
      if (Math.abs(this.zt - this.z) > .002) {
        this.z += (this.zt - this.z) * (1 - Math.exp(-dt / 70));
        if (this.anchor) {
          const a = this.anchor, s = this.scale;
          this.cx = a.ax - (a.mx - this.W / 2) / s;
          this.cy = a.ay - (a.my - this.H / 2) / s;
        }
        this.clampView();
        busy = true;
      } else this.anchor = null;
    }
    this.moving = busy || !!this.dragging;
    if (!(lite && busy && this.cost > 20 && (this.flip = !this.flip))) this.paint();
    const live = this.cv.isConnected && this.cv.offsetParent;
    if (live && busy && !document.hidden) requestAnimationFrame(t => this.tick(t));
    else this.running = false;
  }

  paint() {
    const W = this.W, H = this.H;
    if (!W) return;
    const q = lite ? (this.moving ? .5 : 1) : Math.min(devicePixelRatio || 1, 1.5);
    if (q !== this.q) {
      this.q = q;
      this.cv.width = Math.round(W * q);
      this.cv.height = Math.round(H * q);
      this.g.setTransform(q, 0, 0, q, 0, 0);
      this.sig = '';
    }
    const sig = [this.cx, this.cy, this.z, W, H, tileVer, this.visVer, this.sel && this.sel.i, this.moving ? 1 : 0].join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      const t0 = performance.now();
      const g = this.g;
      g.imageSmoothingEnabled = !lite || !this.moving;
      g.fillStyle = '#050d15';
      g.fillRect(0, 0, W, H);
      this.paintTiles();
      if (this.sel) this.selBox = [this.sx(this.sel) + 30, this.sy(this.sel) - 16, this.sel.name.length * 11 + 70];
      this.rad = this.paintDots();
      this.cost = performance.now() - t0;
    }
    this.placeOverlay();
  }

  placeOverlay() {
    const s = this.sel, h = this.hover;
    const sx = s ? this.sx(s) : 0, sy = s ? this.sy(s) : 0;
    const showSel = !!s && sx > -90 && sy > -90 && sx < this.W + 90 && sy < this.H + 90;
    this.selWrap.hidden = !showSel;
    if (showSel) {
      if (this.selWrap._for !== s) { this.selWrap._for = s; this.selEl.querySelector('.rname').textContent = s.name; }
      this.selWrap.style.transform = `translate(${sx}px, ${sy}px)`;
    }
    const showHover = !!h && h !== s;
    this.hoverEl.hidden = !showHover;
    if (showHover) {
      const s = (this.rad || 2) * K * (this.halo && h.tier === 0 ? 1.35 : 1);
      this.hoverEl.path.setAttribute('d', this.small ? boxOutline(s * .8, 1.8) : triOutline([[0, -s], [s * .95, s * .72], [-s * .95, s * .72]], 2.6));
      this.hoverEl.style.transform = `translate(${this.sx(h)}px, ${this.sy(h)}px)`;
    }
  }

  paintTiles() {
    const g = this.g, W = this.W, H = this.H;
    const tz = clamp(Math.floor(this.z + .4), 0, MAX_TILE_Z);
    const f = 2 ** (this.z - tz), size = TILE * f, n = 2 ** tz;
    const Xc = this.cx * n * TILE, Yc = this.cy * n * TILE;
    const x0 = Math.max(0, Math.floor((Xc - W / 2 / f) / TILE)), x1 = Math.min(n - 1, Math.floor((Xc + W / 2 / f) / TILE));
    const y0 = Math.max(0, Math.floor((Yc - H / 2 / f) / TILE)), y1 = Math.min(n - 1, Math.floor((Yc + H / 2 / f) / TILE));
    const wake = () => this.wake();
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const dx = (tx * TILE - Xc) * f + W / 2, dy = (ty * TILE - Yc) * f + H / 2;
        const t = tile(tz, tx, ty, wake);
        if (t && t.ok) { g.drawImage(t.src, dx, dy, size + .6, size + .6); continue; }
        for (let d = 1; d <= 5 && tz - d >= 0; d++) {
          const p = tiles.get(`${tz - d}/${tx >> d}/${ty >> d}`);
          if (!p || !p.ok) continue;
          const part = TILE >> d;
          g.drawImage(p.src, (tx - ((tx >> d) << d)) * part, (ty - ((ty >> d) << d)) * part, part, part, dx, dy, size + .6, size + .6);
          break;
        }
      }
    }
  }

  paintDots() {
    const g = this.g, W = this.W, H = this.H, vis = this.visible;
    const scale = this.scale, cx = this.cx, cy = this.cy, hw = W / 2, hh = H / 2;
    const rad = clamp(1.7 + (this.z - 1) * .62, 1.8, 6.5);
    const on = [];
    const off = [];
    for (const r of this.rows) {
      const x = (r.mx - cx) * scale + hw, y = (r.my - cy) * scale + hh;
      if (x < -8 || y < -8 || x > W + 8 || y > H + 8) continue;
      r._x = x; r._y = y;
      (vis && !vis.has(r.i) ? off : on).push(r);
    }
    if (off.length && this.z < 7) {
      g.fillStyle = 'rgba(160,190,205,.35)';
      g.beginPath();
      for (const r of off) g.rect(r._x - .8, r._y - .8, 1.6, 1.6);
      g.fill();
    }
    const size = r => rad * K * (this.halo && r.tier === 0 ? 1.35 : 1);
    const small = this.small = rad * K < 4.6 || (lite && this.moving);
    if (this.halo && !(lite && this.moving)) {
      g.fillStyle = 'rgba(255,90,74,.24)';
      g.beginPath();
      for (const r of on) if (r.tier === 0) { g.moveTo(r._x + rad * 3.6, r._y); g.arc(r._x, r._y, rad * 3.6, 0, 6.2832); }
      g.fill();
    }
    if (small) {
      for (let t = this.palette.length - 1; t >= 0; t--) {
        g.fillStyle = this.palette[t];
        g.beginPath();
        for (const r of on) if (r.tier === t) { const q = size(r) * .8; g.rect(r._x - q, r._y - q, q * 2, q * 2); }
        g.fill();
      }
    } else {
      g.fillStyle = 'rgba(0,0,0,.65)';
      g.beginPath();
      for (const r of on) tri(g, r._x, r._y, size(r) + 1.6);
      g.fill();
      for (let t = this.palette.length - 1; t >= 0; t--) {
        g.fillStyle = this.palette[t];
        g.beginPath();
        for (const r of on) if (r.tier === t) tri(g, r._x, r._y, size(r));
        g.fill();
      }
    }
    if (this.z >= 5.2 && on.length && !(lite && this.moving)) this.paintLabels(on, rad);
    return rad;
  }

  paintLabels(on, rad) {
    const g = this.g;
    g.font = '600 13px "Chakra Petch", sans-serif';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const boxes = this.sel && this.selBox ? [[this.selBox[0], this.selBox[1], this.selBox[2]]] : [];
    const list = on.length > 90 ? on.slice().sort((a, b) => (b.elev ?? 0) - (a.elev ?? 0)).slice(0, 90) : on;
    for (const r of list) {
      if (r === this.sel) continue;
      const label = r.name.toUpperCase();
      const w = g.measureText(label).width;
      const x = r._x + rad + 6, y = r._y;
      if (boxes.some(b => x < b[0] + b[2] && x + w > b[0] && y - 8 < b[1] + 16 && y + 8 > b[1])) continue;
      boxes.push([x, y - 8, w]);
      g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 3;
      g.strokeText(label, x, y);
      g.fillStyle = '#e8f5fb';
      g.fillText(label, x, y);
    }
  }
}
