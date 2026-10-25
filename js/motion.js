const REVEAL = '.frame, .dtitle, .dsub, .tabs, .stat, .card, .searchbar, .toolbar, .hero-copy, .cta, .tags';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const quiet = () => reduced || document.documentElement.classList.contains('lite');

export function reveal(root) {
  if (quiet()) return;
  let i = 0;
  root.querySelectorAll(REVEAL).forEach(n => {
    n.classList.remove('rise');
    n.style.setProperty('--d', `${Math.min(i++, 14) * 55}ms`);
  });
  void root.offsetWidth;
  root.querySelectorAll(REVEAL).forEach(n => n.classList.add('rise'));
}

const TILT = Math.tan(5 * Math.PI / 180);
const MS = 640;

export function wipe(dir, swap) {
  if (quiet()) { swap(); return Promise.resolve(); }
  const W = innerWidth, slant = innerHeight * TILT, band = W + slant * 2 + 40;
  const el = document.createElement('div');
  el.className = 'wipe';
  el.style.width = band + 'px';
  document.body.append(el);
  const at = x => 'translateX(' + x + 'px) skewX(-5deg)';
  const start = dir === 'left' ? W : -band - slant - 4;
  const end = dir === 'left' ? -band - 4 : W + 4;
  const H = innerHeight;
  const fix = document.createElement('div');
  fix.className = 'wfix';
  fix.innerHTML = '<div class="wmark"><div class="wname">' + [...'ALTERRA'].map((c, i) => `<i style="--i:${i}">${c}</i>`).join('') + '</div><u></u><small>VOLCANO DATABASE</small></div>';
  document.body.append(fix);
  const clip = x => `polygon(${x + slant}px 0, ${x + band + slant}px 0, ${x + band}px ${H}px, ${x}px ${H}px)`;
  fix.style.clipPath = clip(start);
  el.style.transform = at(start);
  const o = { duration: MS, easing: 'cubic-bezier(.6, 0, .4, 1)', fill: 'forwards' };
  fix.animate([{ clipPath: clip(start) }, { clipPath: clip(end) }], o);
  const run = el.animate([{ transform: at(start) }, { transform: at(end) }], o);
  let done = false;
  const watch = () => {
    if (!done && run.currentTime >= MS / 2) { done = true; swap(); }
    if (!done) requestAnimationFrame(watch);
  };
  watch();
  return run.finished.then(() => { if (!done) swap(); el.remove(); fix.remove(); });
}
