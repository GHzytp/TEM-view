// Panel widgets: bakelite knobs with brass skirts, the hand-magnet pad and the vacuum gauge.
// Knobs turn by vertical drag, wheel or arrow keys (Shift = fine); each is an ARIA slider.

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.appendChild(e); return e; };

export class Knob {
  constructor(host, o) {
    Object.assign(this, { min: 0, max: 1, value: 0, fmt: (v) => v.toFixed(2), sens: 1, onInput: () => {}, onFocus: () => {} }, o);
    this.root = document.createElement('div'); this.root.className = 'knob'; this.root.dataset.k = o.id;
    this.root.innerHTML = `<span class="kl">${o.label}</span>`;
    const svg = el('svg', { viewBox: '-40 -40 80 80', role: 'slider', tabindex: 0, 'aria-label': o.aria || o.label, 'aria-valuemin': this.min, 'aria-valuemax': this.max });
    this.svg = svg;
    for (let i = 0; i <= 10; i++) { const a = (-135 + i * 27) * Math.PI / 180, r0 = 33, r1 = i % 5 ? 36 : 38.5;
      el('line', { x1: r0 * Math.sin(a), y1: -r0 * Math.cos(a), x2: r1 * Math.sin(a), y2: -r1 * Math.cos(a), stroke: i % 5 ? '#6b6358' : '#c9a04e', 'stroke-width': i % 5 ? 1.2 : 1.8, 'stroke-linecap': 'round' }, svg); }
    const defs = el('defs', {}, svg);
    const g1 = el('radialGradient', { id: `kb-${o.id}`, cx: '35%', cy: '30%', r: '75%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#4a3f33' }, g1); el('stop', { offset: '60%', 'stop-color': '#1b1612' }, g1); el('stop', { offset: '100%', 'stop-color': '#0b0907' }, g1);
    const g2 = el('linearGradient', { id: `ks-${o.id}`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': '#f0cf86' }, g2); el('stop', { offset: '55%', 'stop-color': '#a87a2c' }, g2); el('stop', { offset: '100%', 'stop-color': '#5c3f12' }, g2);
    el('circle', { r: 29, fill: `url(#ks-${o.id})` }, svg);
    this.dial = el('g', {}, svg);
    for (let i = 0; i < 24; i++) { const a = (i * 15) * Math.PI / 180; el('circle', { cx: 25.5 * Math.sin(a), cy: 25.5 * Math.cos(a), r: 2.4, fill: '#120f0c' }, this.dial); }
    el('circle', { r: 24, fill: `url(#kb-${o.id})`, stroke: '#000', 'stroke-width': 0.6 }, this.dial);
    el('line', { x1: 0, y1: -8, x2: 0, y2: -21, stroke: '#efe2c7', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, this.dial);
    this.root.appendChild(svg);
    this.out = document.createElement('span'); this.out.className = 'kv'; this.root.appendChild(this.out);
    host.appendChild(this.root);
    this.bind(); this.set(this.value, false);
  }
  get range() { return this.max - this.min; }
  set(v, emit = true) {
    this.value = Math.min(this.max, Math.max(this.min, v));
    const f = (this.value - this.min) / this.range;
    this.dial.setAttribute('transform', `rotate(${-135 + 270 * f})`);
    const txt = this.fmt(this.value); this.out.textContent = txt;
    this.svg.setAttribute('aria-valuenow', this.value.toFixed(5)); this.svg.setAttribute('aria-valuetext', txt);
    if (emit) this.onInput(this.value);
  }
  setFmt() { this.out.textContent = this.fmt(this.value); }
  disable(b) { this.root.classList.toggle('off', b); this.svg.setAttribute('aria-disabled', b); this.svg.tabIndex = b ? -1 : 0; }
  bind() {
    let y0 = null, x0 = 0;
    this.svg.addEventListener('pointerdown', (e) => { y0 = e.clientY; x0 = e.clientX; this.svg.setPointerCapture(e.pointerId); this.svg.focus({ preventScroll: true }); e.preventDefault(); });
    this.svg.addEventListener('pointermove', (e) => { if (y0 === null) return;
      // drag up or right to turn clockwise; hold Shift for fine steps
      const d = (e.clientX - x0) + (y0 - e.clientY); x0 = e.clientX; y0 = e.clientY;
      this.set(this.value + (d / 260) * this.range * this.sens * (e.shiftKey ? 0.1 : 1)); });
    const end = () => { y0 = null; };
    this.svg.addEventListener('pointerup', end); this.svg.addEventListener('pointercancel', end);
    this.svg.addEventListener('wheel', (e) => { e.preventDefault(); this.set(this.value - Math.sign(e.deltaY) * this.range * (e.shiftKey ? 0.002 : 0.012) * this.sens); }, { passive: false });
    this.svg.addEventListener('keydown', (e) => {
      const st = this.range * (e.shiftKey ? 0.002 : 0.01) * this.sens;
      const map = { ArrowUp: st, ArrowRight: st, ArrowDown: -st, ArrowLeft: -st, PageUp: st * 10, PageDown: -st * 10 };
      if (e.key in map) { this.set(this.value + map[e.key]); e.preventDefault(); }
      else if (e.key === 'Home') { this.set(this.min); e.preventDefault(); } else if (e.key === 'End') { this.set(this.max); e.preventDefault(); } });
    this.svg.addEventListener('focus', () => this.onFocus());
    this.root.addEventListener('pointerenter', () => this.onFocus());
  }
}

// The hand magnet as a map of the viewing window: the ring is the window, the glow is the beam spot where it
// really falls on the screen. Drag the spot and it moves the same way on the screen. Near the centre the map is
// linear and scales with the magnification (fine steps at 12,000×); far out it compresses, so a beam far off
// the axis is still on the map and can be pulled back in one drag.
//   o.get() → { d: [x, y] beam offset on the screen (µm in the specimen, screen-aligned), s: window radius (µm), rs: spot radius (µm), on }
//   o.set([x, y]) puts the beam at that screen offset
export class MagnetMap {
  constructor(host, o) {
    Object.assign(this, { onFocus: () => {} }, o);
    this.root = document.createElement('div'); this.root.className = 'pad'; this.root.tabIndex = 0; this.root.setAttribute('role', 'application');
    this.root.setAttribute('aria-label', o.aria || 'Hand magnet: drag the beam spot into the ring, or use the arrow keys');
    this.cv = document.createElement('canvas'); this.root.appendChild(this.cv); host.appendChild(this.root);
    // dragging is incremental: the beam moves exactly in the direction of the finger, by the map's local scale
    let last = null;
    this.root.addEventListener('pointerdown', (e) => { try { this.root.setPointerCapture(e.pointerId); } catch {} last = [e.clientX, e.clientY]; e.preventDefault(); });
    this.root.addEventListener('pointermove', (e) => { if (!last) return;
      const dx = e.clientX - last[0], dy = -(e.clientY - last[1]); last = [e.clientX, e.clientY];
      const g = this.get(), k = this.gain(g) * (e.shiftKey ? 0.2 : 1);
      this.set([g.d[0] + dx * k, g.d[1] + dy * k]); this.draw(); });
    const up = () => { last = null; }; this.root.addEventListener('pointerup', up); this.root.addEventListener('pointercancel', up);
    this.root.addEventListener('keydown', (e) => { const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key]; if (!k) return;
      this.nudge(k[0], k[1], e.shiftKey ? 0.01 : 0.05); e.preventDefault(); });
    this.root.addEventListener('focus', () => this.onFocus()); this.root.addEventListener('pointerenter', () => this.onFocus());
    new ResizeObserver(() => this.draw()).observe(this.root);
  }
  get R() { return (this.cv.clientWidth || 150) / 2 - 4; }
  // screen offset (µm) → map position (px): r = R d / (d + s)
  toMap(d, s) { const L = Math.hypot(d[0], d[1]); if (!L) return [0, 0]; const r = (this.R * L) / (L + s); return [(d[0] / L) * r, (d[1] / L) * r]; }
  // µm of beam movement per pixel of finger movement where the beam is now: dL/dr of the map, capped at the rim
  gain(g) { const r = Math.min(Math.hypot(...this.toMap(g.d, g.s)), this.R * 0.9); return (g.s * this.R) / (this.R - r) ** 2; }
  // move the beam by a fraction of the window radius, in screen directions
  nudge(x, y, f) { const g = this.get(); this.set([g.d[0] + x * f * g.s, g.d[1] + y * f * g.s]); this.draw(); }
  draw() {
    const cv = this.cv, w = cv.clientWidth, dpr = Math.min(devicePixelRatio || 1, 2); if (!w) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = cv.height = Math.round(w * dpr); }
    const c = cv.getContext('2d'), R = this.R, g = this.get();
    c.setTransform(dpr, 0, 0, -dpr, (w / 2) * dpr, (w / 2) * dpr); c.clearRect(-w, -w, 2 * w, 2 * w);
    // the viewing window (d = s) and the axis
    c.strokeStyle = 'rgba(224,178,94,0.75)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, R / 2, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(255,236,200,0.12)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, R, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0); c.moveTo(0, -5); c.lineTo(0, 5); c.strokeStyle = 'rgba(255,236,200,0.5)'; c.stroke();
    // the beam spot, its size mapped the same way
    const p = this.toMap(g.d, g.s), L = Math.hypot(g.d[0], g.d[1]);
    const rOut = (R * (L + g.rs)) / (L + g.rs + g.s), rIn = (R * Math.max(0, L - g.rs)) / (Math.max(0, L - g.rs) + g.s);
    const rad = Math.max(4, (rOut - rIn) / 2);
    const gr = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
    const a = g.on ? 0.95 : 0.35;
    gr.addColorStop(0, `rgba(200,255,170,${a})`); gr.addColorStop(0.7, `rgba(120,230,90,${a * 0.6})`); gr.addColorStop(1, 'rgba(120,230,90,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(p[0], p[1], rad, 0, 7); c.fill();
    c.strokeStyle = g.on ? 'rgba(220,255,200,0.9)' : 'rgba(220,255,200,0.4)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p[0], p[1], Math.min(rad, 9), 0, 7); c.stroke();
  }
}

// Log-scale vacuum gauge, 10³ … 10⁻⁵ mbar
export class Gauge {
  constructor(host) {
    const svg = el('svg', { viewBox: '-60 -54 120 64', 'aria-hidden': 'true' }); host.appendChild(svg);
    el('path', { d: 'M -50 0 A 50 50 0 0 1 50 0', fill: 'none', stroke: '#3a3226', 'stroke-width': 8 }, svg);
    el('path', { d: `M ${-50 * Math.cos(Math.PI * 0.25)} ${-50 * Math.sin(Math.PI * 0.25)} A 50 50 0 0 1 50 0`, fill: 'none', stroke: '#2f4a28', 'stroke-width': 8 }, svg);
    for (let e = 3; e >= -5; e--) { const f = (3 - e) / 8, a = Math.PI * (1 - f); const x = Math.cos(a), y = -Math.sin(a);
      el('line', { x1: 44 * x, y1: 44 * y, x2: 55 * x, y2: 55 * y, stroke: '#9a9184', 'stroke-width': 1 }, svg);
      if (e % 2 !== 0 || e === 0) { const t = el('text', { x: 36 * x, y: 36 * y + 3, 'text-anchor': 'middle', 'font-size': 7, fill: '#8a8174', 'font-family': 'IBM Plex Mono, monospace' }, svg); t.textContent = e; } }
    this.needle = el('line', { x1: 0, y1: 0, x2: -46, y2: 0, stroke: '#e0b25e', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    el('circle', { r: 3.5, fill: '#e0b25e' }, svg);
  }
  set(logP) { const f = Math.min(1, Math.max(0, (3 - logP) / 8)); this.needle.setAttribute('transform', `rotate(${180 * f})`); }
}
