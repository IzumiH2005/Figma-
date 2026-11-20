// Vector layers: <shape>, <vector>, <boolean>, <textpath>, masks, goo (shape fusion), morphing, pseudo-3D.
import { parsePath, serializePath, shapePath, booleanPaths, scalePath, translatePath, rotatePath, bbox, SHAPES } from './pathkit.js';
import { offsetPath, widthProfile, scatterBrush } from './pathops.js';
import { splitTop } from './project.js';
import { interpolate as flubberInterpolate } from 'flubber';

export const VECTOR_TAGS = new Set(['shape', 'vector', 'svg', 'boolean', 'textpath', 'path']);
const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
let UID = 0;

// "star points=6 inner=.4"  ->  { kind, params }
export function parseShapeSpec(spec) {
  const parts = String(spec || '').trim().split(/\s+/);
  const kind = parts[0] || 'rect'; const params = {};
  for (const p of parts.slice(1)) { const m = /^([\w-]+)=(.+)$/.exec(p); if (m) params[m[1]] = m[2]; }
  return { kind, params };
}

export function shapeParams(a) {
  const s = SHAPES[a.kind || 'rect'] || SHAPES.rect; const out = {};
  for (const k of Object.keys(s.params)) if (a[k] !== undefined) out[k] = a[k];
  if (a.kind === 'rect' && a.radius !== undefined) out.radius = a.radius;
  return out;
}

export function boxOf(a, def = 100) {
  const w = /^-?\d/.test(String(a.w ?? '')) ? num(a.w) : a.size !== undefined ? num(a.size) : def;
  const h = /^-?\d/.test(String(a.h ?? '')) ? num(a.h) : a.size !== undefined ? num(a.size) : def;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

// geometry of a node in its own box (local coordinates)
export function nodePath(node, a, box) {
  const { w, h } = box;
  switch (node.tag) {
    case 'shape': return shapePath(a.kind || 'rect', w, h, shapeParams(a));
    case 'rect': return shapePath('rect', w, h, { radius: a.radius === 'full' ? Math.min(w, h) / 2 : a.radius || 0 });
    case 'ellipse': return shapePath('ellipse', w, h, {});
    case 'vector': case 'svg': case 'path': {
      const d = a.d || (node.children || []).filter((c) => c.tag === 'path').map((c) => c.attrs.d).join(' ');
      let subs = parsePath(d);
      if (a.view) { const [vx, vy, vw, vh] = String(a.view).split(/[\s,]+/).map(Number); subs = scalePath(translatePath(subs, -vx, -vy), w / vw, h / vh); }
      return subs;
    }
    default: return shapePath('rect', w, h, {});
  }
}

// children of <boolean>: each child positioned by its x/y (and rotate) inside the boolean's box
// boolean recipe: each operand's local geometry + position (kept on the element for live re-evaluation)
export function booleanParts(node, attrsOf) {
  const parts = [];
  for (const c of node.children || []) {
    if (c.tag === '#text') continue;
    const ca = attrsOf(c); const b = boxOf(ca, 100);
    let local = c.tag === 'boolean' ? booleanSubs(c, attrsOf, ca.op || 'union') : nodePath(c, ca, b);
    if (ca.rotate) local = rotatePath(local, num(ca.rotate), b.w / 2, b.h / 2);
    parts.push({ local, x: num(ca.x), y: num(ca.y), sig: serializePath(local) });
  }
  return parts;
}
// Smart animate of a boolean whose operands moved: interpolate operand positions and recompute the operation
// every frame (a notch slides along a bar instead of being morphed point by point).
export function liveBoolean(el, from, to, duration, ease, delay = 0) {
  if (!from || !to || from.op !== to.op || from.parts.length !== to.parts.length || from.parts.some((p, i) => p.sig !== to.parts[i].sig)) return false;
  const lerp = (a, b, t) => a + (b - a) * t;
  const frame = (k) => serializePath(booleanPaths(to.parts.map((q, i) => translatePath(q.local, lerp(from.parts[i].x, q.x, k), lerp(from.parts[i].y, q.y, k))), to.op));
  const finalD = el.dataset.d; let t0 = null;
  const tick = (now) => {
    if (t0 === null) t0 = now + delay;
    const p = Math.max(0, Math.min(1, (now - t0) / duration));
    if (p >= 1 || !el.isConnected) { endLive(el, finalD); return; }
    setVectorD(el, frame(ease(p))); requestAnimationFrame(tick);
  };
  beginLive(el); setVectorD(el, frame(0)); requestAnimationFrame(tick);
  return true;
}
export function booleanSubs(node, attrsOf, op) {
  const list = [];
  for (const c of node.children || []) {
    if (c.tag === '#text') continue;
    const ca = attrsOf(c);
    const b = boxOf(ca, 100);
    let subs = c.tag === 'boolean' ? booleanSubs(c, attrsOf, ca.op || 'union') : nodePath(c, ca, b);
    if (ca.rotate) subs = rotatePath(subs, num(ca.rotate), b.w / 2, b.h / 2);
    subs = translatePath(subs, num(ca.x), num(ca.y));
    list.push(subs);
  }
  return booleanPaths(list, op || 'union');
}

// ---------------------------------------------------------------- SVG fills
function svgUrl(svg) { return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`; }
export function maskImageFor(d, w, h, evenodd) {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="#000"${evenodd ? ' fill-rule="evenodd"' : ''}/></svg>`);
}

