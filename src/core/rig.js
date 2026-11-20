// Custom rigs: any element (or a component, for all its instances) can expose draggable controls that
// drive an attribute, a component prop or a $variable.
//
//   <shape kind=star rig:points="x 3..12 step=1"/>                       a node attribute
//   <component name=Knob props="value=0.5" rig:value="angle 0..1">      a prop of every instance
//   <frame rig:$volume="y 100..0 step=1 in=track"/>                     a variable (live in the prototype)
//
// Spec: "<mode> <min>..<max> [step=n] [from=deg] [to=deg] [in=childName] [at=f] [group=g] [label=…]"
// Modes: x (horizontal), y (vertical), angle (around the centre, from/to in degrees, 0 = up, clockwise),
// radius (distance from the centre), xy is obtained by giving two rigs (one x, one y) the same group.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function parseRig(spec) {
  const s = String(spec || '').trim();
  const words = s.split(/\s+/);
  const r = { mode: 'x', min: 0, max: 1, step: 0, from: -135, to: 135, in: null, at: null, group: null, label: null };
  for (const w of words) {
    const kv = /^([a-z]+)=(.+)$/.exec(w);
    if (kv) { const [, k, v] = kv; if (['step', 'from', 'to', 'at'].includes(k)) r[k] = +v; else r[k] = v; continue; }
    const range = /^(-?[\d.]+)\.\.(-?[\d.]+)$/.exec(w);
    if (range) { r.min = +range[1]; r.max = +range[2]; continue; }
    if (/^(x|y|angle|radius|h|v|rotate|dist)$/.test(w)) r.mode = { h: 'x', v: 'y', rotate: 'angle', dist: 'radius' }[w] || w;
  }
  return r;
}

const decimals = (step, min, max) => {
  if (step) { const s = String(step); return s.includes('.') ? s.split('.')[1].length : 0; }
  const span = Math.abs(max - min); return span >= 50 ? 0 : span >= 5 ? 1 : 2;
};
export function quantize(v, r) {
  let x = r.step ? Math.round((v - r.min) / r.step) * r.step + r.min : v;
  const lo = Math.min(r.min, r.max), hi = Math.max(r.min, r.max); x = clamp(x, lo, hi);
  return +x.toFixed(decimals(r.step, r.min, r.max));
}

// t ∈ [0,1] along the control → value, and back
const tOf = (v, r) => (r.max === r.min ? 0 : clamp((v - r.min) / (r.max - r.min), 0, 1));
const vOf = (t, r) => r.min + clamp(t, 0, 1) * (r.max - r.min);

// box: {x, y, w, h} in any coordinate space; returns the handle position for value v in that space
export function handlePos(r, v, box) {
  const t = tOf(+v || 0, r); const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  if (r.mode === 'x') return { x: box.x + t * box.w, y: box.y + (r.at ?? 0.5) * box.h };
  if (r.mode === 'y') return { x: box.x + (r.at ?? 0.5) * box.w, y: box.y + t * box.h };
  if (r.mode === 'radius') { const R = Math.min(box.w, box.h) / 2; const a = ((r.from === -135 ? -45 : r.from) * Math.PI) / 180; return { x: cx + Math.sin(a) * R * t, y: cy - Math.cos(a) * R * t }; }
  const deg = r.from + t * (r.to - r.from); const a = (deg * Math.PI) / 180; const R = (Math.min(box.w, box.h) / 2) * (r.at ?? 0.82);
  return { x: cx + Math.sin(a) * R, y: cy - Math.cos(a) * R };
}

// pointer (same space as box) → value
export function valueAt(r, px, py, box) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  if (r.mode === 'x') return quantize(vOf((px - box.x) / (box.w || 1), r), r);
  if (r.mode === 'y') return quantize(vOf((py - box.y) / (box.h || 1), r), r);
  if (r.mode === 'radius') return quantize(vOf(Math.hypot(px - cx, py - cy) / ((Math.min(box.w, box.h) / 2) || 1), r), r);
  let deg = (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI; // 0 = up, clockwise
  const lo = Math.min(r.from, r.to), hi = Math.max(r.from, r.to);
  // bring the angle into the swept range (or snap to the nearest end through the dead zone)
  for (const k of [0, 360, -360]) if (deg + k >= lo && deg + k <= hi) { deg += k; break; }
  if (deg < lo || deg > hi) { const mid = (lo + hi) / 2 + 180; const d = ((deg - mid) % 360 + 360) % 360; deg = d < 180 ? lo : hi; }
  return quantize(vOf((deg - r.from) / ((r.to - r.from) || 1), r), r);
}

// list of rig entries from an attrs object: [{ target, spec, r }]
export function rigsOf(attrs) {
  const out = [];
  for (const [k, v] of Object.entries(attrs || {})) if (k.startsWith('rig:') && v !== true) out.push({ target: k.slice(4), spec: String(v), r: parseRig(v) });
  return out;
}

// group rigs sharing `group=` into one 2D control: [{ rigs: [...], key }]
export function groupRigs(list) {
  const groups = []; const by = new Map();
  for (const g of list) {
    const k = g.r.group;
    if (k && by.has(k)) { by.get(k).rigs.push(g); continue; }
    const e = { rigs: [g], key: k || g.target }; groups.push(e); if (k) by.set(k, e);
  }
  return groups;
}
// handle position of a (possibly 2D) group
export function groupPos(group, values, box) {
  const ps = group.rigs.map((g) => handlePos(g.r, values[g.target], box));
  if (group.rigs.length === 1) return ps[0];
  const gx = group.rigs.find((g) => g.r.mode === 'x'), gy = group.rigs.find((g) => g.r.mode === 'y');
  return { x: gx ? handlePos(gx.r, values[gx.target], box).x : ps[0].x, y: gy ? handlePos(gy.r, values[gy.target], box).y : ps[0].y };
}
export function groupValues(group, px, py, box) {
  const out = {}; for (const g of group.rigs) out[g.target] = valueAt(g.r, px, py, box); return out;
}

// the box a rig works in: the element, or a named child (in=track)
export function rigBox(el, r) {
  if (r.in) { const sub = el.querySelector(`[data-key="${(globalThis.CSS && CSS.escape) ? CSS.escape(r.in) : r.in}"]`); if (sub) return sub.getBoundingClientRect(); }
  return el.getBoundingClientRect();
}
export const toBox = (rc) => ({ x: rc.left, y: rc.top, w: rc.width, h: rc.height });
