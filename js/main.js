import { load, data, filter, run, clearFilters, filterCount, detail, TIERS, SORTS, BANDS, lastText } from './store.js';
import { buildFilters } from './filters.js';
import { VList } from './list.js';
import { WorldMap } from './map.js';
import { GlobeMap } from './globe.js';
import { showDetail } from './detail.js';
import { renderAbout } from './about.js';
import { renderGame } from './game.js';
import { initAmbient } from './ambient.js';
import { reveal, wipe } from './motion.js';
import { initAudio, sfx, setMusic, setSfx, setVolume, onAudioChange, audioState } from './audio.js';
import { $, $$, esc, num, frame, yearLabel, coords, noPhoto } from './util.js';

const KEYS = {
  map: [['/', 'SEARCH'], ['SCROLL', 'ZOOM'], ['DRAG', 'MOVE'], ['CLICK', 'SELECT'], ['ENTER', 'OPEN']],
  list: [['/', 'SEARCH'], ['↑ ↓', 'BROWSE'], ['ENTER', 'OPEN']],
  detail: [['ESC', 'BACK'], ['← →', 'PREVIOUS / NEXT']],
  about: [],
  game: [],
};
const views = { db: $('#view-db'), detail: $('#view-detail'), about: $('#view-about'), game: $('#view-game') };
const q = $('#q');
const suggest = $('#suggest');
const pick = $('#pick');
let results = [];
let list, map, filtersUi;
let mode = 'map';
let view = '';
let selected = null;
let flown = null;
let savedScroll = 0;
let touched = false;
let sugActive = -1;
let sugRows = [];
const built = {};

function softwareGraphics() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || c.getContext('webgl', { failIfMajorPerformanceCaveat: true });
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return !gl;
}

const flags = new URLSearchParams(location.search);
const lite = flags.has('lite') ? flags.get('lite') !== '0' : softwareGraphics();
if (lite) document.documentElement.classList.add('lite');

initAudio();
if (!lite) initAmbient($('#bg'));
bindAudioUi();

function bindAudioUi() {
  const music = $('#a-music'), sfxBtn = $('#a-sfx'), vol = $('#a-vol');
  const paint = s => {
    music.setAttribute('aria-pressed', s.music);
    sfxBtn.setAttribute('aria-pressed', s.sfx);
    vol.value = s.volume;
  };
  music.addEventListener('click', () => setMusic(music.getAttribute('aria-pressed') !== 'true'));
  sfxBtn.addEventListener('click', () => setSfx(sfxBtn.getAttribute('aria-pressed') !== 'true'));
  vol.addEventListener('input', () => setVolume(+vol.value));
  vol.addEventListener('change', () => sfx('click'));
  onAudioChange(paint);
  paint(audioState());
}

function fail(err) {
  $('#boot').innerHTML = `<div class="bootfail"><b>COULD NOT LOAD THE DATABASE</b><span>${esc(err.message || err)}</span><span>If you opened this file directly, serve the folder over http instead (for example <code>python -m http.server</code>).</span></div>`;
}

function buildRow() {
  const n = document.createElement('div');
  n.className = 'vrow';
  n.innerHTML = '<span class="tb"></span><div class="rm"><b class="rn"></b><span class="rs"></span></div><div class="rr"><span class="re"></span><span class="rl"></span></div>';
  n._n = n.querySelector('.rn'); n._s = n.querySelector('.rs'); n._e = n.querySelector('.re'); n._l = n.querySelector('.rl'); n._t = n.querySelector('.tb');
  return n;
}

function fillRow(n, r) {
  n._n.textContent = r.name;
  n._s.textContent = `${data.countries[r.country]}  ·  ${data.types[r.type]}`;
  n._e.textContent = r.elev != null ? `${num(r.elev)} m` : '';
  n._l.textContent = r.last != null ? `LAST ERUPTION ${yearLabel(r.last)}` : '';
  n._t.style.setProperty('--c', TIERS[r.tier].color);
}

