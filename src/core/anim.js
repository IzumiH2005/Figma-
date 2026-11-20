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
  smooth: 'cubic-bezier(.2,.8,.2,1)', expo: 'cubic-bezier(.16,1,.3,1)', back: 'cubic-bezier(.34,1.56,.64,1)', anticipate: 'cubic-bezier(.68,-0.55,.27,1.55)',
  'ease-in': 'cubic-bezier(.4,0,1,1)', 'ease-out': 'cubic-bezier(0,0,.2,1)', 'ease-in-out': 'cubic-bezier(.4,0,.2,1)', standard: 'cubic-bezier(.2,0,0,1)', emphasized: 'cubic-bezier(.05,.7,.1,1)',
};

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
  // loops & attention
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
  orbit: (d = 6) => [{ translate: T(d, 0) }, { translate: T(0, d) }, { translate: T(-d, 0) }, { translate: T(0, -d) }, { translate: T(d, 0) }],
};
export const ENTRANCE = ['fade', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'scale-in', 'zoom-in', 'pop', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'blur-in', 'rotate-in', 'flip-in', 'drop', 'reveal', 'reveal-up', 'reveal-down', 'typewriter', 'grow', 'grow-up', 'count'];
export const LOOPS = ['pulse', 'breathe', 'spin', 'float', 'bounce', 'shake', 'wiggle', 'heartbeat', 'ping', 'blink', 'sway', 'shimmer', 'orbit'];
const LOOP_DEFAULT = { spin: [1200, 'linear'], shimmer: [1600, 'linear'], ping: [1400, 'out'], float: [3000, 'in-out'], breathe: [2400, 'in-out'], pulse: [1600, 'in-out'], sway: [3000, 'in-out'], orbit: [4000, 'linear'] };

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
      continue;
    }
    if (/^-?\d+(\.\d+)?(ms|s)?$/.test(p)) {
      const v = p.endsWith('ms') ? parseFloat(p) : p.endsWith('s') ? parseFloat(p) * 1000 : parseFloat(p);
      if (nums === 0) out.duration = v; else out.delay = v; nums++; continue;
    }
    if (p === 'infinite' || p === 'loop') { out.iterations = Infinity; continue; }
    if (p === 'alternate' || p === 'yoyo') { out.direction = 'alternate'; continue; }
    if (p === 'reverse') { out.direction = 'reverse'; continue; }
    out.easing = p;
  }
  if (out.duration == null) out.duration = kind === 'loop' ? (LOOP_DEFAULT[out.name]?.[0] || 1600) : 500;
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

// play entrance/loop anims gathered by the renderer. returns timeline entries
export function playAnims(list, { project, paused = false, offset = 0 } = {}) {
  const entries = [];
  for (const a of list || []) {
    if (!a.el || !a.el.animate) continue;
    const sp = parseSpec(a.spec, a.kind);
    const ez = resolveEasing(sp.easing, sp.duration);
    const duration = /^spring|bouncy|snappy|gentle|wobbly|stiff/.test(sp.easing || '') ? ez.duration : sp.duration;
    const delay = (sp.delay || 0) + (a.delay || 0) + offset;
    let frames;
    if (sp.name === 'count') frames = [{ opacity: 1 }, { opacity: 1 }];
    else frames = customFrames(sp.name, project) || (PRESETS[sp.name] ? PRESETS[sp.name](sp.dist) : PRESETS.fade());
    try {
      const anim = a.el.animate(frames, {
        duration, delay, easing: sp.name === 'typewriter' ? `steps(${Math.max(4, (a.el.textContent || '').length)})` : ez.easing,
        iterations: sp.iterations, direction: sp.direction, fill: a.kind === 'loop' ? 'none' : 'backwards',
      });
      if (sp.name === 'count') attachCounter(a.el, anim, duration, delay, sp.to);
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

export function totalDuration(entries) {
  let t = 0;
  for (const e of entries) if (e.iterations !== Infinity) t = Math.max(t, e.delay + e.duration * (e.iterations || 1));
  return t;
}
