// Gestures: physical dragging (follow the finger, rubber band, momentum, snap points, spring release) and
// continuous gesture triggers (pan, scrub, pinch/rotate, hold, wheel, velocity-aware swipes).
//
//   <frame drag=x bounds="-96..0" snap="0, -96" drag-index=open/>      a swipe-to-reveal row
//   <row drag=x snap=page drag-index=$page/>                           a paging carousel
//   <frame drag=y snap="0, 55%" elastic=0.2 drag-progress=$sheet/>      a bottom sheet driving a backdrop
//   <frame drag=xy bounds=parent on:drag-end="if {abs(x) > 120} then inc $card"/>
//   <stack on:scrub="change value={px}"/>                               a slider (press = jump, move = scrub)
//   <frame on:pinch="set $zoom = {clamp(scale0 * scale, 1, 4)}"/>      two fingers, or ctrl + wheel
//
// Physics follow Apple's "Designing Fluid Interfaces" (WWDC 2018): the release point is *projected* with the
// finger's velocity (deceleration 0.99 per ms, like UIScrollView .fast) and the nearest snap point to that
// projection wins; past the bounds the layer rubber-bands ((1 − 1/(x·c/d + 1))·d, c = 0.55) and the release
// is a critically-damped-ish spring that keeps the finger's velocity, so the hand-off feels continuous.
// A touch slop (6 px) separates a tap from a drag, and the axis locks so a horizontal drag still lets the page scroll.

const SLOP = 6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rubber = (x, d, c) => (x === 0 ? 0 : Math.sign(x) * (1 - 1 / ((Math.abs(x) * c) / Math.max(1, d) + 1)) * d);
export const project = (v, rate = 0.99) => (v * rate) / (1 - rate); // v in px/ms → distance travelled

