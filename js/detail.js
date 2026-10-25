import { data, detail, TIERS, lastText } from './store.js';
import { $, $$, esc, num, coords, yearLabel, noPhoto } from './util.js';
import { reveal } from './motion.js';
import { WorldMap } from './map.js';
import { getEvents, ago } from './events.js';

let current = null;
let viewHost = null;

const setSlant = () => { if (viewHost && viewHost.clientHeight) viewHost.style.setProperty('--slant', `${Math.round(viewHost.clientHeight * 0.0875)}px`); };
addEventListener('resize', setSlant);

const none = '<span class="off">Not on record</span>';
const fact = (label, value) => `<div class="fact"><span class="fl">${label}</span><span class="fv">${value}</span></div>`;
const cell = (label, value, sub = '', cls = '') => `<div class="cell ${cls}"><span class="fl">${label}</span><div class="big">${value}${sub ? `<small>${sub}</small>` : ''}</div></div>`;

const SHOWN = 25;
const SECTIONS = [['Cones', '#ffa31a'], ['Craters', '#ff5a4a'], ['Domes', '#59d9ff'], ['Thermal', '#f5e27a'], ['Other', '#b9c7d0']];
const SUMMIT = '#ffffff';

function featuresMapHtml(points, total) {
  const used = SECTIONS.map(([n, c], k) => [n, c, points.filter(p => p.tier === k).length]).filter(x => x[2]);
  return `<div class="fcol"><div class="fmap frame"><canvas id="fmapcv" aria-label="Map of the features"></canvas>
    <div class="mapctl"><button class="snd" data-fz="1" aria-label="Zoom in">+</button><button class="snd" data-fz="-1" aria-label="Zoom out">−</button><button class="snd" data-fz="0" aria-label="Fit all">⌂</button></div>
    <div class="legend">${used.map(([n, c, k]) => `<span><i style="background:${c}"></i>${n.toUpperCase()} ${k}</span>`).join('')}</div>
    <div class="tip" id="ftip" hidden></div></div>
    <p class="note">${points.length === total ? `All ${total} features are on the map.` : `${points.length} of ${total} features have coordinates and are on the map.`} Click one in the list or on the map.</p></div>`;
}

function eruptionRow(e) {
  const name = e.n && !/^\d+\s*(AD|BC|CE)?$/i.test(e.n.trim()) && e.n.trim() !== e.a ? esc(e.n) : '<span class="dim">—</span>';
  const size = e.v ?? e.m;
  const bar = size != null ? `<span class="mag"><i style="width:${Math.max(4, Math.min(100, size / 8 * 100))}%"></i></span><span class="magn">${e.v != null ? e.v : size.toFixed(1)}</span>` : '<span class="dim">—</span>';
  const note = [e.u ? 'Uncertain eruption' : '', e.c || ''].filter(Boolean).join(' · ');
  return `<div class="trow"><span class="when">${esc(e.a)}</span><span class="what">${name}${note ? `<small>${esc(note)}</small>` : ''}</span><span class="mg">${bar}</span><span class="col">${e.h ? `${e.h} km` : '<span class="dim">—</span>'}</span></div>`;
}

function historyHtml(list, events) {
  const head = '<div class="trow thead"><span>DATE</span><span>WHERE / WHAT</span><span>SIZE (0–8)</span><span>COLUMN</span></div>';
  const game = events.map(e => `<div class="trow game"><span class="when">${esc(ago(e.at))}</span><span class="what">${esc(e.title)}${e.detail ? `<small>${esc(e.detail)}</small>` : ''}</span><span><span class="tag2">IN ALTERRA</span></span><span class="col dim">—</span></div>`).join('');
  const rows = list.slice(0, SHOWN).map(eruptionRow).join('');
  const rest = list.slice(SHOWN);
  const hidden = rest.length ? `<div class="rest" hidden>${rest.map(eruptionRow).join('')}</div>` : '';
  const button = rest.length ? `<button class="btn snd more-btn" data-total="${list.length}">SHOW ALL ${list.length} ERUPTIONS</button>` : '';
  return `<div class="table">${head}${game}${rows}${hidden}</div>${button}<p class="note">Size is the Volcanic Explosivity Index (0–8) where known. Dates before 1950 may be approximate; ~ means the date is uncertain.</p>`;
}

