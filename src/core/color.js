// Color science helpers: parsing, OKLab/OKLCH, tints & shades, tonal ramps, tinted neutrals, distances.

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0], red: [255, 0, 0, 1] };

export function parseColor(s) {
  if (!s || typeof s !== 'string') return null;
  s = s.trim();
  if (NAMED[s]) return NAMED[s].slice();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (k) => parseInt(h.slice(k, k + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? +(n(6) / 255).toFixed(3) : 1];
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x))); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
}

export function toHex([r, g, b, a = 1]) {
  const h = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return ('#' + h(r) + h(g) + h(b) + (a < 1 ? h(a * 255) : '')).toUpperCase();
}
export function toCss(c) { return c[3] < 1 ? `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+c[3].toFixed(3)})` : toHex(c); }

// --- OKLab (Björn Ottosson)
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export function toOklab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function fromOklab([L, a, b]) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
export function toOklch(c) { const [L, a, b] = toOklab(c); return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]; }
function inGamut(rgb) { return rgb.every((v) => v >= -0.5 && v <= 255.5); }
export function fromOklch(L, C, H) {
  // reduce chroma until in sRGB gamut
  let c = C;
  for (let i = 0; i < 30; i++) {
    const rgb = fromOklab([L, c * Math.cos((H * Math.PI) / 180), c * Math.sin((H * Math.PI) / 180)]);
    if (inGamut(rgb)) return [...rgb.map((v) => Math.max(0, Math.min(255, v))), 1];
    c *= 0.9;
  }
  return [...fromOklab([L, 0, 0]).map((v) => Math.max(0, Math.min(255, v))), 1];
}

export function mix(a, b, t) { // t = part of b (0..1), mixed in OKLab for perceptual smoothness
  const A = toOklab(a), B = toOklab(b);
  const rgb = fromOklab([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
  return [...rgb, (a[3] ?? 1) + ((b[3] ?? 1) - (a[3] ?? 1)) * t];
}
const W = [255, 255, 255, 1], K = [0, 0, 0, 1];
export const tint = (c, p) => mix(c, W, p);   // + white (pastel)
export const shade = (c, p) => mix(c, K, p);  // + black

export function luminance([r, g, b]) { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
export function contrast(a, b) { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
export function deltaE(a, b) { const A = toOklab(a), B = toOklab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) * 100; }

export const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const RAMP_L = [0.975, 0.94, 0.88, 0.8, 0.71, 0.62, 0.53, 0.45, 0.37, 0.29, 0.21];

// tonal ramp 50→950 keeping hue, chroma bell-shaped; base color lands on its closest step
export function ramp(base) {
  const [L, C, H] = toOklch(base);
  const out = {};
  let closest = 0, best = 9;
  RAMP_L.forEach((l, i) => { if (Math.abs(l - L) < best) { best = Math.abs(l - L); closest = i; } });
  RAMP_L.forEach((l, i) => {
    const edge = Math.min(1, Math.abs(l - 0.55) / 0.45);
    const c = C * (1 - 0.75 * Math.pow(edge, 2.2));
    out[RAMP_STEPS[i]] = i === closest ? toHex(base) : toHex(fromOklch(l, c, H));
  });
  return out;
}

// neutral greys gently tinted toward a hue (book: never pure grey; inject the primary at 5–15 %)
export function neutrals(tintColor, strength = 0.012) {
  const H = tintColor ? toOklch(tintColor)[2] : 0;
  const C = tintColor ? strength : 0;
  const out = {};
  RAMP_L.forEach((l, i) => { out[RAMP_STEPS[i]] = toHex(fromOklch(l, C * (i === 0 ? 0.6 : 1), H)); });
  return out;
}

export function hueDistance(a, b) { const d = Math.abs(toOklch(a)[2] - toOklch(b)[2]) % 360; return d > 180 ? 360 - d : d; }

// evaluate color functions inside a value string: tint(c, 20) shade(c, 30) mix(a, b, 50) alpha(c, 40) lighten/darken
export function resolveColorFns(str) {
  if (typeof str !== 'string' || !/(tint|shade|mix|alpha|lighten|darken|saturate)\(/.test(str)) return str;
  const re = /\b(tint|shade|mix|alpha|lighten|darken)\(([^()]*)\)/;
  let guard = 0, m;
  while ((m = re.exec(str)) && guard++ < 50) {
    const args = m[2].split(',').map((x) => x.trim());
    const pct = (v, d) => { const n = parseFloat(v); if (isNaN(n)) return d; return n > 1 ? n / 100 : n; };
    let res = null;
    const c0 = parseColor(args[0]);
    if (m[1] === 'mix') { const c1 = parseColor(args[1]); if (c0 && c1) res = mix(c0, c1, pct(args[2], 0.5)); }
    else if (c0) {
      if (m[1] === 'tint' || m[1] === 'lighten') res = tint(c0, pct(args[1], 0.2));
      if (m[1] === 'shade' || m[1] === 'darken') res = shade(c0, pct(args[1], 0.2));
      if (m[1] === 'alpha') res = [c0[0], c0[1], c0[2], c0[3] * pct(args[1], 0.5)];
    }
    str = str.slice(0, m.index) + (res ? toCss(res) : args[0]) + str.slice(m.index + m[0].length);
  }
  return str;
}
