// Tailwind utility classes → Maquette attributes (tw="…" attribute). Used by imported shadcn/ui components,
// and usable by hand. Spacing scale = 4px per unit (Tailwind v4). Colors resolve to shadcn semantic tokens ($sh-*).
// Unknown or behaviour-only classes (transition, outline, ring, data-* animations, arbitrary selectors) are ignored.

const SEMANTIC = new Set(['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-foreground',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
  'border', 'input', 'ring', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'sidebar', 'sidebar-foreground', 'sidebar-primary',
  'sidebar-primary-foreground', 'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring']);
// a few raw palette colours that shadcn uses directly (overlays, success states)
const PALETTE = { white: '#FFFFFF', black: '#000000', transparent: 'transparent', current: 'currentColor', 'gray-500': '#6B7280', 'zinc-500': '#71717A', 'neutral-500': '#737373',
  'red-500': '#EF4444', 'red-600': '#DC2626', 'green-500': '#22C55E', 'green-600': '#16A34A', 'emerald-500': '#10B981', 'amber-500': '#F59E0B', 'blue-500': '#3B82F6', 'yellow-500': '#EAB308' };
const TEXT = { xs: [12, 16], sm: [14, 20], base: [16, 24], lg: [18, 28], xl: [20, 28], '2xl': [24, 32], '3xl': [30, 36], '4xl': [36, 40], '5xl': [48, 48], '6xl': [60, 60] };
const WEIGHT = { thin: 100, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const LEADING = { none: 1, tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625, loose: 2 };
const TRACKING = { tighter: '-5%', tight: '-2.5%', normal: '0%', wide: '2.5%', wider: '5%', widest: '10%' };
const SHADOWS = new Set(['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'inner', 'none']);
const ALIGN = { start: 'start', center: 'center', end: 'end', stretch: 'stretch', baseline: 'baseline' };
const JUSTIFY = { start: 'start', center: 'center', end: 'end', between: 'between', around: 'around', evenly: 'evenly' };
// prefixes Maquette understands: Tailwind variant → Maquette prefix (null = drop the class)
const VARIANTS = { hover: 'hover', 'focus-visible': 'focus', focus: 'focus', 'focus-within': 'focus', active: 'press', dark: 'dark', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl' };

function size(v) { // spacing value → px number or keyword
  if (v === 'px') return 1;
  if (v === 'full') return 'fill';
  if (v === 'auto') return 'auto';
  if (v === 'fit' || v === 'min' || v === 'max') return 'hug';
  if (v === 'screen' || v === 'dvh' || v === 'svh') return 'fill';
  const fr = /^(\d+)\/(\d+)$/.exec(v); if (fr) return `${+((+fr[1] / +fr[2]) * 100).toFixed(3)}%`;
  const arb = /^\[(.+)\]$/.exec(v); if (arb) { const x = arb[1].replace(/_/g, ' '); if (/^-?[\d.]+px$/.test(x)) return parseFloat(x); if (/^-?[\d.]+rem$/.test(x)) return parseFloat(x) * 16; if (/^-?[\d.]+%$/.test(x)) return x; return null; }
  if (/^-?\d+(\.\d+)?$/.test(v)) return +(+v * 4).toFixed(2);
  return null;
}
const MAXW = { xs: 320, sm: 384, md: 448, lg: 512, xl: 576, '2xl': 672, '3xl': 768, '4xl': 896, '5xl': 1024, '6xl': 1152, '7xl': 1280, prose: 640 };

// color utility value (after bg-/text-/border-…) → mq color string, or null
export function twColor(v, env) {
  let op = null; const m = /^(.+?)\/(\d+|\[[\d.]+\])$/.exec(v); if (m) { v = m[1]; op = m[2].startsWith('[') ? parseFloat(m[2].slice(1)) * 100 : +m[2]; }
  let c = null;
  if (SEMANTIC.has(v)) c = '$' + (env.prefix ?? 'sh-') + v;
  else if (PALETTE[v]) c = PALETTE[v];
  else if (/^\[(#[0-9a-fA-F]{3,8}|rgba?\(.+\)|oklch\(.+\)|hsl\(.+\))\]$/.test(v)) c = v.slice(1, -1).replace(/_/g, ' ');
  else if (/^\[var\(--([\w-]+)\)\]$/.test(v)) c = '$' + (env.prefix ?? 'sh-') + /--([\w-]+)/.exec(v)[1];
  if (!c) return null;
  if (op != null && op < 100) return env.alpha ? env.alpha(c, op) : `alpha(${c}, ${op})`;
  return c;
}

// one class without variants → [attr, value] pairs (or [] when ignored)
function one(cls, env, ctxInfo) {
  const neg = cls.startsWith('-'); if (neg) cls = cls.slice(1);
  const N = (x) => (typeof x === 'number' && neg ? -x : x);
  let m;
  switch (cls) {
    case 'flex': case 'inline-flex': return [['$layout', 'row']];
    case 'flex-col': case 'flex-col-reverse': return [['$layout', 'col'], ...(cls.endsWith('reverse') ? [['reverse', true]] : [])];
    case 'flex-row': return [['$layout', 'row']];
    case 'flex-row-reverse': return [['$layout', 'row'], ['reverse', true]];
    case 'grid': case 'inline-grid': return [['$layout', 'grid'], ['$cols1', true]];
    case 'block': case 'inline-block': case 'inline': return [['$layout', 'block']];
    case 'hidden': return [['hidden', true]];
    case 'flex-wrap': return [['wrap', true]];
    case 'flex-1': case 'grow': case 'flex-auto': return [['grow', true], ['minw', 'auto']];
    case 'shrink-0': return [['shrink', 0]];
    case 'relative': return [];
    case 'absolute': return [['absolute', true]];
    case 'fixed': return [['$fixed', true]];
    case 'sticky': return [];
    case 'overflow-hidden': case 'overflow-clip': return [['clip', true]];
    case 'overflow-auto': case 'overflow-y-auto': case 'overflow-scroll': return [['scroll', 'y']];
    case 'overflow-x-auto': return [['scroll', 'x']];
    case 'truncate': return [['truncate', true]];
    case 'whitespace-nowrap': case 'text-nowrap': return [['nowrap', true]];
    case 'uppercase': return [['upper', true]];
    case 'lowercase': return [['lower', true]];
    case 'italic': return [['italic', true]];
    case 'underline': return [['underline', true]];
    case 'line-through': return [['strike', true]];
    case 'tabular-nums': case 'font-mono': return cls === 'font-mono' ? [['mono', true]] : [];
    case 'text-left': return [['talign', 'left']];
    case 'text-center': return [['talign', 'center']];
    case 'text-right': return [['talign', 'right']];
    case 'border': return [['$bw', 1]];
    case 'border-0': return [['$bw', 0]];
    case 'border-2': return [['$bw', 2]];
    case 'border-dashed': return [['$bstyle', 'dashed']];
    case 'rounded': return [['radius', 4]];
    case 'rounded-none': return [['radius', 0]];
    case 'rounded-full': return [['radius', 'full']];
    case 'shadow': return [['shadow', 'sm']];
    case 'pointer-events-none': return [['events', 'none']];
    case 'cursor-pointer': return [['cursor', 'pointer']];
    case 'cursor-default': return [['cursor', 'default']];
    case 'aspect-square': return [['aspect', 1]];
    case 'aspect-video': return [['aspect', '16/9']];
    case 'mx-auto': return [['mx', 'auto']];
    case 'ml-auto': return [['ml', 'auto']];
    case 'mr-auto': return [['mr', 'auto']];
    case 'mt-auto': return [['mt', 'auto']];
    case 'inset-0': return [['$inset', 0]];
    case 'backdrop-blur': case 'backdrop-blur-sm': return [['bgblur', cls.endsWith('sm') ? 4 : 8]];
    case 'sr-only': return [['hidden', true]];
    case 'leading-none': return [['lh', 1]];
    default: break;
  }
  if ((m = /^(items|self)-(\w+)$/.exec(cls)) && ALIGN[m[2]]) return [[m[1] === 'items' ? 'align' : 'self', ALIGN[m[2]]]];
  if ((m = /^justify-(\w+)$/.exec(cls)) && JUSTIFY[m[1]]) return [['justify', JUSTIFY[m[1]]]];
  if ((m = /^grid-cols-(\d+)$/.exec(cls))) return [['cols', +m[1]]];
  if ((m = /^grid-cols-\[(.+)\]$/.exec(cls))) return [['cols', m[1].replace(/_/g, ' ').replace(/(^|\s)0(?=\s|$)/g, '$10px').replace(/calc\(var\(--spacing\)\*(\d+)\)/g, (_, n) => +n * 4 + 'px')]];
  if ((m = /^col-start-(\d+)$/.exec(cls))) return [['gcol', +m[1]]];
  if ((m = /^row-start-(\d+)$/.exec(cls))) return [['grst', +m[1]]];
  if ((m = /^row-span-(\d+)$/.exec(cls))) return [['rspan', +m[1]]];
  if (cls === 'col-span-full') return [['span', 'all']];
  if ((m = /^translate-([xy])-(.+)$/.exec(cls))) { const x = m[2].startsWith('[') ? m[2].slice(1, -1).replace(/_/g, ' ').replace(/calc\((.+)-(.+)\)/, 'calc($1 - $2)') : size(m[2]); return x == null ? [] : [['t' + m[1], typeof x === 'number' ? N(x) : (neg ? '-' : '') + x]]; }
  if ((m = /^col-span-(\d+)$/.exec(cls))) return [['span', +m[1]]];
  if ((m = /^gap-([xy]-)?(.+)$/.exec(cls))) { const v = size(m[2]); if (v == null) return []; return [[m[1] ? 'gap' + m[1][0] : 'gap', v]]; }
  if ((m = /^space-([xy])-(.+)$/.exec(cls))) { const v = size(m[2]); return v == null ? [] : [['gap', v]]; }
  if ((m = /^(p|px|py|pt|pr|pb|pl|ps|pe)-(.+)$/.exec(cls))) { const v = size(m[2]); if (typeof v !== 'number') return []; const k = { ps: 'pl', pe: 'pr' }[m[1]] || m[1]; return [[k, v]]; }
  if ((m = /^(m|mx|my|mt|mr|mb|ml|ms|me)-(.+)$/.exec(cls))) { const v = size(m[2]); if (v == null) return []; const k = { ms: 'ml', me: 'mr' }[m[1]] || m[1]; return [[k, N(v)]]; }
  if ((m = /^size-(.+)$/.exec(cls))) { const v = size(m[1]); return v == null ? [] : [['w', v], ['h', v]]; }
  if ((m = /^(w|h)-(.+)$/.exec(cls))) { const v = size(m[2]); return v == null ? [] : [[m[1], v]]; }
  if ((m = /^(min|max)-(w|h)-(.+)$/.exec(cls))) {
    let v = m[1] === 'max' && m[2] === 'w' && MAXW[m[3]] ? MAXW[m[3]] : size(m[3]); if (v === 'fill') v = '100%'; if (v == null || v === 'hug' || v === 'auto') return [];
    return [[m[1] + m[2], v]];
  }
  if ((m = /^(top|left|right|bottom)-(.+)$/.exec(cls))) { const v = size(m[2]); return v == null || typeof v !== 'number' && !String(v).endsWith('%') ? [] : [['$' + m[1], N(v)]]; }
  if ((m = /^text-(xs|sm|base|lg|xl|[2-6]xl)$/.exec(cls))) return [['size', TEXT[m[1]][0]], ['$lh', TEXT[m[1]][1]]];
  if ((m = /^text-\[([\d.]+)(px|rem)\]$/.exec(cls))) return [['size', m[2] === 'rem' ? +m[1] * 16 : +m[1]]];
  if ((m = /^font-(\w+)$/.exec(cls)) && WEIGHT[m[1]]) return [['weight', WEIGHT[m[1]]]];
  if ((m = /^leading-(\w+)$/.exec(cls))) { if (LEADING[m[1]]) return [['lh', LEADING[m[1]]]]; const v = size(m[1]); return typeof v === 'number' ? [['lh', v + 'px']] : []; }
  if ((m = /^tracking-(\w+)$/.exec(cls)) && TRACKING[m[1]]) return [['ls', TRACKING[m[1]]]];
  if ((m = /^line-clamp-(\d+)$/.exec(cls))) return [['lines', +m[1]]];
  if ((m = /^opacity-(\d+)$/.exec(cls))) return [['opacity', +m[1] / 100]];
  if ((m = /^shadow-(\w+)$/.exec(cls)) && SHADOWS.has(m[1])) return [['shadow', m[1] === '2xs' ? 'xs' : m[1]]];
  if ((m = /^z-(\d+)$/.exec(cls))) return [['z', +m[1]]];
  if ((m = /^rounded(-[tblr]{1,2}|-[se][se]?)?-(xs|sm|md|lg|xl|2xl|3xl|4xl|full|none|\[.+\])$/.exec(cls))) {
    const r = env.radius ?? 10; const k = m[2];
    const v = k === 'full' ? 'full' : k === 'none' ? 0 : k === 'xs' ? 2 : k === 'sm' ? Math.max(0, r - 4) : k === 'md' ? Math.max(0, r - 2) : k === 'lg' ? r : k === 'xl' ? r + 4 : k === '2xl' ? r + 8 : k === '3xl' ? r + 12 : k === '4xl' ? r + 16 : size(k);
    if (v == null) return [];
    if (!m[1]) return [['radius', v]];
    const side = m[1].slice(1); const corners = { t: [1, 1, 0, 0], b: [0, 0, 1, 1], l: [1, 0, 0, 1], r: [0, 1, 1, 0], tl: [1, 0, 0, 0], tr: [0, 1, 0, 0], br: [0, 0, 1, 0], bl: [0, 0, 0, 1], s: [1, 0, 0, 1], e: [0, 1, 1, 0] }[side];
    return corners ? [['$corners', corners.map((c) => (c ? v : null))]] : [];
  }
  if ((m = /^border-([tblrxy])(-\d)?$/.exec(cls))) return [['$bside', m[1]], ['$bw', m[2] ? +m[2].slice(1) : 1]];
  if ((m = /^border-(.+)$/.exec(cls))) { const c = twColor(m[1], env); return c ? [['$bc', c]] : []; }
  if ((m = /^bg-(.+)$/.exec(cls))) { const c = twColor(m[1], env); return c ? [['fill', c]] : []; }
  if ((m = /^text-(.+)$/.exec(cls))) { const c = twColor(m[1], env); return c ? [['color', c]] : []; }
  if ((m = /^(fill|stroke)-(.+)$/.exec(cls))) { const c = twColor(m[2], env); return c ? [['$svg' + m[1], c]] : []; }
  if (ctxInfo) ctxInfo.unknown.push(cls);
  return [];
}

// split "a b hover:c [&_svg]:d" respecting brackets
export function splitClasses(s) {
  const out = []; let cur = '', depth = 0;
  for (const ch of String(s || '')) {
    if (ch === '[' || ch === '(') depth++; else if (ch === ']' || ch === ')') depth--;
    if (/\s/.test(ch) && depth <= 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// tw string → { attrs: {k: v}, prefixed: {'hover:fill': v, 'dark:fill': v}, layout, unknown }
export function twToAttrs(str, env = {}) {
  const info = { unknown: [] };
  const groups = new Map(); // prefix ('' | 'hover' | …) → working attrs
  const get = (p) => { if (!groups.has(p)) groups.set(p, {}); return groups.get(p); };
  for (let cls of splitClasses(str)) {
    cls = cls.replace(/^!/, '');
    const parts = []; let depth = 0, cur = '';
    for (const ch of cls) { if (ch === '[') depth++; else if (ch === ']') depth--; if (ch === ':' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    parts.push(cur);
    const base = parts.pop(); let prefix = ''; let drop = false;
    for (const v of parts) { const mapped = VARIANTS[v]; if (mapped === undefined) { drop = true; break; } prefix = prefix ? prefix + ':' + mapped : mapped; }
    if (drop || !base) continue;
    const g = get(prefix);
    for (const [k, v] of one(base, env, info)) g[k] = v;
  }
  const attrs = {}; const prefixed = {}; let layout = null;
  for (const [p, g] of groups) {
    const out = {};
    if (g.$layout) { if (!p) layout = g.$layout; delete g.$layout; }
    if (g.$cols1) { if (g.cols === undefined && !p) out.cols = 1; delete g.$cols1; }
    if (g.$lh !== undefined) { if (g.lh === undefined) out.lh = g.$lh + 'px'; delete g.$lh; }
    // border: width + side + colour (shadcn sets border-color: var(--border) globally)
    if (g.$bw !== undefined || g.$bc !== undefined || g.$bside !== undefined) {
      const w = g.$bw ?? 1; const c = g.$bc || '$' + (env.prefix ?? 'sh-') + 'border';
      const key = g.$bside ? { t: 'stroke-t', b: 'stroke-b', l: 'stroke-l', r: 'stroke-r', x: 'stroke-x', y: 'stroke-y' }[g.$bside] : 'stroke';
      if (g.$bw === undefined && g.$bside === undefined) out.$strokeColor = c; // colour only: applies to an existing border
      else if (key === 'stroke-x') { out['stroke-l'] = `${w} ${c}`; out['stroke-r'] = `${w} ${c}`; }
      else if (key === 'stroke-y') { out['stroke-t'] = `${w} ${c}`; out['stroke-b'] = `${w} ${c}`; }
      else out[key] = w === 0 ? 'none' : `${w} ${c}${g.$bstyle ? ' ' + g.$bstyle : ''}`;
      delete g.$bw; delete g.$bc; delete g.$bside; delete g.$bstyle;
    }
    if (g.$corners) { const r = g.$corners.map((x) => x ?? 0); out.radius = r.join(' '); delete g.$corners; }
    if (g.$fixed) { delete g.$fixed; delete g.tx; delete g.ty; for (const k of ['$top', '$left', '$right', '$bottom', '$inset']) delete g[k]; out.$overlay = true; }
    else for (const k of ['top', 'left', 'right', 'bottom']) if (g['$' + k] !== undefined) { if (g.absolute) out[k] = g['$' + k]; delete g['$' + k]; }
    if (g.$inset !== undefined) { if (g.absolute) out.inset = 0; delete g.$inset; }
    if (g.$svgfill) { out.$iconFill = g.$svgfill; delete g.$svgfill; }
    if (g.$svgstroke) delete g.$svgstroke;
    Object.assign(out, g);
    for (const [k, v] of Object.entries(out)) { if (p) prefixed[p + ':' + k] = v; else attrs[k] = v; }
  }
  // a border colour given alone recolours the full border
  if (attrs.$strokeColor) { if (!attrs.stroke) attrs.stroke = `1 ${attrs.$strokeColor}`; delete attrs.$strokeColor; }
  for (const k of Object.keys(prefixed)) if (k.endsWith(':$strokeColor')) { prefixed[k.replace('$strokeColor', 'stroke')] = `1 ${prefixed[k]}`; delete prefixed[k]; }
  return { attrs, prefixed, layout, unknown: info.unknown };
}
