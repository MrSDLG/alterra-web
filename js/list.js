const BUF = 4;

export class VList {
  constructor(host, { rowH, build, fill, onPick }) {
    this.host = host;
    this.rowH = rowH;
    this.build = build;
    this.fill = fill;
    this.onPick = onPick;
    this.items = [];
    this.pool = [];
    this.active = -1;
    this.spacer = document.createElement('div');
    this.spacer.className = 'vspacer';
    host.append(this.spacer);
    host.addEventListener('scroll', () => this.update(), { passive: true });
    new ResizeObserver(() => this.layout()).observe(host);
    host.addEventListener('click', e => {
      const row = e.target.closest('.vrow');
      if (row) onPick(this.items[+row.dataset.idx], +row.dataset.idx);
    });
  }

  setItems(items, resetScroll = true) {
    this.items = items;
    this.active = -1;
    this.spacer.style.height = `${items.length * this.rowH}px`;
    if (resetScroll) this.host.scrollTop = 0;
    this.update(true);
  }

  layout() {
    const need = Math.ceil(this.host.clientHeight / this.rowH) + BUF * 2;
    while (this.pool.length < need) {
      const n = this.build();
      n.style.height = `${this.rowH}px`;
      this.spacer.append(n);
      this.pool.push(n);
    }
    this.update(true);
  }

  update(force = false) {
    const P = this.pool.length;
    if (!P) return;
    const first = Math.max(0, Math.floor(this.host.scrollTop / this.rowH) - BUF);
    for (let idx = first; idx < first + P; idx++) {
      const n = this.pool[idx % P];
      if (idx >= this.items.length) { n.style.display = 'none'; n.dataset.idx = ''; continue; }
      n.style.display = '';
      n.style.transform = `translateY(${idx * this.rowH}px)`;
      if (force || n.dataset.idx !== String(idx)) {
        n.dataset.idx = idx;
        this.fill(n, this.items[idx], idx);
      }
      n.classList.toggle('active', idx === this.active);
    }
  }

  setActive(idx) {
    if (!this.items.length) return;
    idx = Math.max(0, Math.min(this.items.length - 1, idx));
    this.active = idx;
    const top = idx * this.rowH;
    const h = this.host.clientHeight;
    if (top < this.host.scrollTop) this.host.scrollTop = top;
    else if (top + this.rowH > this.host.scrollTop + h) this.host.scrollTop = top + this.rowH - h;
    this.update();
  }

  page() { return Math.max(1, Math.floor(this.host.clientHeight / this.rowH) - 1); }
}
