import { norm, slug, yearLabel } from './util.js';

export const TIERS = [
  { id: 0, label: 'ERUPTING NOW', color: '#ff5a4a' },
  { id: 1, label: 'NOT ERUPTING', color: '#4fa8c9' },
];
export const tierOf = flags => (flags & 32 ? 0 : 1);
export const lastText = r => (r.last != null ? yearLabel(r.last) : r.flags & 16 ? 'Over 11,700 years ago' : 'Date unknown');

export const BANDS = [
  { id: 'sea', label: 'BELOW SEA LEVEL', test: e => e < 0 },
  { id: 'low', label: '0 – 1,000 M', test: e => e >= 0 && e < 1000 },
  { id: 'mid', label: '1,000 – 2,000 M', test: e => e >= 1000 && e < 2000 },
  { id: 'high', label: '2,000 – 3,000 M', test: e => e >= 2000 && e < 3000 },
  { id: 'peak', label: '3,000 M +', test: e => e >= 3000 },
];

export const SORTS = [
  { id: 'match', label: 'BEST MATCH / A–Z' },
  { id: 'elev', label: 'HIGHEST FIRST' },
  { id: 'recent', label: 'MOST RECENT ERUPTION' },
  { id: 'country', label: 'COUNTRY' },
];

export const data = { rows: [], countries: [], types: [], landforms: [], chunk: 64, bySlug: new Map() };

export const filter = {
  q: '', sort: 'match', photo: false, eruptions: false,
  countries: new Set(), types: new Set(), tiers: new Set(), bands: new Set(),
};

export async function load() {
  const res = await fetch('data/index.json');
  if (!res.ok) throw new Error(`index.json ${res.status}`);
  const j = await res.json();
  data.countries = j.countries;
  data.types = j.types;
  data.landforms = j.landforms;
  data.chunk = j.chunk;
  data.asOf = j.asOf;
  data.rows = j.rows.map((r, i) => ({
    i, id: r[0], name: r[1], country: r[2], type: r[3], landform: r[4],
    elev: r[5], lat: r[6], lon: r[7], last: r[8], flags: r[9], syn: r[10],
    tier: tierOf(r[9]),
    key: norm(r[1]),
    all: norm(`${r[1]} ${r[10]} ${j.countries[r[2]]} ${j.types[r[3]]}`),
  }));
  data.rows.forEach(r => {
    let s = slug(r.name);
    if (data.bySlug.has(s)) { let n = 2; while (data.bySlug.has(`${s}-${n}`)) n++; s = `${s}-${n}`; }
    r.slug = s;
    data.bySlug.set(s, r);
  });
}

const chunks = new Map();
export function detail(i) {
  const c = Math.floor(i / data.chunk);
  if (!chunks.has(c)) {
    chunks.set(c, fetch(`data/detail/${c}.json`).then(r => {
      if (!r.ok) throw new Error(`detail ${c} ${r.status}`);
      return r.json();
    }).catch(e => { chunks.delete(c); throw e; }));
  }
  return chunks.get(c).then(p => p[i]);
}

function score(r, tokens, whole) {
  let s = 0;
  for (const t of tokens) {
    if (r.key.startsWith(t)) s += 100;
    else if (r.key.includes(` ${t}`) || r.key.includes(`-${t}`)) s += 60;
    else if (r.key.includes(t)) s += 40;
    else if (norm(r.syn).includes(t)) s += 20;
    else s += 5;
  }
  if (r.key === whole) s += 500;
  else if (r.key.startsWith(whole)) s += 80;
  return s;
}

export function run() {
  const { q, countries, types, tiers, bands, photo, eruptions } = filter;
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  const whole = tokens.join(' ');
  const out = [];
  for (const r of data.rows) {
    if (countries.size && !countries.has(r.country)) continue;
    if (types.size && !types.has(r.type)) continue;
    if (tiers.size && !tiers.has(r.tier)) continue;
    if (photo && !(r.flags & 1)) continue;
    if (eruptions && !(r.flags & 2)) continue;
    if (bands.size) {
      if (r.elev == null) continue;
      let ok = false;
      for (const b of BANDS) if (bands.has(b.id) && b.test(r.elev)) { ok = true; break; }
      if (!ok) continue;
    }
    if (tokens.length && !tokens.every(t => r.all.includes(t))) continue;
    out.push(r);
  }
  const byName = (a, b) => a.i - b.i;
  if (filter.sort === 'elev') out.sort((a, b) => (b.elev ?? -1e9) - (a.elev ?? -1e9) || byName(a, b));
  else if (filter.sort === 'recent') out.sort((a, b) => (b.last ?? -1e9) - (a.last ?? -1e9) || byName(a, b));
  else if (filter.sort === 'country') out.sort((a, b) => data.countries[a.country].localeCompare(data.countries[b.country]) || byName(a, b));
  else if (tokens.length) {
    const sc = new Map(out.map(r => [r, score(r, tokens, whole)]));
    out.sort((a, b) => sc.get(b) - sc.get(a) || byName(a, b));
  }
  return out;
}

export function filterCount() {
  const f = filter;
  return f.countries.size + f.types.size + f.tiers.size + f.bands.size + (f.photo ? 1 : 0) + (f.eruptions ? 1 : 0);
}

export function clearFilters() {
  const f = filter;
  f.countries.clear(); f.types.clear(); f.tiers.clear(); f.bands.clear();
  f.photo = false; f.eruptions = false;
}
