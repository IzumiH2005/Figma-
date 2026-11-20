// Motion: presets, springs, keyframes -> Web Animations API
export function springEasing(stiffness = 170, damping = 18, mass = 1, samples = 60) {
  // simulate a damped spring from 0 -> 1 ; returns { easing, duration }
  const w0 = Math.sqrt(stiffness / mass), zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const pos = (t) => {
    if (zeta < 1) { const wd = w0 * Math.sqrt(1 - zeta * zeta); return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t)); }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  let settle = 0;
  for (let t = 0; t < 5; t += 0.01) if (Math.abs(pos(t) - 1) > 0.002) settle = t;
  const dur = Math.max(0.2, settle + 0.02);
  const pts = []; for (let k = 0; k <= samples; k++) pts.push(+pos((k / samples) * dur).toFixed(4));
  pts[pts.length - 1] = 1;
  return { easing: `linear(${pts.join(', ')})`, duration: Math.round(dur * 1000) };
}

const SPRINGS = {
  spring: [170, 16], bouncy: [260, 12], snappy: [400, 30], gentle: [120, 20], wobbly: [180, 9], stiff: [500, 40],
};
export const EASINGS = {
  linear: 'linear', ease: 'ease', in: 'cubic-bezier(.4,0,1,1)', out: 'cubic-bezier(0,0,.2,1)', 'in-out': 'cubic-bezier(.4,0,.2,1)',
  smooth: 'cubic-bezier(.2,.8,.2,1)', expo: 'cubic-bezier(.16,1,.3,1)', cushion: 'cubic-bezier(.22,1,.36,1)', snap: 'cubic-bezier(.7,0,.2,1)', accelerate: 'cubic-bezier(.55,0,1,.45)', back: 'cubic-bezier(.34,1.56,.64,1)', anticipate: 'cubic-bezier(.68,-0.55,.27,1.55)',
  'ease-in': 'cubic-bezier(.4,0,1,1)', 'ease-out': 'cubic-bezier(0,0,.2,1)', 'ease-in-out': 'cubic-bezier(.4,0,.2,1)', standard: 'cubic-bezier(.2,0,0,1)', emphasized: 'cubic-bezier(.05,.7,.1,1)',
};

// CSS easing string → JS function (linear() lists incl. springs, cubic-bezier, keywords) for rAF-driven effects
export function easeFn(css) {
  css = String(css || 'linear').trim();
  if (EASINGS[css]) css = EASINGS[css];
  let m = /^linear\((.*)\)$/.exec(css);
  if (m) {
    const raw = m[1].split(',').map((s) => s.trim().split(/\s+/)); const pts = [];
    raw.forEach(([v, pct], i) => pts.push([pct ? parseFloat(pct) / 100 : null, parseFloat(v)]));
    pts[0][0] = pts[0][0] ?? 0; pts[pts.length - 1][0] = pts[pts.length - 1][0] ?? 1;
    for (let i = 1; i < pts.length - 1; i++) if (pts[i][0] == null) { let j = i; while (pts[j][0] == null) j++; const a = pts[i - 1][0], b = pts[j][0]; for (let k = i; k < j; k++) pts[k][0] = a + ((b - a) * (k - i + 1)) / (j - i + 1); }
    return (t) => { if (t <= 0) return pts[0][1]; if (t >= 1) return pts[pts.length - 1][1]; let i = 1; while (pts[i][0] < t) i++; const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (t - x0)) / (x1 - x0 || 1); };
  }
  m = /^cubic-bezier\(([^)]*)\)$/.exec(css);
  const [x1, y1, x2, y2] = m ? m[1].split(',').map(Number) : css === 'linear' ? [0, 0, 1, 1] : [0.25, 0.1, 0.25, 1];
  const bez = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (bez(x1, x2, t) < x) lo = t; else hi = t; } return bez(y1, y2, t); };
}

