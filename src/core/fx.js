// Layer effects compiled to SVG filters (Figma "shader effects", Config 2026):
//   fx="halftone size=8 angle=45 mode=cmyk; bloom intensity=0.6"
// Each effect becomes its own <filter> (ctx.defs) chained in the CSS filter property,
// so every effect can choose its own units (pixels for patterns, bounding box for warps).
// Parameters are plain numbers / colours, or {expr} resolved upstream, so rigs and variables drive them.
import { parseColor } from './color.js';

const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const f3 = (x) => +(+x).toFixed(4);
const SVGNS = "xmlns='http://www.w3.org/2000/svg'";
const enc = (svg) => 'data:image/svg+xml,' + encodeURIComponent(svg);
const LUM = [0.2126, 0.7152, 0.0722];
const rgb01 = (c, d = '#000') => { const p = parseColor(String(c || d)) || parseColor(d); return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] ?? 1]; };
const hex = (c) => { const [r, g, b] = rgb01(c); return '#' + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
const listColors = (v) => String(v || '').split(/[,\s]+/).filter(Boolean);
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const rand = (seed) => { let s = (seed * 9301 + 49297) % 233280 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

// ------------------------------------------------------------------ parsing
// "a k=v k2=v2; b …" (also "|" between effects). Values may be quoted. Colour lists use commas.
export function parseFx(spec) {
  const out = [];
  for (const chunk of String(spec || '').split(/\s*[;|]\s*/)) {
    const toks = chunk.match(/[\w.-]+=(?:"[^"]*"|'[^']*'|\S+)|"[^"]*"|\S+/g);
    if (!toks) continue;
    const type = toks[0].toLowerCase(); const o = {}; const pos = []; const keys = [];
    for (const t of toks.slice(1)) {
      const m = /^([\w.-]+)=(.*)$/.exec(t);
      if (m) { o[m[1]] = m[2].replace(/^["']|["']$/g, ''); keys.push(m[1]); } else pos.push(t.replace(/^["']|["']$/g, ''));
    }
    out.push({ type: ALIAS[type] || type, raw: type, o, pos, keys });
  }
  return out;
}
export function serializeFx(list) {
  return list.map((e) => [e.raw || e.type, ...e.pos, ...Object.keys(e.o).map((k) => `${k}=${/[\s;|]/.test(e.o[k]) ? `"${e.o[k]}"` : e.o[k]}`)].join(' ')).join('; ');
}
const ALIAS = { 'color-adjust': 'adjust', adjustments: 'adjust', filter: 'preset', 'gradient-map': 'gradmap', mixer: 'channels', 'channel-mixer': 'channels', dots: 'halftone', pixel: 'pixelate', mosaic: 'pixelate', hatch: 'hatching', contour: 'outlines', 'colored-edges': 'edges', glow: 'bloom', chromatic: 'rgb-split', split: 'rgb-split', aberration: 'rgb-split', distort: 'lens', 'lens-distortion': 'lens', refraction: 'refract', 'pixel-stretch': 'stretch', 'slice-shift': 'slice', 'chromatic-metal': 'metal', chrome: 'metal', goo: 'gooey', 'gooey-merge': 'gooey', bayer: 'dither' };

// ------------------------------------------------------------------ filter helpers
const filt = (id, body, { region = 0, obb = false } = {}) => {
  const r = region ? `x='${-region}' y='${-region}' width='${1 + 2 * region}' height='${1 + 2 * region}'` : "x='0' y='0' width='1' height='1'";
  return `<filter id='${id}' ${r} color-interpolation-filters='sRGB'${obb ? " primitiveUnits='objectBoundingBox'" : ''}>${body}</filter>`;
};
const mat = (rows, i = '', r = '') => `<feColorMatrix${i ? ` in='${i}'` : ''} type='matrix' values='${rows.flat().map(f3).join(' ')}'${r ? ` result='${r}'` : ''}/>`;
const tbl = (vals, ch = 'RGB', i = '', r = '', type = 'table') => `<feComponentTransfer${i ? ` in='${i}'` : ''}${r ? ` result='${r}'` : ''}>${ch.split('').map((c) => `<feFunc${c} type='${type}' tableValues='${vals.map(f3).join(' ')}'/>`).join('')}</feComponentTransfer>`;
const arith = (a, b, k1, k2, k3, k4, r = '') => `<feComposite in='${a}' in2='${b}' operator='arithmetic' k1='${f3(k1)}' k2='${f3(k2)}' k3='${f3(k3)}' k4='${f3(k4)}'${r ? ` result='${r}'` : ''}/>`;
const clip = (i = '') => `<feComposite${i ? ` in='${i}'` : ''} in2='SourceGraphic' operator='in'/>`;
// grey value (luminance) in R,G,B with opaque alpha
const LUMROWS = [[...LUM, 0, 0], [...LUM, 0, 0], [...LUM, 0, 0], [0, 0, 0, 0, 1]];
const DARKROWS = [[...LUM.map((x) => -x), 0, 1], [...LUM.map((x) => -x), 0, 1], [...LUM.map((x) => -x), 0, 1], [0, 0, 0, 0, 1]];
const OPAQUE = [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0, 1]];
// grey q (R channel) → mix(a, b, q)
const colorize = (a, b, i = '', r = '') => { const A = rgb01(a), B = rgb01(b); return mat([0, 1, 2].map((k) => [B[k] - A[k], 0, 0, 0, A[k]]).concat([[0, 0, 0, 0, 1]]), i, r); };
const isNone = (c) => c === 'none' || c === 'transparent';

// sample a list of colour stops into per-channel tables (gradient map)
function stopTables(colors, { n = 64, offset = 0, repeat = 1, mirror = false } = {}) {
  const cs = colors.map((c) => rgb01(c));
  const at = (t) => { t = (t * repeat + offset); t = mirror ? 1 - Math.abs(((t % 2) + 2) % 2 - 1) : (repeat !== 1 || offset ? ((t % 1) + 1) % 1 : clamp(t)); const x = t * (cs.length - 1); const i = Math.min(cs.length - 2, Math.floor(x)); const f = x - i; return cs.length === 1 ? cs[0] : cs[i].map((v, k) => v + (cs[i + 1][k] - v) * f); };
  const T = [[], [], []];
  for (let j = 0; j < n; j++) { const c = at(j / (n - 1)); for (let k = 0; k < 3; k++) T[k].push(c[k]); }
  return T;
}
const tables3 = (T, i = '', r = '') => `<feComponentTransfer${i ? ` in='${i}'` : ''}${r ? ` result='${r}'` : ''}>${'RGB'.split('').map((c, k) => `<feFunc${c} type='table' tableValues='${T[k].map(f3).join(' ')}'/>`).join('')}</feComponentTransfer>`;

// big user-space image (pattern fields) sized to the element (or a generous default)
const fieldImage = (svgBody, S, r) => `<feImage href="${enc(`<svg ${SVGNS} width='${S}' height='${S}' viewBox='0 0 ${S} ${S}'>${svgBody}</svg>`)}" x='0' y='0' width='${S}' height='${S}' preserveAspectRatio='none' result='${r}'/>`;
// bounding-box image (maps that follow the layer's size)
const obbImage = (href, r) => `<feImage href="${href}" x='0' y='0' width='1' height='1' preserveAspectRatio='none' result='${r}'/>`;

// "distance-like" fields: value 1 on the line/dot centre, 0 at the cell border (grey, opaque)
function fieldSvg(shape, cell, angle, S, id = 'p') {
  const c = cell, h = c / 2;
  const tr = `rotate(${f3(angle)} ${S / 2} ${S / 2})`;
  if (shape === 'line' || shape === 'lines') {
    return `<defs><linearGradient id='${id}' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='0' y2='${c}' spreadMethod='repeat' gradientTransform='${tr}'><stop offset='0' stop-color='#000'/><stop offset='.5' stop-color='#fff'/><stop offset='1' stop-color='#000'/></linearGradient></defs><rect x='-${S}' y='-${S}' width='${3 * S}' height='${3 * S}' fill='url(#${id})'/>`;
  }
  if (shape === 'circles' || shape === 'rings' || shape === 'concentric') {
    return `<defs><radialGradient id='${id}' gradientUnits='userSpaceOnUse' cx='${S / 2}' cy='${S / 2}' r='${c}' spreadMethod='repeat'><stop offset='0' stop-color='#000'/><stop offset='.5' stop-color='#fff'/><stop offset='1' stop-color='#000'/></radialGradient></defs><rect width='${S}' height='${S}' fill='url(#${id})'/>`;
  }
  if (shape === 'square' || shape === 'diamond') {
    // four triangles, each a linear ramp from the centre (white) to its edge (black) = Chebyshev distance
    const tri = (pts, x1, y1, x2, y2, k) => `<linearGradient id='${id}${k}' gradientUnits='userSpaceOnUse' x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}'><stop offset='0' stop-color='#fff'/><stop offset='1' stop-color='#000'/></linearGradient><polygon points='${pts}' fill='url(#${id}${k})'/>`;
    const cellSvg = tri(`0,0 ${c},0 ${h},${h}`, h, h, h, 0, 'a') + tri(`${c},0 ${c},${c} ${h},${h}`, h, h, c, h, 'b') + tri(`${c},${c} 0,${c} ${h},${h}`, h, h, h, c, 'c') + tri(`0,${c} 0,0 ${h},${h}`, h, h, 0, h, 'd');
    const rot = shape === 'diamond' ? angle + 45 : angle;
    return `<defs><pattern id='${id}' patternUnits='userSpaceOnUse' width='${c}' height='${c}' patternTransform='rotate(${f3(rot)} ${S / 2} ${S / 2})'>${cellSvg}</pattern></defs><rect width='${S}' height='${S}' fill='url(#${id})'/>`;
  }
  // dot: radial ramp, 1 at the centre → 0 at the cell corner (r = c/√2)
  return `<defs><radialGradient id='${id}g' gradientUnits='userSpaceOnUse' cx='${h}' cy='${h}' r='${f3(c * Math.SQRT1_2)}'><stop offset='0' stop-color='#fff'/><stop offset='1' stop-color='#000'/></radialGradient><pattern id='${id}' patternUnits='userSpaceOnUse' width='${c}' height='${c}' patternTransform='${tr}'><rect width='${c}' height='${c}' fill='url(#${id}g)'/></pattern></defs><rect width='${S}' height='${S}' fill='url(#${id})'/>`;
}
// wavy / zigzag line fields: stacked strokes of decreasing width (quantised distance field)
function strokeFieldSvg(style, cell, angle, S, freq, amp, id = 'w') {
  const L = Math.max(8, cell * 4 / Math.max(0.1, freq)), A = cell * amp;
  const pts = []; const N = style === 'zigzag' ? 2 : 24;
  for (let i = 0; i <= N; i++) { const t = i / N; const y = style === 'zigzag' ? (i % 2 ? -A : A) : A * Math.sin(t * Math.PI * 2); pts.push(`${f3(t * L)},${f3(y)}`); }
  const seg = `M${pts.join(' L')}`;
  const lv = 12; let strokes = '';
  for (let k = 0; k < lv; k++) { const w = cell * (1 - k / lv); const g = Math.round(255 * (k + 0.5) / lv); strokes += `<use href='#${id}l' stroke='rgb(${g},${g},${g})' stroke-width='${f3(w)}'/>`; }
  const H = cell;
  const row = (dy) => `<g transform='translate(0 ${dy})'>${strokes}</g>`;
  return `<defs><path id='${id}l' d='${seg} M${f3(-L)},${pts[0].split(',')[1]} ${seg.replace(/^M/, 'L')}' fill='none' stroke-linejoin='round'/><pattern id='${id}' patternUnits='userSpaceOnUse' width='${f3(L)}' height='${H}' patternTransform='rotate(${f3(angle)} ${S / 2} ${S / 2})'><rect width='${f3(L)}' height='${H}' fill='#000'/>${row(H / 2 - H)}${row(H / 2)}${row(H / 2 + H)}</pattern></defs><rect width='${S}' height='${S}' fill='url(#${id})'/>`;
}

// threshold a darkness image D (in) against a field F: ink where F > 1-ρ(D)
const threshold = (D, F, K, r) => arith(D, F, 0, K, K, 0.5 - K, r);

// ------------------------------------------------------------------ displacement maps (canvas, cached)
const mapCache = new Map();
function dispMap(key, fn, N = 160) {
  if (mapCache.has(key)) return mapCache.get(key);
  if (typeof document === 'undefined') return { href: '', scale: 0 };
  const vals = new Float32Array(N * N * 2); let mx = 1e-6;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const u = (i + 0.5) / N, v = (j + 0.5) / N; let [dx, dy] = fn(u, v); dx = Math.min(0.997, Math.max(0.003, u + dx)) - u; dy = Math.min(0.997, Math.max(0.003, v + dy)) - v; vals[(j * N + i) * 2] = dx; vals[(j * N + i) * 2 + 1] = dy; mx = Math.max(mx, Math.abs(dx), Math.abs(dy)); }
  const scale = mx * 2.02;
  const cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'); const im = g.createImageData(N, N);
  for (let p = 0; p < N * N; p++) { im.data[p * 4] = Math.round(255 * (0.5 + vals[p * 2] / scale)); im.data[p * 4 + 1] = Math.round(255 * (0.5 + vals[p * 2 + 1] / scale)); im.data[p * 4 + 2] = 128; im.data[p * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  const r = { href: cv.toDataURL('image/png'), scale };
  if (mapCache.size > 80) mapCache.clear();
  mapCache.set(key, r); return r;
}
const displace = (inp, map, scale, r = '') => `<feDisplacementMap in='${inp}' in2='${map}' scale='${f3(scale)}' xChannelSelector='R' yChannelSelector='G'${r ? ` result='${r}'` : ''}/>`;
// R, G, B isolated then re-merged with screen (for chromatic dispersion)
const ISO = [[[1, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 1, 0]], [[0, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 1, 0]], [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0]]];
const screen3 = (a, b, c, r = '') => `<feBlend in='${a}' in2='${b}' mode='screen' result='${r}_ab'/><feBlend in='${r}_ab' in2='${c}' mode='screen'${r ? ` result='${r}'` : ''}/>`;

// warp functions: (u, v) in 0..1 → displacement (in bounding-box fractions) of the sampled point
const WARPS = {
  sine: (o) => { const f = num(o.frequency ?? o.freq, 3), a = num(o.amount ?? o.amplitude ?? o.amp, 0.04), ang = num(o.angle, 0) * Math.PI / 180; return (u, v) => { const t = u * Math.cos(ang) + v * Math.sin(ang); const s = a * Math.sin(t * f * Math.PI * 2 + num(o.phase, 0)); return [-Math.sin(ang) * s, Math.cos(ang) * s]; }; },
  wave: (o) => WARPS.sine(o),
  ripple: (o) => { const f = num(o.frequency ?? o.freq, 8), a = num(o.amount ?? o.amp, 0.02), cx = num(o.cx, 0.5), cy = num(o.cy, 0.5); return (u, v) => { const dx = u - cx, dy = v - cy, r = Math.hypot(dx, dy) || 1e-6; const s = a * Math.sin(r * f * Math.PI * 2 + num(o.phase, 0)); return [dx / r * s, dy / r * s]; }; },
  twist: (o) => { const a = num(o.amount ?? o.angle, 90) * Math.PI / 180, R = num(o.radius, 0.5), cx = num(o.cx, 0.5), cy = num(o.cy, 0.5); return (u, v) => { const dx = u - cx, dy = v - cy, r = Math.hypot(dx, dy); const t = Math.max(0, 1 - r / R); const th = a * t * t; const c = Math.cos(th), s = Math.sin(th); return [dx * c - dy * s - dx, dx * s + dy * c - dy]; }; },
  swirl: (o) => WARPS.twist({ amount: 200, radius: 0.6, ...o }),
  bulge: (o) => { const a = num(o.amount, 0.5), R = num(o.radius, 0.45), cx = num(o.cx, 0.5), cy = num(o.cy, 0.5); return (u, v) => { const dx = u - cx, dy = v - cy, r = Math.hypot(dx, dy); if (r >= R) return [0, 0]; const t = r / R; const k = Math.pow(t, a > 0 ? 1 + a : 1 / (1 - a)); return [dx * (k / (t || 1e-6)) - dx, dy * (k / (t || 1e-6)) - dy]; }; },
  pinch: (o) => WARPS.bulge({ ...o, amount: -Math.abs(num(o.amount, 0.5)) }),
  flag: (o) => { const f = num(o.frequency ?? o.freq, 1.5), a = num(o.amount ?? o.amp, 0.05); return (u, v) => [0, a * u * Math.sin(u * f * Math.PI * 2 + num(o.phase, 0))]; },
  squeeze: (o) => { const a = num(o.amount, 0.3); return (u, v) => { const dx = u - 0.5; return [dx * a * Math.sin(v * Math.PI), 0]; }; },
};

// ------------------------------------------------------------------ the effects
// each builder: (o, pos, env) → { body, region?, obb? }   env: { S (field size px), uid }
const FX = {
  // Color adjust: exposure (stops) · contrast · brightness · highlights · shadows · black · white · gamma · temperature · tint · saturation · vibrance · hue
  adjust(o) {
    const ex = num(o.exposure, 0), co = num(o.contrast, 0) / 100, br = num(o.brightness, 0) / 100, hi = num(o.highlights, 0) / 100, sh = num(o.shadows, 0) / 100;
    const bp = num(o.black, 0) / 400, wp = 1 - num(o.white, 0) / 400, ga = Math.max(0.05, num(o.gamma, 1));
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const curve = []; for (let i = 0; i <= 32; i++) {
      let x = i / 32; x *= Math.pow(2, ex); x += br * 0.35 * (br > 0 ? 1 - x : x);
      x = (x - bp) / Math.max(0.01, wp - bp);
      const k = co >= 0 ? 1 / Math.max(0.05, 1 - co * 0.85) : 1 + co; x = (x - 0.5) * k + 0.5;
      x += hi * 0.35 * ss(0.45, 1, x) + sh * 0.35 * (1 - ss(0, 0.55, x));
      x = Math.pow(clamp(x), 1 / ga); curve.push(clamp(x));
    }
    const t = num(o.temperature ?? o.temp, 0) / 100, ti = num(o.tint, 0) / 100;
    const sat = 1 + num(o.saturation ?? o.saturate, 0) / 100 + num(o.vibrance, 0) / 200;
    let body = tbl(curve);
    if (t || ti) body += mat([[1 + 0.12 * t, 0, 0, 0, 0], [0, 1 - 0.1 * ti, 0, 0, 0], [0, 0, 1 - 0.12 * t, 0, 0], [0, 0, 0, 1, 0]]);
    if (sat !== 1) body += `<feColorMatrix type='saturate' values='${f3(Math.max(0, sat))}'/>`;
    if (num(o.hue, 0)) body += `<feColorMatrix type='hueRotate' values='${f3(num(o.hue))}'/>`;
    if (num(o.definition, 0)) { const d = num(o.definition) / 100; body += `<feConvolveMatrix order='3' preserveAlpha='true' kernelMatrix='0 ${f3(-d)} 0 ${f3(-d)} ${f3(1 + 4 * d)} ${f3(-d)} 0 ${f3(-d)} 0'/>`; }
    return { body };
  },
  // Filter presets: grayscale · sepia · vintage · warm · cool · noir · fade · vivid · invert   intensity=0..1
  preset(o, pos) {
    const name = pos[0] || o.name || 'grayscale', k = clamp(num(o.intensity ?? pos[1], 1), 0, 2);
    const I = [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0]];
    const G = [[...LUM, 0, 0], [...LUM, 0, 0], [...LUM, 0, 0], [0, 0, 0, 1, 0]];
    const P = {
      grayscale: G, mono: G,
      sepia: [[0.393, 0.769, 0.189, 0, 0], [0.349, 0.686, 0.168, 0, 0], [0.272, 0.534, 0.131, 0, 0], [0, 0, 0, 1, 0]],
      vintage: [[0.6, 0.35, 0.1, 0, 0.06], [0.22, 0.7, 0.12, 0, 0.04], [0.18, 0.28, 0.45, 0, 0.05], [0, 0, 0, 1, 0]],
      warm: [[1.08, 0.04, 0, 0, 0.02], [0, 1.02, 0, 0, 0.01], [0, 0, 0.86, 0, 0], [0, 0, 0, 1, 0]],
      cool: [[0.88, 0, 0, 0, 0], [0, 1.0, 0.03, 0, 0.01], [0, 0.05, 1.1, 0, 0.03], [0, 0, 0, 1, 0]],
      noir: [[0.3, 0.75, 0.15, 0, -0.1], [0.3, 0.75, 0.15, 0, -0.1], [0.3, 0.75, 0.15, 0, -0.1], [0, 0, 0, 1, 0]],
      fade: [[0.8, 0.1, 0.05, 0, 0.08], [0.06, 0.82, 0.06, 0, 0.08], [0.05, 0.1, 0.78, 0, 0.1], [0, 0, 0, 1, 0]],
      vivid: [[1.35, -0.25, -0.1, 0, 0], [-0.12, 1.3, -0.18, 0, 0], [-0.1, -0.25, 1.35, 0, 0], [0, 0, 0, 1, 0]],
      invert: [[-1, 0, 0, 0, 1], [0, -1, 0, 0, 1], [0, 0, -1, 0, 1], [0, 0, 0, 1, 0]],
    }[name] || G;
    let body = mat(I.map((row, r) => row.map((v, c) => v + (P[r][c] - v) * k)));
    if (name === 'noir') body += tbl([0, 0, 0.12, 0.45, 0.85, 1, 1].map((v, i, a) => (i / (a.length - 1)) + (v - i / (a.length - 1)) * Math.min(1, k)));
    return { body };
  },
  // Gradient map: colors=#000,#f06,#fff  offset= repeat= mirror  mix=0..1
  gradmap(o, pos) {
    const cols = listColors(o.colors || o.stops || pos.join(',')); if (cols.length < 2) cols.unshift('#000'), cols.push('#fff');
    const T = stopTables(cols, { offset: num(o.offset, 0), repeat: num(o.repeat, 1), mirror: o.mirror !== undefined || pos.includes('mirror') });
    const mix = clamp(num(o.mix, 1));
    let body = mat(LUMROWS.map((r, i) => (i === 3 ? [0, 0, 0, 1, 0] : r)), 'SourceGraphic') + tables3(T, '', mix < 1 ? 'gm' : '');
    if (mix < 1) body += arith('gm', 'SourceGraphic', 0, mix, 1 - mix, 0);
    return { body };
  },
  duotone(o, pos) { return FX.gradmap({ ...o, colors: o.colors || [o.dark || pos[0] || '#1b1b3a', o.light || pos[1] || '#ffd166'].join(',') }, []); },
  // Channel mixer: r=#f00 g=#0f0 b=#00f  (each input channel is sent to a colour) · swap=gbr
  channels(o) {
    if (o.swap) { const idx = { r: 0, g: 1, b: 2 }; const s = String(o.swap).toLowerCase(); const rows = [0, 1, 2].map((k) => { const row = [0, 0, 0, 0, 0]; row[idx[s[k]] ?? k] = 1; return row; }); return { body: mat([...rows, [0, 0, 0, 1, 0]]) }; }
    const R = rgb01(o.r || '#f00'), G = rgb01(o.g || '#0f0'), B = rgb01(o.b || '#00f');
    return { body: mat([0, 1, 2].map((k) => [R[k], G[k], B[k], 0, 0]).concat([[0, 0, 0, 1, 0]])) };
  },
  // Halftone: size=8 angle=45 shape=dot|line|square|diamond mode=bw|dark|color|cmyk|rgb ink= paper= softness=0..1 contrast=-100..100
  halftone(o, pos, env) {
    const c = Math.max(2, num(o.size, 8)), ang = num(o.angle, 45), shape = o.shape || pos.find((p) => /^(dot|line|lines|square|diamond)$/.test(p)) || 'dot';
    const mode = o.mode || pos.find((p) => /^(bw|dark|color|cmyk|rgb)$/.test(p)) || 'bw';
    const soft = clamp(num(o.softness, 0.15)); const K = Math.max(1, (c / 1.4) * (1 - soft) + 1);
    const expo = shape === 'line' || shape === 'lines' ? 1 : 0.5;
    const co = num(o.contrast, 0) / 100, sl = 1 + co, ic = 0.5 * (1 - sl);
    const S = env.S; const uid = env.uid;
    const pre = (rows) => mat(rows, 'SourceGraphic') + `<feGaussianBlur stdDeviation='${f3(c * 0.35)}'/>` + mat(OPAQUE) +
      `<feComponentTransfer>${'RGB'.split('').map((ch) => `<feFunc${ch} type='linear' slope='${f3(sl)}' intercept='${f3(ic)}'/>`).join('')}</feComponentTransfer>` +
      `<feComponentTransfer result='D'>${'RGB'.split('').map((ch) => `<feFunc${ch} type='gamma' amplitude='1.02' exponent='${expo}' offset='0'/>`).join('')}</feComponentTransfer>`;
    let body;
    if (mode === 'cmyk' || mode === 'rgb') {
      // one field per channel, each at its own screen angle (C 15°, M 75°, Y 0°)
      const angs = mode === 'cmyk' ? [15, 75, 0] : [ang, ang + 30, ang + 60];
      const inv = [[-1, 0, 0, 0, 1], [0, -1, 0, 0, 1], [0, 0, -1, 0, 1], [0, 0, 0, 0, 1]];
      body = pre(mode === 'cmyk' ? inv : OPAQUE);
      angs.forEach((a, k) => { body += fieldImage(fieldSvg(shape, c, a, S, uid + 'f' + k), S, 'F' + k) + mat([0, 1, 2].map((j) => (j === k ? [1, 0, 0, 0, 0] : [0, 0, 0, 0, 0])).concat([[0, 0, 0, 0, 1]]), 'F' + k, 'G' + k); });
      body += arith('G0', 'G1', 0, 1, 1, 0, 'G01') + arith('G01', 'G2', 0, 1, 1, 0, 'F');
      body += threshold('D', 'F', K, 'M');
      body += mode === 'cmyk' ? mat([[-1, 0, 0, 0, 1], [0, -1, 0, 0, 1], [0, 0, -1, 0, 1], [0, 0, 0, 0, 1]], 'M') : '';
      return { body: body + (o.clip === 'false' ? '' : clip()) };
    }
    body = pre(DARKROWS) + fieldImage(fieldSvg(shape, c, ang, S, uid + 'f'), S, 'F') + threshold('D', 'F', K, 'M');
    const dark = mode === 'dark';
    const ink = o.ink || (dark ? '#fff' : '#111'), paper = o.paper || (dark ? '#111' : '#fff');
    if (mode === 'color') {
      body += `<feGaussianBlur in='SourceGraphic' stdDeviation='${f3(c * 0.3)}'/>` + mat(OPAQUE, '', 'S') + arith('M', 'S', 1, 0, 0, 0, 'A');
      if (isNone(paper)) body += mat([[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [1, 0, 0, 0, 0]], 'M', 'Ma') + `<feComposite in='A' in2='Ma' operator='in'/>`;
      else { const P = rgb01(paper); body += mat([0, 1, 2].map((k) => [-P[k], 0, 0, 0, P[k]]).concat([[0, 0, 0, 0, 1]]), 'M', 'B') + arith('A', 'B', 0, 1, 1, 0); }
    } else if (isNone(paper)) {
      const I = rgb01(ink); body += mat([[0, 0, 0, 0, I[0]], [0, 0, 0, 0, I[1]], [0, 0, 0, 0, I[2]], [I[3], 0, 0, 0, 0]], 'M');
    } else body += colorize(paper, ink, 'M');
    return { body: body + (o.clip === 'false' ? '' : clip()) };
  },
  // Dither: mode=bayer|noise|threshold levels=2 size=2 (pixel size) mono ink= paper= brightness= contrast=
  dither(o, pos, env) {
    const mode = o.mode || pos.find((p) => /^(bayer|noise|blue|threshold)$/.test(p)) || 'bayer';
    const n = Math.max(2, Math.round(num(o.levels, 2))), px = Math.max(1, num(o.size, 2));
    const mono = o.mono !== undefined || pos.includes('mono') || o.ink || o.paper;
    const br = num(o.brightness, 0) / 100, co = 1 + num(o.contrast, 0) / 100;
    let body = '';
    let src = 'SourceGraphic';
    if (px > 1) { body += FX.pixelate({ size: px }, [], env).body.replace(/<feComposite in2='SourceGraphic' operator='in'\/>$/, '') + mat(OPAQUE, '', 'PX'); src = 'PX'; }
    body += mat(mono ? LUMROWS : OPAQUE, src) + `<feComponentTransfer result='Y'>${'RGB'.split('').map((ch) => `<feFunc${ch} type='linear' slope='${f3(co)}' intercept='${f3(0.5 * (1 - co) + br)}'/>`).join('')}</feComponentTransfer>`;
    if (mode === 'threshold') body += `<feFlood flood-color='#808080' result='T'/>`;
    else if (mode === 'noise' || mode === 'blue') body += `<feTurbulence type='fractalNoise' baseFrequency='${f3(0.9 / px)}' numOctaves='2' seed='${Math.round(num(o.seed, 3))}'/>` + mat(LUMROWS) + `<feComponentTransfer result='T'><feFuncR type='linear' slope='2.4' intercept='-0.7'/><feFuncG type='linear' slope='2.4' intercept='-0.7'/><feFuncB type='linear' slope='2.4' intercept='-0.7'/></feComponentTransfer>`;
    else {
      const B = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
      const rects = B.map((v, i) => { const g = Math.round(255 * (v + 0.5) / 64); return `<rect x='${(i % 8) * px}' y='${Math.floor(i / 8) * px}' width='${px}' height='${px}' fill='rgb(${g},${g},${g})'/>`; }).join('');
      body += `<feImage href="${enc(`<svg ${SVGNS} width='${8 * px}' height='${8 * px}' shape-rendering='crispEdges'>${rects}</svg>`)}" x='0' y='0' width='${8 * px}' height='${8 * px}'/><feTile result='T'/>`;
    }
    const s = 1 / (n - 1);
    body += arith('Y', 'T', 0, 1, s, -0.5 * s);
    const q = []; for (let j = 0; j < 256; j++) q.push(Math.round(((j + 0.5) / 256) * (n - 1)) / (n - 1));
    body += tbl(q, 'RGB', '', '', 'discrete');
    if (mono) body += colorize(o.ink || '#111', o.paper || '#f4f1ea');
    return { body: body + clip() };
  },
  // Pixelate: size=8 shape=square|circle gap=0
  pixelate(o, pos, env) {
    const s = Math.max(2, Math.round(num(o.size ?? pos[0], 8))); const h = s / 2;
    let body = `<feFlood x='${Math.floor(h)}' y='${Math.floor(h)}' width='1' height='1'/><feComposite x='0' y='0' width='${s}' height='${s}'/><feTile result='dots'/><feComposite in='SourceGraphic' in2='dots' operator='in'/><feMorphology operator='dilate' radius='${f3(h)}' result='blocks'/>`;
    const shape = o.shape || pos.find((p) => /^(circle|round|square)$/.test(p)) || 'square';
    const gap = num(o.gap, shape === 'square' ? 0 : s * 0.08);
    if (shape !== 'square' || gap) {
      const cell = shape === 'square' ? `<rect x='${gap / 2}' y='${gap / 2}' width='${s - gap}' height='${s - gap}' fill='#000'/>` : `<circle cx='${h}' cy='${h}' r='${f3(h - gap / 2)}' fill='#000'/>`;
      body += `<feImage href="${enc(`<svg ${SVGNS} width='${s}' height='${s}'>${cell}</svg>`)}" x='0' y='0' width='${s}' height='${s}'/><feTile result='shapeT'/><feComposite in='blocks' in2='shapeT' operator='in'/>`;
    }
    return { body: body + clip() };
  },
  // Hatching: style=lines|waves|zigzag|circles|cross density=6 (px between lines) angle=45 frequency= amplitude= ink= paper=
  hatching(o, pos, env) {
    const style = o.style || o.lines || o.type || pos.find((p) => /^(lines|waves|zigzag|circles|cross)$/.test(p)) || 'lines';
    const c = Math.max(3, num(o.density ?? o.spacing, 6)), ang = num(o.angle, 45), S = env.S, uid = env.uid;
    const soft = clamp(num(o.softness, 0.1)); const K = Math.max(1, (c / 2) * (1 - soft) + 1);
    let body = mat(DARKROWS, 'SourceGraphic') + `<feGaussianBlur stdDeviation='${f3(c * 0.3)}'/>` + mat(OPAQUE) + `<feComponentTransfer result='D'><feFuncR type='gamma' amplitude='1.05' exponent='1.1'/><feFuncG type='gamma' amplitude='1.05' exponent='1.1'/><feFuncB type='gamma' amplitude='1.05' exponent='1.1'/></feComponentTransfer>`;
    if (style === 'waves' || style === 'zigzag') body += fieldImage(strokeFieldSvg(style, c, ang, S, num(o.frequency ?? o.freq, 1), num(o.amplitude ?? o.amp, 0.6), uid + 'w'), S, 'F');
    else if (style === 'cross') body += fieldImage(fieldSvg('line', c, ang, S, uid + 'a'), S, 'Fa') + fieldImage(fieldSvg('line', c, ang + 90, S, uid + 'b'), S, 'Fb') + `<feBlend in='Fa' in2='Fb' mode='lighten' result='F'/>`;
    else body += fieldImage(fieldSvg(style === 'circles' ? 'circles' : 'line', c, ang, S, uid + 'f'), S, 'F');
    body += threshold('D', 'F', K, 'M') + colorize(o.paper || o.bg || '#f6f2ea', o.ink || o.fg || '#1a1a1a', 'M');
    return { body: body + clip() };
  },
  // Outlines (contour lines): mode=luma|inverse|alpha spacing=8 (levels across the tone range, or px for alpha) thickness=0.25 ink= paper= colors=
  outlines(o, pos) {
    const mode = o.mode || pos.find((p) => /^(luma|inverse|alpha)$/.test(p)) || 'luma';
    const lv = Math.max(2, Math.round(num(o.levels ?? o.spacing, 8))), th = clamp(num(o.thickness, 0.25), 0.02, 0.9);
    const tri = []; for (let i = 0; i <= lv; i++) tri.push(i % 2);
    let body; let region = 0;
    if (mode === 'alpha') {
      const sp = num(o.spacing, 10); region = 0.3;
      body = `<feGaussianBlur in='SourceAlpha' stdDeviation='${f3(sp * lv / 6)}'/>` + mat([[0, 0, 0, 1, 0], [0, 0, 0, 1, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]]);
    } else body = `<feGaussianBlur in='SourceGraphic' stdDeviation='${f3(num(o.smooth, 1.5))}'/>` + mat(mode === 'inverse' ? DARKROWS : LUMROWS);
    body += tbl(tri) + `<feComponentTransfer result='L'>${'RGB'.split('').map((ch) => `<feFunc${ch} type='linear' slope='${f3(-1 / th)}' intercept='1'/>`).join('')}</feComponentTransfer>`;
    const cols = o.colors ? listColors(o.colors) : null;
    if (cols) body += tables3(stopTables(['#000', ...cols]), 'L');
    else if (isNone(o.paper || (mode === 'alpha' ? 'none' : '#f6f2ea')) || mode === 'alpha') { const I = rgb01(o.ink || (mode === 'alpha' ? '#ff4d8d' : '#111')); body += mat([[0, 0, 0, 0, I[0]], [0, 0, 0, 0, I[1]], [0, 0, 0, 0, I[2]], [1, 0, 0, 0, 0]], 'L'); }
    else body += colorize(o.paper || '#f6f2ea', o.ink || '#111', 'L');
    if (mode === 'alpha' && o.keep !== 'false') body += `<feMerge><feMergeNode/><feMergeNode in='SourceGraphic'/></feMerge>`;
    return { body: mode === 'alpha' ? body : body + (isNone(o.paper || '') ? '' : clip()), region };
  },
  // Colored edges: width=1 color=#fff|source bg=#000|none|source gain=4
  edges(o) {
    const w = Math.max(0.5, num(o.width, 1)), gain = num(o.gain, 4);
    let body = mat(LUMROWS, 'SourceGraphic', 'Y') + `<feMorphology in='Y' operator='dilate' radius='${f3(w)}' result='Dl'/><feMorphology in='Y' operator='erode' radius='${f3(w)}' result='Er'/>` + arith('Dl', 'Er', 0, gain, -gain, 0) + mat(OPAQUE, '', 'E');
    const color = o.color || '#fff', bg = o.bg ?? '#0b0b0f';
    if (o.colors) body += tables3(stopTables(['#000', ...listColors(o.colors)]), 'E', 'Ec');
    else if (color === 'source') body += arith('E', 'SourceGraphic', 1, 0, 0, 0, 'Ec');
    else { const C = rgb01(color); body += mat([[C[0], 0, 0, 0, 0], [C[1], 0, 0, 0, 0], [C[2], 0, 0, 0, 0], [0, 0, 0, 0, 1]], 'E', 'Ec'); }
    if (bg === 'source') body += arith('Ec', 'SourceGraphic', 0, 1, 1, 0);
    else if (isNone(bg)) body += mat([[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [LUM[0], LUM[1], LUM[2], 0, 0]], 'Ec');
    else { body += `<feFlood flood-color='${hex(bg)}' result='bgc'/>` + arith('Ec', 'bgc', 0, 1, 1, 0); }
    return { body: body + clip() };
  },
  // Bloom: threshold=0.6 intensity=0.8 radius=12 color=(tint) region=0.3
  bloom(o, pos) {
    const thr = clamp(num(o.threshold, o.raw === 'glow' ? 0 : 0.6)), k = num(o.intensity ?? pos[0], 0.8), r = num(o.radius ?? o.softness, 12);
    const sl = 1 / Math.max(0.02, 1 - thr);
    let body = mat([[...LUM, 0, -thr], [...LUM, 0, -thr], [...LUM, 0, -thr], [0, 0, 0, 1, 0]], 'SourceGraphic') +
      `<feComponentTransfer result='m'>${'RGB'.split('').map((ch) => `<feFunc${ch} type='linear' slope='${f3(sl)}'/>`).join('')}</feComponentTransfer>` + arith('m', 'SourceGraphic', 1, 0, 0, 0, 'hl');
    if (o.color) { const C = rgb01(o.color); body += mat([[...LUM.map((x) => x * C[0] * 1.4), 0, 0], [...LUM.map((x) => x * C[1] * 1.4), 0, 0], [...LUM.map((x) => x * C[2] * 1.4), 0, 0], [0, 0, 0, 1, 0]], 'hl', 'hl'); }
    body += `<feGaussianBlur in='hl' stdDeviation='${f3(r * 0.4)}' result='b1'/><feGaussianBlur in='hl' stdDeviation='${f3(r)}' result='b2'/><feGaussianBlur in='hl' stdDeviation='${f3(r * 2.6)}' result='b3'/>` +
      arith('b1', 'b2', 0, 0.5, 0.7, 0, 'b12') + arith('b12', 'b3', 0, 1, 0.6, 0, 'glow') + arith('SourceGraphic', 'glow', 0, 1, k, 0);
    return { body, region: clamp(num(o.region, 0.3), 0, 1) };
  },
  // Bokeh blur: radius=10 highlights=0.6
  bokeh(o, pos) {
    const r = num(o.radius ?? pos[0], 10), hl = num(o.highlights, 0.6);
    const body = `<feGaussianBlur in='SourceGraphic' stdDeviation='${f3(r * 0.5)}' result='bl'/>` + mat([[...LUM, 0, -0.65], [...LUM, 0, -0.65], [...LUM, 0, -0.65], [0, 0, 0, 1, 0]], 'SourceGraphic') +
      `<feComponentTransfer result='m'><feFuncR type='linear' slope='3'/><feFuncG type='linear' slope='3'/><feFuncB type='linear' slope='3'/></feComponentTransfer>` + arith('m', 'SourceGraphic', 1, 0, 0, 0, 'h') +
      `<feMorphology in='h' operator='dilate' radius='${f3(r * 0.35)}'/><feGaussianBlur stdDeviation='${f3(r * 0.45)}' result='disc'/>` + arith('bl', 'disc', 0, 1, hl * 1.6, 0);
    return { body, region: 0.1 };
  },
  // RGB split: amount=4 (px) angle=0
  'rgb-split'(o, pos) {
    const d = num(o.amount ?? o.shift ?? pos[0], 4), a = num(o.angle, 0) * Math.PI / 180, dx = Math.cos(a) * d, dy = Math.sin(a) * d;
    const body = mat(ISO[0], 'SourceGraphic') + `<feOffset dx='${f3(dx)}' dy='${f3(dy)}' result='r'/>` + mat(ISO[1], 'SourceGraphic', 'g') + mat(ISO[2], 'SourceGraphic') + `<feOffset dx='${f3(-dx)}' dy='${f3(-dy)}' result='b'/>` + screen3('r', 'g', 'b', 'rgb') + clip();
    return { body, region: 0.05 };
  },
  // Lens distortion: distortion=0.4 (barrel>0, pincushion<0) cx=.5 cy=.5 aberration=0..1 zoom=1
  lens(o) {
    const k = num(o.distortion ?? o.amount, 0.4), cx = num(o.cx, 0.5), cy = num(o.cy, 0.5), ab = num(o.aberration, 0), z = num(o.zoom, 1);
    const mk = (kk) => dispMap(`lens|${f3(kk)}|${cx}|${cy}|${z}`, (u, v) => { const dx = u - cx, dy = v - cy, r2 = (dx * dx + dy * dy) * 2; const f = (1 - kk * 0.5 * r2 * (kk > 0 ? 1 : -0.6) * 1) / z; return [dx * f - dx, dy * f - dy]; });
    if (!ab) { const m = mk(k); return { body: obbImage(m.href, 'map') + displace('SourceGraphic', 'map', m.scale) + clip(), obb: true }; }
    const ms = [mk(k * (1 - ab * 0.12)), mk(k), mk(k * (1 + ab * 0.12))];
    let body = '';
    ms.forEach((m, i) => { body += obbImage(m.href, 'm' + i) + displace('SourceGraphic', 'm' + i, m.scale, 'd' + i) + mat(ISO[i], 'd' + i, 'c' + i); });
    return { body: body + screen3('c0', 'c1', 'c2', 'L') + clip('L'), obb: true };
  },
  // Warp: type=sine|wave|ripple|twist|swirl|bulge|pinch|flag|squeeze cx cy amount frequency angle phase radius
  warp(o, pos) {
    const type = o.type || pos.find((p) => WARPS[p]) || 'sine';
    const fn = WARPS[type](o); const m = dispMap('warp|' + type + '|' + JSON.stringify(o), fn);
    return { body: obbImage(m.href, 'map') + displace('SourceGraphic', 'map', m.scale) + (/flag|squeeze|sine|wave/.test(type) && o.clip !== 'true' ? '' : clip()), obb: true }; // flag/sine reshape the silhouette on purpose
  },
  // Pattern refraction: pattern=lenticular|zigzag|waves|grid|circular|squares size=24 strength=12 angle=0 frost=0 dispersion=0
  refract(o, pos, env) {
    const pat = o.pattern || o.type || pos[0] || 'lenticular', c = Math.max(4, num(o.size, 24)), st = num(o.strength, 28), ang = num(o.angle, 0), S = env.S, uid = env.uid;
    const tr = `rotate(${f3(ang)} ${S / 2} ${S / 2})`;
    const ramp = (id, x2, y2, stops, spread = 'repeat') => `<linearGradient id='${id}' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='${x2}' y2='${y2}' spreadMethod='${spread}' gradientTransform='${tr}'>${stops}</linearGradient>`;
    const saw = (ch) => `<stop offset='0' stop-color='${ch === 'r' ? '#000080' : '#800000'}'/><stop offset='1' stop-color='${ch === 'r' ? '#ff0080' : '#80ff00'}'/>`;
    const tri = (ch) => `<stop offset='0' stop-color='${ch === 'r' ? '#000080' : '#800000'}'/><stop offset='.5' stop-color='${ch === 'r' ? '#ff0080' : '#80ff00'}'/><stop offset='1' stop-color='${ch === 'r' ? '#000080' : '#800000'}'/>`;
    const sine = (ch) => Array.from({ length: 9 }, (_, i) => { const v = Math.round(127.5 + 127 * Math.sin(i / 8 * Math.PI * 2)); return `<stop offset='${f3(i / 8)}' stop-color='${ch === 'r' ? `rgb(${v},128,128)` : `rgb(128,${v},128)`}'/>`; }).join('');
    let svg;
    const full = (fill) => `<rect x='-${S}' y='-${S}' width='${3 * S}' height='${3 * S}' fill='${fill}'/>`;
    if (pat === 'grid' || pat === 'squares') svg = `<defs>${ramp(uid + 'x', c, 0, saw('r'))}${ramp(uid + 'y', 0, c, saw('g'))}</defs>${full(`url(#${uid}x)`)}<g style='mix-blend-mode:screen'>${full(`url(#${uid}y)`)}</g>`;
    else if (pat === 'circular' || pat === 'circles') svg = `<defs><radialGradient id='${uid}c' gradientUnits='userSpaceOnUse' cx='${S / 2}' cy='${S / 2}' r='${c}' spreadMethod='repeat'><stop offset='0' stop-color='#808080'/><stop offset='1' stop-color='#ffff80'/></radialGradient></defs>${full(`url(#${uid}c)`)}`;
    else svg = `<defs>${ramp(uid + 'x', c, 0, pat === 'zigzag' ? tri('r') : pat === 'waves' ? sine('r') : saw('r'))}</defs>${full(`url(#${uid}x)`)}`;
    let body = fieldImage(svg, S, 'P');
    if (pat === 'grid' || pat === 'squares') body = body.replace("result='P'", "result='P0'") + mat([[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 0, 0, 0.5], [0, 0, 0, 0, 1]], 'P0', 'P');
    const fr = num(o.frost, 0);
    if (fr) body += `<feTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='2' seed='4' result='nz'/>` + arith('P', 'nz', 0, 1, fr / 100, -fr / 200, 'P');
    const disp = num(o.dispersion, 0);
    if (!disp) body += displace('SourceGraphic', 'P', st, 'R');
    else { [1 - disp, 1, 1 + disp].forEach((k, i) => { body += displace('SourceGraphic', 'P', st * k, 'd' + i) + mat(ISO[i], 'd' + i, 'c' + i); }); body += screen3('c0', 'c1', 'c2', 'R'); }
    // samples that fall outside the layer come back transparent: show the untouched source there
    body += `<feMerge><feMergeNode in='SourceGraphic'/><feMergeNode in='R'/></feMerge>`;
    return { body: body + clip() };
  },
  // Pixel stretch: position=0.5 angle=90 (direction of the stretch: 0 → right, 90 → down)
  stretch(o, pos) {
    const p = clamp(num(o.position ?? pos[0], 0.5)), a = ((num(o.angle, 90) % 360) + 360) % 360;
    const dir = [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
    const m = dispMap(`stretch|${p}|${a}`, (u, v) => { const t = (u - 0.5) * dir[0] + (v - 0.5) * dir[1] + 0.5; if (t <= p) return [0, 0]; const d = t - p; return [-dir[0] * d, -dir[1] * d]; }, 192);
    return { body: obbImage(m.href, 'map') + displace('SourceGraphic', 'map', m.scale), obb: true };
  },
  // Slice shift: slices=12 shift=0.08 angle=0 random=1 seed=3
  slice(o, pos) {
    const n = Math.max(2, Math.round(num(o.slices ?? pos[0], 12))), sh = num(o.shift, 0.08), a = num(o.angle, 0) * Math.PI / 180, rnd = clamp(num(o.random, 1)), seed = num(o.seed, 3);
    const R = rand(seed); const offs = Array.from({ length: n }, (_, i) => { const r = R(); return sh * ((1 - rnd) * (i % 2 ? 1 : -1) + rnd * (r * 2 - 1)); });
    const ca = Math.cos(a), sa = Math.sin(a);
    const m = dispMap(`slice|${n}|${sh}|${a}|${rnd}|${seed}`, (u, v) => { const t = -(u - 0.5) * sa + (v - 0.5) * ca + 0.5; const i = clamp(Math.floor(t * n), 0, n - 1); return [ca * offs[i], sa * offs[i]]; }, 256);
    return { body: obbImage(m.href, 'map') + displace('SourceGraphic', 'map', m.scale), obb: true };
  },
  // Chromatic metal: rounding=8 depth=4 roughness=0.3 split=2 repeats=2 angle=135 colors=…
  metal(o) {
    const rd = num(o.rounding, 8), depth = num(o.depth, 4), rough = clamp(num(o.roughness, 0.3), 0, 1), split = num(o.split, 2), rep = num(o.repeats, 2), ang = num(o.angle, 135);
    const cols = o.colors ? listColors(o.colors) : ['#2b2d31', '#f3f5f8', '#7d828c', '#ffffff', '#3a3d44', '#c9ced6'];
    let body = `<feGaussianBlur in='SourceAlpha' stdDeviation='${f3(rd)}' result='h'/>` +
      `<feDiffuseLighting in='h' surfaceScale='${f3(depth)}' diffuseConstant='1' lighting-color='#fff' result='dif'><feDistantLight azimuth='${f3(ang)}' elevation='35'/></feDiffuseLighting>` +
      tables3(stopTables(cols, { repeat: rep, mirror: true }), 'dif', 'ref');
    if (split) body += `<feOffset in='ref' dx='${f3(split)}' dy='0' result='rs'/><feOffset in='ref' dx='${f3(-split)}' dy='0' result='bs'/>` + mat(ISO[0], 'rs', 'c0') + mat(ISO[1], 'ref', 'c1') + mat(ISO[2], 'bs', 'c2') + screen3('c0', 'c1', 'c2', 'ref');
    body += `<feSpecularLighting in='h' surfaceScale='${f3(depth)}' specularConstant='${f3(1.2 - rough * 0.6)}' specularExponent='${f3(4 + (1 - rough) * 40)}' lighting-color='#fff' result='spec'><feDistantLight azimuth='${f3(ang)}' elevation='50'/></feSpecularLighting>` +
      mat(OPAQUE, 'ref', 'refo') + arith('refo', 'spec', 0, 1, 1, 0) + `<feComposite in2='SourceAlpha' operator='in'/>`;
    return { body };
  },
  // Gooey merge: radius=10 (blur) contrast=20
  gooey(o, pos) {
    const r = num(o.radius ?? pos[0], 10), k = num(o.contrast, 20);
    return { body: `<feGaussianBlur in='SourceGraphic' stdDeviation='${f3(r)}' result='b'/><feColorMatrix in='b' type='matrix' values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${k} ${f3(-k / 2.2)}' result='g'/><feComposite in='SourceGraphic' in2='g' operator='atop'/>`, region: 0.2 };
  },
  // Vignette: amount=0.5 radius=0.75 color=#000 cx cy
  vignette(o, pos) {
    const k = clamp(num(o.amount ?? pos[0], 0.5)), r = num(o.radius, 0.75), C = hex(o.color || '#000'), cx = num(o.cx, 0.5), cy = num(o.cy, 0.5);
    const href = enc(`<svg ${SVGNS} viewBox='0 0 100 100' preserveAspectRatio='none'><defs><radialGradient id='v' cx='${cx}' cy='${cy}' r='${f3(r)}'><stop offset='${f3(Math.max(0, 0.55 - (1 - r) * 0.2))}' stop-color='${C}' stop-opacity='0'/><stop offset='1' stop-color='${C}' stop-opacity='${k}'/></radialGradient></defs><rect width='100' height='100' fill='url(#v)'/></svg>`);
    return { body: obbImage(href, 'v') + `<feComposite in='v' in2='SourceGraphic' operator='atop'/>`, obb: true };
  },
  // Posterize: levels=4
  posterize(o, pos) { const n = Math.max(2, Math.round(num(o.levels ?? pos[0], 4))); return { body: tbl(Array.from({ length: n }, (_, i) => i / (n - 1)), 'RGB', '', '', 'discrete') }; },
  invert(o, pos) { const k = clamp(num(o.amount ?? pos[0], 1)); return { body: tbl([k, 1 - k]) }; },
  // Threshold: level=0.5 ink paper
  threshold(o, pos) { const t = clamp(num(o.level ?? pos[0], 0.5)); const v = []; for (let j = 0; j < 64; j++) v.push((j + 0.5) / 64 >= t ? 1 : 0); return { body: mat(LUMROWS, 'SourceGraphic') + tbl(v, 'RGB', '', '', 'discrete') + colorize(o.ink || '#000', o.paper || '#fff') + clip() }; },
  sharpen(o, pos) { const d = num(o.amount ?? pos[0], 0.6); return { body: `<feConvolveMatrix order='3' preserveAlpha='true' kernelMatrix='0 ${f3(-d)} 0 ${f3(-d)} ${f3(1 + 4 * d)} ${f3(-d)} 0 ${f3(-d)} 0'/>` }; },
  emboss(o, pos) { const d = num(o.amount ?? pos[0], 1); return { body: `<feConvolveMatrix order='3' preserveAlpha='true' kernelMatrix='${f3(-2 * d)} ${f3(-d)} 0 ${f3(-d)} 1 ${f3(d)} 0 ${f3(d)} ${f3(2 * d)}'/>` }; },
  // Noise (film grain baked into the image): amount=0.15 size=1 mono
  noise(o, pos) { const k = num(o.amount ?? pos[0], 0.15), s = num(o.size, 1); return { body: `<feTurbulence type='fractalNoise' baseFrequency='${f3(0.85 / s)}' numOctaves='3' seed='${Math.round(num(o.seed, 7))}'/>` + mat(o.color ? OPAQUE : LUMROWS, '', 'nz') + arith('SourceGraphic', 'nz', 0, 1, k * 2, -k) + clip() }; },
};

export const FX_NAMES = Object.keys(FX);
export const FX_DOC = {
  adjust: 'exposure contrast brightness highlights shadows black white gamma temperature tint saturation vibrance hue definition',
  preset: 'grayscale|sepia|vintage|warm|cool|noir|fade|vivid|invert intensity',
  gradmap: 'colors=#000,#f06,#fff offset repeat mirror mix', duotone: 'dark light',
  channels: 'r=#f00 g=#0f0 b=#00f | swap=gbr',
  halftone: 'size angle shape=dot|line|square|diamond mode=bw|dark|color|cmyk|rgb ink paper softness contrast',
  dither: 'mode=bayer|noise|threshold levels size mono ink paper brightness contrast',
  pixelate: 'size shape=square|circle gap', hatching: 'style=lines|waves|zigzag|circles|cross density angle frequency amplitude ink paper',
  outlines: 'mode=luma|inverse|alpha levels spacing thickness ink paper colors', edges: 'width color=…|source bg gain colors',
  bloom: 'threshold intensity radius color', bokeh: 'radius highlights', 'rgb-split': 'amount angle',
  lens: 'distortion cx cy aberration zoom', warp: 'type=sine|ripple|twist|swirl|bulge|pinch|flag|squeeze cx cy amount frequency angle phase radius',
  refract: 'pattern=lenticular|zigzag|waves|grid|circular size strength angle frost dispersion', stretch: 'position angle',
  slice: 'slices shift angle random seed', metal: 'rounding depth roughness split repeats angle colors', gooey: 'radius contrast',
  vignette: 'amount radius color cx cy', posterize: 'levels', invert: 'amount', threshold: 'level ink paper', sharpen: 'amount', emboss: 'amount', noise: 'amount size seed',
};

// ------------------------------------------------------------------ compile
const compiled = new Map();
// spec → CSS filter value ("url(#a) url(#b)"); filters are registered in ctx.defs (Map id → svg)
export function compileFx(spec, ctx, size = {}) {
  const list = parseFx(spec); if (!list.length) return '';
  const S = Math.min(4096, Math.max(800, Math.ceil(Math.max(num(size.w, 0), num(size.h, 0), 600) / 200) * 200 + 200));
  const urls = [];
  for (const e of list) {
    const b = FX[e.type]; if (!b) continue;
    const key = e.type + '|' + JSON.stringify(e.o) + '|' + e.pos.join(',') + '|' + S;
    const id = 'fx' + e.type.replace(/\W/g, '') + hash(key);
    let svg = compiled.get(id);
    if (!svg) {
      let r; try { r = b(e.o, e.pos, { S, uid: id }); } catch (err) { continue; }
      svg = filt(id, r.body, r); if (compiled.size > 400) compiled.clear(); compiled.set(id, svg);
    }
    if (ctx) (ctx.defs = ctx.defs || new Map()).set(id, svg);
    urls.push(`url(#${id})`);
  }
  return urls.join(' ');
}

// ------------------------------------------------------------------ on-canvas handles (rigs)
// → [{ param:'fx', name, x, y, map(lx, ly) → new fx string }] in the layer's local pixels
export function handles(spec, w, h) {
  const list = parseFx(spec); const out = [];
  list.forEach((e, i) => {
    const o = e.o; const tag = e.raw || e.type;
    const centre = () => { const cx = num(o.cx, 0.5), cy = num(o.cy, 0.5); out.push({ param: 'fx', name: `${tag}.center`, x: cx * w, y: cy * h, map: (lx, ly) => { const L = parseFx(spec); L[i].o.cx = String(f3(clamp(lx / w))); L[i].o.cy = String(f3(clamp(ly / h))); return serializeFx(L); } }); };
    const angleH = (key, def, R) => { const a = num(o[key], def) * Math.PI / 180; const cx = num(o.cx, 0.5) * w, cy = num(o.cy, 0.5) * h; out.push({ param: 'fx', name: `${tag}.${key}`, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, guide: { cx, cy, r: R }, map: (lx, ly) => { const L = parseFx(spec); L[i].o[key] = String(Math.round(Math.atan2(ly - cy, lx - cx) * 180 / Math.PI)); return serializeFx(L); } }); };
    if (e.type === 'lens' || e.type === 'vignette' || (e.type === 'warp' && /ripple|twist|swirl|bulge|pinch/.test(o.type || e.pos[0] || ''))) centre();
    if (e.type === 'halftone' || e.type === 'hatching' || e.type === 'refract' || e.type === 'rgb-split' || e.type === 'slice' || e.type === 'metal' || (e.type === 'warp' && /sine|wave/.test(o.type || e.pos[0] || 'sine'))) angleH('angle', { halftone: 45, hatching: 45, metal: 135 }[e.type] ?? 0, Math.min(w, h) * 0.32);
    if (e.type === 'stretch') { const a = num(o.angle, 90) * Math.PI / 180, p = num(o.position ?? e.pos[0], 0.5); const d = [Math.cos(a), Math.sin(a)]; const t = p - 0.5; out.push({ param: 'fx', name: `${tag}.position`, x: w / 2 + d[0] * t * w, y: h / 2 + d[1] * t * h, map: (lx, ly) => { const L = parseFx(spec); L[i].o.position = String(f3(clamp((lx / w - 0.5) * d[0] + (ly / h - 0.5) * d[1] + 0.5))); delete L[i].pos[0]; L[i].pos = L[i].pos.filter((x) => x !== undefined); return serializeFx(L); } }); }
    if (e.type === 'halftone') { const s = num(o.size, 8); out.push({ param: 'fx', name: `${tag}.size`, x: w - 12 - s * 2, y: 12, map: (lx) => { const L = parseFx(spec); L[i].o.size = String(Math.max(2, Math.round((w - 12 - lx) / 2))); return serializeFx(L); } }); }
  });
  return out;
}