// "-96..0" | "x=-100..0 y=0..300" | "parent"
function parseRange(s) { const m = /^(-?[\d.]+%?)\.\.(-?[\d.]+%?)$/.exec(String(s).trim()); return m ? [m[1], m[2]] : null; }
export function parseDrag(a) {
  const axis = String(a.drag === true ? 'xy' : a.drag).toLowerCase();
  const spec = { x: axis.includes('x') || axis === 'both', y: axis.includes('y') || axis === 'both', bounds: { x: null, y: null }, parentBounds: false, snap: { x: null, y: null }, page: false,
    elastic: a.elastic != null ? +a.elastic : 0.35, momentum: a.momentum === 'false' || a.momentum === false ? 0 : a.momentum != null && a.momentum !== true ? +a.momentum : 0.99,
    stiffness: 320, damping: 30 };
  if (a.release) { const m = /spring\(\s*([\d.]+)\s*,\s*([\d.]+)/.exec(String(a.release)); if (m) { spec.stiffness = +m[1]; spec.damping = +m[2]; } }
  const b = a.bounds != null ? String(a.bounds).trim() : '';
  if (b === 'parent') spec.parentBounds = true;
  else if (b) {
    const parts = b.split(/\s+/);
    for (const p of parts) { const kv = /^(x|y)=(.+)$/.exec(p); const r = parseRange(kv ? kv[2] : p); if (!r) continue; if (kv) spec.bounds[kv[1]] = r; else spec.bounds[spec.x ? 'x' : 'y'] = r; }
    if (parts.length === 1 && !/^(x|y)=/.test(parts[0]) && spec.x && spec.y) spec.bounds.y = spec.bounds.x;
  }
  const s = a.snap != null ? String(a.snap).trim() : '';
  if (s === 'page') spec.page = true;
  else if (s) {
    const axes = /(^|\s)(x|y)=/.test(s) ? Object.fromEntries(s.split(/\s+(?=[xy]=)/).map((p) => [p[0], p.slice(2)])) : { [spec.x && !spec.y ? 'x' : spec.y && !spec.x ? 'y' : 'x']: s };
    for (const [k, v] of Object.entries(axes)) spec.snap[k] = v.split(/\s*,\s*/).filter(Boolean);
  }
  return spec;
}

// "40" | "-50%" (of the layer's own size on that axis) → px
const px = (v, size) => (String(v).endsWith('%') ? (parseFloat(v) / 100) * size : +v);

// Mixed into Player.prototype
export const GestureMixin = {
  // ------------------------------------------------------------------ drag
  bindDrag(el, a, bind) {
    const spec = parseDrag(a);
    if (!spec.x && !spec.y) return;
    const gk = el.dataset.gk;
    this.dragPos = this.dragPos || {}; this.dragAnim = this.dragAnim || {};
    el.dataset.hot = '1'; el.dataset.drag = spec.x && spec.y ? 'xy' : spec.x ? 'x' : 'y';
    el.style.touchAction = spec.x && spec.y ? 'none' : spec.x ? 'pan-y' : 'pan-x';
    el.style.userSelect = 'none'; el.style.webkitUserSelect = 'none';
    if (!el.style.cursor) el.style.cursor = 'grab';
    el._drag = { spec, bind };
    const cached = this.dragPos[gk];
    if (cached) this.applyDrag(el, cached);
    // once laid out: resolve the rest position from the bound value (a `set $page = 2` animates there)
    const settle = (k = 0) => {
      if (!el.isConnected || !el.offsetWidth) { if (k < 20) requestAnimationFrame(() => settle(k + 1)); return; }
      if (this.dragAnim[gk] && this.dragAnim[gk].live) return; // a drag or a release spring owns the position
      const g = this.dragGeom(el);
      const want = this.restFromBinding(el, g);
      if (!want) return;
      const cur = this.dragPos[gk] || { x: 0, y: 0 };
      if (Math.abs(want.x - cur.x) < 0.5 && Math.abs(want.y - cur.y) < 0.5) { this.dragPos[gk] = want; this.applyDrag(el, want); return; }
      if (!cached) { this.dragPos[gk] = want; this.applyDrag(el, want); return; } // first mount: no travel
      this.springTo(gk, cur, want, { x: 0, y: 0 }, false);
    };
    requestAnimationFrame(() => settle());

    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      if (e.target.closest('[data-drag]') !== el) return; // the innermost draggable wins
      const live = this.dragAnim[gk]; if (live) live.stop();
      const g = this.dragGeom(el);
      const start = { ...(this.dragPos[gk] || { x: 0, y: 0 }) };
      const p0 = { x: e.clientX, y: e.clientY };
      let active = false, cancelled = false; const samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
      let pos = { ...start };
      const state = { live: true, stop: () => {} }; this.dragAnim[gk] = state;
      const move = (ev) => {
        if (cancelled) return;
        const dx = (ev.clientX - p0.x) / g.scale, dy = (ev.clientY - p0.y) / g.scale;
        if (!active) {
          const along = spec.x && spec.y ? Math.hypot(dx, dy) : spec.x ? Math.abs(dx) : Math.abs(dy);
          const across = spec.x && spec.y ? 0 : spec.x ? Math.abs(dy) : Math.abs(dx);
          if (across > SLOP && across > along) { cancelled = true; end(); return; } // the other axis: let it scroll
          if (along < SLOP) return;
          active = true; document.body.style.cursor = 'grabbing';
          this.fireDrag(el, 'on:drag-start', { x: pos.x, y: pos.y, dx: 0, dy: 0, vx: 0, vy: 0, progress: this.dragProgress(g, pos), index: this.nearestIndex(g, pos) });
        }
        ev.preventDefault();
        samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY }); while (samples.length > 2 && ev.timeStamp - samples[0].t > 90) samples.shift();
        for (const k of ['x', 'y']) {
          if (!spec[k]) continue;
          const raw = start[k] + (k === 'x' ? dx : dy); const [lo, hi] = g.range[k];
          const d = k === 'x' ? g.w : g.h;
          pos[k] = raw < lo ? lo - rubber(lo - raw, d, spec.elastic) : raw > hi ? hi + rubber(raw - hi, d, spec.elastic) : raw;
          if (!spec.elastic) pos[k] = clamp(raw, lo, hi);
        }
        this.dragPos[gk] = { ...pos }; this.applyDrag(this.dragEl(gk) || el, pos);
        this.writeDragProgress(el, g, pos);
        const v = vel(samples, g.scale);
        this.fireDrag(el, 'on:drag', { x: pos.x, y: pos.y, dx, dy, vx: v.x, vy: v.y, progress: this.dragProgress(g, pos), index: this.nearestIndex(g, pos) });
      };
      const up = (ev) => {
        end();
        if (!active) return;
        // a drag is not a click
        const eat = (c) => { c.stopPropagation(); c.preventDefault(); window.removeEventListener('click', eat, true); };
        window.addEventListener('click', eat, true); setTimeout(() => window.removeEventListener('click', eat, true), 0);
        const v = vel(samples, g.scale, ev.timeStamp);
        const target = { ...pos };
        for (const k of ['x', 'y']) {
          if (!spec[k]) continue;
          const proj = pos[k] + (spec.momentum ? project(v[k], spec.momentum) : 0);
          const snaps = g.snaps[k];
          if (snaps && snaps.length) {
            const near = (p) => snaps.reduce((b, s) => (Math.abs(s - p) < Math.abs(b - p) ? s : b), snaps[0]);
            target[k] = near(proj);
            // a deliberate flick always reaches the neighbouring snap point (pagers, sheets), even a short one
            const from = near(start[k]);
            if (target[k] === from && Math.abs(v[k]) >= 0.15) { const sorted = [...snaps].sort((a, b) => a - b); const i = sorted.indexOf(from) + Math.sign(v[k]); if (sorted[i] != null) target[k] = sorted[i]; }
          }
          else target[k] = clamp(spec.momentum ? proj : pos[k], g.range[k][0], g.range[k][1]);
        }
        const index = this.nearestIndex(g, target);
        this.fireDrag(el, 'on:drag-end', { x: target.x, y: target.y, dx: pos.x - start.x, dy: pos.y - start.y, vx: v.x, vy: v.y, progress: this.dragProgress(g, target), index });
        if (bind.index) { this.writeBound(bind.index, index); this.scheduleRerender(); }
        this.springTo(gk, pos, target, v, true, g);
      };
      const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); document.body.style.cursor = ''; if (!active) state.live = false; };
      window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
  },

  dragEl(gk) { const q = `[data-gk="${CSS.escape(gk)}"]`; return (this.current && this.current.querySelector(q)) || (this.host && this.host.querySelector(q)); },
  applyDrag(el, pos) { el.style.translate = `${Math.round(pos.x * 100) / 100}px ${Math.round(pos.y * 100) / 100}px`; },

  // the layer's size, travel range and snap points, in unscaled px
  dragGeom(el) {
    const { spec } = el._drag;
    const r = el.getBoundingClientRect(); const s = r.width / (el.offsetWidth || r.width) || 1;
    const w = el.offsetWidth, h = el.offsetHeight;
    const cur = this.dragPos[el.dataset.gk] || { x: 0, y: 0 };
    const range = { x: [-Infinity, Infinity], y: [-Infinity, Infinity] }; const snaps = { x: null, y: null };
    const par = el.parentElement;
    if (spec.parentBounds || spec.page) {
      const pr = par.getBoundingClientRect();
      const left = (r.left - pr.left) / s - cur.x, top = (r.top - pr.top) / s - cur.y; // untranslated offset in the parent
      const pw = par.clientWidth, ph = par.clientHeight;
      range.x = [Math.min(0, pw - w - left), Math.max(0, -left)]; range.y = [Math.min(0, ph - h - top), Math.max(0, -top)];
      if (spec.page) {
        for (const k of ['x', 'y']) {
          if (!spec[k]) continue;
          const page = k === 'x' ? pw : ph; const n = Math.max(1, Math.round((k === 'x' ? w : h) / page));
          snaps[k] = Array.from({ length: n }, (_, i) => Math.max(range[k][0], -i * page));
        }
      }
    }
    for (const k of ['x', 'y']) {
      const b = spec.bounds[k]; const size = k === 'x' ? w : h;
      if (b) range[k] = [Math.min(px(b[0], size), px(b[1], size)), Math.max(px(b[0], size), px(b[1], size))];
      if (spec.snap[k]) snaps[k] = spec.snap[k].map((v) => px(v, size));
      if (snaps[k] && !b && !spec.parentBounds && !spec.page) range[k] = [Math.min(...snaps[k]), Math.max(...snaps[k])];
      if (!spec[k]) range[k] = [0, 0];
    }
    return { w, h, scale: s, range, snaps, spec };
  },
  mainAxis(g) { return g.spec.x && !g.spec.y ? 'x' : g.spec.y && !g.spec.x ? 'y' : 'x'; },
  // progress runs from the first snap point to the last one as written (snap="0, -360": 0 = rest, 1 = open), else lo..hi
  progressSpan(g) { const k = this.mainAxis(g); const sn = g.snaps[k]; if (sn && sn.length > 1) return [sn[0], sn[sn.length - 1]]; return g.range[k]; },
  dragProgress(g, pos) { const k = this.mainAxis(g); const [a, b] = this.progressSpan(g); if (!isFinite(a) || !isFinite(b) || a === b) return 0; return +clamp((pos[k] - a) / (b - a), 0, 1).toFixed(4); },
  nearestIndex(g, pos) { const k = this.mainAxis(g); const sn = g.snaps[k]; if (!sn || !sn.length) return 0; let best = 0; sn.forEach((s, i) => { if (Math.abs(s - pos[k]) < Math.abs(sn[best] - pos[k])) best = i; }); return best; },
  restFromBinding(el, g) {
    const { bind } = el._drag; const k = this.mainAxis(g); const cur = { ...(this.dragPos[el.dataset.gk] || { x: 0, y: 0 }) };
    if (bind.index && g.snaps[k]) { const i = clamp(Math.round(+this.readBound(bind.index) || 0), 0, g.snaps[k].length - 1); cur[k] = g.snaps[k][i]; return cur; }
    if (bind.progress) { const [a, b] = this.progressSpan(g); if (!isFinite(a) || !isFinite(b)) return null; const p = +this.readBound(bind.progress); if (!isFinite(p)) return null; cur[k] = a + clamp(p, 0, 1) * (b - a); return cur; }
    return null;
  },
  writeDragProgress(el, g, pos) {
    const { bind } = el._drag; if (!bind.progress) return;
    const p = this.dragProgress(g, pos);
    if (this.readBound(bind.progress) !== p) { this.writeBound(bind.progress, p); this.scheduleRerender(); }
  },
  fireDrag(el, trig, locals) {
    const ev = el._mqEvents && el._mqEvents[trig]; if (!ev) return;
    this.exec(ev.action, ev.scope.child(locals), el, { instant: true });
  },

  // spring from → to, starting with the finger's velocity (px/ms); writes the bound progress on the way
  springTo(gk, from, to, v0, live, g0) {
    const prev = this.dragAnim[gk]; if (prev && prev.raf) cancelAnimationFrame(prev.raf);
    const el0 = this.dragEl(gk); if (!el0 || !el0._drag) return;
    const { stiffness: k, damping: c } = el0._drag.spec;
    const pos = { ...from }; const vel = { x: (v0.x || 0) * 1000, y: (v0.y || 0) * 1000 }; // px/s
    const st = { live: true, raf: 0, stop: () => { cancelAnimationFrame(st.raf); st.live = false; } };
    this.dragAnim[gk] = st;
    let last = performance.now();
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (now) => {
      const el = this.dragEl(gk);
      let dt = Math.min(0.032, (now - last) / 1000); last = now;
      let done = true;
      for (const a of ['x', 'y']) {
        if (reduce) { pos[a] = to[a]; continue; }
        // two half-steps (semi-implicit Euler) for stability
        for (let i = 0; i < 2; i++) { const h = dt / 2; const f = -k * (pos[a] - to[a]) - c * vel[a]; vel[a] += f * h; pos[a] += vel[a] * h; }
        if (Math.abs(pos[a] - to[a]) > 0.3 || Math.abs(vel[a]) > 8) done = false;
      }
      if (done) { pos.x = to.x; pos.y = to.y; }
      this.dragPos[gk] = { ...pos };
      if (el) { this.applyDrag(el, pos); if (el._drag && el._drag.bind.progress) this.writeDragProgress(el, g0 || this.dragGeom(el), pos); }
      if (done) { st.live = false; const e2 = this.dragEl(gk); if (e2) this.fireDrag(e2, 'on:drag-rest', { x: pos.x, y: pos.y, index: g0 ? this.nearestIndex(g0, pos) : 0 }); return; }
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
  },

  // ------------------------------------------------------------------ continuous triggers
  bindGestures(el, events) {
    const has = (re) => Object.keys(events).filter((k) => re.test(k));
    const fire = (trig, locals, e) => { const ev = events[trig]; if (!ev) return; if (e) e.stopPropagation(); this.emit('trigger', { el, action: ev.action }); this.exec(ev.action, ev.scope.child(locals), el, { instant: true }); };
    let rect0 = null; const local = (e) => { const r = (el.isConnected || !rect0) ? (rect0 = el.getBoundingClientRect()) : rect0; const s = r.width / (el.offsetWidth || r.width) || 1; return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s, px: +clamp((e.clientX - r.left) / r.width, 0, 1).toFixed(4), py: +clamp((e.clientY - r.top) / r.height, 0, 1).toFixed(4), scale: s }; };
    const swipes = has(/^on:swipe-(left|right|up|down)$/); const pans = has(/^on:pan(-start|-end)?$/);
    const scrub = events['on:scrub'] || events['on:scrub-end'];
    if (swipes.length || pans.length || scrub) {
      el.dataset.hot = '1';
      const hz = swipes.some((s) => /left|right/.test(s)) || pans.length, vt = swipes.some((s) => /up|down/.test(s));
      if (!el.style.touchAction) el.style.touchAction = scrub || pans.length || (hz && vt) ? 'none' : hz ? 'pan-y' : 'pan-x';
      el.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        const p0 = { x: e.clientX, y: e.clientY }; const samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }]; let panning = false;
        const l0 = local(e);
        if (scrub) { e.preventDefault(); fire('on:scrub', l0, e); }
        const move = (ev) => {
          samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY }); while (samples.length > 2 && ev.timeStamp - samples[0].t > 90) samples.shift();
          const l = local(ev); const dx = (ev.clientX - p0.x) / l.scale, dy = (ev.clientY - p0.y) / l.scale; const v = vel(samples, l.scale);
          if (scrub) fire('on:scrub', l);
          if (pans.length) {
            if (!panning && Math.hypot(dx, dy) > SLOP) { panning = true; fire('on:pan-start', { ...l, dx, dy, vx: 0, vy: 0 }); }
            if (panning) { ev.preventDefault(); fire('on:pan', { ...l, dx, dy, vx: v.x, vy: v.y }); }
          }
        };
        const up = (ev) => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
          const l = local(ev); const dx = (ev.clientX - p0.x) / l.scale, dy = (ev.clientY - p0.y) / l.scale; const v = vel(samples, l.scale, ev.timeStamp);
          if (scrub && events['on:scrub-end']) fire('on:scrub-end', l);
          if (panning) fire('on:pan-end', { ...l, dx, dy, vx: v.x, vy: v.y });
          // swipe = a flick (≥ 0.3 px/ms over ≥ 12 px) or a long enough stroke (≥ 40 px), along a dominant axis
          const ax = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : Math.abs(dy) > Math.abs(dx) * 1.2 ? 'v' : null;
          if (ax) {
            const d = ax === 'h' ? dx : dy, sp = ax === 'h' ? v.x : v.y;
            const ok = Math.abs(d) >= 40 || (Math.abs(d) >= 12 && Math.abs(sp) >= 0.3 && Math.sign(sp) === Math.sign(d));
            const dir = ax === 'h' ? (d < 0 ? 'left' : 'right') : d < 0 ? 'up' : 'down';
            if (ok && events['on:swipe-' + dir]) {
              fire('on:swipe-' + dir, { dx, dy, vx: v.x, vy: v.y }, ev);
              const eat = (c) => { c.stopPropagation(); c.preventDefault(); window.removeEventListener('click', eat, true); };
              window.addEventListener('click', eat, true); setTimeout(() => window.removeEventListener('click', eat, true), 0);
            }
          }
        };
        window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      });
    }
    // press and hold: fires at once, then repeats (400 ms, then faster and faster) — steppers, scrubbing a value
    if (events['on:hold']) {
      el.dataset.hot = '1';
      el.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        let n = 0, t; fire('on:hold', { n: n++ }, e);
        const next = (ms) => { t = setTimeout(() => { fire('on:hold', { n: n++ }); next(Math.max(40, ms * 0.8)); }, ms); };
        next(400);
        const stop = () => { clearTimeout(t); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); el.removeEventListener('pointerleave', stop); };
        window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); el.addEventListener('pointerleave', stop);
      });
    }
    // pinch / rotate: two pointers; with a mouse, ctrl + wheel zooms and shift + wheel rotates
    const pinch = events['on:pinch'] || events['on:rotate'] || events['on:pinch-end'];
    if (pinch) {
      el.dataset.hot = '1'; el.style.touchAction = 'none';
      const ptrs = new Map(); let base = null;
      const geo = () => { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(b.x - a.x, b.y - a.y), ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
      const both = (locals) => { fire('on:pinch', locals); fire('on:rotate', locals); };
      el.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) base = geo(); });
      window.addEventListener('pointermove', (e) => {
        if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.size === 2 && base) { const g = geo(); both({ scale: +(g.d / base.d).toFixed(4), angle: +(g.ang - base.ang).toFixed(2) }); }
      });
      const lift = (e) => { if (!ptrs.delete(e.pointerId)) return; if (base && ptrs.size < 2) { base = null; fire('on:pinch-end', {}); } };
      window.addEventListener('pointerup', lift); window.addEventListener('pointercancel', lift);
      let wheelT; let acc = { scale: 1, angle: 0 };
      el.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.shiftKey && !e.metaKey) return;
        e.preventDefault(); e.stopPropagation();
        if (e.shiftKey) acc.angle += (e.deltaY || e.deltaX) * 0.3; else acc.scale *= Math.exp(-e.deltaY / 200);
        both({ scale: +acc.scale.toFixed(4), angle: +acc.angle.toFixed(2) });
        clearTimeout(wheelT); wheelT = setTimeout(() => { acc = { scale: 1, angle: 0 }; fire('on:pinch-end', {}); }, 220);
      }, { passive: false });
    }
    if (events['on:wheel']) {
      el.addEventListener('wheel', (e) => { if (e.ctrlKey) return; e.preventDefault(); fire('on:wheel', { dx: e.deltaX, dy: e.deltaY }, e); }, { passive: false });
    }
  },
};

// finger velocity over the last ~90 ms, px/ms in layer space
// velocity over the last ~90 ms of moves (the up event repeats the last position, so it is not a sample);
// a finger that stopped before lifting (> 100 ms since the last move) has no velocity — like Android's VelocityTracker
function vel(samples, scale = 1, upT) {
  if (samples.length < 2 || (upT != null && upT - samples[samples.length - 1].t > 100)) return { x: 0, y: 0 };
  const a = samples[0], b = samples[samples.length - 1]; const dt = Math.max(8, b.t - a.t);
  return { x: (b.x - a.x) / scale / dt, y: (b.y - a.y) / scale / dt };
}
