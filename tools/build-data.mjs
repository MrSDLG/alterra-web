// node tools/build-data.mjs  ->  data/index.json + data/detail/NN.json
// Base list: GVP Holocene + Pleistocene feeds. The old database adds eruption lists, features and synonyms.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => JSON.parse(readFileSync(join(root, 'source', f), 'utf8'));
const CHUNK = 64;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const feeds = [
  ...read('gvp/holocene.json').features.map(f => ({ ...f.properties, epoch: 'H' })),
  ...read('gvp/pleistocene.json').features.map(f => ({ ...f.properties, epoch: 'P' })),
];
const photos = (() => { try { return read('gvp/photos.json'); } catch { return {}; } })();
const subs = (() => { try { return read('gvp/subfeatures.json'); } catch { return {}; } })();
const eruptionsByVolcano = (() => {
  let list = [];
  try { list = read('gvp/eruptions.json').features.map(f => f.properties); } catch { /* optional */ }
  const m = new Map();
  list.forEach(p => { if (!m.has(p.Volcano_Number)) m.set(p.Volcano_Number, []); m.get(p.Volcano_Number).push(p); });
  return m;
})();
const old = Object.entries(read('votw_data_v2.json')).map(([k, v]) => ({ ...v, name: k.trim() }));

const noImage = u => !u || u.includes('noimage');
const num = v => (v === undefined || v === null || v === '' || isNaN(+v) ? null : +v);
const fmt = n => n.toLocaleString('en-US');
const near = (a, b) => Math.abs(a.latitude - b.Latitude) < 2 && Math.abs(a.longitude - b.Longitude) < 2;

function cleanType(t) {
  let s = String(t || 'Unknown').replace(/\(.*?\)/g, '').replace(/\?/g, '').replace(/\s+/g, ' ').trim();
  if (!s) s = 'Unknown';
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

// "Basile, Pico" -> "Pico Basile"
function cleanName(n) {
  const m = String(n).trim().match(/^([^,]+), ([^,]+)$/);
  return m ? `${m[2]} ${m[1]}` : String(n).trim();
}

function parseAge(raw) {
  const s = String(raw || '').trim();
  let m;
  if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) return { y: +m[3] + (+m[2] - 1) / 12, a: `${+m[1]} ${MONTHS[+m[2] - 1]} ${m[3]}` };
  const err = (s.match(/\+\/-\s*([\d.]+)/) || [])[1];
  const tail = err ? ` ±${fmt(+err)}` : '';
  if ((m = s.match(/^(-?[\d.]+)\s*BP/))) return { y: 1950 - +m[1], a: `${fmt(+m[1])} BP${tail}` };
  if ((m = s.match(/^(-?[\d.]+)\s*BC/))) { const n = Math.abs(+m[1]); return { y: -n, a: `${fmt(n)} BC${tail}` }; }
  if ((m = s.match(/^(-?[\d.]+)/))) { const n = +m[1]; return { y: n, a: n < 0 ? `${fmt(-n)} BC${tail}` : `${n} CE${tail}` }; }
  return { y: null, a: s || '—' };
}

// Pages give one text: caption then credit ("... Photo by A, 1995 (B).")
function splitCredit(text) {
  if (!text) return [null, null];
  const re = /\b(Photo(?:graph)? (?:by|courtesy|taken)|Image (?:by|courtesy)|Courtesy of|Aerial photo)/gi;
  let cut = -1, m;
  while ((m = re.exec(text))) cut = m.index;
  return cut > 0 ? [text.slice(0, cut).trim(), text.slice(cut).trim()] : [text.trim(), null];
}

function captionOf(caption, credit) {
  if (credit || !caption) return { caption, credit: credit || null };
  const [c, cr] = splitCredit(caption);
  return { caption: c, credit: cr };
}

const monthIndex = p => p.EndDateYear * 12 + (p.EndDateMonth || 1) - 1 + ((p.EndDateDay || 1) - 1) / 31;
const ends = [...eruptionsByVolcano.values()].flat().filter(p => p.EndDateYear != null).map(monthIndex);
const latest = ends.length ? Math.max(...ends) : 0;
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const asOf = latest ? `${FULL[Math.floor(latest % 12)]} ${Math.floor(latest / 12)}` : '';
// "Erupting now" = still going at the Smithsonian's last update (end date marked "after" and recent).
const active = new Set([...eruptionsByVolcano.values()].flat().filter(p => p.EndDateYearModifier === '>' && monthIndex(p) >= latest - 2).map(p => p.Volcano_Number));

const mark = m => (m === '?' ? '~' : m === '<' ? 'before ' : m === '>' ? 'after ' : '');

