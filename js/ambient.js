export function initAmbient(canvas) {
  const g = canvas.getContext('2d');
  let W = 0, H = 0;
  const fit = () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; };
  fit();
  addEventListener('resize', fit);
  const dust = Array.from({ length: 90 }, () => {
    const r = Math.random();
    return {
      x: Math.random() * W, y: Math.random() * H,
      s: .5 + Math.random() * 1.3, vy: -(.01 + Math.random() * .03), vx: (Math.random() - .5) * .02,
      a: .12 + Math.random() * .4, p: Math.random() * 6.28,
      c: r < .68 ? '89,217,255' : r < .86 ? '255,163,26' : '220,240,250',
    };
  });
  let last = 0;
  const frame = t => {
    requestAnimationFrame(frame);
    if (document.hidden || document.documentElement.classList.contains('lite')) return;
    const dt = Math.min(t - last, 50);
    last = t;
    g.clearRect(0, 0, W, H);
    for (const d of dust) {
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.y < -4) { d.y = H + 4; d.x = Math.random() * W; }
      if (d.x < -4) d.x = W + 4; else if (d.x > W + 4) d.x = -4;
      g.fillStyle = `rgba(${d.c},${d.a * (.7 + .3 * Math.sin(t / 1400 + d.p))})`;
      g.beginPath();
      g.arc(d.x, d.y, d.s, 0, 6.2832);
      g.fill();
    }
  };
  requestAnimationFrame(frame);
}