function strokeSpec(v) {
  const parts = splitTop(String(v), ' ').filter(Boolean);
  let w = 1, color = 'currentColor', dashed = false, dotted = false, align = 'center';
  for (const p of parts) { if (/^\d+(\.\d+)?$/.test(p)) w = parseFloat(p); else if (p === 'dashed') dashed = true; else if (p === 'dotted') dotted = true; else if (['inside', 'outside', 'center'].includes(p)) align = p; else color = p; }
  return { w, color, dashed, dotted, align };
}

// Build the visual of a vector element. `a` = resolved attrs, subs = local path, fillCss = (value) => {image,color,size}
export function buildVector(el, node, a, subs, box, ctx, fillCss) {
  if (!a._inner && (a.offset || a['width-profile'] || a.profile || a.brush)) return buildModified(el, node, a, subs, box, ctx, fillCss);
  const { w, h } = box;
  const d = serializePath(subs);
  const evenodd = a['fill-rule'] !== 'nonzero' && (a['fill-rule'] === 'evenodd' || a.evenodd || subs.length > 1 && node.tag !== 'shape');
  el.classList.add('mq-vec');
  el.dataset.d = d; el.dataset.vw = w; el.dataset.vh = h;
  el._path = subs; el._box = box;
  el.style.width = el.style.width || (a.w === undefined && a.size === undefined ? w + 'px' : el.style.width);
  el.style.height = el.style.height || (a.h === undefined && a.size === undefined ? h + 'px' : el.style.height);
  if (a.w === undefined && a.size === undefined) el.style.width = w + 'px';
  if (a.h === undefined && a.size === undefined) el.style.height = h + 'px';
  el.style.flexShrink = '0';
  // fill layer (any Maquette fill: color, gradients, mesh, noise, image(), aurora…)
  const fillV = a.fill ?? a.bg;
  const closed = subs.some((s) => s.closed);
  if (fillV !== undefined && fillV !== 'none' && fillV !== false && closed) {
    const fl = document.createElement('div'); fl.className = 'mq-vec-fill';
    const f = fillCss(fillV);
    if (f) { if (f.image) { fl.style.backgroundImage = f.image; fl.style.backgroundSize = f.size || 'cover'; fl.style.backgroundPosition = 'center'; } if (f.color) fl.style.backgroundColor = f.color; if (f.anim) { fl.style.backgroundSize = '200% 200%'; fl.style.animation = 'mq-aurora 12s ease-in-out infinite alternate'; } }
    const m = maskImageFor(d, w, h, evenodd);
    fl.style.cssText += `;position:absolute;inset:0;-webkit-mask-image:${m};mask-image:${m};-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat`;
    el.appendChild(fl);
  }
  // stroke layer
  const stV = a.stroke ?? a.border;
  if ((stV !== undefined && stV !== 'none' && stV !== false) || (!closed && fillV === undefined)) {
    const st = strokeSpec(stV === undefined ? '2 currentColor' : stV);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'mq-vec-stroke');
    const id = 'mqv' + (++UID).toString(36);
    let defs = '';
    const marker = (kind, pos) => {
      if (!kind || kind === 'none') return '';
      const mid = `${id}-${pos}`;
      const shapes = { arrow: '<path d="M0 0 L10 5 L0 10 Z"/>', 'arrow-open': '<path d="M0 0 L10 5 L0 10" fill="none" stroke="context-stroke" stroke-width="2"/>', dot: '<circle cx="5" cy="5" r="4"/>', bar: '<rect x="4" y="0" width="2" height="10"/>', diamond: '<path d="M5 0 L10 5 L5 10 L0 5Z"/>' };
      const mcol = /^(linear|radial)\(/.test(st.color) ? (pos === 'start' ? (st.color.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) || ['currentColor'])[0] : (st.color.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) || ['currentColor']).slice(-1)[0]) : st.color;
      defs += `<marker id="${mid}" viewBox="0 0 10 10" refX="${kind.startsWith('arrow') ? 8 : 5}" refY="5" markerWidth="${3 + st.w}" markerHeight="${3 + st.w}" orient="auto-start-reverse" fill="${mcol}">${shapes[kind] || shapes.arrow}</marker>`;
      return ` marker-${pos}="url(#${mid})"`;
    };
    // stroke alignment: inside/outside emulated with a doubled width + mask/clip
    let width = st.w, extra = '';
    if (st.align !== 'center' && closed) { width = st.w * 2; defs += `<clipPath id="${id}-c"><path d="${d}"/></clipPath>`; if (st.align === 'inside') extra = ` clip-path="url(#${id}-c)"`; }
    const dash = a.dash ? ` stroke-dasharray="${a.dash}"` : st.dashed ? ` stroke-dasharray="${st.w * 3} ${st.w * 2}"` : st.dotted ? ` stroke-dasharray="0 ${st.w * 2}" stroke-linecap="round"` : '';
    const mk = marker(a.start, 'start') + marker(a.end, 'end');
    let strokeColor = st.color;
    if (/^(linear|radial)\(/.test(st.color)) { const g = svgGradient(st.color, `${id}-g`); defs += g; strokeColor = `url(#${id}-g)`; }
    svg.innerHTML = `<defs>${defs}</defs><path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${width}" stroke-linecap="${a.cap || 'round'}" stroke-linejoin="${a.join || 'round'}" vector-effect="non-scaling-stroke"${dash}${mk}${extra}${evenodd ? ' fill-rule="evenodd"' : ''}/>`;
    if (st.align === 'outside' && closed) { // draw outside only: mask out the interior
      const m = maskImageFor(`M-9999 -9999H9999V9999H-9999Z ${d}`, w, h, true);
      svg.style.cssText = `-webkit-mask-image:${m};mask-image:${m};-webkit-mask-size:100% 100%;mask-size:100% 100%;overflow:visible`;
    }
    el.appendChild(svg);
  }
}