export function resolveEasing(name, fallbackDur) {
  if (!name) return { easing: EASINGS.smooth, duration: fallbackDur };
  const m = /^spring\((\d+)\s*,\s*(\d+)\)$/.exec(name);
  if (m) return springEasing(+m[1], +m[2]);
  if (SPRINGS[name]) return springEasing(...SPRINGS[name]);
  if (name === 'bounce') return { easing: 'linear(0, 0.063, 0.25, 0.563, 1 36.4%, 0.812, 0.75, 0.813, 1 72.7%, 0.953, 0.938, 0.953, 1 90.9%, 0.984, 1)', duration: fallbackDur };
  return { easing: EASINGS[name] || name, duration: fallbackDur };
}

const T = (x = 0, y = 0) => `${x}px ${y}px`;
export const PRESETS = {
  // entrances
  fade: () => [{ opacity: 0 }, { opacity: 1 }],
  'fade-up': (d = 16) => [{ opacity: 0, translate: T(0, d) }, { opacity: 1, translate: T() }],
  'fade-down': (d = 16) => [{ opacity: 0, translate: T(0, -d) }, { opacity: 1, translate: T() }],
  'fade-left': (d = 24) => [{ opacity: 0, translate: T(d, 0) }, { opacity: 1, translate: T() }],
  'fade-right': (d = 24) => [{ opacity: 0, translate: T(-d, 0) }, { opacity: 1, translate: T() }],
  'scale-in': () => [{ opacity: 0, scale: '0.92' }, { opacity: 1, scale: '1' }],
  'zoom-in': () => [{ opacity: 0, scale: '1.12' }, { opacity: 1, scale: '1' }],
  pop: () => [{ opacity: 0, scale: '0.5' }, { opacity: 1, scale: '1.06', offset: 0.6 }, { opacity: 1, scale: '1' }],
  'slide-up': () => [{ translate: '0 100%' }, { translate: '0 0' }],
  'slide-down': () => [{ translate: '0 -100%' }, { translate: '0 0' }],
  'slide-left': () => [{ translate: '100% 0' }, { translate: '0 0' }],
  'slide-right': () => [{ translate: '-100% 0' }, { translate: '0 0' }],
  'blur-in': () => [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0px)' }],
  'rotate-in': () => [{ opacity: 0, rotate: '-14deg', scale: '0.9' }, { opacity: 1, rotate: '0deg', scale: '1' }],
  'flip-in': () => [{ opacity: 0, transform: 'perspective(600px) rotateX(-75deg)' }, { opacity: 1, transform: 'perspective(600px) rotateX(0deg)' }],
  drop: (d = 60) => [{ opacity: 0, translate: T(0, -d) }, { opacity: 1, translate: T(0, 0), offset: 0.55 }, { translate: T(0, -d * 0.18), offset: 0.75 }, { translate: T(0, 0) }],
  reveal: () => [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
  'reveal-up': () => [{ clipPath: 'inset(100% 0 0 0)', translate: T(0, 12) }, { clipPath: 'inset(0% 0 0 0)', translate: T() }],
  'reveal-down': () => [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }],
  typewriter: () => [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
  grow: () => [{ scale: '0 1', transformOrigin: 'left center' }, { scale: '1 1', transformOrigin: 'left center' }],
  'grow-up': () => [{ scale: '1 0', transformOrigin: 'center bottom' }, { scale: '1 1', transformOrigin: 'center bottom' }],
  // physique : contact pur avant écrasement, volume conservé (sx · sy ≈ 1)
  land: (d = 48) => [
    { opacity: 0, translate: T(0, -d), scale: '0.94 1.07', transformOrigin: '50% 100%' },
    { opacity: 1, translate: T(0, 0), scale: '0.94 1.07', offset: 0.5, transformOrigin: '50% 100%' },
    { translate: T(0, 0), scale: '1.14 0.88', offset: 0.62, transformOrigin: '50% 100%' },
    { translate: T(0, -d * 0.12), scale: '0.97 1.03', offset: 0.8, transformOrigin: '50% 100%' },
    { opacity: 1, translate: T(), scale: '1 1', transformOrigin: '50% 100%' }],
  squish: () => [{ scale: '1 1' }, { scale: '1.12 0.89', offset: 0.3 }, { scale: '0.96 1.04', offset: 0.62 }, { scale: '1.02 0.98', offset: 0.82 }, { scale: '1 1' }],
  jelly: () => [{ scale: '1 1' }, { scale: '1.18 0.85', offset: 0.22 }, { scale: '0.88 1.13', offset: 0.42 }, { scale: '1.06 0.94', offset: 0.62 }, { scale: '0.98 1.02', offset: 0.8 }, { scale: '1 1' }],
  rubber: () => [{ scale: '1' }, { scale: '1.18', offset: 0.35 }, { scale: '0.94', offset: 0.6 }, { scale: '1.03', offset: 0.8 }, { scale: '1' }],
  'stretch-in': (d = 40) => [{ opacity: 0, translate: T(0, d), scale: '0.9 1.12' }, { opacity: 1, translate: T(0, 0), scale: '1.04 0.96', offset: 0.75 }, { opacity: 1, translate: T(), scale: '1 1' }],
  // loops & attention
  'moving-hold': () => [{ scale: '1', translate: T(0, 0), rotate: '0deg' }, { scale: '1.012', translate: T(0, -1.5), rotate: '0.25deg' }, { scale: '1', translate: T(0, 0), rotate: '0deg' }],
  pulse: () => [{ scale: '1' }, { scale: '1.06' }, { scale: '1' }],
  breathe: () => [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }],
  spin: () => [{ rotate: '0deg' }, { rotate: '360deg' }],
  float: (d = 8) => [{ translate: T(0, 0) }, { translate: T(0, -d) }, { translate: T(0, 0) }],
  bounce: (d = 10) => [{ translate: T(0, 0) }, { translate: T(0, -d), offset: 0.3 }, { translate: T(0, 0), offset: 0.55 }, { translate: T(0, -d * 0.35), offset: 0.75 }, { translate: T(0, 0) }],
  shake: (d = 8) => [{ translate: T() }, { translate: T(-d, 0) }, { translate: T(d, 0) }, { translate: T(-d * 0.6, 0) }, { translate: T(d * 0.6, 0) }, { translate: T() }],
  wiggle: () => [{ rotate: '0deg' }, { rotate: '-8deg' }, { rotate: '8deg' }, { rotate: '-4deg' }, { rotate: '0deg' }],
  heartbeat: () => [{ scale: '1' }, { scale: '1.18', offset: 0.14 }, { scale: '1', offset: 0.28 }, { scale: '1.12', offset: 0.42 }, { scale: '1', offset: 0.7 }, { scale: '1' }],
  ping: () => [{ scale: '1', opacity: 0.9 }, { scale: '2', opacity: 0 }],
  blink: () => [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }],
  sway: () => [{ rotate: '-3deg' }, { rotate: '3deg' }, { rotate: '-3deg' }],
  shimmer: () => [{ backgroundPosition: '-200% 0' }, { backgroundPosition: '200% 0' }],
  // motion path (along=…): ride the whole curve, once (entrance) or in a loop
  along: () => [{ offsetDistance: '0%' }, { offsetDistance: '100%' }],
  orbit: (d = 6) => [{ translate: T(d, 0) }, { translate: T(0, d) }, { translate: T(-d, 0) }, { translate: T(0, -d) }, { translate: T(d, 0) }],
};
export const ENTRANCE = ['fade', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'scale-in', 'zoom-in', 'pop', 'land', 'stretch-in', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'blur-in', 'rotate-in', 'flip-in', 'drop', 'reveal', 'reveal-up', 'reveal-down', 'typewriter', 'grow', 'grow-up', 'count', 'along'];
export const LOOPS = ['morph', 'moving-hold', 'pulse', 'breathe', 'spin', 'float', 'bounce', 'shake', 'wiggle', 'heartbeat', 'ping', 'blink', 'sway', 'shimmer', 'orbit', 'along'];
export const ACCENTS = ['squish', 'jelly', 'rubber', 'shake', 'wiggle', 'heartbeat', 'pulse'];
export const MODIFIERS = ['anticipate', 'snap', 'overshoot', 'arc', 'hard', 'soft'];
const LOOP_DEFAULT = { 'moving-hold': [3200, 'in-out'], spin: [1200, 'linear'], shimmer: [1600, 'linear'], ping: [1400, 'out'], float: [3000, 'in-out'], breathe: [2400, 'in-out'], pulse: [1600, 'in-out'], sway: [3000, 'in-out'], orbit: [4000, 'linear'], along: [4000, 'in-out'] };

