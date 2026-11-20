// Theme importers: shadcn/ui globals.css (v3 HSL triples or v4 oklch) → Maquette tokens with named modes.
import { parseColor, toCss } from './color.js';

function cssVars(block) {
  const out = {}; const re = /--([\w-]+)\s*:\s*([^;}]+)[;}]?/g; let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].trim();
  return out;
}
function blockOf(css, selRe) {
  const m = selRe.exec(css); if (!m) return '';
  let i = css.indexOf('{', m.index) + 1, depth = 1; const start = i;
  while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
  return css.slice(start, i - 1);
}
// one value: oklch()/hsl()/rgb()/hex, a bare HSL triple "222.2 47.4% 11.2%", a rem/px length, or var(--x)
function convert(v) {
  v = v.trim();
  if (/^[\d.]+rem$/.test(v)) return String(Math.round(parseFloat(v) * 16));
  if (/^[\d.]+px$/.test(v)) return String(parseFloat(v));
  const vm = /^var\(--([\w-]+)\)$/.exec(v); if (vm) return '$sh-' + vm[1];
  if (/^-?[\d.]+\s+[\d.]+%\s+[\d.]+%(\s*\/\s*[\d.]+%?)?$/.test(v)) v = `hsl(${v})`;
  const c = parseColor(v); return c ? toCss(c) : null;
}

export function importShadcnTheme(css, prefix = 'sh-') {
  const light = cssVars(blockOf(css, /(^|[\s}])(:root)\s*\{/));
  const dark = cssVars(blockOf(css, /\.dark\s*\{/));
  const lines = []; const skipped = [];
  for (const k of [...new Set([...Object.keys(light), ...Object.keys(dark)])]) {
    const a = light[k] !== undefined ? convert(light[k]) : null, b = dark[k] !== undefined ? convert(dark[k]) : null;
    if (a == null && b == null) { skipped.push(k); continue; }
    const fix = (x) => (x && x.startsWith('$sh-') ? '$' + prefix + x.slice(4) : x);
    const A = fix(a), B = fix(b);
    lines.push(`  ${prefix}${k}: ${B && A && B !== A ? `light: ${A} | dark: ${B}` : A || B}`);
  }
  return { tokens: `<tokens>\n${lines.join('\n')}\n</tokens>`, count: lines.length, skipped };
}