function openRow(r) { if (r) location.hash = `#/v/${r.slug}`; }

/* ---------- side panel (map mode) ---------- */

const PANEL = 500;

function setSlant() { pick.style.setProperty('--slant', `${Math.round(pick.clientHeight * 0.0875)}px`); }

function selectRow(r, fly = true) {
  selected = r;
  map.setSelected(r);
  if (fly) { map.flyTo(r.lat, r.lon, Math.max(map.z, 6.8), 1100, innerWidth > 960 ? PANEL + 32 : 0); flown = r; }
  showPick(r);
  sfx('click');
}

function deselect() {
  selected = null;
  map.setSelected(null);
  views.db.classList.remove('has-pick');
  pick.classList.remove('show');
  setTimeout(() => { if (!selected) pick.hidden = true; }, 460);
}

function expandPick(r) {
  sfx('transition');
  wipe('left', () => { location.hash = `#/v/${r.slug}`; });
}

async function showPick(r) {
  const tier = TIERS[r.tier];
  pick.hidden = false;
  pick.classList.remove("show");
  setSlant();
  views.db.classList.add("has-pick");
  pick.innerHTML = `
    <i class="pback"></i><i class="pedge"></i>
    <div class="pinner">
      <button class="pclose snd" id="pclose" aria-label="Close panel">✕</button>
      <div class="pphoto" id="pthumb"></div>
      <div class="pbody">
        <h2 class="ptitle">${esc(r.name)}</h2>
        <div class="dsub">${esc(data.types[r.type])}<i>·</i>${esc(data.countries[r.country])}</div>
        <div class="pfacts">
          <div class="fact"><span class="fl">LAST ERUPTION</span><span class="fv">${lastText(r)}<span class="pill" style="--c:${tier.color}"><i></i>${tier.label}</span></span></div>
          <div class="fact"><span class="fl">ELEVATION</span><span class="fv">${r.elev != null ? `${num(r.elev)} m` : "—"}</span></div>
          <div class="fact"><span class="fl">LOCATION</span><span class="fv">${coords(r.lat, r.lon)}</span></div>
        </div>
        <p class="psum" id="psum"></p>
      </div>
      <div class="pbtns"><a class="btn hot big snd" id="pexpand" href="#/v/${r.slug}">EXPAND FULL VIEW <span>▸</span></a></div>
    </div>`;
  $('#pclose').onclick = deselect;
  $('#pexpand').onclick = e => { e.preventDefault(); expandPick(r); };
  requestAnimationFrame(() => pick.classList.add('show'));
  let d;
  try { d = await detail(r.i); } catch { return; }
  if (selected !== r || !d) return;
  if (d.s) $('#psum').textContent = d.s.length > 360 ? `${d.s.slice(0, 360).replace(/\s+\S*$/, '')}…` : d.s;
  const t = $('#pthumb');
  const blank = () => { if (selected === r) { t.innerHTML = noPhoto(tier.color); t.classList.add('on'); } };
  if (!d.p) { blank(); return; }
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.alt = r.name;
  img.onload = () => { if (selected === r) { t.append(img); t.classList.add('on'); } };
  img.onerror = blank;
  img.src = d.p;
}

/* ---------- search suggestions ---------- */

function renderSuggest() {
  const show = mode === 'map' && q.value.trim() && document.activeElement === q;
  sugRows = show ? results.slice(0, 8) : [];
  suggest.hidden = !sugRows.length;
  if (!sugRows.length) { sugActive = -1; return; }
  suggest.innerHTML = sugRows.map((r, i) => `<button class="sug${i === sugActive ? ' on' : ''}" role="option" data-i="${i}"><i style="--c:${TIERS[r.tier].color}"></i><b>${esc(r.name)}</b><span>${esc(data.countries[r.country])}</span><em>${r.elev != null ? `${num(r.elev)} m` : ''}</em></button>`).join('')
    + (results.length > 8 ? `<div class="sugmore">+ ${num(results.length - 8)} more shown on the map</div>` : '');
}