export function parseSpec(spec, kind = 'in') {
  const parts = String(spec).trim().split(/\s+/);
  const out = { name: parts[0], duration: null, delay: 0, easing: null, iterations: kind === 'loop' ? Infinity : 1, direction: 'normal', dist: undefined };
  let nums = 0;
  for (const p of parts.slice(1)) {
    const kv = /^(\w+)=(.+)$/.exec(p);
    if (kv) {
      const [, k, v] = kv;
      if (k === 'delay') out.delay = parseFloat(v);
      else if (k === 'ease' || k === 'easing') out.easing = v;
      else if (k === 'dur' || k === 'duration') out.duration = parseFloat(v);
      else if (k === 'dist' || k === 'd') out.dist = parseFloat(v);
      else if (k === 'times' || k === 'repeat') out.iterations = v === 'infinite' ? Infinity : parseFloat(v);
      else if (k === 'to') out.to = parseFloat(v);
      else if (k === 'antic' || k === 'anticipate') out.antic = parseFloat(v);
      else if (k === 'overshoot' || k === 'settle') out.overshoot = parseFloat(v);
      else if (k === 'arc') out.arc = parseFloat(v);
      continue;
    }
    if (/^-?\d+(\.\d+)?(ms|s)?$/.test(p)) {
      const v = p.endsWith('ms') ? parseFloat(p) : p.endsWith('s') ? parseFloat(p) * 1000 : parseFloat(p);
      if (nums === 0) out.duration = v; else out.delay = v; nums++; continue;
    }
    if (p === 'infinite' || p === 'loop') { out.iterations = Infinity; continue; }
    if (p === 'alternate' || p === 'yoyo') { out.direction = 'alternate'; continue; }
    if (p === 'reverse') { out.direction = 'reverse'; continue; }
    if (p === 'anticipate' || p === 'antic') { out.antic = out.antic ?? 0.18; continue; }
    if (p === 'snap') { out.snap = true; continue; }
    if (p === 'hold' || p === 'forwards') { out.hold = true; continue; }
    if (p === 'overshoot' || p === 'settle') { out.overshoot = out.overshoot ?? 0.1; continue; }
    if (p === 'arc') { out.arc = out.arc ?? 0.22; continue; }
    if (p === 'hard') { out.accent = 'hard'; continue; }
    if (p === 'soft') { out.accent = 'soft'; continue; }
    out.easing = p;
  }
  if (out.duration == null) out.duration = kind === 'loop' ? (LOOP_DEFAULT[out.name]?.[0] || 1600) : 500;
  // accent dur = rebond après contact ; accent doux = continuation amortie (pas de rebond)
  if (out.accent === 'hard') { out.overshoot = out.overshoot ?? 0.14; out.easing = out.easing || 'expo'; }
  if (out.accent === 'soft') { out.overshoot = 0; out.easing = out.easing || 'cushion'; }
  if (!out.easing) out.easing = kind === 'loop' ? (LOOP_DEFAULT[out.name]?.[1] || 'in-out') : 'smooth';
  return out;
}