function dayLabel(y, mo, d, ym) {
  const yr = y < 0 ? `${fmt(-y)} BC` : `${y}${y < 1000 ? ' CE' : ''}`;
  const parts = [d > 0 ? d : '', mo > 0 ? MONTHS[mo - 1] : '', yr].filter(x => x !== '');
  return mark(ym) + parts.join(' ');
}

function newEruption(p) {
  const y = p.StartDateYear + (p.StartDateMonth > 0 ? (p.StartDateMonth - 1) / 12 : 0);
  let a = dayLabel(p.StartDateYear, p.StartDateMonth, p.StartDateDay, p.StartDateYearModifier);
  if (p.StartDateYearUncertainty) a += ` ±${fmt(p.StartDateYearUncertainty)}`;
  if (p.EndDateYear != null && (p.EndDateYear !== p.StartDateYear || p.EndDateMonth !== p.StartDateMonth || p.EndDateDay !== p.StartDateDay)) {
    a += ` → ${dayLabel(p.EndDateYear, p.EndDateMonth, p.EndDateDay, p.EndDateYearModifier)}`;
  }
  const e = { n: p.ActivityArea || '', a, y: Math.round(y * 100) / 100 };
  if (p.ExplosivityIndexMax != null) e.v = p.ExplosivityIndexMax;
  if (p.Activity_Type === 'Uncertain Eruption') e.u = 1;
  return e;
}

function parseList(v) {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

const oldById = new Map();
old.forEach(o => { if (!oldById.has(o.id)) oldById.set(o.id, []); oldById.get(o.id).push(o); });
const matched = new Set();

// Base records from the feeds, enriched with the old record that shares the id and sits in the same place.
const records = feeds.map(f => {
  const o = (oldById.get(f.Volcano_Number) || []).find(x => near(x, f));
  if (o) matched.add(o);
  return { f, o };
});
// Old records with a wrong id but the same spot as a feed volcano.
for (const o of old) {
  if (matched.has(o)) continue;
  const r = records.find(x => !x.o && Math.abs(x.f.Latitude - o.latitude) < 0.01 && Math.abs(x.f.Longitude - o.longitude) < 0.01);
  if (r) { r.o = o; matched.add(o); }
}
// Old records that no feed knows (kept so nothing is lost).
const leftovers = old.filter(o => !matched.has(o)).map(o => ({ f: null, o }));

const entries = [...records, ...leftovers].map(({ f, o }) => {
  const id0 = f?.Volcano_Number ?? o.id;
  const got = photos[id0];
  const photo = !noImage(f?.Primary_Photo_Link) ? f.Primary_Photo_Link
    : !noImage(o?.photo) ? o.photo : !noImage(o?.photo_link) ? o.photo_link : got?.p || null;
  const [gotCaption, gotCredit] = got && !f?.Primary_Photo_Link ? splitCredit(got.c) : [null, null];
  const comps = f?.Major_Rock_Type ? [f.Major_Rock_Type] : [];
  parseList(o?.compositions).filter(c => !/no data/i.test(c)).forEach(c => { if (!comps.includes(c)) comps.push(c); });
  if (o?.rock_type && !comps.includes(o.rock_type)) comps.push(o.rock_type);
  const fromOld = (o?.registered_eruptions || []).map(e => {
    const p = e.properties || {};
    const { y, a } = parseAge(e.age);
    const x = { n: e.name, a, y };
    if (p.Magnitude) x.m = +p.Magnitude;
    if (p['Bulk Vol']) x.bv = +p['Bulk Vol'];
    if (p['DRE Vol']) x.dv = +p['DRE Vol'];
    if (p['Col Height']) x.h = +p['Col Height'];
    if (p.Composition) x.c = p.Composition;
    return x;
  });
  const eruptions = (eruptionsByVolcano.get(id0) || []).map(newEruption);
  fromOld.forEach(x => {
    const twin = x.y != null && eruptions.find(e => Math.abs(e.y - x.y) <= 1.5 && !e.merged);
    if (twin) { twin.merged = 1; Object.assign(twin, { m: x.m, bv: x.bv, dv: x.dv, h: x.h, c: x.c }); } else eruptions.push(x);
  });
  eruptions.forEach(e => { delete e.merged; for (const k in e) if (e[k] === undefined) delete e[k]; });
  eruptions.sort((a, b) => (b.y ?? -1e9) - (a.y ?? -1e9));
  const sub = subs[id0] || {};
  const vlat = f ? f.Latitude : o.latitude, vlon = f ? f.Longitude : o.longitude;
  // Collected coordinates lost their N/S/E/W sign; take the sign that lands nearest the summit.
  const nearSign = (v, ref) => (v == null ? null : Math.abs(v - ref) <= Math.abs(-v - ref) ? v : -v);
  const features = (o?.features?.length ? o.features.map(x => ({ n: x.name, t: x.type, s: x.section, e: num(x.elevation), la: x.latitude, lo: x.longitude }))
    : (sub.f || []).map(x => ({ ...x, la: nearSign(x.la, vlat), lo: nearSign(x.lo, vlon) })))
    .map(x => ({ ...x, n: cleanName(x.n) }));
  const syn = (o?.synonyms?.length ? o.synonyms : sub.syn || []).filter(Boolean);
  const summary = f?.Geological_Summary || o?.geological_summary || null;
  return {
    id: f?.Volcano_Number ?? o.id,
    name: cleanName(f ? f.Volcano_Name : o.name),
    country: f ? f.Country : o.country,
    type: f ? f.Primary_Volcano_Type : o.type,
    landform: f ? f.Volcanic_Landform : o.landform,
    lat: f ? f.Latitude : o.latitude,
    lon: f ? f.Longitude : o.longitude,
    elev: num(f?.Elevation) ?? num(o?.elevation),
    last: f ? num(f.Last_Eruption_Year) ?? num(o?.last_eruption_year) : num(o.last_eruption_year),
    epoch: f ? f.epoch : '',
    photo, ...captionOf(f?.Primary_Photo_Caption || o?.photo_caption || gotCaption, f?.Primary_Photo_Credit || gotCredit),
    evidence: f?.Evidence_Category || null, region: f?.Subregion || f?.Region || null,
    comps, eruptions, features, syn, summary,
  };
});

entries.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id - b.id);
const countries = [...new Set(entries.map(e => e.country))].sort((a, b) => a.localeCompare(b));
const typeCount = {};
const landCount = {};
entries.forEach(e => {
  e.t = cleanType(e.type);
  typeCount[e.t] = (typeCount[e.t] || 0) + 1;
  landCount[e.landform] = (landCount[e.landform] || 0) + 1;
});
const types = Object.keys(typeCount).sort((a, b) => typeCount[b] - typeCount[a]);
const landforms = Object.keys(landCount).sort((a, b) => landCount[b] - landCount[a]);

