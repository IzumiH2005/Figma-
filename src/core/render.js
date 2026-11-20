// DOM renderer: Maquette node tree -> live HTML elements.
import { Scope, interp, evaluate } from './expr.js';
import { DEVICES, splitTop, withAlpha, parseColor, coerce } from './project.js';
import { twToAttrs } from './tailwind.js';
import { patternFill, wrapClone, applyEffects, applyMaskGroup } from './effects.js';
import { compileFx } from './fx.js';
import { applyShader } from './shader.js';
import { resolveColorFns, shade as shadeC, parseColor as parseC, toCss as toCssC } from './color.js';
const shadeColor = (c, p) => { const v = parseC(c); if (!v) throw new Error('not a colour'); return toCssC(shadeC(v, p / 100)); };
import { VECTOR_TAGS, nodePath, boxOf, booleanSubs, booleanParts, buildVector, ROUNDABLE, cornerOf, withCorners, buildTextPath, gooFilterSvg, maskCss, threeD, parseShapeSpec } from './vector.js';
import { shapePath, serializePath } from './pathkit.js';
import { textOf } from './parse.js';
import { ICONS } from './icons.js';
import { iconSvg, splitIconName, packLoaded } from './iconpacks.js';
import { genImage } from './gen.js';
import { makeStatusBar, makeHomeBar } from './chrome.js';
import { parseRig } from './rig.js';

export const FRAME_TAGS = new Set(['shape', 'boolean', 'textpath', 'path', 'frame', 'row', 'col', 'grid', 'stack', 'box', 'screen', 'rect', 'ellipse', 'button', 'card', 'section', 'header', 'footer', 'nav', 'list']);
export const INLINE_TEXT = new Set(['span', 'b', 'i', 'u', 's', 'a', 'code', 'br']);
const BP = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };
const STATE_PREFIX = { hover: ':hover', press: ':active', active: ':active', focus: ':focus-within' };
const WEIGHTS = { thin: 100, extralight: 200, light: 300, regular: 400, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, heavy: 800, black: 900 };
const SHADOWS = {
  none: 'none',
  xs: '0 1px 2px rgba(0,0,0,.06)',
  sm: '0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08)',
  md: '0 2px 4px rgba(0,0,0,.04), 0 6px 16px rgba(0,0,0,.08)',
  lg: '0 4px 8px rgba(0,0,0,.04), 0 16px 32px rgba(0,0,0,.12)',
  xl: '0 8px 16px rgba(0,0,0,.06), 0 28px 64px rgba(0,0,0,.18)',
  '2xl': '0 40px 100px rgba(0,0,0,.28)',
  inner: 'inset 0 2px 4px rgba(0,0,0,.08)',
  // recettes « How to Design Better UI Components »
  soft: '0 10px 15px rgba(0,0,0,.04)',
  raised: '0 15px 20px rgba(0,0,0,.10)',
  layered: '0 10px 15px rgba(0,0,0,.04), 0 2px 4px rgba(0,0,0,.15)',
  contact: '0 2px 4px rgba(0,0,0,.15)',
  brutal: '4px 4px 0 #000',
  'inner-light': 'inset -4px 2px 10px rgba(255,255,255,1)',
  e1: '0 1px 2px rgba(0,0,0,.06), 0 1px 1px rgba(0,0,0,.04)',
  e2: '0 2px 4px rgba(0,0,0,.06), 0 4px 8px rgba(0,0,0,.05)',
  e3: '0 4px 8px rgba(0,0,0,.06), 0 10px 20px rgba(0,0,0,.08)',
  e4: '0 8px 16px rgba(0,0,0,.08), 0 20px 40px rgba(0,0,0,.10)',
  e5: '0 16px 32px rgba(0,0,0,.10), 0 40px 80px rgba(0,0,0,.16)',
};
const EVENT_KEYS = (k) => k.startsWith('on:') || k.startsWith('@');
const ANIM_KEYS = new Set(['anim', 'loop', 'stagger']);
const NON_STYLE = new Set(['name', 'key', 'class', 'if', 'repeat', 'each', 'as', 'props', 'device', 'start', 'statusbar', 'homebar', 'src', 'bind', 'placeholder', 'type', 'd', 'view', 'value']);

let UID = 0;

export function rootScope(project, state) {
  return new Scope({}, null, {
    dollar: (n) => {
      if (state.vars && n in state.vars) return state.vars[n];
      const t = project.token(n, state.mode || 0);
      return t === undefined ? undefined : coerce(t);
    },
  });
}

// resolve "$token" refs inside a plain attribute string
// Tailwind environment: radius scale from $sh-radius, colour/opacity through the project's tokens
function twEnv(ctx) {
  if (ctx._tw) return ctx._tw;
  const r = parseFloat(ctx.project.token('sh-radius', ctx.mode)); 
  return (ctx._tw = { prefix: 'sh-', radius: isNaN(r) ? 10 : r, alpha: (c, op) => { const str = String(resolveDollars(c, ctx)); return parseColor(str) ? withAlpha(str, op / 100) : c; } });
}
export function resolveDollars(v, ctx) {
  if (typeof v !== 'string') return v;
  if (!v.includes('$')) return resolveColorFns(v);
  if (v.includes('$$')) return resolveDollars(v.split('$$').join('\u0001'), ctx).split('\u0001').join('$');
  const r = resolveDollarsRaw(v, ctx);
  return typeof r === 'string' ? resolveColorFns(r) : r;
}
function resolveDollarsRaw(v, ctx) {
  const whole = /^\$([A-Za-z_][\w\-.]*)(?:\/(\d+))?$/.exec(v);
  const look = (n) => {
    if (ctx.vars && n in ctx.vars) return ctx.vars[n];
    const t = ctx.project.token(n, ctx.mode);
    return t;
  };
  if (whole) {
    const r = look(whole[1]);
    if (r === undefined) return v;
    return whole[2] ? withAlpha(String(r), whole[2]) : r;
  }
  return v.replace(/\$([A-Za-z_][\w\-.]*)(?:\/(\d+))?/g, (m, n, a) => {
    const r = look(n); if (r === undefined) return m;
    return a ? withAlpha(String(r), a) : String(r);
  });
}

export function makeCtx(project, opts = {}) {
  const mode = opts.mode || 0;
  const state = { vars: opts.vars || project.initialVars(), mode };
  return {
    project, mode, modeName: project.modes[mode] || 'default', vars: state.vars,
    scope: rootScope(project, state), editor: !!opts.editor, runtime: opts.runtime || null,
    rules: [], anims: [], links: [], errors: [], owner: null, depth: 0, screenW: 0, device: null, slot: null,
  };
}

// ------------------------------------------------------------------ attrs

function mergeClasses(node, scope, ctx, out, seen = new Set()) {
  const cls = node.attrs && node.attrs.class;
  if (!cls) return;
  const list = String(safeInterp(cls, scope, ctx)).split(/\s+/).filter(Boolean);
  for (const c of list) {
    if (seen.has(c)) continue; seen.add(c);
    const st = ctx.project.styles[c];
    if (!st) continue;
    if (st.class) mergeClasses({ attrs: { class: st.class } }, scope, ctx, out, seen);
    for (const [k, v] of Object.entries(st)) if (k !== 'class') out[k] = v;
  }
}

function safeInterp(v, scope, ctx) {
  try { return interp(v, scope); } catch (e) { ctx.errors.push(e.message); return ''; }
}

export function resolveAttrs(node, scope, ctx, overrides) {
  const raw = {};
  mergeClasses(node, scope, ctx, raw);
  Object.assign(raw, node.attrs || {});
  const base = {}, states = {}, events = {};
  const apply = (k, v) => { base[k] = v; };
  const deferred = [];
  for (const [k, v] of Object.entries(raw)) {
    if (EVENT_KEYS(k)) { events[k.replace(/^@/, 'on:')] = { action: v, scope }; continue; }
    const ci = k.indexOf(':');
    if (ci > 0) {
      const p = k.slice(0, ci), rest = k.slice(ci + 1);
      if (STATE_PREFIX[p]) { (states[p] = states[p] || {})[rest] = val(v); continue; }
      if (ctx.project.modes.includes(p)) { if (ctx.modeName === p) deferred.push([rest, v, 1]); continue; }
      if (BP[p]) { if (ctx.screenW >= BP[p]) deferred.push([rest, v, 2 + BP[p] / 1e4]); continue; }
    }
    apply(k, val(v));
  }
  deferred.sort((a, b) => a[2] - b[2]).forEach(([k, v]) => apply(k, val(v)));
  // Tailwind utilities (tw="flex items-center gap-2 bg-primary hover:bg-primary/90") — explicit attributes win
  if (base.tw && typeof base.tw === 'string') {
    const tw = twToAttrs(base.tw, twEnv(ctx));
    const has = (k) => raw[k] !== undefined;
    if (tw.layout && !['row', 'col', 'grid', 'stack', 'layout'].some(has)) base.layout = tw.layout === 'block' ? 'col' : tw.layout;
    if (tw.layout === 'block' && base.align === undefined) base.align = 'stretch';
    for (const [k, v] of Object.entries(tw.attrs)) if (!k.startsWith('$') && !has(k)) base[k] = typeof v === 'string' ? resolveDollars(v, ctx) : v;
    for (const [k, v] of Object.entries(tw.prefixed)) {
      const ci = k.indexOf(':'); const p = k.slice(0, ci), rest = k.slice(ci + 1); if (rest.startsWith('$') || rest.includes(':')) continue;
      const vv = typeof v === 'string' ? resolveDollars(v, ctx) : v;
      if (STATE_PREFIX[p]) { if (!(states[p] && rest in states[p])) (states[p] = states[p] || {})[rest] = vv; }
      else if (p === 'dark') { if (/dark/i.test(ctx.modeName || '')) base[rest] = vv; }
      else if (BP[p]) { if (ctx.screenW >= BP[p]) base[rest] = vv; }
    }
    delete base.tw;
  }
  if (overrides) {
    for (const [k, v] of Object.entries(overrides.base)) base[k] = v;
    Object.assign(events, overrides.events);
    for (const [s, m] of Object.entries(overrides.states)) states[s] = { ...(states[s] || {}), ...m };
  }
  return { a: base, states, events };

  function val(v) {
    if (v === true) return true;
    const r = safeInterp(v, scope, ctx);
    if (r === 'false') return false;
    return typeof r === 'string' ? resolveDollars(r, ctx) : r;
  }
}