function pickSuggest(i) {
  const r = sugRows[i];
  if (!r) return;
  q.value = '';
  suggest.hidden = true;
  q.blur();
  touched = false;
  refresh();
  selectRow(r);
}

/* ---------- filtering ---------- */

const refit = (() => {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (mode !== 'map' || view !== 'db') return;
      if (!results.length) return;
      if (results.length === data.rows.length) map.reset(); else map.fit(results);
    }, 380);
  };
})();

let listDirty = true;
let lastSig = '';

const refresh = frame(() => {
  filter.q = q.value;
  results = run();
  if (mode === 'list') { list.setItems(results); listDirty = false; } else listDirty = true;
  map.setVisible(results.length === data.rows.length ? null : new Set(results.map(r => r.i)));
  const total = data.rows.length;
  $('#count').innerHTML = results.length === total ? `<b>${num(total)}</b> VOLCANOES` : `<b>${num(results.length)}</b> OF ${num(total)} VOLCANOES`;
  $('.toolbar').classList.toggle('all', results.length === total);
  $('#empty').hidden = results.length > 0;
  list.host.hidden = results.length === 0 || mode !== 'list';
  const sig = [...filter.tiers, '|', ...filter.types, '|', ...filter.countries, '|', ...filter.bands, filter.photo, filter.eruptions].join(',');
  if (sig !== lastSig) {
    lastSig = sig;
    const fc = filterCount();
    const badge = $('#fcount');
    badge.hidden = !fc; badge.textContent = fc;
    renderChips();
    filtersUi.sync();
  }
  renderSuggest();
  if (touched) refit();
});

function renderChips() {
  const out = [];
  const add = (label, remove) => out.push({ label, remove });
  filter.tiers.forEach(i => add(TIERS[i].label, () => filter.tiers.delete(i)));
  filter.types.forEach(i => add(data.types[i], () => filter.types.delete(i)));
  filter.countries.forEach(i => add(data.countries[i], () => filter.countries.delete(i)));
  filter.bands.forEach(id => add(BANDS.find(b => b.id === id).label, () => filter.bands.delete(id)));
  if (filter.photo) add('HAS PHOTO', () => { filter.photo = false; });
  if (filter.eruptions) add('HAS ERUPTION RECORDS', () => { filter.eruptions = false; });
  const host = $('#chips');
  host.hidden = !out.length;
  host.innerHTML = '';
  out.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip x snd';
    b.innerHTML = `${esc(c.label)} <span aria-hidden="true">✕</span>`;
    b.setAttribute('aria-label', `Remove filter ${c.label}`);
    b.onclick = () => { touched = true; c.remove(); refresh(); };
    host.append(b);
  });
  if (out.length) {
    const b = document.createElement('button');
    b.className = 'link snd';
    b.textContent = 'CLEAR ALL';
    b.onclick = resetAll;
    host.append(b);
  }
}

function resetAll() { touched = true; clearFilters(); q.value = ''; refresh(); }

/* ---------- views ---------- */

function setKeys(k) {
  $('#keys').innerHTML = KEYS[k].map(([key, label]) => `<span><kbd>${key}</kbd>${label}</span>`).join('') + '<a class="credits-link snd" href="#/credits">DATA: SMITHSONIAN GVP · IMAGERY: EOX · CREDITS</a>';
}

function setMode(m) {
  mode = m;
  views.db.dataset.mode = m;
  $('#vlist').hidden = m !== 'list' || !results.length;
  $('#mapwrap').hidden = m !== 'map';
  $('#v-map').setAttribute('aria-selected', m === 'map');
  $('#v-list').setAttribute('aria-selected', m === 'list');
  if (m === 'list') { deselectQuiet(); if (listDirty) { list.setItems(results); listDirty = false; } requestAnimationFrame(() => list.layout()); }
  else requestAnimationFrame(() => map.resize());
  suggest.hidden = true;
  setKeys(m);
}

