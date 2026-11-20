// Design system engine: <system brand=#5B5BF7 …/> → a complete, contrast-checked token set in three tiers
// (Nathan Curtis: primitive → semantic → component; Figma variables: collections + modes; W3C DTCG 2025.10 export).
// Perceptual choices (Kholmatova's "adjectives" of the brand): neutral temperature, radius personality, density,
// elevation style, motion personality, type pairing. The generated names are the ones the kit, the shadcn/ui import
// and project components already use ($primary, $surface, $text, $border, $radius, sh-*…), so everything adopts the system.
import { parseColor, toHex, toOklch, fromOklch, ramp, contrast } from './color.js';
import { smoothShadow } from './plugins.js';

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const STATUS = { success: '#16A34A', warning: '#D97706', danger: '#DC2626', info: '#2563EB' };
const NEUTRAL = { tinted: null, pure: [0, 0], warm: [70, 0.012], cool: [250, 0.014], olive: [110, 0.012] };
const DENSITY = {
  compact: [2, 4, 8, 12, 16, 20, 24, 32, 40, 48], comfortable: [4, 8, 12, 16, 24, 32, 40, 48, 64, 80], spacious: [4, 8, 16, 24, 32, 48, 64, 80, 96, 128],
};
const RADIUS = { sharp: [2, 4, 6, 8], soft: [6, 10, 14, 20], round: [8, 14, 20, 28], pill: [8, 14, 20, 28] };
const TYPE_RATIO = { 'minor-third': 1.2, 'major-third': 1.25, 'perfect-fourth': 1.333, 'augmented-fourth': 1.414, golden: 1.618, ui: 1.2 };
const MOTION = {
  calm: { fast: 140, base: 260, slow: 420, spring: 'gentle', enter: 'cubic-bezier(.22,1,.36,1)' },
  snappy: { fast: 90, base: 180, slow: 300, spring: 'snappy', enter: 'cubic-bezier(.2,.8,.2,1)' },
  playful: { fast: 140, base: 300, slow: 520, spring: 'bouncy', enter: 'cubic-bezier(.34,1.56,.64,1)' },
};
const hex = (c) => toHex(c).slice(0, 7);