function customFrames(name, project) {
  const kf = project && project.keyframes && project.keyframes[name];
  if (!kf) return null;
  return kf.map(({ offset, attrs }) => {
    const f = { offset };
    if (attrs.opacity !== undefined) f.opacity = +attrs.opacity;
    if (attrs.x !== undefined || attrs.y !== undefined) f.translate = `${attrs.x || 0}px ${attrs.y || 0}px`;
    if (attrs.scale !== undefined) f.scale = String(attrs.scale);
    if (attrs.rotate !== undefined) f.rotate = `${attrs.rotate}deg`;
    if (attrs.blur !== undefined) f.filter = `blur(${attrs.blur}px)`;
    if (attrs.fill !== undefined) f.backgroundColor = attrs.fill;
    if (attrs.color !== undefined) f.color = attrs.color;
    if (attrs.radius !== undefined) f.borderRadius = `${attrs.radius}px`;
    if (attrs.w !== undefined) f.width = `${attrs.w}px`;
    if (attrs.h !== undefined) f.height = `${attrs.h}px`;
    return f;
  });
}

import { attachMorph } from './vector.js';
// play entrance/loop anims gathered by the renderer. returns timeline entries
export function playAnims(list, { project, paused = false, offset = 0, ignoreReduced = false, holdOnly = false } = {}) {
  const entries = [];
  for (const a of list || []) {
    if (!a.el || !a.el.animate) continue;
    const sp = parseSpec(a.spec, a.kind);
    const reduce = !ignoreReduced && prefersReducedMotion();
    if (reduce && a.kind === 'loop') continue;
    const ez = resolveEasing(sp.easing, sp.duration);
    let duration = (/^spring|bouncy|snappy|gentle|wobbly|stiff/.test(sp.easing || '') ? ez.duration : sp.duration) * (a.durScale || 1);
    const delay = (sp.delay || 0) + (a.delay || 0) + offset;
    let frames;
    if (sp.name === 'count' || sp.name === 'morph') frames = [{ opacity: 1 }, { opacity: 1 }];
    else frames = customFrames(sp.name, project) || (PRESETS[sp.name] ? PRESETS[sp.name](sp.dist) : PRESETS.fade());
    let easing = sp.name === 'typewriter' ? `steps(${Math.max(4, (a.el.textContent || '').length)})` : ez.easing;
    if (reduce) { frames = [{ opacity: 0 }, { opacity: 1 }]; duration = Math.min(200, duration); easing = 'ease-out'; }
    else if (sp.name !== 'count' && sp.name !== 'typewriter' && sp.name !== 'morph') {
      const shaped = shapeFrames(frames, sp, easing);
      frames = shaped.frames; if (shaped.easing) easing = shaped.easing; duration *= shaped.durMul;
    }
    // one-shot effects that end invisible (bursts, confetti, toasts that vanish) keep their last frame;
    // `hold` forces it for any entrance anim
    const last = frames[frames.length - 1] || {};
    const hold = a.kind !== 'loop' && (sp.hold || (sp.iterations === 1 && String(last.opacity) === '0'));
    if (holdOnly && !hold) continue;
    try {
      const anim = a.el.animate(frames, {
        duration, delay, easing,
        iterations: sp.iterations, direction: sp.direction, fill: a.kind === 'loop' ? 'none' : hold ? 'both' : 'backwards',
      });
      if (sp.name === 'count') attachCounter(a.el, anim, duration, delay, sp.to);
      if (sp.name === 'morph') attachMorph(a.el, anim, duration, sp.iterations);
      if (paused) anim.pause();
      entries.push({ id: a.id, el: a.el, name: sp.name, duration, delay, kind: a.kind, animation: anim, iterations: sp.iterations });
    } catch (e) { /* ignore bad keyframes */ }
  }
  return entries;
}

