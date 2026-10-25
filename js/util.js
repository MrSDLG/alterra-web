export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

export const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const num = n => n.toLocaleString('en-US');

export function slug(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'volcano';
}

export function coords(lat, lon) {
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}`;
}

export function yearLabel(y) {
  if (y == null) return '—';
  return y < 0 ? `${num(-y)} BC` : `${y} CE`;
}

export function frame(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
}

export function noPhoto(color = '#59d9ff') {
  return `<div class="nophoto" style="--c:${color}"><svg viewBox="0 0 120 70" aria-hidden="true"><path d="M8 64 44 18l8 7 9-12 51 51Z"/><path d="M44 18l-5 8m17-1 4 8m5-20-4 9"/><path d="M4 64h112"/></svg><b>NO</b><span>IMAGE</span><em>AVAILABLE</em><i></i></div>`;
}

export function reticle() {
  const el = document.createElement('div');
  el.className = 'reticle';
  el.innerHTML = '<i class="rglow"></i><i class="rpulse"></i><svg viewBox="0 0 68 68"><circle cx="34" cy="34" r="30" fill="none" stroke="#ffa31a" stroke-width="2.5" stroke-dasharray="30 17.1" stroke-linecap="round"/></svg><svg class="rtri" viewBox="0 0 24 24"><path d="M12 3 21 19H3Z" fill="#ffa31a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><i class="rline"></i><span class="rname"></span>';
  return el;
}

// outline path hugging a triangle (vertices relative to its centre) from d px outside
export function triOutline(V, d) {
  const [A, B, C] = V;
  const a = Math.hypot(B[0] - C[0], B[1] - C[1]), b = Math.hypot(A[0] - C[0], A[1] - C[1]), c = Math.hypot(A[0] - B[0], A[1] - B[1]);
  const p = a + b + c;
  const ix = (a * A[0] + b * B[0] + c * C[0]) / p, iy = (a * A[1] + b * B[1] + c * C[1]) / p;
  const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
  const k = 1 + d / (2 * area / p);
  return 'M' + V.map(v => `${(ix + (v[0] - ix) * k).toFixed(2)} ${(iy + (v[1] - iy) * k).toFixed(2)}`).join('L') + 'Z';
}

export function boxOutline(q, d) {
  const e = q + d;
  return `M${-e} ${-e}H${e}V${e}H${-e}Z`;
}

export function hoverShape() {
  const el = document.createElement('div');
  el.className = 'mhover';
  el.hidden = true;
  el.innerHTML = '<svg><path fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  el.path = el.querySelector('path');
  return el;
}