// ------------------------------------------------------------------ values

const px = (v) => (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v)) ? `${v}px` : String(v));
const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };

function padValue(v, side, ctx) {
  if (v === 'safe') return px(side === 't' ? (ctx.device?.safeTop || 0) : side === 'b' ? (ctx.device?.safeBottom || 0) : 0);
  if (typeof v === 'string' && v.startsWith('safe+')) return px((side === 't' ? ctx.device?.safeTop || 0 : ctx.device?.safeBottom || 0) + num(v.slice(5)));
  return px(v);
}

function boxShorthand(v) {
  const p = String(v).trim().split(/\s+/);
  if (p.length === 1) return [p[0], p[0], p[0], p[0]];
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  if (p.length === 3) return [p[0], p[1], p[2], p[1]];
  return p.slice(0, 4);
}

function fnArgs(s) { // "linear(90, #fff, #000)" -> ['linear', ['90','#fff','#000']]
  const m = /^([\w-]+)\(([\s\S]*)\)$/.exec(s.trim());
  if (!m) return null;
  return [m[1], splitTop(m[2], ',')];
}

function stopList(args) {
  return args.map((a) => a.replace(/(\d+(\.\d+)?)(?!\s*(%|px|deg))(\s*)$/, (m, n) => (/^#|rgb|hsl/.test(a) && !a.includes(' ') ? m : `${n}%`))).join(', ');
}

const NOISE = (o = 0.12, f = 0.9) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 ${o * 2.2} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;

export function fillToCss(v, ctx) {
  if (v === undefined || v === null || v === true || v === '') return null;
  const layers = splitTop(String(v), '+');
  const images = []; let color = null; const sizes = []; let anim = null;
  layers.forEach((layer, idx) => {
    const last = idx === layers.length - 1;
    const f = fnArgs(layer);
    if (!f) {
      if (last) color = layer; else images.push(`linear-gradient(${layer},${layer})`), sizes.push('auto');
      return;
    }
    const [name, args] = f;
    switch (name) {
      case 'linear': {
        let a = args;
        let ang = '180deg';
        if (/^-?\d+(\.\d+)?(deg)?$/.test(a[0]) || /^to /.test(a[0])) { ang = /^to /.test(a[0]) ? a[0] : `${parseFloat(a[0])}deg`; a = a.slice(1); }
        images.push(`linear-gradient(${ang} in oklab, ${stopList(a)})`); sizes.push('auto'); break;
      }
      case 'radial': {
        let a = args; let pos = 'circle at 50% 50%';
        if (/^(at |circle|ellipse)/.test(a[0])) { pos = a[0].startsWith('at') ? `circle ${a[0]}` : a[0]; a = a.slice(1); }
        images.push(`radial-gradient(${pos} in oklab, ${stopList(a)})`); sizes.push('auto'); break;
      }
      case 'conic': {
        let a = args; let pre = 'from 0deg';
        if (/^-?\d+(deg)?$/.test(a[0])) { pre = `from ${parseFloat(a[0])}deg`; a = a.slice(1); }
        images.push(`conic-gradient(${pre} in oklch, ${stopList(a)})`); sizes.push('auto'); break;
      }
      case 'mesh': case 'aurora': {
        const c = args;
        const spots = [['18% 22%'], ['82% 18%'], ['78% 82%'], ['22% 78%'], ['50% 50%']];
        c.slice(1).forEach((col, k) => { images.push(`radial-gradient(circle at ${spots[k % spots.length][0]}, ${col} 0%, transparent 62%)`); sizes.push('auto'); });
        if (last) color = c[0]; else { images.push(`linear-gradient(${c[0]},${c[0]})`); sizes.push('auto'); }
        if (name === 'aurora') anim = 'aurora';
        break;
      }
      case 'noise': images.push(NOISE(num(args[0], 0.12), num(args[1], 0.9))); sizes.push('220px 220px'); break;
      case 'pattern': { const pf = patternFill(args, (name, size, color) => { try { return iconSvg(name, { size, sw: 2 }); } catch (e) { return ''; } }); images.push(pf.image); sizes.push(pf.size); break; }
      case 'dots': { const col = args[0] || 'rgba(127,127,127,.35)', s = num(args[1], 2), g = num(args[2], 16); images.push(`radial-gradient(${col} ${s / 2}px, transparent ${s / 2 + 0.5}px)`); sizes.push(`${g}px ${g}px`); break; }
      case 'grid': { const col = args[0] || 'rgba(127,127,127,.18)', g = num(args[1], 24), w = num(args[2], 1); images.push(`linear-gradient(${col} ${w}px, transparent ${w}px), linear-gradient(90deg, ${col} ${w}px, transparent ${w}px)`); sizes.push(`${g}px ${g}px, ${g}px ${g}px`); break; }
      case 'stripes': { const col = args[0] || 'rgba(127,127,127,.15)', w = num(args[1], 8), ang = num(args[2], 45); images.push(`repeating-linear-gradient(${ang}deg, ${col} 0 ${w}px, transparent ${w}px ${w * 2}px)`); sizes.push('auto'); break; }
      case 'image': case 'url': { const src = imageSrc(args[0].replace(/^["']|["']$/g, ''), ctx); images.push(`url("${src}")`); sizes.push(args[1] || 'cover'); break; }
      default: if (last) color = layer; else { images.push(layer); sizes.push('auto'); }
    }
  });
  return { image: images.join(', ') || null, color, size: sizes.join(', '), anim };
}

export function imageSrc(src, ctx) {
  if (!src) return '';
  if (/^(gen|avatar|initials|photo):/.test(src)) return genImage(src);
  if (ctx && ctx.project.assets && ctx.project.assets[src]) return ctx.project.assets[src];
  return src;
}

function strokeParts(v) {
  const parts = splitTop(String(v), ' ').filter(Boolean);
  let w = 1, color = 'currentColor', pos = 'inside', style = 'solid';
  for (const p of parts) {
    if (/^\d+(\.\d+)?$/.test(p)) w = parseFloat(p);
    else if (p === 'inside' || p === 'outside' || p === 'center') pos = p;
    else if (p === 'dashed' || p === 'dotted' || p === 'solid' || p === 'double') style = p;
    else color = p;
  }
  return { w, color, pos, style };
}

function shadowToCss(v) {
  return splitTop(String(v), '+').map((s) => {
    if (SHADOWS[s]) return SHADOWS[s];
    const f = fnArgs(s);
    if (f && f[0] === 'tinted') { const c = parseColor(f[1][0]); const a = f[1][1] ? parseFloat(f[1][1]) / (parseFloat(f[1][1]) > 1 ? 100 : 1) : 0.2; return c ? `0 15px 20px rgba(${c[0]},${c[1]},${c[2]},${a})` : ''; }
    if (f && f[0] === 'halo') return `0 0 0 1px ${f[1][0] || 'rgba(255,255,255,.08)'}, 0 0 ${num(f[1][1], 40)}px ${f[1][0] || 'rgba(255,255,255,.08)'}`;
    if (f && f[0] === 'glow') return `0 0 ${num(f[1][1], 24)}px ${f[1][2] || 0}px ${f[1][0]}`;
    if (f && f[0] === 'soft') return `0 ${num(f[1][1], 12)}px ${num(f[1][1], 12) * 2.5}px -${num(f[1][1], 12) / 2}px ${f[1][0]}`;
    return splitTop(s, ' ').map((t) => (/^-?\d+(\.\d+)?$/.test(t) ? `${t}px` : t)).join(' ');
  }).join(', ');
}

function fontStack(f) {
  if (!f) return null;
  const s = String(f);
  if (s === 'mono') return 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace';
  if (s === 'serif') return '"Instrument Serif", Georgia, serif';
  if (s.includes(',')) return s;
  return `"${s.replace(/["']/g, '')}", Inter, system-ui, -apple-system, sans-serif`;
}

const alignMap = { start: 'flex-start', top: 'flex-start', left: 'flex-start', center: 'center', middle: 'center', end: 'flex-end', bottom: 'flex-end', right: 'flex-end', stretch: 'stretch', baseline: 'baseline' };
const gridAlign = { start: 'start', top: 'start', left: 'start', center: 'center', middle: 'center', end: 'end', bottom: 'end', right: 'end', stretch: 'stretch', baseline: 'baseline' };
const justifyMap = { start: 'flex-start', left: 'flex-start', top: 'flex-start', center: 'center', end: 'flex-end', right: 'flex-end', bottom: 'flex-end', between: 'space-between', around: 'space-around', evenly: 'space-evenly' };

export function layoutOf(tag, a) {
  if (a.layout) return a.layout === 'column' ? 'col' : a.layout;
  if (a.row) return 'row'; if (a.col) return 'col'; if (a.grid) return 'grid'; if (a.stack) return 'stack';
  if (tag === 'row' || tag === 'nav') return 'row';
  if (tag === 'col' || tag === 'screen' || tag === 'section' || tag === 'card' || tag === 'list' || tag === 'header' || tag === 'footer') return 'col';
  if (tag === 'grid') return 'grid';
  if (tag === 'button') return 'row';
  return 'stack';
}

function placeParts(v) {
  const t = String(v).split(/[-\s]+/);
  let h = 'center', vv = 'center';
  if (t.includes('left')) h = 'start'; if (t.includes('right')) h = 'end';
  if (t.includes('top')) vv = 'start'; if (t.includes('bottom')) vv = 'end';
  return { h, v: vv };
}

// compute css for element
export function cssFor(tag, a, parentLayout, ctx, isText) {
  const s = {};
  const tf = [];
  const layout = isText ? null : layoutOf(tag, a);

  // ---------- container layout
  if (layout === 'row' || layout === 'col') {
    s.display = 'flex';
    s.flexDirection = layout === 'row' ? (a.reverse ? 'row-reverse' : 'row') : (a.reverse ? 'column-reverse' : 'column');
    const def = layout === 'row' ? 'center' : 'stretch';
    s.alignItems = alignMap[a.align || def] || def;
    if (a.justify) s.justifyContent = justifyMap[a.justify] || a.justify;
    if (a.wrap) { s.flexWrap = 'wrap'; s.alignContent = s.alignItems === 'stretch' ? 'flex-start' : s.alignItems; }
  } else if (layout === 'grid') {
    s.display = 'grid';
    const cols = a.cols ?? 2;
    s.gridTemplateColumns = /^\d+$/.test(String(cols)) ? `repeat(${cols}, minmax(0, 1fr))` : String(cols).replace(/(\d+)(?=\s|$)(?!fr|px|%)/g, '$1px');
    if (a.rows) s.gridTemplateRows = /^\d+$/.test(String(a.rows)) ? `repeat(${a.rows}, minmax(0, 1fr))` : String(a.rows);
    if (a.align) s.alignItems = gridAlign[a.align] || a.align;
    if (a.justify) s.justifyItems = gridAlign[a.justify] || a.justify;
    if (a.flow) s.gridAutoFlow = a.flow;
  } else if (layout === 'stack') {
    s.display = 'grid';
    s.gridTemplateColumns = 'minmax(0, 1fr)'; s.gridTemplateRows = 'minmax(0, 1fr)';
    s.placeItems = `${gridAlign[a.align || 'start'] || 'start'} ${gridAlign[a.justify || 'start'] || 'start'}`;
  }
  if (a.center && !isText) {
    if (layout === 'row' || layout === 'col') { s.alignItems = 'center'; s.justifyContent = 'center'; }
    else s.placeItems = 'center';
  }
  if (a.gap !== undefined && !isText) {
    if (a.gap === 'auto') s.justifyContent = 'space-between'; else s.gap = String(a.gap).split(/\s+/).map(px).join(' ');
  }
  if (a.gapx !== undefined) s.columnGap = px(a.gapx);
  if (a.gapy !== undefined) s.rowGap = px(a.gapy);

  // padding
  if (a.p !== undefined) { const [t, r, b, l] = boxShorthand(a.p); s.padding = [padValue(t, 't', ctx), padValue(r, 'r', ctx), padValue(b, 'b', ctx), padValue(l, 'l', ctx)].join(' '); }
  if (a.px !== undefined) { s.paddingLeft = px(a.px); s.paddingRight = px(a.px); }
  if (a.py !== undefined) { s.paddingTop = padValue(a.py, 't', ctx); s.paddingBottom = padValue(a.py, 'b', ctx); }
  if (a.pt !== undefined) s.paddingTop = padValue(a.pt, 't', ctx);
  if (a.pb !== undefined) s.paddingBottom = padValue(a.pb, 'b', ctx);
  if (a.pl !== undefined) s.paddingLeft = px(a.pl);
  if (a.pr !== undefined) s.paddingRight = px(a.pr);
  // margin
  if (a.m !== undefined) s.margin = boxShorthand(a.m).map((x) => (x === 'auto' ? 'auto' : px(x))).join(' ');
  for (const [k, prop] of [['mt', 'marginTop'], ['mb', 'marginBottom'], ['ml', 'marginLeft'], ['mr', 'marginRight']]) if (a[k] !== undefined) s[prop] = a[k] === 'auto' ? 'auto' : px(a[k]);
  if (a.mx !== undefined) { s.marginLeft = s.marginRight = a.mx === 'auto' ? 'auto' : px(a.mx); }
  if (a.my !== undefined) { s.marginTop = s.marginBottom = a.my === 'auto' ? 'auto' : px(a.my); }

  // ---------- sizing
  const pl = parentLayout;
  const sizeAxis = (v, axis) => {
    if (v === undefined || v === 'auto') return;
    const main = (pl === 'row' && axis === 'w') || (pl === 'col' && axis === 'h');
    const P = axis === 'w' ? 'width' : 'height';
    if (v === 'fill') {
      if (main) { s.flexGrow = 1; s.flexShrink = 1; s.flexBasis = 0; s[axis === 'w' ? 'minWidth' : 'minHeight'] = 0; }
      else if (pl === 'row' || pl === 'col') { s.alignSelf = 'stretch'; if (a.mx === 'auto' || a.my === 'auto' || String(a.m || '').includes('auto')) s[P] = '100%'; }
      else if (pl === 'grid' || pl === 'stack') { s[axis === 'w' ? 'justifySelf' : 'alignSelf'] = 'stretch'; }
      else s[P] = '100%';
      if (s.position === 'absolute') s[P] = '100%';
      return;
    }
    if (v === 'hug') { s[P] = 'fit-content'; if (main) s.flexShrink = 0; return; }
    s[P] = px(v);
    if (main && /^-?\d/.test(String(v)) && !String(v).endsWith('%')) s.flexShrink = 0;
  };

  // ---------- positioning
  const hasPos = ['x', 'y', 'top', 'left', 'right', 'bottom', 'inset'].some((k) => a[k] !== undefined);
  const absolute = a.absolute || a.fixed || (hasPos && tag !== 'screen');
  if (absolute) {
    s.position = 'absolute';
    if (a.inset !== undefined) { const [t, r, b, l] = boxShorthand(a.inset); Object.assign(s, { top: px(t), right: px(r), bottom: px(b), left: px(l) }); }
    if (a.place) {
      const pp = placeParts(a.place);
      if (pp.h === 'start') s.left = '0px'; else if (pp.h === 'end') s.right = '0px'; else { s.left = '50%'; tf.push('translateX(-50%)'); }
      if (pp.v === 'start') s.top = '0px'; else if (pp.v === 'end') s.bottom = '0px'; else { s.top = '50%'; tf.push('translateY(-50%)'); }
    }
    // constraints: x=center [offset] keeps the distance to the centre; percentages scale with the parent
    const cen = (v) => { const m = /^center(?:\s+(-?[\d.]+))?$/.exec(String(v)); return m ? (m[1] ? `calc(50% + ${m[1]}px)` : '50%') : null; };
    if (a.x !== undefined) { const c = cen(a.x); if (c) { s.left = c; tf.push('translateX(-50%)'); } else s.left = px(a.x); }
    if (a.y !== undefined) { const c = cen(a.y); if (c) { s.top = c; tf.push('translateY(-50%)'); } else s.top = px(a.y); }
    for (const k of ['top', 'left', 'right', 'bottom']) if (a[k] !== undefined) s[k] = px(a[k]);
  } else if (pl === 'stack' && tag !== 'screen') {
    s.gridArea = '1 / 1';
    if (a.place) { const pp = placeParts(a.place); s.justifySelf = pp.h; s.alignSelf = pp.v; }
  }
  if (!isText && !s.position) s.position = 'relative';
  if (tag !== 'screen') { sizeAxis(a.w, 'w'); sizeAxis(a.h, 'h'); }
  if (a.size !== undefined && (tag === 'ellipse' || tag === 'rect' || tag === 'box')) { s.width = px(a.size); s.height = px(a.size); s.flexShrink = 0; }
  if (a.minw !== undefined) s.minWidth = px(a.minw);
  if (a.maxw !== undefined) s.maxWidth = px(a.maxw);
  if (a.minh !== undefined) s.minHeight = px(a.minh);
  if (a.maxh !== undefined) s.maxHeight = px(a.maxh);
  if (a.aspect !== undefined) s.aspectRatio = String(a.aspect);
  if (a.grow !== undefined) { s.flexGrow = a.grow === true ? 1 : num(a.grow, 1); s.flexBasis = s.flexBasis ?? 0; s.minWidth = s.minWidth ?? 0; }
  if (a.shrink !== undefined) s.flexShrink = num(a.shrink, 1);
  if (a.self) s.alignSelf = alignMap[a.self] || a.self;
  if (a.span) s.gridColumn = a.span === 'all' ? '1 / -1' : `span ${a.span}`;
  if (a.gcol !== undefined) s.gridColumnStart = String(a.gcol);
  if (a.grst !== undefined) s.gridRowStart = String(a.grst);
  if (a.rspan !== undefined) s.gridRow = `span ${a.rspan}`;
  if (a.rowspan) s.gridRow = `span ${a.rowspan}`;
  if (a.z !== undefined) s.zIndex = a.z;
  if (a.order !== undefined) s.order = a.order;

  // ---------- visuals
  const fillV = tag === 'icon' || tag === 'vector' || tag === 'svg' ? undefined : isText && a.bg !== undefined ? undefined : a.fill ?? a.bg;
  if (isText && a.bg !== undefined && a.bg !== true) { const f = fillToCss(a.bg, ctx); if (f) { if (f.image) s.backgroundImage = f.image; if (f.color) s.backgroundColor = f.color; } }
  if (fillV !== undefined && fillV !== true) {
    const f = fillToCss(fillV, ctx);
    if (f) {
      if (isText && (f.image || /gradient/.test(f.color || ''))) {
        s.backgroundImage = f.image || f.color; s.webkitBackgroundClip = 'text'; s.backgroundClip = 'text'; s.color = 'transparent'; s.webkitTextFillColor = 'transparent';
      } else if (isText && tag !== 'text-bg') {
        s.color = f.color;
      } else {
        if (f.image) { s.backgroundImage = f.image; s.backgroundSize = f.size; s.backgroundPosition = 'center'; }
        if (f.color) s.backgroundColor = f.color;
        if (f.anim) { s.backgroundSize = '200% 200%'; s.animation = 'mq-aurora 12s ease-in-out infinite alternate'; }
      }
    }
  }
  if (a.highlight) s.backgroundColor = a.highlight;
  if (a.opacity !== undefined) s.opacity = num(a.opacity, 1) > 1 ? num(a.opacity) / 100 : num(a.opacity, 1);
  if (a.radius !== undefined && !ROUNDABLE(tag, a)) {
    s.borderRadius = a.radius === 'full' ? '9999px' : String(a.radius).split(/\s+/).map((x) => (x === 'full' ? '9999px' : px(x))).join(' ');
  }
  if (tag === 'ellipse') s.borderRadius = '50%';
  const strokeV = a.stroke ?? a.border;
  if (strokeV !== undefined && strokeV !== 'none' && strokeV !== false && tag !== 'icon' && tag !== 'vector') {
    const st = strokeParts(strokeV);
    s.outline = `${st.w}px ${st.style} ${st.color}`;
    s.outlineOffset = st.pos === 'inside' ? `${-st.w}px` : st.pos === 'center' ? `${-st.w / 2}px` : '0px';
  }
  for (const [k, side] of [['stroke-t', 'Top'], ['stroke-b', 'Bottom'], ['stroke-l', 'Left'], ['stroke-r', 'Right']]) {
    if (a[k] !== undefined) { const st = strokeParts(a[k]); s[`border${side}`] = `${st.w}px ${st.style} ${st.color}`; }
  }
  const shadows = [];
  if (a.shadow !== undefined && a.shadow !== true) shadows.push(shadowToCss(a.shadow));
  if (a.shadow === true) shadows.push(SHADOWS.md);
  if (a.glow) shadows.push(`0 0 ${a['glow-size'] || 32}px ${a.glow}`);
  if (shadows.length) { if (isText) s.textShadow = shadows.join(', ').replace(/inset\s*/g, ''); else s.boxShadow = shadows.join(', '); }
  const filters = [];
  if (a.blur !== undefined) filters.push(`blur(${num(a.blur)}px)`);
  if (a.grayscale) filters.push(`grayscale(${a.grayscale === true ? 1 : a.grayscale})`);
  if (a.brightness) filters.push(`brightness(${a.brightness})`);
  if (a.saturate) filters.push(`saturate(${a.saturate})`);
  if (a.hue) filters.push(`hue-rotate(${num(a.hue)}deg)`);
  if (a['drop-shadow']) filters.push(`drop-shadow(${shadowToCss(a['drop-shadow'])})`);
  if (filters.length) s.filter = filters.join(' ');
  if (a.bgblur !== undefined) { s.backdropFilter = `blur(${num(a.bgblur, 20)}px) saturate(180%)`; s.webkitBackdropFilter = s.backdropFilter; }
  if (a.blend) s.mixBlendMode = a.blend;
  if (a.clip || tag === 'screen') s.overflow = 'hidden';
  if (a.scroll) {
    s.overflowX = a.scroll === 'x' || a.scroll === 'both' ? 'auto' : 'hidden';
    s.overflowY = a.scroll === 'y' || a.scroll === 'both' || a.scroll === true ? 'auto' : 'hidden';
    s.scrollbarWidth = 'none';
    if (a.snap) { s.scrollSnapType = `${a.scroll === 'x' ? 'x' : 'y'} mandatory`; }
    if (a.scroll === 'x' && !s.flexWrap) s.flexWrap = 'nowrap';
  }
  if (a.snap === 'item' || a['snap-item']) s.scrollSnapAlign = 'start';
  if (a.hidden || a.visible === false) s.display = 'none';
  if (a.cursor) s.cursor = a.cursor;
  if (a.events === 'none') s.pointerEvents = 'none';
  if (a.perspective) s.perspective = px(a.perspective);

  // transforms
  if (a.dx !== undefined || a.dy !== undefined) tf.push(`translate(${px(a.dx || 0)}, ${px(a.dy || 0)})`);
  if (a.rotate !== undefined) tf.push(`rotate(${num(a.rotate)}deg)`);
  if (a.rotx !== undefined) tf.push(`rotateX(${num(a.rotx)}deg)`);
  if (a.roty !== undefined) tf.push(`rotateY(${num(a.roty)}deg)`);
  if (a.scale !== undefined) tf.push(`scale(${num(a.scale, 1)})`);
  if (a.flipx) tf.push('scaleX(-1)'); if (a.flipy) tf.push('scaleY(-1)');
  if (a.tx !== undefined || a.ty !== undefined) tf.unshift(`translate(${a.tx === undefined ? '0px' : px(a.tx)}, ${a.ty === undefined ? '0px' : px(a.ty)})`);
  if (tf.length) s.transform = tf.join(' ');
  if (a.origin) s.transformOrigin = a.origin;
  const depth = threeD(a, s);
  if (depth && VECTOR_TAGS.has(tag) && tag !== 'textpath') {
    // vectors: chained 1px drop-shadows extrude the real silhouette (crisp, opaque side colour)
    const n = Math.min(32, Math.round(num(a.depth))); const [dx, dy] = String(a['depth-dir'] || '1 1').split(/\s+/).map(Number);
    let col = a['depth-color']; if (!col) { try { col = shadeColor(String(a.fill || '#888'), 28); } catch { col = '#333'; } }
    s.filter = [s.filter, Array.from({ length: n }, () => `drop-shadow(${dx}px ${dy}px 0 ${col})`).join(' ')].filter(Boolean).join(' ');
  } else if (depth) { if (isText) s.textShadow = [s.textShadow, depth].filter(Boolean).join(', '); else s.boxShadow = [s.boxShadow, depth].filter(Boolean).join(', '); }
  if (a.tilt || a.preserve3d) s.transformStyle = 'preserve-3d';
  if (a.mask && a.mask !== true && a.mask !== 'first') { const m = maskCss(a.mask); if (m) { s.webkitMaskImage = m.image; s.maskImage = m.image; s.webkitMaskSize = m.size; s.maskSize = m.size; s.webkitMaskRepeat = 'no-repeat'; s.maskRepeat = 'no-repeat'; } }

  // ---------- typography (cascades)
  if (a.font) s.fontFamily = fontStack(a.font);
  if (a.mono) s.fontFamily = fontStack('mono');
  if (a.size !== undefined && tag !== 'icon' && tag !== 'ellipse' && tag !== 'rect' && tag !== 'box') s.fontSize = px(a.size);
  if (a.weight !== undefined) s.fontWeight = WEIGHTS[a.weight] || a.weight;
  // variable font axes (axes="wght 650, wdth 90, opsz 32") and OpenType features (features="tnum ss01 -liga")
  if (a.axes) s.fontVariationSettings = String(a.axes).split(',').map((p) => p.trim().split(/\s+/)).filter((p) => p.length === 2).map(([t, v]) => `"${t}" ${v}`).join(', ');
  if (a.features) s.fontFeatureSettings = String(a.features).split(/[\s,]+/).filter(Boolean).map((f) => (f.startsWith('-') ? `"${f.slice(1)}" 0` : `"${f}" 1`)).join(', ');
  if (a.bold) s.fontWeight = 700;
  if (a.lh !== undefined) s.lineHeight = num(a.lh) <= 4 ? String(num(a.lh)) : px(a.lh);
  if (a.ls !== undefined) s.letterSpacing = String(a.ls).endsWith('%') ? `${num(a.ls) / 100}em` : String(a.ls).endsWith('em') ? a.ls : px(a.ls);
  if (a.color !== undefined && a.color !== true) {
    const f = fillToCss(a.color, ctx);
    if (f && f.image) { s.backgroundImage = f.image; s.webkitBackgroundClip = 'text'; s.backgroundClip = 'text'; s.color = 'transparent'; s.webkitTextFillColor = 'transparent'; }
    else s.color = a.color;
  }
  const ta = a.talign || (isText ? a.align : undefined);
  if (ta) s.textAlign = ta === 'start' ? 'left' : ta === 'end' ? 'right' : ta;
  if (a.upper) s.textTransform = 'uppercase';
  if (a.lower) s.textTransform = 'lowercase';
  if (a.caps) s.textTransform = 'capitalize';
  if (a.italic) s.fontStyle = 'italic';
  if (a.underline) s.textDecoration = 'underline';
  if (a.strike) s.textDecoration = 'line-through';
  if (a.tabular) s.fontVariantNumeric = 'tabular-nums';
  if (a.nowrap) s.whiteSpace = 'nowrap';
  if (a.balance) s.textWrap = 'balance';
  if (a.truncate) { s.whiteSpace = 'nowrap'; s.overflow = 'hidden'; s.textOverflow = 'ellipsis'; if (!s.minWidth) s.minWidth = 0; }
  if (a.lines) { s.display = '-webkit-box'; s.webkitLineClamp = String(a.lines); s.webkitBoxOrient = 'vertical'; s.overflow = 'hidden'; }
  if (isText && a.w === undefined && pl === 'row' && !a.truncate && !a.grow) s.flexShrink = s.flexShrink ?? 0;
  return s;
}

function applyCss(el, s) {
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null) continue;
    if (k === 'webkitBackgroundClip') el.style.setProperty('-webkit-background-clip', v);
    else if (k === 'webkitTextFillColor') el.style.setProperty('-webkit-text-fill-color', v);
    else if (k === 'webkitLineClamp') el.style.setProperty('-webkit-line-clamp', v);
    else if (k === 'webkitBoxOrient') el.style.setProperty('-webkit-box-orient', v);
    else if (k === 'webkitBackdropFilter') el.style.setProperty('-webkit-backdrop-filter', v);
    else if (k === 'webkitMaskImage') el.style.setProperty('-webkit-mask-image', v);
    else if (k === 'webkitMaskSize') el.style.setProperty('-webkit-mask-size', v);
    else if (k === 'webkitMaskRepeat') el.style.setProperty('-webkit-mask-repeat', v);
    else el.style[k] = v;
  }
}

const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/^webkit/, '-webkit');

function stateRules(cls, states, tag, ctx, isText) {
  for (const [st, attrs] of Object.entries(states)) {
    const css = cssFor(tag, attrs, null, ctx, isText);
    delete css.position; delete css.display; delete css.gridArea;
    for (const k of ['flexDirection', 'alignItems', 'placeItems', 'gridTemplateColumns', 'gridTemplateRows']) if (!(k in attrs)) delete css[k];
    const body = Object.entries(css).map(([k, v]) => `${kebab(k)}:${v} !important`).join(';');
    const sel = st === 'hover' ? `.${cls}:hover` : `.${cls}${STATE_PREFIX[st]}`;
    ctx.rules.push(`${sel}{${body}}`);
  }
}

// ------------------------------------------------------------------ nodes

export function renderChildren(children, scope, parentLayout, ctx, parentEl) {
  const out = [];
  for (const c of children || []) for (const el of renderNode(c, scope, parentLayout, ctx)) { if (parentEl) parentEl.appendChild(el); out.push(el); }
  return out;
}

export function renderNode(node, scope, parentLayout, ctx, overrides) {
  if (!node) return [];
  // bare text inside a container (e.g. <ui.Button>Enregistrer</ui.Button>) renders as an implicit <text>
  if (node.tag === '#text') return node.text && node.text.trim() ? renderNode({ id: node.id, tag: 'text', attrs: {}, children: [{ ...node, text: node.text.trim() }] }, scope, parentLayout, ctx) : [];
  if (node.tag === 'note' && !ctx.editor) return [];
  if (ctx.depth > 40) { ctx.errors.push('Récursion de composants trop profonde'); return []; }
  const at = node.attrs || {};
  // conditionals & loops
  if (at.if !== undefined) {
    let ok = true;
    try { ok = !!evaluate(String(at.if).replace(/^\{|\}$/g, ''), scope); } catch (e) { ctx.errors.push(e.message); }
    if (!ok) return [];
  }
  if (at.repeat !== undefined || at.each !== undefined) {
    let list;
    try {
      if (at.each !== undefined) list = interp(at.each, scope);
      else { const n = +interp(at.repeat, scope); list = Array.from({ length: n }, (_, k) => k); }
    } catch (e) { ctx.errors.push(e.message); list = []; }
    if (!Array.isArray(list)) list = [];
    const as = at.as || 'item';
    const stripped = { ...node, attrs: { ...at } }; delete stripped.attrs.repeat; delete stripped.attrs.each; delete stripped.attrs.as;
    const out = [];
    list.forEach((item, i) => {
      const sc = scope.child({ [as]: item, i, index: i, first: i === 0, last: i === list.length - 1, __loop: (scope.lookup('__loop') || '') + '.' + i });
      for (const el of renderNode(stripped, sc, parentLayout, ctx, overrides)) { if (el.dataset.key) el.dataset.key += '#' + (item && item.id != null ? item.id : i); out.push(el); }
    });
    return out;
  }

  // slot
  // named slots (Figma « slot » property): <slot name=footer/> receives the instance children marked slot=footer,
  // the plain <slot/> receives the others; a slot's own children are its default content when nothing is given.
  if (node.tag === 'slot') {
    const want = node.attrs.name ? String(node.attrs.name) : null;
    const given = ctx.slot ? ctx.slot.children.filter((c) => ((c.attrs && c.attrs.slot) ? String(c.attrs.slot) : null) === want) : [];
    if (!given.length) return node.children && node.children.length ? renderChildren(node.children, scope, parentLayout, ctx) : [];
    const saved = ctx.owner; ctx.owner = ctx.slot.owner;
    const els = renderChildren(given, ctx.slot.scope, parentLayout, { ...ctx, slot: ctx.slot.parent, owner: ctx.slot.owner, instance: ctx.slot.instance, depth: ctx.depth });
    ctx.owner = saved; return els;
  }

  // instance swap: <instance of={icon ? 'IconButton' : 'Button'} …/> renders the named component with the same props
  if (node.tag === 'instance') {
    const name = String(safeInterp(node.attrs.of ?? '', scope, ctx) || '').trim();
    if (!ctx.project.components[name]) { ctx.errors.push(`<instance of=…> : composant inconnu « ${name} »`); return []; }
    const attrs = { ...node.attrs }; delete attrs.of;
    return renderNode({ ...node, tag: name, attrs }, scope, parentLayout, ctx, overrides);
  }
  // component instance
  const comp = /^(\w+\.)?[A-Z]/.test(node.tag) ? ctx.project.components[node.tag] : null;
  if (comp) return [renderInstance(node, comp, scope, parentLayout, ctx, overrides)];

  const { a, states, events } = resolveAttrs(node, scope, ctx, overrides);
  const rigs = takeRigs(a, (t) => rigBinding(t, node.id, a, ctx));
  const el = createElementFor(node, a, scope, parentLayout, ctx);
  if (!el) return [];
  decorate(el, node, a, states, events, scope, parentLayout, ctx);
  if (rigs.length) attachRigs(el, rigs, ctx);
  return [a.clone && a.clone !== true ? wrapClone(el, a.clone) : el];
}

// rig:<target>="…" → [{ target, spec, r, bind }] (removed from the attrs so they never reach the CSS)
function takeRigs(a, bindOf) {
  const out = [];
  for (const k of Object.keys(a)) {
    if (!k.startsWith('rig:')) continue;
    const spec = a[k]; delete a[k];
    if (spec === true || spec === false || spec == null || spec === 'false' || spec === 'none') continue;
    const target = k.slice(4); out.push({ target, spec: String(spec), r: parseRig(spec), bind: bindOf(target) });
  }
  return out;
}
// what a rig writes: a $variable, a prop of the enclosing instance, or an attribute of the node itself
function rigBinding(target, nodeId, a, ctx) {
  if (target.startsWith('$')) { const name = target.slice(1); return { type: 'var', name, value: ctx.vars ? ctx.vars[name] : undefined }; }
  const inst = ctx.instance;
  if (inst && target in inst.props) return { type: 'prop', id: inst.id, key: inst.key, top: inst.top, comp: inst.comp, name: target, value: inst.props[target] };
  return { type: 'attr', id: nodeId, owned: !!ctx.owner, name: target, value: a[target] };
}
function attachRigs(el, rigs, ctx) {
  el._rigs = (el._rigs || []).concat(rigs); el.dataset.rigged = '1';
  if (ctx.runtime && ctx.runtime.bindRigs) ctx.runtime.bindRigs(el);
}

function renderInstance(node, comp, scope, parentLayout, ctx, outerOverrides) {
  const props = { ...comp.props };
  const instKey = node.id + (scope.lookup('__loop') || '');
  const rigAttrs = {};
  const base = {}, events = {}, states = {}, deferred = [];
  const raw = {}; mergeClasses(node, scope, ctx, raw); Object.assign(raw, node.attrs);
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'class' || k === 'if' || k === 'repeat' || k === 'each' || k === 'as') continue;
    if (k.startsWith('rig:')) { rigAttrs[k] = v; continue; }
    if (k in comp.props) { if (v === true) props[k] = true; else { const r = resolveDollars(safeInterp(v, scope, ctx), ctx); props[k] = /^\{[\s\S]*\}$/.test(v) ? r : coerce(r); } continue; }
    if (EVENT_KEYS(k)) { events[k.replace(/^@/, 'on:')] = { action: v, scope }; continue; }
    const ci = k.indexOf(':');
    const rv = () => { if (v === true) return true; const r = resolveDollars(safeInterp(v, scope, ctx), ctx); return r === 'false' ? false : r; };
    if (ci > 0) {
      const pfx = k.slice(0, ci), rest = k.slice(ci + 1);
      if (STATE_PREFIX[pfx]) { (states[pfx] = states[pfx] || {})[rest] = rv(); continue; }
      if (ctx.project.modes.includes(pfx)) { if (ctx.modeName === pfx) deferred.push([rest, rv(), 1]); continue; }
      if (BP[pfx]) { if (ctx.screenW >= BP[pfx]) deferred.push([rest, rv(), 2 + BP[pfx] / 1e4]); continue; }
    }
    base[k] = rv();
  }
  deferred.sort((x, y) => x[2] - y[2]).forEach(([k, v]) => { base[k] = v; });
  // rigs declared on <component rig:value="…"> apply to every instance (an instance can override or disable one with rig:value=false)
  for (const [k, v] of Object.entries((comp.node && comp.node.attrs) || {})) if (k.startsWith('rig:') && !(k in rigAttrs)) rigAttrs[k] = v;
  if (outerOverrides) { Object.assign(base, outerOverrides.base); Object.assign(events, outerOverrides.events); }
  // interactive components: instance-local state set by `change k=v` or a rig in the prototype
  const local = ctx.runtime && ctx.runtime.inst && ctx.runtime.inst[instKey];
  if (local) for (const [k, v] of Object.entries(local)) if (k in comp.props) props[k] = v;
  const instance = { id: node.id, key: instKey, props, top: !ctx.owner, comp: comp.name };
  const kids = (node.children || []).filter((c) => !(c.tag === '#text' && !c.text.trim()));
  const compScope = scope.child({ __inst: instKey, ...props, children: kids.length > 0, label: props.label ?? (kids.length && kids.every((k) => k.tag === 'text' && k.implicit) ? textOf(kids[0]) : props.label) });
  compScope.parent = null; compScope.root = scope.root; // isolate locals
  const sub = { ...ctx, depth: ctx.depth + 1, owner: ctx.owner || node.id, instance, slot: { children: kids, scope, owner: ctx.owner, instance: ctx.instance, parent: ctx.slot } };
  if (!comp.root) return document.createElement('div');
  const els = renderNode(comp.root, compScope, parentLayout, sub, { base, events, states });
  const el = els[0] || document.createElement('div');
  el.dataset.comp = comp.name;
  el._props = props;
  if (props.kind !== undefined) el.dataset.kind = String(props.kind);
  if (!ctx.owner) el.dataset.id = node.id;
  const key = base.key || base.name;
  if (key) el.dataset.key = key;
  el.dataset.inst = instKey;
  const own = takeRigs(rigAttrs, (t) => t.startsWith('$') ? rigBinding(t, node.id, {}, ctx) : t in comp.props ? { type: 'prop', id: node.id, key: instKey, top: !ctx.owner, comp: comp.name, name: t, value: props[t] } : { type: 'attr', id: node.id, owned: !!ctx.owner, name: t, value: base[t] });
  if (own.length) attachRigs(el, own, ctx);
  return el;
}

function createElementFor(node, a, scope, parentLayout, ctx) {
  const tag = node.tag;
  let el;
  switch (tag) {
    case 'text': case 'note': {
      el = document.createElement('div');
      el.className = 'mq-text';
      fillText(el, node.children, scope, ctx);
      if (tag === 'note') el.className = 'mq-note';
      break;
    }
    case 'icon': {
      el = document.createElement('div'); el.className = 'mq-icon';
      const name = String(a.name || a.icon || 'circle');
      const size = num(a.size, 20);
      const sw = a.stroke !== undefined && /^\d/.test(String(a.stroke)) ? num(a.stroke) : a.sw !== undefined ? num(a.sw) : undefined;
      const fill = a.fill && a.fill !== true ? a.fill : undefined;
      let svg = iconSvg(name, { size, sw, fill });
      if (!svg) {
        const [pack] = splitIconName(name);
        if (pack !== 'lucide' && !packLoaded(pack)) { (ctx.missingPacks = ctx.missingPacks || new Set()).add(pack); el.dataset.pendingIcon = name; }
        else ctx.errors.push(`Icône inconnue: ${name}`);
        svg = iconSvg('circle-dashed', { size, sw }) || '';
      }
      el.innerHTML = svg;
      el.style.width = el.style.height = size + 'px'; el.style.flexShrink = '0';
      el.style.display = 'grid'; el.style.placeItems = 'center';
      if (a.color) el.style.color = a.color;
      break;
    }
    case 'image': case 'img': {
      el = document.createElement('div'); el.className = 'mq-image';
      const src = imageSrc(String(a.src || 'gen:abstract'), ctx);
      el.style.backgroundImage = `url("${src}")`;
      el.style.backgroundSize = a.fit === 'contain' ? 'contain' : a.fit === 'fill' ? '100% 100%' : 'cover';
      el.style.backgroundPosition = a.pos || 'center';
      el.style.backgroundRepeat = 'no-repeat';
      if (a.w === undefined && a.h === undefined && a.aspect === undefined && a.inset === undefined) { el.style.width = '100%'; el.style.aspectRatio = '4/3'; }
      break;
    }
    case 'shape': case 'boolean': case 'textpath': case 'path': {
      el = document.createElement('div'); el.className = 'mq-vector';
      const box = boxOf(a, tag === 'textpath' ? 200 : 100);
      const attrsOf = (c) => resolveAttrs(c, scope, ctx).a;
      let subs;
      if (tag === 'boolean') { subs = booleanSubs(node, attrsOf, a.op || 'union'); el._bool = { op: a.op || 'union', parts: booleanParts(node, attrsOf), ...cornerOf(a) }; }
      else if (tag === 'textpath') { const sp = parseShapeSpec(a.shape || 'ellipse'); subs = a.d ? nodePath({ tag: 'vector', children: [] }, a, box) : shapePath(sp.kind, box.w, box.h, sp.params); }
      else subs = withCorners(nodePath(node, a, box), cornerOf(a));
      if (tag === 'textpath') buildTextPath(el, a, String(safeInterp(textOf(node), scope, ctx) ?? '').trim(), subs, box);
      else buildVector(el, node, a, subs, box, ctx, (v) => fillToCss(v, ctx));
      if (a.morph) el._morphTargets = String(a.morph).split('|').map((spec) => { const s = parseShapeSpec(spec.trim()); return serializePath(shapePath(s.kind, box.w, box.h, s.params)); });
      break;
    }
    case 'vector': case 'svg': {
      if ((a.d && !a.view) || a.vector || (a.w !== undefined && a.d && /^\d/.test(String(a.w)) && !a.view)) {
        el = document.createElement('div'); el.className = 'mq-vector';
        const box = boxOf(a, 100);
        buildVector(el, node, a, withCorners(nodePath(node, a, box), cornerOf(a)), box, ctx, (v) => fillToCss(v, ctx));
        break;
      }
      el = document.createElement('div'); el.className = 'mq-vector';
      const view = a.view || '0 0 24 24';
      const paths = a.d ? [{ d: a.d, fill: a.fill, stroke: a.stroke }] : (node.children || []).filter((c) => c.tag === 'path').map((c) => ({ d: c.attrs.d, fill: resolveDollars(c.attrs.fill, ctx), stroke: resolveDollars(c.attrs.stroke, ctx), sw: c.attrs.sw }));
      const body = paths.map((p) => `<path d="${p.d}" fill="${p.fill && p.fill !== true ? p.fill : (a.d ? 'none' : 'currentColor')}" stroke="${p.stroke && !/^\d/.test(p.stroke) ? p.stroke : 'none'}" stroke-width="${p.sw || a.sw || 2}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="100%" height="100%" preserveAspectRatio="${a.preserve || 'xMidYMid meet'}">${body}</svg>`;
      if (a.d && a.stroke && !/^\d/.test(String(a.stroke))) el.querySelector('path').setAttribute('stroke', a.stroke);
      if (a.d && a.fill && a.fill !== true) el.querySelector('path').setAttribute('fill', a.fill);
      break;
    }
    case 'input': case 'textarea': {
      el = document.createElement(tag === 'textarea' ? 'textarea' : 'input');
      el.className = 'mq-input';
      if (tag === 'input') el.type = a.type || 'text';
      if (a.placeholder) el.placeholder = a.placeholder;
      const bind = node.attrs.bind ? String(node.attrs.bind).replace(/^\$/, '') : null;
      if (bind && ctx.vars && ctx.vars[bind] != null) el.value = ctx.vars[bind];
      else if (a.value !== undefined) el.value = a.value;
      if (bind) el.dataset.bind = bind;
      if (ctx.editor) { el.readOnly = true; el.tabIndex = -1; }
      break;
    }
    case 'divider': case 'line': {
      el = document.createElement('div'); el.className = 'mq-divider';
      const thick = num(a.thick, 1);
      const vertical = a.vertical || parentLayout === 'row';
      if (vertical) { el.style.width = thick + 'px'; el.style.alignSelf = 'stretch'; } else { el.style.height = thick + 'px'; el.style.alignSelf = 'stretch'; }
      el.style.flexShrink = '0';
      el.style.background = a.color || a.fill || ctx.project.token('border', ctx.mode) || 'rgba(127,127,127,.2)';
      break;
    }
    case 'spacer': {
      el = document.createElement('div'); el.className = 'mq-spacer';
      if (a.size !== undefined) { el.style.width = el.style.height = px(a.size); el.style.flexShrink = '0'; } else { el.style.flexGrow = '1'; }
      return el;
    }
    default: {
      el = document.createElement('div');
      el.className = 'mq-frame';
      if (!FRAME_TAGS.has(tag) && !/^(\w+\.)?[A-Z]/.test(tag) && tag !== 'page') ctx.errors.push(`Balise inconnue <${tag}> (rendue comme <frame>)`);
      if (/^(\w+\.)?[A-Z]/.test(tag)) ctx.errors.push(`Composant inconnu <${tag}>`);
    }
  }
  return el;
}

function fillText(el, children, scope, ctx) {
  for (const c of children || []) {
    if (c.tag === '#text') {
      let t = safeInterp(c.text, scope, ctx);
      if (t == null) t = '';
      el.appendChild(document.createTextNode(String(t)));
    } else if (c.tag === 'br') el.appendChild(document.createElement('br'));
    else if (c.tag === 'icon') { const [ic] = renderNode(c, scope, 'row', ctx); if (ic) { ic.style.display = 'inline-grid'; ic.style.verticalAlign = '-0.15em'; el.appendChild(ic); } }
    else {
      const span = document.createElement(c.tag === 'a' ? 'a' : 'span');
      const { a } = resolveAttrs(c, scope, ctx);
      const st = cssFor(c.tag, a, null, ctx, true);
      delete st.position;
      if (c.tag === 'b') st.fontWeight = st.fontWeight || 700;
      if (c.tag === 'i') st.fontStyle = 'italic';
      if (c.tag === 'u') st.textDecoration = 'underline';
      if (c.tag === 's') st.textDecoration = 'line-through';
      if (c.tag === 'code') { st.fontFamily = st.fontFamily || fontStack('mono'); }
      applyCss(span, st);
      fillText(span, c.children, scope, ctx);
      el.appendChild(span);
    }
  }
}

function decorate(el, node, a, states, events, scope, parentLayout, ctx) {
  const tag = node.tag;
  const isText = tag === 'text' || tag === 'note';
  const css = cssFor(tag, a, parentLayout, ctx, isText);
  if (tag === 'icon') { delete css.width; delete css.height; if (a.w) css.width = px(a.w); }
  if (tag === 'divider' || tag === 'line') { delete css.backgroundColor; delete css.color; }
  if (el.classList.contains('mq-vec')) {
    for (const k of ['backgroundColor', 'backgroundImage', 'backgroundSize', 'outline', 'outlineOffset', 'color', 'webkitBackgroundClip', 'backgroundClip', 'webkitTextFillColor', 'animation']) delete css[k];
    if (css.boxShadow) { css.filter = [css.filter, ...splitTop(css.boxShadow, ',').filter((x) => !x.includes('inset')).map((x) => `drop-shadow(${x.replace(/(-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px)\s+-?\d+(?:\.\d+)?px/, '$1')})`)].filter(Boolean).join(' '); delete css.boxShadow; }
    if (!el.style.width) css.width = css.width || el._box?.w + 'px';
  }
  if (tag === 'textpath') { delete css.color; delete css.backgroundImage; }
  applyCss(el, css);
  if (el.classList.contains('mq-vec') && !el.style.position) el.style.position = 'relative';
  if (a.css) el.style.cssText += ';' + a.css;
  if (a.goo) { const g = gooFilterSvg(a.goo); (ctx.defs = ctx.defs || new Map()).set(g.id, g.svg); el.style.filter = `url(#${g.id})` + (el.style.filter ? ' ' + el.style.filter : ''); }
  if (a.fx && a.fx !== true) { const f = compileFx(resolveDollars(String(a.fx), ctx), ctx, { w: a.w, h: a.h }); if (f) el.style.filter = (el.style.filter ? el.style.filter + ' ' : '') + f; }
  if (a.shader && a.shader !== true) applyShader(el, resolveDollars(String(a.shader), ctx), ctx);
  if (a.tilt === 'pointer' && ctx.runtime) bindTilt(el, num(a['tilt-max'], 12));
  if (!ctx.owner) el.dataset.id = node.id;
  el.dataset.tag = tag;
  const key = tag === 'icon' ? a.key : (a.key || a.name);
  if (key) el.dataset.key = key;
  if (a['aria-label'] != null && a['aria-label'] !== true) el.setAttribute('aria-label', String(a['aria-label']));
  if (a.role) el.setAttribute('role', String(a.role));
  if (Object.keys(states).length) {
    const cls = 'mqs' + (++UID).toString(36);
    el.classList.add(cls);
    stateRules(cls, states, tag, ctx, isText);
    if (!el.style.transition) el.style.transition = 'background-color .18s, color .18s, transform .18s, box-shadow .18s, opacity .18s, outline-color .18s';
  }
  if (a.transition) el.style.transition = String(a.transition) === 'true' ? 'all .25s cubic-bezier(.2,.8,.2,1)' : `all ${num(a.transition)}ms cubic-bezier(.2,.8,.2,1)`;
  // events
  if (Object.keys(events).length) {
    if (ctx.runtime) ctx.runtime.bind(el, events);
    else if (ctx.editor) {
      el.dataset.proto = '1';
      for (const [trig, ev] of Object.entries(events)) {
        const m = /\b(?:go|overlay|swap)\s+([\w\-]+|"[^"]+")/.exec(String(ev.action));
        ctx.links.push({ from: el, owner: ctx.owner || node.id, trigger: trig, action: String(ev.action), target: m ? m[1].replace(/"/g, '') : null });
      }
    }
    if (events['on:click'] && !el.style.cursor) el.style.cursor = 'pointer';
  }
  // animations
  if (a.anim && a.anim !== true) ctx.anims.push({ el, spec: String(a.anim), kind: 'in', id: ctx.owner || node.id });
  if (a.loop && a.loop !== true) ctx.anims.push({ el, spec: String(a.loop), kind: 'loop', id: ctx.owner || node.id });
  // children
  if (!isText && !['icon', 'image', 'img', 'vector', 'svg', 'input', 'textarea', 'divider', 'line', 'shape', 'boolean', 'textpath', 'path'].includes(tag)) {
    const layout = layoutOf(tag, a);
    const kids = renderChildren(node.children, scope, layout, ctx, el);
    if (a.stagger) applyStagger(kids, a.stagger, ctx);
  }
  if (a.grain || a.texture || a.glass || a.pblur) applyEffects(el, a, ctx);
  if (a.mask === 'first' || a['mask-group']) { const run = (k) => { if (el.isConnected && el.offsetWidth) applyMaskGroup(el, a); else if (k < 30 && typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => run(k + 1)); }; run(0); }
}

// Cascade (overlapping action): "60 fade-up 450 from=center drag=1.1"
//   from=start|end|center|edges|random  ordre de départ ; drag = chaque élément suivant dure un peu plus (traîne)
export function applyStagger(kids, spec, ctx) {
  const parts = String(spec).split(/\s+/);
  const step = num(parts[0], 60);
  let from = 'start', drag = 1; const rest = [];
  for (const p of parts.slice(1)) { const m = /^(from|drag)=(.+)$/.exec(p); if (m) { if (m[1] === 'from') from = m[2]; else drag = num(m[2], 1); } else rest.push(p); }
  const animSpec = rest.join(' ') || 'fade-up 450';
  const n = kids.length; const mid = (n - 1) / 2;
  let rnd = 7;
  const order = kids.map((_, i) => from === 'end' ? n - 1 - i : from === 'center' ? Math.abs(i - mid) : from === 'edges' ? mid - Math.abs(i - mid) : from === 'random' ? ((rnd = (rnd * 9301 + 49297) % 233280) / 233280) * (n - 1) : i);
  kids.forEach((k, idx) => {
    const o = order[idx];
    const own = ctx.anims.find((x) => x.el === k && x.kind === 'in');
    if (own) { own.delay = (own.delay || 0) + o * step; own.durScale = Math.pow(drag, o); }
    else ctx.anims.push({ el: k, spec: animSpec, kind: 'in', delay: o * step, durScale: Math.pow(drag, o), id: k.dataset.id });
  });
}

// ------------------------------------------------------------------ screens

export function renderScreen(screen, ctx) {
  const { w, h, device } = ctx.project.sizeOf(screen);
  ctx.device = device || { safeTop: 0, safeBottom: 0 };
  ctx.screenW = w;
  ctx.rules = []; ctx.anims = []; ctx.links = []; ctx.errors = [];
  const { a, states, events } = resolveAttrs(screen, ctx.scope, ctx);
  const outer = document.createElement('div');
  outer.className = 'mq-screen';
  outer.dataset.id = screen.id; outer.dataset.tag = 'screen'; outer.dataset.screen = screen.attrs.name || '';
  const autoH = screen.attrs.h === 'auto' && !ctx.runtime;
  outer.style.cssText = `position:relative;width:${w}px;${autoH ? `min-height:${h}px` : `height:${h}px`};overflow:hidden;box-sizing:border-box;`;
  const fontDefault = ctx.project.token('font', ctx.mode) || ctx.project.fonts[0]?.split(':')[0] || 'Inter';
  outer.style.fontFamily = fontStack(fontDefault);
  const txt = ctx.project.token('text', ctx.mode);
  outer.style.color = txt || '#111';
  outer.style.fontSize = '16px'; outer.style.lineHeight = '1.45';
  // inner content box (scrollable)
  const inner = document.createElement('div');
  inner.className = 'mq-screen-body';
  const fixedKids = [], flowKids = [];
  for (const c of screen.children || []) ((c.attrs && (c.attrs.fixed || c.attrs.overlay)) ? fixedKids : flowKids).push(c);
  const css = cssFor('screen', a, null, ctx, false);
  const bgKeys = ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'animation'];
  for (const k of bgKeys) if (css[k]) { outer.style[k] = css[k]; delete css[k]; }
  if (css.fontFamily) { outer.style.fontFamily = css.fontFamily; } if (css.color) outer.style.color = css.color;
  applyCss(inner, css);
  if (autoH) { inner.style.position = 'relative'; inner.style.minHeight = h + 'px'; } else { inner.style.position = 'absolute'; inner.style.inset = '0'; }
  inner.style.overflowX = 'hidden';
  inner.style.overflowY = autoH || a.scroll === false || a.scroll === 'none' ? 'hidden' : 'auto';
  inner.style.scrollbarWidth = 'none';
  inner.style.boxSizing = 'border-box';
  if (a.css) inner.style.cssText += ';' + a.css;
  outer.appendChild(inner);
  const layout = layoutOf('screen', a);
  renderChildren(flowKids, ctx.scope, layout, ctx, inner);
  const fixedLayer = document.createElement('div');
  fixedLayer.className = 'mq-fixed'; fixedLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:grid;grid-template:minmax(0,1fr)/minmax(0,1fr);';
  for (const el of renderChildren(fixedKids, ctx.scope, 'stack', ctx)) { el.style.pointerEvents = 'auto'; fixedLayer.appendChild(el); }
  outer.appendChild(fixedLayer);
  if (a.statusbar) outer.appendChild(makeStatusBar(a.statusbar === true ? 'auto' : a.statusbar, device, outer.style.color));
  if (a.homebar) outer.appendChild(makeHomeBar(a.homebar === true ? 'auto' : a.homebar, outer.style.color));
  if (a.stagger) applyStagger([...inner.children].filter((k) => k.tagName !== 'STYLE'), a.stagger, ctx);
  if (Object.keys(events).length && ctx.runtime) ctx.runtime.bind(outer, events);
  else if (ctx.editor) for (const [trig, ev] of Object.entries(events)) { const m = /\b(?:go|overlay|swap)\s+([\w\-]+|"[^"]+")/.exec(String(ev.action)); ctx.links.push({ from: outer, owner: screen.id, trigger: trig, action: String(ev.action), target: m ? m[1].replace(/"/g, '') : null }); }
  appendDefs(outer, ctx);
  if (ctx.rules.length || ctx.project.css) {
    const st = document.createElement('style');
    st.textContent = ctx.rules.join('\n') + '\n' + (ctx.project.css || '');
    outer.appendChild(st);
  }
  outer._mq = { anims: ctx.anims, links: ctx.links, errors: ctx.errors, events, w, h };
  return outer;
}

// render any node standalone (used for components preview / overlays)
export function renderStandalone(node, ctx, layout = 'stack') {
  ctx.rules = []; ctx.anims = []; ctx.links = []; ctx.errors = [];
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:inline-grid;position:relative;';
  const fontDefault = ctx.project.token('font', ctx.mode) || ctx.project.fonts[0]?.split(':')[0] || 'Inter';
  wrap.style.fontFamily = fontStack(fontDefault);
  wrap.style.color = ctx.project.token('text', ctx.mode) || '#111';
  wrap.style.fontSize = '16px'; wrap.style.lineHeight = '1.45';
  if (node.attrs && (node.attrs.x !== undefined || node.attrs.y !== undefined)) { const at = { ...node.attrs }; delete at.x; delete at.y; node = { ...node, attrs: at }; }
  renderNode(node, ctx.scope, layout, ctx).forEach((e) => wrap.appendChild(e));
  appendDefs(wrap, ctx);
  if (ctx.rules.length) { const st = document.createElement('style'); st.textContent = ctx.rules.join('\n'); wrap.appendChild(st); }
  wrap._mq = { anims: ctx.anims, errors: ctx.errors, links: ctx.links, events: {} };
  return wrap;
}

function appendDefs(host, ctx) {
  if (!ctx.defs || !ctx.defs.size) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.innerHTML = `<defs>${[...ctx.defs.values()].join('')}</defs>`;
  host.appendChild(svg);
  ctx.defs = new Map();
}

// tilt="pointer": the element leans toward the cursor (3D card effect)
function bindTilt(el, max) {
  el.style.transformStyle = 'preserve-3d'; el.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
  const base = el.style.transform || '';
  el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5; el.style.transform = `${base} perspective(800px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`; });
  el.addEventListener('pointerleave', () => { el.style.transform = base; });
}