function featuresHtml(list) {
  const groups = {};
  list.forEach((f, fi) => { (groups[f.s || 'Other'] ||= []).push([f, fi]); });
  return Object.entries(groups).map(([sec, items]) => `
    <h3 class="sub">${esc(sec.toUpperCase())} <small>${items.length}</small></h3>
    <div class="table">${items.map(([f, fi]) => `<div class="trow feat${f.la != null ? ' has' : ''}" data-fi="${fi}"><span class="what">${esc(f.n)}</span><span>${esc(f.t || '')}</span><span>${f.e != null ? `${num(f.e)} m` : '<span class="dim">—</span>'}</span></div>`).join('')}</div>`).join('');
}

export async function showDetail(host, row, ctx) {
  current = row;
  viewHost = host;
  setSlant();
  const tier = TIERS[row.tier];
  const pos = ctx ? ctx.indexOf(row) : -1;
  const prev = pos > 0 ? ctx[pos - 1] : null;
  const next = pos >= 0 && pos < ctx.length - 1 ? ctx[pos + 1] : null;

  host.innerHTML = `
    <div class="dbar">
      <button class="btn snd" data-act="back"><span>◄</span> DATABASE</button>
      <div class="pager">
        <button class="btn icon snd" data-nav="${prev ? prev.slug : ''}" ${prev ? '' : 'disabled'} aria-label="Previous volcano">◄</button>
        <span class="pos">${pos >= 0 ? `${num(pos + 1)} / ${num(ctx.length)}` : ''}</span>
        <button class="btn icon snd" data-nav="${next ? next.slug : ''}" ${next ? '' : 'disabled'} aria-label="Next volcano">►</button>
      </div>
    </div>
    <div class="dscroll"><div class="dwrap"><p class="dim">Loading…</p></div></div>`;

  let d, events = [];
  try { [d, events] = await Promise.all([detail(row.i), getEvents(row)]); } catch { d = null; }
  if (current !== row) return;
  const wrap = $('.dwrap', host);
  if (!d) { wrap.innerHTML = '<p class="dim">Could not load this volcano’s details. Check your connection and try again.</p>'; return; }

  const e = d.e || [], f = d.f || [];
  const points = f.map((x, fi) => ({ x, fi })).filter(({ x }) => x.la != null && x.lo != null).map(({ x, fi }) => {
    const k = SECTIONS.findIndex(s => s[0] === x.s);
    return { i: fi + 1, fi, name: x.n, lat: x.la, lon: x.lo, elev: x.e, type: x.t, tier: k < 0 ? 4 : k };
  });
  const nHistory = e.length + events.length;
  const sections = [
    { id: 'about', label: 'ABOUT', n: 0 },
    { id: 'history', label: 'HISTORY', n: nHistory },
    { id: 'features', label: 'FEATURES', n: f.length },
  ];
  const last = events[0];
  const quiet = row.flags & 16 ? 'No eruptions on record. This volcano has not erupted in roughly the last 11,700 years.' : 'No eruptions on record for this volcano.';

  wrap.innerHTML = `
    <div class="dmain">
      <section class="hero">
        <figure class="photo frame" id="dphoto"></figure>
        <div class="hero-text">
          <h1 class="dtitle">${esc(row.name)}</h1>
          <div class="dsub">${esc(data.types[row.type])}<i>·</i>${esc(data.countries[row.country])}${data.landforms[row.landform].toLowerCase() === data.types[row.type].toLowerCase() ? '' : `<i>·</i>${esc(data.landforms[row.landform])}`}</div>
          <div class="stats4 frame${last ? '' : ' three'}">
            ${cell('LAST ERUPTION', lastText(row), `<span class="pill" style="--c:${tier.color}"><i></i>${tier.label}</span>`, row.last == null ? 'off' : '')}
            ${cell('ELEVATION', row.elev != null ? `${num(row.elev)} m` : 'Not on record', row.elev != null && row.elev < 0 ? 'below sea level' : '', row.elev == null ? 'off' : '')}
            ${cell('ERUPTIONS ON RECORD', e.length || 'None', e.length ? `since ${esc(e[e.length - 1].a)}` : '', e.length ? '' : 'off')}
            ${last ? cell('IN ALTERRA', esc(last.title), esc(ago(last.at)), 'hot') : ''}
          </div>
        </div>
      </section>

      <section class="sec frame" id="sec-about"><h2>ABOUT</h2>
        <div class="facts-row">
          ${fact('COORDINATES', `${coords(row.lat, row.lon)} <button class="link snd" data-copy="${row.lat}, ${row.lon}">COPY</button>`)}
          ${fact('REGION', d.rg ? esc(d.rg) : none)}
          ${fact('ROCK TYPE', d.c ? d.c.map(c => `<span class="chip">${esc(c)}</span>`).join(' ') : none)}
          ${fact('HOW WE KNOW IT ERUPTED', d.ev ? esc(d.ev) : none)}
          ${fact('ALSO KNOWN AS', d.syn ? esc(d.syn.join(', ')) : none)}
        </div>
        ${d.s ? `<p class="summary">${esc(d.s)}</p>` : '<p class="summary off">No description on record for this volcano yet.</p>'}
      </section>

      <section class="sec frame${nHistory ? '' : ' dim-sec'}" id="sec-history"><h2>ERUPTION HISTORY <em>${nHistory ? `${nHistory} EVENTS` : 'NONE'}</em></h2>${nHistory ? historyHtml(e, events) : `<p class="off">${quiet}</p>`}</section>

      <section class="sec frame${f.length ? '' : ' dim-sec'}" id="sec-features"><h2>FEATURES <em>${f.length ? f.length : 'NONE'}</em></h2>${f.length ? `<div class="fgrid${points.length ? '' : ' solo'}">${points.length ? featuresMapHtml(points, f.length) : ''}<div class="flist">${featuresHtml(f)}</div></div>` : '<p class="off">No cones, craters, domes or other features are on record for this volcano.</p>'}</section>
    </div>`;

  host.insertAdjacentHTML('beforeend', `
    <aside class="dside" id="dside"><i class="pback"></i><div class="sbar" id="sbar" aria-hidden="true"><b></b></div>
      <div class="pinner">
        <span class="fl">ON THIS PAGE</span>
        <nav class="dnav">${sections.map((s, k) => `<a class="snd${s.id !== 'about' && !s.n ? ' off' : ''}" href="#sec-${s.id}" data-s="${s.id}"><i>${String(k + 1).padStart(3, '0')}</i><span>${s.label}</span><b>${s.id === 'about' ? '' : num(s.n)}</b></a>`).join('')}</nav>
        ${last ? `<div class="dgame"><span class="fl">IN ALTERRA NOW</span><strong>${esc(last.title)}</strong><span class="dim">${esc(ago(last.at))}</span></div>` : ''}
      </div>
    </aside>`);

  const fig = $('#dphoto', host);
  const blank = () => { fig.innerHTML = noPhoto(tier.color); };
  if (d.p) {
    fig.innerHTML = `<img alt="${esc(row.name)}" referrerpolicy="no-referrer"><figcaption>${d.pc ? esc(d.pc) : ''}<small>${d.pcr ? esc(d.pcr) : 'Photo: Smithsonian GVP'}</small></figcaption>`;
    const img = fig.querySelector('img');
    img.addEventListener('error', blank);
    img.src = d.p;
  } else blank();

  $$('.more-btn', host).forEach(b => b.addEventListener('click', () => {
    const rest = $('.rest', host);
    rest.hidden = !rest.hidden;
    b.textContent = rest.hidden ? `SHOW ALL ${b.dataset.total} ERUPTIONS` : 'SHOW FEWER';
  }));

  const scroller = $('.dscroll', host);
  $$('.dnav a', host).forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault();
    $(`#sec-${a.dataset.s}`, host).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const links = new Map($$('.dnav a', host).map(a => [a.dataset.s, a]));
  const mark = () => {
    const edge = scroller.getBoundingClientRect().top + 120;
    let id = sections[0].id;
    sections.forEach(s => { if ($(`#sec-${s.id}`, host).getBoundingClientRect().top <= edge) id = s.id; });
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) id = sections[sections.length - 1].id;
    links.forEach((l, k) => l.classList.toggle('on', k === id));
  };
  scroller.addEventListener('scroll', mark, { passive: true });
  mark();

  const track = $('#sbar', host), thumb = $('#sbar b', host);
  let drag = null;
  const place = () => {
    const over = scroller.scrollHeight - scroller.clientHeight;
    track.hidden = over <= 4;
    if (track.hidden) return;
    const th = track.clientHeight, size = Math.max(36, th * scroller.clientHeight / scroller.scrollHeight);
    thumb.style.height = `${size}px`;
    thumb.style.transform = `translateY(${(scroller.scrollTop / over) * (th - size)}px)`;
  };
  scroller.addEventListener('scroll', place, { passive: true });
  new ResizeObserver(place).observe(scroller.firstElementChild);
  addEventListener('resize', place);
  thumb.addEventListener('pointerdown', ev => {
    thumb.setPointerCapture(ev.pointerId);
    drag = { y: ev.clientY, top: scroller.scrollTop };
    ev.preventDefault();
  });
  thumb.addEventListener('pointermove', ev => {
    if (!drag) return;
    const over = scroller.scrollHeight - scroller.clientHeight, room = track.clientHeight - thumb.offsetHeight;
    scroller.scrollTop = drag.top + (ev.clientY - drag.y) * over / room;
  });
  thumb.addEventListener('pointerup', () => { drag = null; });
  track.addEventListener('pointerdown', ev => {
    if (ev.target !== track) return;
    const r = track.getBoundingClientRect();
    scroller.scrollTo({ top: (ev.clientY - r.top) / r.height * (scroller.scrollHeight - scroller.clientHeight), behavior: 'smooth' });
  });
  place();

  if (points.length) {
    const summit = { i: 0, name: row.name, lat: row.lat, lon: row.lon, elev: row.elev, type: 'Summit', tier: 5 };
    const all = [summit, ...points];
    const rowOf = fi => $(`.feat[data-fi="${fi}"]`, host);
    const mark = (cls, fi) => { $$(`.feat.${cls}`, host).forEach(r => r.classList.remove(cls)); if (fi != null) rowOf(fi)?.classList.add(cls); };
    const fmap = new WorldMap($('#fmapcv', host), {
      rows: all, palette: [...SECTIONS.map(s => s[1]), SUMMIT],
      onHover: (r, x, y) => {
        const tip = $('#ftip', host);
        tip.hidden = !r;
        mark('hl', r && r.fi);
        if (!r) return;
        tip.innerHTML = `<b>${esc(r.name)}</b><span>${esc(r.type || '')}${r.elev != null ? ` · ${num(r.elev)} m` : ''}</span>`;
        const w = $('.fmap', host).clientWidth;
        tip.style.left = `${Math.min(x + 16, w - tip.offsetWidth - 8)}px`;
        tip.style.top = `${Math.max(8, y - 14)}px`;
      },
      onPick: r => choose(r),
    });
    const choose = r => {
      if (!r.fi && r.fi !== 0) { fmap.setSelected(summit); mark('on'); fmap.fit(all); return; }
      fmap.setSelected(r);
      fmap.flyTo(r.lat, r.lon, Math.max(fmap.z, 13), 900);
      mark('on', r.fi);
      rowOf(r.fi)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    fmap.setSelected(summit);
    requestAnimationFrame(() => { fmap.resize(); fmap.fit(all, true); });
    $$('[data-fz]', host).forEach(b => b.addEventListener('click', () => (+b.dataset.fz ? fmap.zoomBy(+b.dataset.fz) : choose(summit))));
    $$('.feat.has', host).forEach(el => {
      const pt = points.find(p => p.fi === +el.dataset.fi);
      el.addEventListener('pointerenter', () => { fmap.hover = pt; fmap.wake(); });
      el.addEventListener('pointerleave', () => { fmap.hover = null; fmap.wake(); });
      el.addEventListener('click', () => choose(pt));
    });
  }

  reveal(host);
}