function grays(brand, neutral, strength) {
  let H = 0, C = 0;
  if (neutral === 'tinted' || !NEUTRAL[neutral]) { H = toOklch(brand)[2]; C = strength ?? 0.012; } else [H, C] = NEUTRAL[neutral];
  const L = [0.985, 0.967, 0.922, 0.87, 0.708, 0.556, 0.439, 0.371, 0.269, 0.205, 0.145];
  const out = {}; STEPS.forEach((s, i) => { out[s] = hex(fromOklch(L[i], C * (i === 0 ? 0.5 : 1), H)); }); return out;
}
// the ramp step nearest to `prefer` that reaches `min` contrast against `against` (walking away from prefer)
function pickStep(r, against, min, prefer = 600, dir = 1) {
  const order = STEPS.slice().sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer) || (dir > 0 ? b - a : a - b));
  for (const s of order) if (contrast(parseColor(r[s]), parseColor(against)) >= min) return s;
  return dir > 0 ? 950 : 50;
}
const onColor = (bg) => (contrast(parseColor(bg), [255, 255, 255, 1]) >= contrast(parseColor(bg), [17, 17, 20, 1]) ? '#FFFFFF' : '#111114');
const alphaHex = (h, a) => { const c = parseColor(h); return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`; };

export function generateSystem(a = {}) {
  const brand = parseColor(String(a.brand || '#5B5BF7')) || parseColor('#5B5BF7');
  const accentC = a.accent ? parseColor(String(a.accent)) : null;
  const P = {}; // primitives: name → hex
  const R = { brand: ramp(brand), gray: grays(brand, a.neutral || 'tinted', a['neutral-strength'] ? +a['neutral-strength'] : undefined) };
  if (accentC) R.accent = ramp(accentC);
  for (const [k, v] of Object.entries(STATUS)) R[k] = ramp(parseColor(String(a[k] || v)));
  for (const [name, r] of Object.entries(R)) for (const s of STEPS) P[`${name}-${s}`] = r[s];

  // ---- semantic, per mode
  const G = R.gray; const light = {}, dark = {};
  Object.assign(light, { bg: G[50], surface: '#FFFFFF', 'surface-2': G[100], 'surface-3': G[200], text: G[950], muted: G[600], subtle: G[500], border: G[200], divider: G[100], 'on-dark': '#FFFFFF' });
  Object.assign(dark, { bg: G[950], surface: G[900], 'surface-2': G[800], 'surface-3': G[700], text: G[50], muted: G[400], subtle: G[500], border: G[800], divider: G[900], 'on-dark': '#FFFFFF' });
  // body text on every surface: ≥ 4.5:1 (WCAG AA) — muted is darkened/lightened until it passes on surface-2
  light.muted = G[pickStep(G, light['surface-2'], 4.5, 600, 1)]; dark.muted = G[pickStep(G, dark['surface-2'], 4.5, 400, -1)];
  const roles = [['primary', R.brand], ...(R.accent ? [['accent', R.accent]] : []), ['success', R.success], ['warning', R.warning], ['danger', R.danger], ['info', R.info]];
  for (const [role, r] of roles) {
    // light: a solid fill that carries white text at AA (buttons); dark: a lighter step that reads on the dark background
    const brandStep = role === 'primary' ? STEPS.reduce((b, s) => (Math.abs(toOklch(parseColor(r[s]))[0] - toOklch(role === 'primary' ? brand : parseColor(r[600]))[0]) < Math.abs(toOklch(parseColor(r[b]))[0] - toOklch(role === 'primary' ? brand : parseColor(r[600]))[0]) ? s : b), 600) : 600;
    const ls = role === 'warning' ? pickStep(r, '#FFFFFF', 4.5, 700, 1) : pickStep(r, '#FFFFFF', 4.5, Math.max(500, brandStep), 1);
    light[role] = r[ls]; light[`on-${role}`] = onColor(r[ls]);
    light[`${role}-hover`] = r[STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(ls) + 1)]];
    light[`${role}-soft`] = alphaHex(r[ls], 0.12); light[`${role}-text`] = r[pickStep(r, light.surface, 4.5, ls, 1)];
    const ds = pickStep(r, dark.bg, 4.5, 400, -1);
    dark[role] = r[ds]; dark[`on-${role}`] = onColor(r[ds]);
    dark[`${role}-hover`] = r[STEPS[Math.max(0, STEPS.indexOf(ds) - 1)]];
    dark[`${role}-soft`] = alphaHex(r[ds], 0.18); dark[`${role}-text`] = r[pickStep(r, dark.surface, 4.5, ds, -1)];
  }
  light.focus = alphaHex(light.primary, 0.4); dark.focus = alphaHex(dark.primary, 0.5);
  // elevation: smooth layered shadows; in dark mode surfaces get lighter instead and shadows get denser
  const elev = { flat: [0, 0, 0, 0], soft: [2, 6, 14, 28], deep: [3, 10, 24, 44] }[a.elevation || 'soft'] || [2, 6, 14, 28];
  elev.forEach((e, i) => { light[`shadow-${i + 1}`] = e ? smoothShadow(e, 'rgba(15,15,30,1)', 0.14) : 'none'; dark[`shadow-${i + 1}`] = e ? smoothShadow(e, 'rgba(0,0,0,1)', 0.45) : 'none'; });

  // ---- scales (mode-independent)
  const S = {};
  (DENSITY[a.density || 'comfortable'] || DENSITY.comfortable).forEach((v, i) => { S[`space-${i + 1}`] = String(v); });
  const rr = RADIUS[a.radius] || (/^\d/.test(String(a.radius || '')) ? [Math.round(+a.radius * 0.5), +a.radius, Math.round(+a.radius * 1.4), Math.round(+a.radius * 2)] : RADIUS.soft);
  ['sm', 'md', 'lg', 'xl'].forEach((k, i) => { S[`radius-${k}`] = String(rr[i]); }); S['radius-full'] = '999'; S.radius = String(rr[1]);
  const [sans, display] = String(a.type || 'Inter').split('/').map((x) => x.trim());
  S['font-sans'] = sans; S['font-display'] = display || sans; S['font-mono'] = a.mono || 'JetBrains Mono';
  const base = +a['font-size'] || 16; const ratio = TYPE_RATIO[a.scale] || +a.scale || 1.25;
  ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'].forEach((k, i) => { S[`text-${k}`] = String(Math.round(base * Math.pow(ratio, i - 2))); });
  const M = MOTION[a.motion || 'calm'] || MOTION.calm;
  Object.assign(S, { 'dur-fast': String(M.fast), 'dur-base': String(M.base), 'dur-slow': String(M.slow), 'ease-standard': 'cubic-bezier(.2,0,0,1)', 'ease-enter': M.enter, 'ease-exit': 'cubic-bezier(.4,0,1,1)', spring: M.spring });

  // ---- component tier (references semantic + scales; what components read)
  const dens = a.density || 'comfortable'; const H = dens === 'compact' ? [32, 36, 44] : dens === 'spacious' ? [44, 52, 60] : [40, 48, 56];
  const C = {
    'button-h-sm': String(H[0]), 'button-h-md': String(H[1]), 'button-h-lg': String(H[2]),
    'button-radius': a.radius === 'pill' ? '999' : S['radius-md'], 'button-px': dens === 'compact' ? '16' : '24',
    'input-h': String(H[1]), 'input-radius': S['radius-md'], 'card-radius': S['radius-lg'], 'card-pad': dens === 'compact' ? '16' : dens === 'spacious' ? '32' : '24',
    'chip-radius': a.radius === 'sharp' ? S['radius-sm'] : '999', 'dialog-radius': S['radius-xl'],
  };
  // shadcn/ui semantic names → the same decisions (imported ui.* components follow the system)
  const SH = { 'sh-background': '$bg', 'sh-foreground': '$text', 'sh-card': '$surface', 'sh-card-foreground': '$text', 'sh-popover': '$surface', 'sh-popover-foreground': '$text', 'sh-primary': '$primary', 'sh-primary-foreground': '$on-primary', 'sh-secondary': '$surface-2', 'sh-secondary-foreground': '$text', 'sh-muted': '$surface-2', 'sh-muted-foreground': '$muted', 'sh-accent': '$surface-2', 'sh-accent-foreground': '$text', 'sh-destructive': '$danger', 'sh-destructive-foreground': '$on-danger', 'sh-border': '$border', 'sh-input': '$border', 'sh-ring': '$focus', 'sh-radius': S['radius-md'] };

  // ---- checks: every semantic pair the components rely on
  const checks = [];
  const pair = (mode, fg, bg, min, what) => { const sem = mode === 'light' ? light : dark; const f = parseColor(sem[fg] || fg), b = parseColor(sem[bg] || bg); if (!f || !b) return; const r = contrast(f, b); checks.push({ mode, fg, bg, ratio: Math.round(r * 100) / 100, min, ok: r >= min, what }); };
  for (const m of ['light', 'dark']) {
    for (const s of ['bg', 'surface', 'surface-2']) { pair(m, 'text', s, 4.5, 'texte'); pair(m, 'muted', s, 4.5, 'texte secondaire'); }
    for (const [role] of roles) { pair(m, `on-${role}`, role, 4.5, `texte sur ${role}`); pair(m, `${role}-text`, 'surface', 4.5, `${role} en texte`); pair(m, role, 'bg', 3, `${role} (UI) sur le fond`); }
  }
  return { primitives: P, light, dark, scales: S, components: C, shadcn: SH, checks, ramps: Object.keys(R) };
}

// token lines for the project (named modes so they work whatever the order of the project's modes)
export function systemTokens(sys) {
  const out = {};
  for (const [k, v] of Object.entries(sys.primitives)) out[k] = v;
  for (const k of Object.keys(sys.light)) out[k] = sys.light[k] === sys.dark[k] ? sys.light[k] : { light: sys.light[k], dark: sys.dark[k] };
  Object.assign(out, sys.scales, sys.components, sys.shadcn);
  return out;
}

// ---- W3C DTCG 2025.10 export: groups, $type, aliases {group.token}; modes in $extensions
const TYPE_OF = (k, v) => /^(shadow-)/.test(k) ? 'shadow' : /^(dur-)/.test(k) ? 'duration' : /^ease-/.test(k) ? 'cubicBezier' : /^font-/.test(k) ? 'fontFamily' : /^(space|radius|text|button|input|card|chip|dialog)-|^radius$/.test(k) ? 'dimension' : 'color';
const dtcgVal = (type, v) => type === 'dimension' ? { value: +v, unit: 'px' } : type === 'duration' ? { value: +v, unit: 'ms' } : type === 'cubicBezier' ? String(v).match(/[-\d.]+/g).map(Number) : v;
export function toDTCG(sys, name = 'maquette') {
  const root = { $description: `Design system « ${name} » généré par Maquette (primitives → sémantique → composant)` };
  const color = (root.color = {});
  for (const [k, v] of Object.entries(sys.primitives)) { const [g, s] = k.split(/-(?=\d+$)/); (color[g] = color[g] || { $type: 'color' })[s] = { $value: v }; }
  const sem = (root.semantic = { $type: 'color' });
  const findAlias = (hexv) => { for (const [k, v] of Object.entries(sys.primitives)) if (v.toLowerCase() === String(hexv).toLowerCase()) { const [g, s] = k.split(/-(?=\d+$)/); return `{color.${g}.${s}}`; } return hexv; };
  for (const k of Object.keys(sys.light)) {
    const t = TYPE_OF(k, sys.light[k]);
    if (t === 'shadow') { (root.elevation = root.elevation || { $type: 'shadow' })[k] = { $value: sys.light[k], $extensions: { 'com.maquette.modes': { dark: sys.dark[k] } } }; continue; }
    sem[k] = { $value: findAlias(sys.light[k]), $extensions: { 'com.maquette.modes': { light: findAlias(sys.light[k]), dark: findAlias(sys.dark[k]) } } };
  }
  const scales = (root.scale = {});
  for (const [k, v] of Object.entries(sys.scales)) { if (k === 'spring') continue; const t = TYPE_OF(k, v); scales[k] = { $type: t, $value: dtcgVal(t, v) }; }
  const comp = (root.component = {});
  for (const [k, v] of Object.entries(sys.components)) { const sc = Object.entries(sys.scales).find(([sk, sv]) => sv === v && /^(radius|space)-/.test(sk)); comp[k] = { $type: 'dimension', $value: sc ? `{scale.${sc[0]}}` : dtcgVal('dimension', v) }; }
  return root;
}
export function toCSS(sys) {
  const v = (k, val) => `  --${k}: ${/^\d+(\.\d+)?$/.test(String(val)) && !/^(dur|text-[0-9])/.test(k) ? val + 'px' : /^dur-/.test(k) ? val + 'ms' : val};`;
  const prim = Object.entries(sys.primitives).map(([k, x]) => v(k, x));
  const L = Object.entries(sys.light).map(([k, x]) => v(k, x)), D = Object.entries(sys.dark).map(([k, x]) => v(k, x));
  const sc = Object.entries({ ...sys.scales, ...sys.components }).filter(([k]) => k !== 'spring').map(([k, x]) => v(k, x));
  return `:root {\n${[...prim, ...sc, ...L].join('\n')}\n}\n[data-theme="dark"], .dark {\n${D.join('\n')}\n}\n`;
}
export function toTailwind(sys) {
  const colors = {}; for (const [k, x] of Object.entries(sys.primitives)) { const [g, s] = k.split(/-(?=\d+$)/); (colors[g] = colors[g] || {})[s] = x; }
  for (const k of Object.keys(sys.light)) if (!/^shadow-/.test(k)) colors[k] = `var(--${k})`;
  const spacing = {}; Object.entries(sys.scales).filter(([k]) => k.startsWith('space-')).forEach(([k, x]) => { spacing[k.slice(6)] = x + 'px'; });
  const borderRadius = {}; Object.entries(sys.scales).filter(([k]) => k.startsWith('radius-')).forEach(([k, x]) => { borderRadius[k.slice(7)] = x + 'px'; });
  const boxShadow = {}; [1, 2, 3, 4].forEach((i) => { boxShadow[String(i)] = `var(--shadow-${i})`; });
  return `/** @type {import('tailwindcss').Config} */\nexport default ${JSON.stringify({ theme: { extend: { colors, spacing, borderRadius, boxShadow, fontFamily: { sans: [sys.scales['font-sans']], display: [sys.scales['font-display']], mono: [sys.scales['font-mono']] }, transitionDuration: { fast: sys.scales['dur-fast'] + 'ms', base: sys.scales['dur-base'] + 'ms', slow: sys.scales['dur-slow'] + 'ms' } } } }, null, 2)};\n`;
}
// DTCG → token lines (import)
export function fromDTCG(json) {
  const out = {}; const all = {};
  const walk = (o, path, type) => { for (const [k, v] of Object.entries(o)) { if (k.startsWith('$')) continue; if (v && typeof v === 'object' && '$value' in v) all[[...path, k].join('.')] = { ...v, $type: v.$type || type }; else if (v && typeof v === 'object') walk(v, [...path, k], v.$type || type); } };
  walk(json, [], undefined);
  const res = (val, depth = 0) => { if (typeof val === 'string' && /^\{.+\}$/.test(val) && depth < 8) { const t = all[val.slice(1, -1)]; return t ? res(t.$value, depth + 1) : val; } return val; };
  const fmt = (t) => { const v = res(t.$value); if (v && typeof v === 'object' && 'value' in v) return String(v.value); if (Array.isArray(v)) return t.$type === 'cubicBezier' ? `cubic-bezier(${v.join(',')})` : v.join(', '); return String(v); };
  for (const [path, t] of Object.entries(all)) {
    const name = path.split('.').filter((x, i, arr) => !(i === 0 && ['color', 'semantic', 'scale', 'component', 'elevation'].includes(x))).join('-');
    const modes = t.$extensions && t.$extensions['com.maquette.modes'];
    out[name] = modes && modes.dark ? { light: fmt({ ...t, $value: modes.light || t.$value }), dark: fmt({ ...t, $value: modes.dark }) } : fmt(t);
  }
  return out;
}
export function tokenLines(map) {
  return Object.entries(map).map(([k, v]) => `${k}: ${typeof v === 'object' ? `light: ${v.light} | dark: ${v.dark}` : v}`);
}