// SVG gradient from Maquette's linear(angle, stops…) / radial(stops…) (used for gradient strokes and text paths)
export function svgGradient(v, id) {
  const m = /^(linear|radial)\(([\s\S]*)\)$/.exec(v.trim()); if (!m) return '';
  let args = splitTop(m[2], ','); let ang = 180;
  if (m[1] === 'linear' && /^-?\d+(\.\d+)?(deg)?$/.test(args[0])) { ang = parseFloat(args[0]); args = args.slice(1); }
  const stops = args.map((s, i) => { const mm = /^(.*?)\s+(\d+(\.\d+)?)%?$/.exec(s.trim()); const color = mm ? mm[1] : s.trim(); const off = mm ? parseFloat(mm[2]) : (i / Math.max(1, args.length - 1)) * 100; return `<stop offset="${off}%" stop-color="${color}"/>`; }).join('');
  if (m[1] === 'radial') return `<radialGradient id="${id}">${stops}</radialGradient>`;
  const r = ((ang - 90) * Math.PI) / 180; const x = Math.cos(r) / 2, y = Math.sin(r) / 2;
  return `<linearGradient id="${id}" x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}">${stops}</linearGradient>`;
}

// ---------------------------------------------------------------- text on a path
export function buildTextPath(el, a, text, subs, box) {
  const { w, h } = box; const id = 'mqtp' + (++UID).toString(36);
  const d = serializePath(subs);
  const fillV = a.color || a.fill || 'currentColor';
  const grad = /^(linear|radial)\(/.test(String(fillV)) ? svgGradient(String(fillV), id + 'g') : '';
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" overflow="visible"><defs><path id="${id}" d="${d}"/>${grad}</defs><text fill="${grad ? `url(#${id}g)` : fillV}" font-size="${num(a.size, 16)}" ${a.ls ? `letter-spacing="${a.ls}"` : ''} dominant-baseline="${a.baseline || 'middle'}"><textPath href="#${id}" startOffset="${a.offset || '50%'}" text-anchor="${a.anchor || 'middle'}">${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textPath></text></svg>`;
  el.style.width = el.style.width || w + 'px'; el.style.height = el.style.height || h + 'px';
  el._path = subs; el._box = box; el.dataset.d = d; el.dataset.vw = w; el.dataset.vh = h;
}

// ---------------------------------------------------------------- goo (metaball fusion) filter
export function gooFilterSvg(strength) {
  const s = Math.max(1, num(strength, 10));
  const id = `mq-goo-${String(s).replace('.', '_')}`;
  return { id, svg: `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="${s}" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${Math.round(s * 1.9 + 6)} -${Math.round(s * 0.75 + 3)}" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter>` };
}

// ---------------------------------------------------------------- masks for any element
// mask="star points=6" | "blob seed=3" | "fade bottom" | "image(src)"
export function maskCss(spec) {
  const s = String(spec).trim();
  const fade = /^fade(?:\s+(top|bottom|left|right|edges|x|y))?(?:\s+(\d+))?$/.exec(s);
  if (fade) {
    const dir = fade[1] || 'bottom', amt = fade[2] ? +fade[2] : 35;
    const g = dir === 'edges' || dir === 'x' ? `linear-gradient(90deg, transparent, #000 ${amt}%, #000 ${100 - amt}%, transparent)` : dir === 'y' ? `linear-gradient(180deg, transparent, #000 ${amt}%, #000 ${100 - amt}%, transparent)` : `linear-gradient(to ${dir === 'top' ? 'top' : dir === 'left' ? 'left' : dir === 'right' ? 'right' : 'bottom'}, #000 ${100 - amt}%, transparent)`;
    return { image: g, size: '100% 100%' };
  }
  const { kind, params } = parseShapeSpec(s);
  if (!SHAPES[kind]) return null;
  const subs = shapePath(kind, 100, 100, params);
  return { image: maskImageFor(serializePath(subs), 100, 100, kind === 'ring' || kind === 'gear'), size: '100% 100%' };
}

// ---------------------------------------------------------------- pseudo-3D
// tilt="12 -8" (rotateX rotateY), perspective, depth extrusion (stacked shadows), skew
export function threeD(a, s) {
  const tf = [];
  if (a.tilt && a.tilt !== 'pointer' && a.tilt !== true) { const [rx, ry = 0, rz = 0] = String(a.tilt).split(/\s+/).map(Number); tf.push(`perspective(${num(a.perspective, 900)}px) rotateX(${rx}deg) rotateY(${ry}deg)${rz ? ` rotateZ(${rz}deg)` : ''}`); }
  if (a.skew) { const [kx, ky = 0] = String(a.skew).split(/\s+/).map(Number); tf.push(`skew(${kx}deg, ${ky}deg)`); }
  if (tf.length) s.transform = (s.transform ? s.transform + ' ' : '') + tf.join(' ');
  if (a.depth) {
    const n = Math.min(40, Math.round(num(a.depth))); const col = a['depth-color'] || 'rgba(0,0,0,.28)';
    const [dx, dy] = String(a['depth-dir'] || '1 1').split(/\s+/).map(Number);
    const layers = []; for (let i = 1; i <= n; i++) layers.push(`${dx * i}px ${dy * i}px 0 ${col}`);
    return layers.join(', ');
  }
  return null;
}

// ---------------------------------------------------------------- morphing
// update a vector element in place with a new path (fill mask + stroke)
export function setVectorD(el, d) {
  const w = +el.dataset.vw, h = +el.dataset.vh;
  const fl = el.querySelector(':scope > .mq-vec-fill');
  const live = el._live;
  if (live) live.path.setAttribute('d', d); // during a live animation: plain SVG path, no per-frame mask decoding (no flicker)
  else if (fl) { const m = maskImageFor(d, w, h, false); fl.style.webkitMaskImage = m; fl.style.maskImage = m; }
  const p = el.querySelector(':scope > .mq-vec-stroke path'); if (p) p.setAttribute('d', d);
  el.dataset.d = d;
}
const interpCache = new Map();
export function morpher(a, b) {
  const k = a + '|' + b; if (interpCache.has(k)) return interpCache.get(k);
  let fn; try { fn = flubberInterpolate(a, b, { maxSegmentLength: 6, string: true }); } catch (e) { fn = (t) => (t < 0.5 ? a : b); }
  if (interpCache.size > 200) interpCache.clear(); interpCache.set(k, fn); return fn;
}
// drive a morph cycle through el._morphTargets, synced to a (possibly paused/scrubbed) WAAPI animation
export function attachMorph(el, anim, duration, iterations) {
  const base = el.dataset.d; const targets = [base, ...(el._morphTargets || [])];
  if (targets.length < 2) return;
  const n = targets.length; const fns = targets.map((d, i) => morpher(d, targets[(i + 1) % n]));
  const tick = () => {
    if (!el.isConnected) return;
    const t = anim.currentTime; if (t == null) { requestAnimationFrame(tick); return; }
    const total = duration; const local = ((t % total) + total) % total / total; // 0..1 over full cycle
    const seg = Math.min(n - 1, Math.floor(local * n)), u = local * n - seg;
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // ease-in-out between shapes
    setVectorD(el, fns[seg](e));
    if (anim.playState !== 'finished' && anim.playState !== 'idle') requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// live mode: a solid fill is drawn as an inline SVG path while the shape animates (CSS mask images decode
// asynchronously, swapping them every frame makes the shape blink); the mask comes back once the motion ends
function beginLive(el) {
  const fl = el.querySelector(':scope > .mq-vec-fill'); if (!fl || el._live) return;
  const cs = getComputedStyle(fl); if (cs.backgroundImage && cs.backgroundImage !== 'none') return;
  const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${el.dataset.vw} ${el.dataset.vh}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'mq-vec-live');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
  const path = document.createElementNS(NS, 'path'); path.setAttribute('fill', cs.backgroundColor); path.setAttribute('fill-rule', 'evenodd'); svg.appendChild(path);
  fl.style.visibility = 'hidden'; fl.after(svg); el._live = { svg, path, fl };
}
function endLive(el, finalD) {
  const L = el._live; if (!L) { setVectorD(el, finalD); return; }
  el._live = null; setVectorD(el, finalD);
  const m = maskImageFor(finalD, +el.dataset.vw, +el.dataset.vh, false);
  const img = new Image(); const done = () => { L.fl.style.visibility = ''; L.svg.remove(); };
  img.onload = () => requestAnimationFrame(() => requestAnimationFrame(done)); img.onerror = done; img.src = m.slice(5, -2).replace(/^"|"$/g, '');
  setTimeout(done, 400);
}
export function morphBetween(el, fromD, toD, duration, easeFn) {
  const fn = morpher(fromD, toD); const t0 = performance.now();
  beginLive(el);
  const tick = (now) => { const p = Math.min(1, (now - t0) / duration); if (p < 1 && el.isConnected) { setVectorD(el, fn(easeFn ? easeFn(p) : p)); requestAnimationFrame(tick); } else endLive(el, toD); };
  setVectorD(el, fromD); requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- non-destructive path modifiers
// offset=8|-6 (grow/shrink), width-profile=taper|brush|ink|calligraphy|"0:0.2 0.5:1 1:0" (variable-width stroke),
// brush="scatter star size=10 spacing=16 jitter=0.3 rotate=follow|random" (scatter brush). The element keeps its
// box and editable path; the modified geometry is drawn in positioned layers (it may overflow the box).
function buildModified(el, node, a, subs, box, ctx, fillCss) {
  const { w, h } = box;
  el.classList.add('mq-vec');
  el.dataset.d = serializePath(subs); el.dataset.vw = w; el.dataset.vh = h; el._path = subs; el._box = box;
  if (a.w === undefined && a.size === undefined) el.style.width = w + 'px';
  if (a.h === undefined && a.size === undefined) el.style.height = h + 'px';
  el.style.flexShrink = '0'; el.style.overflow = 'visible';
  const stV = a.stroke ?? a.border; const st = stV !== undefined && stV !== 'none' && stV !== false ? strokeSpec(stV) : null;
  const base = a.offset ? offsetPath(subs, num(a.offset), { smooth: !!a['offset-smooth'] }) : subs;
  const prof = a['width-profile'] || a.profile;
  const strip = { ...a, _inner: true }; for (const k of ['offset', 'width-profile', 'profile', 'brush', 'w', 'h', 'size']) delete strip[k];
  const layer = (geo, attrs) => {
    if (!geo || !geo.length) return; const bb = bbox(geo); if (!bb.w && !bb.h) return;
    const inner = document.createElement('div');
    inner.style.cssText = `position:absolute;left:${bb.x}px;top:${bb.y}px;width:${Math.max(1, bb.w)}px;height:${Math.max(1, bb.h)}px;pointer-events:none`;
    buildVector(inner, node, attrs, translatePath(geo, -bb.x, -bb.y), { w: Math.max(1, bb.w), h: Math.max(1, bb.h) }, ctx, fillCss);
    el.appendChild(inner);
  };
  const baseAttrs = { ...strip }; if (prof || a.brush) { baseAttrs.stroke = 'none'; delete baseAttrs.border; }
  const fillV = a.fill ?? a.bg;
  if ((fillV !== undefined && fillV !== 'none') || baseAttrs.stroke !== 'none' && st) layer(base, baseAttrs);
  const ink = a['brush-fill'] || (st ? st.color : 'currentColor');
  if (prof) layer(widthProfile(base, st ? st.w : 4, prof, { seed: num(a.seed, 3) }), { _inner: true, fill: ink, 'fill-rule': 'nonzero', opacity: undefined });
  if (a.brush) layer(scatterBrush(base, a.brush), { _inner: true, fill: ink, 'fill-rule': 'nonzero' });
}