const rows = [];
const details = [];
entries.forEach(e => {
  const flags = (e.photo ? 1 : 0) | (e.eruptions.length ? 2 : 0) | (e.features.length ? 4 : 0) | (e.summary ? 8 : 0) | (e.epoch === 'P' ? 16 : 0) | (active.has(e.id) ? 32 : 0);
  rows.push([e.id, e.name, countries.indexOf(e.country), types.indexOf(e.t), landforms.indexOf(e.landform), e.elev, e.lat, e.lon, e.last, flags, e.syn.join(' | ')]);
  const d = { ty: e.type };
  if (e.summary) d.s = e.summary;
  if (e.comps.length) d.c = e.comps;
  if (e.photo) d.p = e.photo;
  if (e.caption) d.pc = e.caption;
  if (e.credit) d.pcr = e.credit;
  if (e.evidence) d.ev = e.evidence;
  if (e.region) d.rg = e.region;
  if (e.syn.length) d.syn = e.syn;
  if (e.features.length) d.f = e.features;
  if (e.eruptions.length) d.e = e.eruptions;
  details.push(d);
});

rmSync(join(root, 'data'), { recursive: true, force: true });
mkdirSync(join(root, 'data', 'detail'), { recursive: true });
writeFileSync(join(root, 'data', 'index.json'), JSON.stringify({ chunk: CHUNK, asOf, countries, types, landforms, rows }));
for (let c = 0; c * CHUNK < details.length; c++) {
  const part = {};
  details.slice(c * CHUNK, (c + 1) * CHUNK).forEach((d, k) => { part[c * CHUNK + k] = d; });
  writeFileSync(join(root, 'data', 'detail', `${c}.json`), JSON.stringify(part));
}
const holocene = entries.filter(e => e.epoch === 'H').length;
console.log(`${rows.length} volcanoes (${holocene} Holocene, ${entries.length - holocene - leftovers.length} Pleistocene, ${leftovers.length} old-only), ${countries.length} countries, ${types.length} types, ${Math.ceil(details.length / CHUNK)} chunks`);
console.log(`erupting now ${rows.filter(r => r[9] & 32).length} (as of ${asOf})`);
console.log(`photos ${entries.filter(e => e.photo).length}, credits ${entries.filter(e => e.credit).length}, eruption lists ${entries.filter(e => e.eruptions.length).length}`);
console.log('old-only:', leftovers.map(l => l.o.name).join(', '));
