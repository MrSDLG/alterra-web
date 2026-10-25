const KEY = 'roearth.audio';
const FILES = { hover: 'audio/hover.ogg', click: 'audio/click.ogg', transition: 'audio/transition.ogg' };
const VOLUME = { hover: 0.35, click: 0.5, transition: 0.45 };

const prefs = { music: true, sfx: true, volume: 0.6 };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage blocked */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ } };

let ctx = null;
let sfxGain = null;
const buffers = {};
let music = null;
let started = false;
let fade = 0;
const MUSIC_LEVEL = 0.22;
const listeners = new Set();

export const onAudioChange = fn => listeners.add(fn);
const notify = () => listeners.forEach(fn => fn({ ...prefs }));
export const audioState = () => ({ ...prefs });

function ensure() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  sfxGain = ctx.createGain();
  sfxGain.connect(ctx.destination);
  applyVolume();
  Object.entries(FILES).forEach(([name, url]) => {
    fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { buffers[name] = buf; }).catch(() => {});
  });
}

function applyVolume() {
  if (sfxGain) sfxGain.gain.value = prefs.volume;
  if (music && !fade) music.volume = MUSIC_LEVEL * prefs.volume;
}

function fadeMusic(to, done) {
  cancelAnimationFrame(fade);
  const from = music.volume;
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 700);
    music.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) fade = requestAnimationFrame(step);
    else { fade = 0; done && done(); }
  };
  fade = requestAnimationFrame(step);
}

function playMusic() {
  if (!music) {
    music = new Audio('audio/ambient.mp3');
    music.loop = true;
    music.preload = 'none';
    music.volume = 0;
  }
  music.play().then(() => fadeMusic(MUSIC_LEVEL * prefs.volume)).catch(() => {});
}

function stopMusic() {
  if (music && !music.paused) fadeMusic(0, () => music.pause());
}

export function sfx(name) {
  if (!prefs.sfx || !ctx || !buffers[name]) return;
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  const g = ctx.createGain();
  g.gain.value = VOLUME[name] ?? 0.4;
  src.connect(g).connect(sfxGain);
  src.start();
}

export function setMusic(on) {
  prefs.music = on;
  save();
  if (on && started) playMusic(); else stopMusic();
  notify();
}

export function setSfx(on) { prefs.sfx = on; save(); notify(); }

export function setVolume(v) { prefs.volume = v; save(); applyVolume(); notify(); }

function firstGesture() {
  if (started) return;
  started = true;
  ensure();
  if (prefs.music) playMusic();
  notify();
}

export function initAudio() {
  const once = () => { firstGesture(); removeEventListener('pointerdown', once, true); removeEventListener('keydown', once, true); };
  addEventListener('pointerdown', once, true);
  addEventListener('keydown', once, true);

  let lastHover = null;
  let lastAt = 0;
  document.addEventListener('pointerover', e => {
    const t = e.target.closest('.snd, .vrow');
    if (!t || t === lastHover) return;
    lastHover = t;
    const now = performance.now();
    if (now - lastAt < 90) return;
    lastAt = now;
    sfx('hover');
  });
  document.addEventListener('pointerout', e => { if (!e.relatedTarget || !e.relatedTarget.closest?.('.snd, .vrow')) lastHover = null; });
  document.addEventListener('click', e => { if (e.target.closest('.snd, .vrow')) sfx('click'); });

  document.addEventListener('visibilitychange', () => {
    if (!music || !prefs.music || !started) return;
    if (document.hidden) music.pause(); else playMusic();
  });
}
