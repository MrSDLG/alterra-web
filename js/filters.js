import { data, filter, TIERS, BANDS } from './store.js';
import { esc, num } from './util.js';

const TYPE_VISIBLE = 8;

function group(title, body, open = true) {
  return `<details class="fgroup"${open ? ' open' : ''}><summary class="snd">${title}</summary><div class="fbody">${body}</div></details>`;
}

function check(kind, value, label, count, color) {
  const dot = color ? `<i class="dot" style="background:${color}"></i>` : '';
  return `<label class="opt snd"><input type="checkbox" data-f="${kind}" data-v="${esc(value)}"><span class="box"></span>${dot}<span class="lbl">${esc(label)}</span><span class="cnt">${num(count)}</span></label>`;
}

export function buildFilters(host, onChange) {
  const rows = data.rows;
  const count = (key, n) => { const a = new Array(n).fill(0); rows.forEach(r => a[r[key]]++); return a; };
  const byCountry = count('country', data.countries.length);
  const byType = count('type', data.types.length);
  const byTier = count('tier', TIERS.length);
  const byBand = BANDS.map(b => rows.filter(r => r.elev != null && b.test(r.elev)).length);

  const typeOrder = data.types.map((t, i) => i);
  const countryOrder = data.countries.map((c, i) => i).sort((a, b) => byCountry[b] - byCountry[a] || data.countries[a].localeCompare(data.countries[b]));

  host.innerHTML = `
    <div class="fhead"><span>FILTERS</span><button class="link snd" data-act="clear">RESET</button><button class="icon snd fclose" data-act="close-filters" aria-label="Close filters">✕</button></div>
    ${group('STATUS', TIERS.map(t => check('tier', t.id, t.label, byTier[t.id], t.color)).join(''))}
    ${group('VOLCANO TYPE', typeOrder.map((i, k) => `<div class="${k >= TYPE_VISIBLE ? 'extra' : ''}">${check('type', i, data.types[i], byType[i])}</div>`).join('') + `<button class="link snd more" data-act="more-types">SHOW ALL ${data.types.length} TYPES</button>`)}
    ${group('COUNTRY', `<input class="mini" type="search" placeholder="FIND COUNTRY…" data-act="country-find" autocomplete="off"><div class="cscroll">${countryOrder.map(i => `<div data-name="${esc(data.countries[i].toLowerCase())}">${check('country', i, data.countries[i], byCountry[i])}</div>`).join('')}</div>`)}
    ${group('ELEVATION', BANDS.map((b, i) => check('band', b.id, b.label, byBand[i])).join(''), false)}
    ${group('ONLY SHOW', check('photo', 1, 'HAS A PHOTO', rows.filter(r => r.flags & 1).length) + check('eruptions', 1, 'HAS ERUPTION RECORDS', rows.filter(r => r.flags & 2).length), false)}
    <div class="fcredit">Data: Smithsonian Global Volcanism Program, Volcanoes of the World.</div>`;

  host.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.f === undefined) return;
    const v = t.dataset.v, on = t.checked;
    const set = { tier: filter.tiers, type: filter.types, country: filter.countries, band: filter.bands }[t.dataset.f];
    if (set) { const key = t.dataset.f === 'band' ? v : +v; on ? set.add(key) : set.delete(key); }
    else if (t.dataset.f === 'photo') filter.photo = on;
    else if (t.dataset.f === 'eruptions') filter.eruptions = on;
    onChange();
  });

  host.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    if (b.dataset.act === 'more-types') {
      const open = host.classList.toggle('types-open');
      b.textContent = open ? 'SHOW FEWER' : `SHOW ALL ${data.types.length} TYPES`;
    } else if (b.dataset.act === 'clear') host.dispatchEvent(new CustomEvent('reset'));
    else if (b.dataset.act === 'close-filters') host.dispatchEvent(new CustomEvent('closedrawer'));
  });

  host.addEventListener('input', e => {
    if (e.target.dataset.act !== 'country-find') return;
    const q = e.target.value.trim().toLowerCase();
    host.querySelectorAll('.cscroll > div').forEach(d => { d.hidden = q && !d.dataset.name.includes(q); });
  });

  return {
    sync() {
      host.querySelectorAll('input[data-f]').forEach(i => {
        const f = i.dataset.f, v = i.dataset.v;
        i.checked = f === 'photo' ? filter.photo : f === 'eruptions' ? filter.eruptions
          : { tier: filter.tiers, type: filter.types, country: filter.countries, band: filter.bands }[f].has(f === 'band' ? v : +v);
      });
    },
  };
}