function deselectQuiet() { pick.classList.remove('show'); pick.hidden = true; views.db.classList.remove('has-pick'); }

function show(name) {
  if (view === 'db' && name !== 'db') savedScroll = $('#vlist').scrollTop;
  Object.entries(views).forEach(([k, v]) => { v.hidden = k !== name; });
  const grp = name === 'detail' ? 'db' : name;
  $$('.nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.route === grp));
  const prevGrp = view === 'detail' ? 'db' : view;
  if (prevGrp && prevGrp !== grp) sfx('transition');
  view = name;
  reveal(views[name]);
  if (name !== 'db') setKeys(name);
}

async function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  closeDrawer();
  if (h.startsWith('/v/')) {
    const row = data.bySlug.get(decodeURIComponent(h.slice(3)));
    if (!row) { location.replace('#/'); return; }
    show('detail');
    selected = row;
    document.title = `${row.name} — Alterra Volcanoes`;
    showDetail(views.detail, row, results.includes(row) ? results : null, mode);
    return;
  }
  if (h === '/about' || h === '/overview' || h === '/credits') {
    show('about');
    if (!built.about) { renderAbout(views.about); built.about = true; reveal(views.about); }
    if (h === '/credits') requestAnimationFrame(() => $('#credits').scrollIntoView({ block: 'center' }));
    document.title = 'About — Alterra Volcanoes';
    return;
  }
  if (h === '/game') {
    show('game');
    if (!built.game) { renderGame(views.game); built.game = true; reveal(views.game); }
    document.title = 'Get the game — Alterra';
    return;
  }
  const was = view;
  show('db');
  setMode(h === '/list' ? 'list' : 'map');
  document.title = 'Alterra — Volcano Database';
  if (mode === 'list') requestAnimationFrame(() => { list.layout(); $('#vlist').scrollTop = savedScroll; list.update(true); });
  else if (selected) {
    map.setSelected(selected);
    showPick(selected);
    if (flown !== selected || was === 'detail') { map.flyTo(selected.lat, selected.lon, Math.max(map.z, 6.8), 900, innerWidth > 960 ? PANEL + 32 : 0); flown = selected; }
  }
}

function openDrawer() { $('#filters').classList.add('open'); $('#scrim').hidden = false; }
function closeDrawer() { $('#filters').classList.remove('open'); $('#scrim').hidden = true; }
function toggleDrawer() { $('#filters').classList.contains('open') ? closeDrawer() : openDrawer(); }

function useGlobe() {
  const want = flags.get('map');
  return want ? want === 'globe' : !lite;
}