export const BASE_CSS = `
.mq-screen *,.mq-screen *::before,.mq-screen *::after{box-sizing:border-box}
.mq-screen-body::-webkit-scrollbar,.mq-frame::-webkit-scrollbar{display:none}
.mq-text{white-space:pre-line;overflow-wrap:break-word;min-width:0}
.mq-note{white-space:pre-line;background:#FFE58F;color:#3d3200;padding:14px 16px;border-radius:4px;font:500 14px/1.45 Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.18);max-width:320px}
.mq-vec{position:relative;flex-shrink:0}.mq-vec-fill{pointer-events:none}.mq-vec-stroke{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.mq-input{font:inherit;color:inherit;background:transparent;border:0;outline:0;min-width:0;padding:0;margin:0}
.mq-input::placeholder{color:currentColor;opacity:.45}
[data-hot]:focus-visible{outline:2px solid #5B8CFF;outline-offset:2px}
@keyframes mq-aurora{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:30% 0%}}
@keyframes mq-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
`;

export function fontsHref(project) {
  const fams = project.fonts.length ? project.fonts : ['Inter:400;500;600;700;800'];
  const all = new Map();
  for (const f of fams) { const [n, w] = f.split(':'); all.set(n.trim(), w || '400;500;600;700'); }
  if (!all.has('Inter')) all.set('Inter', '400;500;600;700');
  // "Roboto Flex:opsz,wdth,wght@8..144,25..151,100..1000" passes axis ranges through (variable fonts)
  const q = [...all].map(([n, w]) => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:${w.includes('@') ? w : 'wght@' + w.split(/[;,]/).sort((x, y) => parseFloat(x) - parseFloat(y)).join(';')}`).join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}