function attachCounter(el, anim, duration, delay, toOverride) {
  const txt = el.textContent || '';
  const m = /-?[\d\s.,]*\d/.exec(txt);
  if (!m) return;
  const raw = m[0];
  const decimals = (/[.,](\d+)$/.exec(raw.replace(/\s/g, '')) || [, ''])[1].length;
  const target = toOverride ?? parseFloat(raw.replace(/\s/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  const fmt = (v) => {
    const s = v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return txt.slice(0, m.index) + (raw.includes(',') || raw.includes(' ') ? s : v.toFixed(decimals)) + txt.slice(m.index + raw.length);
  };
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes(raw.trim().slice(0, 1))) || el;
  const set = (v) => { if (node === el) el.textContent = fmt(v); else node.textContent = fmt(v); };
  const tick = () => {
    if (!el.isConnected && anim.playState === 'finished') return;
    const t = Math.max(0, (anim.currentTime ?? duration + delay) - delay);
    const p = Math.min(1, t / duration);
    const e = 1 - Math.pow(1 - p, 3);
    set(target * e);
    if (anim.playState !== 'finished' || p < 1) requestAnimationFrame(tick);
  };
  set(0); requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ modifiers
// Values of translate / scale / rotate / opacity as numeric vectors (units kept)
const MOVE = ['translate', 'scale', 'rotate'];
function pv(prop, v) {
  if (v === undefined || v === null) return null;
  const parts = String(v).trim().split(/\s+/);
  const n = [], u = [];
  for (const p of parts) { const m = /^(-?\d*\.?\d+)(px|%|deg|turn)?$/.exec(p); if (!m) return null; n.push(+m[1]); u.push(m[2] || ''); }
  if (prop === 'scale' && n.length === 1) { n.push(n[0]); u.push(''); }
  if (prop === 'translate' && n.length === 1) { n.push(0); u.push('px'); }
  return { n, u };
}
const fv = (prop, x) => (prop === 'opacity' ? +x.n[0].toFixed(3) : x.n.map((k, i) => +k.toFixed(3) + x.u[i]).join(' '));
function mixv(a, b, t) {
  const n = a.n.map((x, i) => x + ((b.n[i] ?? x) - x) * t);
  const u = a.u.map((x, i) => (a.n[i] === 0 && b.u[i] ? b.u[i] : x || b.u[i] || ''));
  return { n, u };
}
function extrap(a, b, k) { // a + (a - b) * k  (going beyond a, away from b)
  const n = a.n.map((x, i) => x + (x - (b.n[i] ?? x)) * k);
  const u = a.u.map((x, i) => x || b.u[i] || '');
  return { n, u };
}
const props = (f) => Object.keys(f).filter((k) => k !== 'offset' && k !== 'easing' && k !== 'composite');

// Anticipation (pre-move opposite to the action), invisible anticipation (snap), follow-through (overshoot) and arcs.
export function shapeFrames(frames, sp, mainEasing) {
  const antic = sp.snap ? 0.1 : sp.antic || 0;
  const over = sp.overshoot || 0;
  const arc = sp.arc || 0;
  if (!antic && !over && !arc) return { frames, durMul: 1 };
  let F = frames.map((f, i) => ({ ...f, offset: f.offset ?? (frames.length === 1 ? 1 : i / (frames.length - 1)) }));
  const first = F[0], last = F[F.length - 1];
  // arc: bend the straight translate path (2-frame presets) along a quadratic curve
  if (arc && F.length === 2) {
    const a = pv('translate', first.translate), b = pv('translate', last.translate);
    if (a && b && a.u.every((x) => x !== '%') && b.u.every((x) => x !== '%')) {
      const dx = b.n[0] - a.n[0], dy = b.n[1] - a.n[1], dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        let nx = -dy / dist, ny = dx / dist; if (ny > 0) { nx = -nx; ny = -ny; } // bow upward
        const cx = (a.n[0] + b.n[0]) / 2 + nx * dist * arc, cy = (a.n[1] + b.n[1]) / 2 + ny * dist * arc;
        const N = antic || over ? 2 : 6; const out = [first];
        for (let k = 1; k < N; k++) {
          const t = k / N; const x = (1 - t) * (1 - t) * a.n[0] + 2 * (1 - t) * t * cx + t * t * b.n[0], y = (1 - t) * (1 - t) * a.n[1] + 2 * (1 - t) * t * cy + t * t * b.n[1];
          const f = { offset: t, translate: `${x.toFixed(2)}px ${y.toFixed(2)}px` };
          for (const p of props(first)) if (p !== 'translate') { const pa = pv(p, first[p]), pb = pv(p, last[p]); if (pa && pb) f[p] = fv(p, mixv(pa, pb, t)); else f[p] = t < 0.5 ? first[p] : last[p]; }
          out.push(f);
        }
        out.push(last); F = out;
      }
    }
  }
  if (!antic && !over) return { frames: F, durMul: 1 };
  const A = antic ? (sp.snap ? 0.07 : 0.24) : 0, O = over ? 0.3 : 0;
  const out = [];
  const head = { ...F[0], offset: 0 };
  out.push(head);
  if (antic) {
    const pre = { ...F[0] };
    const nxt = F[1];
    for (const p of MOVE) { const s = pv(p, F[0][p]), t = pv(p, nxt[p]); if (s && t) pre[p] = fv(p, extrap(s, t, antic)); }
    if (F[0].opacity !== undefined && nxt.opacity !== undefined) pre.opacity = +(F[0].opacity + (nxt.opacity - F[0].opacity) * 0.6).toFixed(3);
    pre.offset = A;
    head.easing = 'cubic-bezier(.45,0,.55,1)'; // anticipation : lente
    out.push(pre);
  }
  const E = over ? 1 - O : 1;
  const mids = F.slice(1, F.length - 1);
  for (const m of mids) out.push({ ...m, offset: A + m.offset * (E - A) });
  if (over) {
    const prev = F[F.length - 2], end = F[F.length - 1];
    const ov = { ...end, offset: E };
    for (const p of MOVE) { const s = pv(p, end[p]), t = pv(p, prev[p]); if (s && t) ov[p] = fv(p, extrap(s, t, over)); }
    out.push(ov);
    ov.easing = 'cubic-bezier(.3,0,.35,1)'; // retour amorti
    out.push({ ...end, offset: 1 });
  } else out.push({ ...F[F.length - 1], offset: 1 });
  // the action segments keep the main spacing
  for (let i = antic ? 1 : 0; i < out.length - (over ? 2 : 1); i++) if (!out[i].easing) out[i].easing = mids.length ? 'linear' : mainEasing;
  if (mids.length && antic) out[1].easing = mainEasing.startsWith('linear(') ? 'cubic-bezier(.2,.8,.2,1)' : mainEasing;
  return { frames: out, easing: 'linear', durMul: 1 + (antic ? (sp.snap ? 0.06 : 0.3) : 0) + (over ? 0.35 : 0) };
}

// ------------------------------------------------------------------ global time scale (slow motion) & reduced motion
let TIME_SCALE = 1, patched = false;
export function setTimeScale(k) {
  TIME_SCALE = k;
  if (!patched && typeof Element !== 'undefined') {
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (...args) { const an = orig.apply(this, args); if (TIME_SCALE !== 1) { try { an.playbackRate = TIME_SCALE; } catch (e) { /* */ } } return an; };
    patched = true;
  }
}
export const getTimeScale = () => TIME_SCALE;
export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function totalDuration(entries) {
  let t = 0;
  for (const e of entries) if (e.iterations !== Infinity) t = Math.max(t, e.delay + e.duration * (e.iterations || 1));
  return t;
}