function bindDb() {
  q.addEventListener('input', () => { touched = true; sugActive = -1; refresh(); });
  q.addEventListener('focus', renderSuggest);
  q.addEventListener('blur', () => setTimeout(() => { suggest.hidden = true; }, 150));
  q.addEventListener('keydown', e => {
    if (mode === 'map') {
      if (e.key === 'ArrowDown') { e.preventDefault(); sugActive = Math.min(sugRows.length - 1, sugActive + 1); renderSuggest(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sugActive = Math.max(0, sugActive - 1); renderSuggest(); }
      else if (e.key === 'Enter') pickSuggest(Math.max(0, sugActive));
    } else if (e.key === 'ArrowDown') { e.preventDefault(); list.setActive(list.active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list.setActive(list.active - 1); }
    else if (e.key === 'Enter') openRow(results[Math.max(0, list.active)]);
    if (e.key === 'Escape') { if (q.value) { q.value = ''; refresh(); } else q.blur(); }
  });
  suggest.addEventListener('mousedown', e => {
    const b = e.target.closest('.sug');
    if (b) { e.preventDefault(); pickSuggest(+b.dataset.i); }
  });

  const sort = $('#sort');
  sort.innerHTML = SORTS.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
  sort.addEventListener('change', () => { filter.sort = sort.value; refresh(); });

  $('#open-filters').addEventListener('click', toggleDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  $('#empty-clear').addEventListener('click', resetAll);
  $('#filters').addEventListener('reset', resetAll);
  $('#filters').addEventListener('closedrawer', closeDrawer);
  $('#filters').addEventListener('change', () => { touched = true; });

  const tip = $('#tip');
  let tipRow = null;
  const mapOptions = {
    rows: data.rows, halo: true,
    onPick: r => selectRow(r),
    onOpen: r => expandPick(r),
    onHover: (r, x, y) => {
      tip.hidden = !r;
      if (!r) { tipRow = null; return; }
      if (r !== tipRow) {
        tipRow = r;
        tip.innerHTML = `<b>${esc(r.name)}</b><span>${esc(data.countries[r.country])} · ${esc(data.types[r.type])}${r.elev != null ? ` · ${num(r.elev)} m` : ''}</span>`;
      }
      const w = $('#mapwrap').clientWidth;
      tip.style.left = `${Math.min(x + 16, w - tip.offsetWidth - 8)}px`;
      tip.style.top = `${Math.max(8, y - 14)}px`;
    },
  };
  const host = $('#map');
  if (window.maplibregl && useGlobe()) map = new GlobeMap(host, mapOptions);
  else {
    const cv = document.createElement('canvas');
    host.append(cv);
    map = new WorldMap(cv, mapOptions);
  }
  map.fit(data.rows, true);
  $$('#mapwrap [data-z]').forEach(b => b.addEventListener('click', () => (+b.dataset.z ? map.zoomBy(+b.dataset.z) : map.reset())));
  $('#legend').innerHTML = TIERS.map(t => `<span><i style="background:${t.color}"></i>${t.label}</span>`).join('');
}

function bindGlobal() {
  views.detail.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-nav],[data-copy]');
    if (!b) return;
    if (b.dataset.act === 'back') wipe('right', () => { location.hash = mode === 'list' ? '#/list' : '#/'; });
    else if (b.dataset.nav) location.hash = `#/v/${b.dataset.nav}`;
    else if (b.dataset.copy) {
      navigator.clipboard?.writeText(b.dataset.copy).then(() => { b.textContent = 'COPIED'; setTimeout(() => { b.textContent = 'COPY'; }, 1200); }).catch(() => {});
    }
  });

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (view === 'db') {
      if (e.key === '/' && !typing) { e.preventDefault(); q.focus(); q.select(); return; }
      if (typing) return;
      if (mode === 'map') {
        if (e.key === 'Escape') deselect();
        else if (e.key === 'Enter' && selected) openRow(selected);
        else if (e.key === '+' || e.key === '=') map.zoomBy(1);
        else if (e.key === '-') map.zoomBy(-1);
        return;
      }
      const k = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (k) { e.preventDefault(); list.setActive(list.active < 0 ? 0 : list.active + k); }
      else if (e.key === 'PageDown') { e.preventDefault(); list.setActive(list.active + list.page()); }
      else if (e.key === 'PageUp') { e.preventDefault(); list.setActive(list.active - list.page()); }
      else if (e.key === 'Home') { e.preventDefault(); list.setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); list.setActive(results.length - 1); }
      else if (e.key === 'Enter' && list.active >= 0) openRow(results[list.active]);
    } else if (view === 'detail' && !typing) {
      if (e.key === 'Escape') wipe('right', () => { location.hash = mode === 'list' ? '#/list' : '#/'; });
      else if (e.key === 'ArrowLeft') $$('[data-nav]', views.detail)[0]?.click();
      else if (e.key === 'ArrowRight') $$('[data-nav]', views.detail)[1]?.click();
    }
  });
  window.addEventListener('hashchange', route);
}

try {
  await load();
} catch (err) {
  fail(err);
  throw err;
}

list = new VList($('#vlist'), { rowH: 64, build: buildRow, fill: fillRow, onPick: openRow });
filtersUi = buildFilters($('#filters'), refresh);
bindDb();
bindGlobal();
$('#boot').remove();
refresh();
await route();
map.resize();
addEventListener('resize', () => { map.resize(); setSlant(); });
