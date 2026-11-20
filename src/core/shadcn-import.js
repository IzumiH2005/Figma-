// Import shadcn/ui registry components (TSX + Tailwind + cva + Radix) as Maquette components.
// Works on the registry JSON (https://ui.shadcn.com/r/styles/<style>/<name>.json) or a raw .tsx file.
// The result is .mq source: one <component name="ui.X"> per exported function component, with
//   - cva variants → props + conditional tw expressions,
//   - data-[state=…]:, data-[k]:, disabled:, aria-invalid: → props (state, k, disabled, invalid),
//   - {children} / {...props} → <slot/>, lucide icons → <icon>, Radix primitives → plain containers,
//   - className → prop className (appended to the root's tw).
// shadcn/ui is MIT licensed (© shadcn); the generated file keeps that notice.
import { transform } from 'sucrase';
import { Parser } from 'acorn';
import jsx from 'acorn-jsx';
import { splitClasses } from './tailwind.js';
import { parseColor, toCss } from './color.js';

const JSXParser = Parser.extend(jsx());
export const SHADCN_REGISTRY = 'https://ui.shadcn.com/r/styles/new-york-v4';
export const SHADCN_NOTICE = 'shadcn/ui — MIT License — Copyright (c) 2023 shadcn — https://ui.shadcn.com (converti par Maquette)';

const TEXT_HTML = new Set(['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'a', 'small', 'strong', 'em', 'b', 'i', 'code', 'kbd', 'caption', 'legend', 'figcaption', 'li', 'dt', 'dd', 'blockquote']);
const CELL_HTML = new Set(['th', 'td']);
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])(\d)/g, '$1-$2').toLowerCase();
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function parseTsx(code) {
  const js = transform(code, { transforms: ['typescript', 'jsx'], jsxRuntime: 'preserve', disableESTransforms: true }).code;
  return JSXParser.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
}

// ------------------------------------------------------------------ class strings with data-variants → mq expression
// returns { expr: mq expression string, props: Set of props it reads }
function classExpr(str, props) {
  classExpr.vals = classExpr.vals || {};
  const plain = []; const conds = new Map(); // condition expr → classes[]
  for (const cls of splitClasses(str)) {
    const parts = []; let depth = 0, cur = '';
    for (const ch of cls) { if (ch === '[') depth++; else if (ch === ']') depth--; if (ch === ':' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    const base = cur; const keep = []; const cond = []; let drop = false;
    for (const v of parts) {
      let m;
      if ((m = /^group-data-\[([\w-]+)=([\w-]+)\](?:\/[\w-]+)?$/.exec(v))) { const p = camel(m[1]); props.add(p); cond.push(`${p} == ${q(m[2])}`); (classExpr.vals[p] = classExpr.vals[p] || new Set()).add(m[2]); }
      else if ((m = /^data-\[([\w-]+)=([\w-]+)\]$/.exec(v))) { const p = camel(m[1]); props.add(p); cond.push(`${p} == ${q(m[2])}`); (classExpr.vals[p] = classExpr.vals[p] || new Set()).add(m[2]); }
      else if ((m = /^data-\[([\w-]+)\]$/.exec(v)) || (m = /^data-([\w-]+)$/.exec(v))) { const p = camel(m[1]); props.add(p); cond.push(p); }
      else if (v === 'disabled' || v === 'data-disabled' || v === 'aria-disabled') { props.add('disabled'); cond.push('disabled'); }
      else if (v === 'aria-invalid') { props.add('invalid'); cond.push('invalid'); }
      else if ((m = /^aria-(selected|checked|expanded|current)$/.exec(v))) { props.add(m[1]); cond.push(m[1]); }
      else if (/^(group|peer|has|in|not|supports|\*|\[|first|last|odd|even|placeholder|file|selection|before|after|motion|print|ltr|rtl|open|@|max-|min-|starting)/.test(v)) { drop = true; break; }
      else keep.push(v);
    }
    if (drop || !base) continue;
    const c = [...keep, base].join(':');
    if (!cond.length) plain.push(c);
    else { const k = cond.join(' && '); if (!conds.has(k)) conds.set(k, []); conds.get(k).push(c); }
  }
  const out = [];
  if (plain.length) out.push(q(plain.join(' ')));
  for (const [k, cl] of conds) out.push(`(${k} ? ${q(cl.join(' '))} : '')`);
  return out.length ? out.join(` + ' ' + `) : "''";
}

// ------------------------------------------------------------------ JS expression → mq expression
function jsExpr(n, env) {
  if (!n) return "''";
  switch (n.type) {
    case 'Literal': return typeof n.value === 'string' ? q(n.value) : n.value === null ? "''" : String(n.value);
    case 'TemplateLiteral': return n.quasis.map((qq, i) => q(qq.value.cooked) + (n.expressions[i] ? ` + (${jsExpr(n.expressions[i], env)})` : '')).join(' + ');
    case 'Identifier': if (n.name === 'undefined') return "''"; if (env.consts[n.name] !== undefined) return env.consts[n.name]; env.used.add(n.name); return n.name;
    case 'UnaryExpression': return n.operator === '!' ? `!(${jsExpr(n.argument, env)})` : n.operator === '-' ? `-${jsExpr(n.argument, env)}` : "''";
    case 'BinaryExpression': { const op = { '===': '==', '!==': '!=' }[n.operator] || n.operator; return `(${jsExpr(n.left, env)} ${op} ${jsExpr(n.right, env)})`; }
    case 'LogicalExpression': return `(${jsExpr(n.left, env)} ${n.operator === '??' ? '||' : n.operator} ${jsExpr(n.right, env)})`;
    case 'ConditionalExpression': return `(${jsExpr(n.test, env)} ? ${jsExpr(n.consequent, env)} : ${jsExpr(n.alternate, env)})`;
    case 'MemberExpression': if (n.object.type === 'Identifier' && n.object.name === 'props' && !n.computed) { env.used.add(n.property.name); return n.property.name; } return "''";
    default: return "''";
  }
}
// className-ish expression (cn(...), cva(...), strings, conditionals) → mq tw expression
function twExpr(n, env) {
  if (!n) return "''";
  if (n.type === 'Literal' && typeof n.value === 'string') return classExpr(n.value, env.used);
  if (n.type === 'TemplateLiteral' && !n.expressions.length) return classExpr(n.quasis.map((x) => x.value.cooked).join(''), env.used);
  if (n.type === 'Identifier' && n.name === 'className') return '';
  if (n.type === 'CallExpression') {
    const fn = n.callee.type === 'Identifier' ? n.callee.name : '';
    if (fn === 'cn' || fn === 'clsx' || fn === 'twMerge') return n.arguments.map((a) => twExpr(a, env)).filter(Boolean).join(` + ' ' + `) || "''";
    if (env.cva[fn]) return cvaExpr(env.cva[fn], n.arguments[0], env);
    return '';
  }
  if (n.type === 'ConditionalExpression') return `(${jsExpr(n.test, env)} ? ${twExpr(n.consequent, env) || "''"} : ${twExpr(n.alternate, env) || "''"})`;
  if (n.type === 'LogicalExpression' && n.operator === '&&') return `(${jsExpr(n.left, env)} ? ${twExpr(n.right, env) || "''"} : '')`;
  if (n.type === 'ObjectExpression') { // clsx({ 'a b': cond })
    return n.properties.map((p) => `(${jsExpr(p.value, env)} ? ${q(p.key.value ?? p.key.name)} : '')`).join(` + ' ' + `);
  }
  return '';
}
function cvaExpr(def, arg, env) {
  // arg = { variant, size, className } or { variant: x }
  const parts = [classExpr(def.base, env.used)];
  const given = {};
  if (arg && arg.type === 'ObjectExpression') for (const p of arg.properties) if (p.key) given[p.key.name ?? p.key.value] = p.value;
  for (const [vname, opts] of Object.entries(def.variants)) {
    const src = given[vname] ? jsExpr(given[vname], env) : vname; env.used.add(vname);
    const str = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(' ') : '');
    const branches = Object.entries(opts || {}).map(([k, v]) => [k, str(v)]).filter(([, cls]) => cls.trim());
    if (!branches.length) continue;
    let e = "''";
    for (const [k, cls] of branches.reverse()) e = `(${src} == ${q(k)} ? ${classExpr(cls, env.used)} : ${e})`;
    parts.push(e);
    if (def.defaults[vname] !== undefined && env.defaults[vname] === undefined) env.defaults[vname] = def.defaults[vname];
  }
  return parts.join(` + ' ' + `);
}

// ------------------------------------------------------------------ JSX → mq nodes
function elName(n) {
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return elName(n.object) + '.' + n.property.name;
  return 'div';
}
function attrMap(el) {
  const out = {}; let spread = false;
  for (const a of el.openingElement.attributes) {
    if (a.type === 'JSXSpreadAttribute') { spread = true; continue; }
    const k = a.name.type === 'JSXNamespacedName' ? a.name.namespace.name + ':' + a.name.name.name : a.name.name;
    out[k] = a.value == null ? { type: 'Literal', value: true } : a.value.type === 'JSXExpressionContainer' ? a.value.expression : a.value;
  }
  return { attrs: out, spread };
}

function convertEl(el, env, extra = {}) {
  if (el.type === 'JSXFragment') return { tag: 'col', attrs: {}, children: kids(el.children, env) };
  let name = elName(el.openingElement.name);
  const { attrs, spread } = attrMap(el);
  // const Comp = asChild ? Slot : "button"
  if (env.tagAlias[name]) name = env.tagAlias[name];
  const node = { tag: 'col', attrs: { ...extra }, children: [] };
  const cls = attrs.className ? twExpr(attrs.className, env) : '';
  let tw = cls && cls !== "''" ? cls : '';
  const isRoot = !!extra.$root; delete node.attrs.$root;
  if (isRoot) { tw = tw ? `${tw} + ' ' + className` : 'className'; env.used.add('className'); }

  const local = env.components.has(name);
  const icon = env.icons.has(name) || (/Icon$/.test(name) && !local && !name.includes('.'));
  if (local) node.tag = 'ui.' + name;
  else if (icon) {
    node.tag = 'icon'; node.attrs.name = q(kebab(name.replace(/Icon$/, '')));
    let sz = 16;
    if (attrs.className && attrs.className.type === 'Literal') { const m = /(?:^|\s)size-(\d+(?:\.5)?)/.exec(attrs.className.value); if (m) sz = +m[1] * 4; }
    node.attrs.size = String(sz);
  } else {
    const lower = name.toLowerCase(); const last = name.split('.').pop();
    if (lower === 'img' || last === 'Image') { node.tag = 'image'; node.attrs.src = attrs.src ? jsExpr(attrs.src, env) : q('avatar:Ada'); node.attrs.fit = q('cover'); }
    else if (lower === 'input' || lower === 'textarea') {
      node.tag = 'row';
      node.children.push({ tag: 'text', attrs: { color: q('$sh-muted-foreground'), truncate: 'true', w: q('fill') }, children: [], text: '{value || placeholder}' });
      env.used.add('placeholder'); env.used.add('value');
      if (!env.defaults.placeholder) env.defaults.placeholder = lower === 'input' ? 'Saisir…' : 'Écrire…';
    } else if (lower === 'svg') { node.tag = 'icon'; node.attrs.name = q('circle'); node.attrs.size = '16'; }
    else if (lower === 'tr') node.tag = 'row';
    else if (CELL_HTML.has(lower)) { node.tag = 'col'; node.attrs.grow = 'true'; node.attrs.minw = '0'; }
    else if (TEXT_HTML.has(lower) || /\.(Title|Description|Label|Caption)$/.test(name)) node.tag = 'col';
  }
  if (tw) node.attrs.tw = tw;
  if (attrs.style && attrs.style.type === 'ObjectExpression') {
    const parts = attrs.style.properties.filter((p) => p.type === 'Property').map((p) => `'${kebab(p.key.name ?? p.key.value)}:' + ${p.value.type === 'Literal' && typeof p.value.value === 'number' ? q(p.value.value + 'px') : jsExpr(p.value, env)} + ';'`);
    if (parts.length) node.attrs.css = parts.join(' + ');
  }
  // forward known props to local components
  if (local) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className' || k === 'key' || k.startsWith('data-') || k.startsWith('aria-') || k === 'ref') continue;
    node.attrs[k] = v.type === 'Literal' && typeof v.value === 'string' ? q(v.value) : jsExpr(v, env);
  }
  // children
  const ch = icon ? [] : kids(el.children || [], env);
  if (!ch.length && spread && !icon && node.tag !== 'image') ch.push({ tag: 'slot', attrs: {}, children: [] });
  node.children.push(...ch);
  return node;
}

function kids(list, env) {
  const out = [];
  for (const c of list) {
    if (c.type === 'JSXText') { const t = c.value.replace(/\s+/g, ' ').trim(); if (t) out.push({ tag: 'text', attrs: {}, children: [], text: t }); continue; }
    if (c.type === 'JSXElement' || c.type === 'JSXFragment') { out.push(convertEl(c, env)); continue; }
    if (c.type === 'JSXExpressionContainer') {
      const e = c.expression;
      if (e.type === 'JSXEmptyExpression') continue;
      if ((e.type === 'Identifier' && e.name === 'children') || (e.type === 'MemberExpression' && e.object.name === 'props' && e.property.name === 'children')) { out.push({ tag: 'slot', attrs: {}, children: [] }); continue; }
      if (e.type === 'LogicalExpression' && e.operator === '&&' && (e.right.type === 'JSXElement' || e.right.type === 'JSXFragment')) { const n = convertEl(e.right, env); n.attrs.if = jsExpr(e.left, env); out.push(n); continue; }
      if (e.type === 'ConditionalExpression') {
        const test = jsExpr(e.test, env);
        for (const [br, cond] of [[e.consequent, test], [e.alternate, `!(${test})`]]) {
          if (br.type === 'JSXElement' || br.type === 'JSXFragment') { const n = convertEl(br, env); n.attrs.if = cond; out.push(n); }
          else if (br.type === 'Identifier' && br.name === 'children') out.push({ tag: 'slot', attrs: { if: cond }, children: [] });
        }
        continue;
      }
      if (e.type === 'Identifier' || e.type === 'MemberExpression' || e.type === 'TemplateLiteral') { out.push({ tag: 'text', attrs: {}, children: [], text: `{${jsExpr(e, env)}}` }); continue; }
      env.warnings.push('expression JSX ignorée (' + e.type + ')');
    }
  }
  return out;
}

// ------------------------------------------------------------------ module → components
function literal(n) {
  if (!n) return undefined;
  if (n.type === 'Literal') return n.value;
  if (n.type === 'TemplateLiteral' && !n.expressions.length) return n.quasis[0].value.cooked;
  if (n.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'Literal') return -n.argument.value;
  if (n.type === 'ObjectExpression') { const o = {}; for (const p of n.properties) if (p.key) o[p.key.name ?? p.key.value] = literal(p.value); return o; }
  if (n.type === 'ArrayExpression') return n.elements.map(literal);
  return undefined;
}
function fnOf(decl) {
  if (!decl) return null;
  if (decl.type === 'FunctionDeclaration') return { name: decl.id.name, fn: decl };
  if (decl.type === 'VariableDeclaration') for (const d of decl.declarations) {
    let init = d.init; if (!init || d.id.type !== 'Identifier') continue;
    if (init.type === 'CallExpression' && /forwardRef|memo/.test(init.callee.property?.name || init.callee.name || '')) init = init.arguments[0];
    if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) return { name: d.id.name, fn: init };
  }
  return null;
}
function returnedJSX(fn) {
  if (fn.body.type !== 'BlockStatement') return fn.body;
  let ret = null;
  const visit = (stmts) => { for (const s of stmts) { if (s.type === 'ReturnStatement' && s.argument) ret = s.argument; } };
  visit(fn.body.body);
  if (ret && ret.type === 'ConditionalExpression') ret = ret.alternate.type === 'JSXElement' ? ret.alternate : ret.consequent;
  return ret;
}

export function convertTsx(code, opts = {}) {
  const ast = parseTsx(code);
  const icons = new Set(); const cva = {}; const fns = []; const warnings = [];
  for (const st of ast.body) {
    if (st.type === 'ImportDeclaration' && /lucide|@tabler|@radix-ui\/react-icons/.test(st.source.value)) for (const s of st.specifiers) icons.add(s.local.name);
    const decl = st.type === 'ExportNamedDeclaration' || st.type === 'ExportDefaultDeclaration' ? st.declaration : st;
    if (decl && decl.type === 'VariableDeclaration') for (const d of decl.declarations) {
      if (d.init && d.init.type === 'CallExpression' && d.init.callee.name === 'cva') {
        const opt = literal(d.init.arguments[1]) || {};
        cva[d.id.name] = { base: [].concat(literal(d.init.arguments[0]) || '').filter((x) => typeof x === 'string').join(' '), variants: opt.variants || {}, defaults: opt.defaultVariants || {} };
      }
    }
    const f = fnOf(decl); if (f && /^[A-Z]/.test(f.name)) fns.push(f);
  }
  const components = new Set([...fns.map((f) => f.name), ...(opts.known || [])]);
  const out = [];
  for (const { name, fn } of fns) {
    classExpr.vals = {};
    const env = { cva, icons, components, used: new Set(), defaults: {}, consts: {}, tagAlias: {}, warnings };
    // destructured props with defaults
    const p0 = fn.params[0];
    const declared = [];
    if (p0 && p0.type === 'ObjectPattern') for (const pr of p0.properties) {
      if (pr.type !== 'Property') continue;
      const key = pr.key.name; const val = pr.value;
      if (['className', 'children', 'asChild', 'ref', 'style'].includes(key)) continue;
      declared.push(key);
      if (val.type === 'AssignmentPattern') { const v = literal(val.right); if (v !== undefined) env.defaults[key] = v; }
    }
    // local aliases: const Comp = asChild ? Slot : "button"
    if (fn.body.type === 'BlockStatement') for (const s of fn.body.body) if (s.type === 'VariableDeclaration') for (const d of s.declarations) {
      if (d.id.type !== 'Identifier' || !d.init) continue;
      if (d.init.type === 'ConditionalExpression' && d.init.alternate.type === 'Literal') env.tagAlias[d.id.name] = d.init.alternate.value;
      else if (d.init.type === 'Literal' && typeof d.init.value === 'string') env.tagAlias[d.id.name] = d.init.value;
    }
    const jsxRoot = returnedJSX(fn);
    if (!jsxRoot || !/^JSX/.test(jsxRoot.type)) { warnings.push(`${name} : pas de JSX rendu, ignoré`); continue; }
    const root = convertEl(jsxRoot, env, { $root: true });
    // resting state: a component styled for data-[state=unchecked|closed|inactive] starts in that state
    for (const [p, vals] of Object.entries(classExpr.vals)) if (env.defaults[p] === undefined) { const off = ['unchecked', 'closed', 'inactive', 'off', 'horizontal'].find((x) => vals.has(x)); if (off) env.defaults[p] = off; }
    // props: declared + read by class conditions; defaults from destructuring / cva
    const props = new Map();
    const fmt = (v) => (typeof v === 'string' ? q(v) : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `{${JSON.stringify(v)}}`);
    for (const k of [...declared, ...env.used]) {
      if (props.has(k) || ['props', 'className', 'children', 'cn'].includes(k) || env.cva[k] || components.has(k)) continue;
      props.set(k, env.defaults[k] !== undefined ? fmt(env.defaults[k]) : /^(disabled|invalid|checked|selected|expanded|inset|open)$/.test(k) ? 'false' : "''");
    }
    props.set('className', "''");
    const desc = `shadcn/ui · ${opts.item || ''}${Object.keys(cva).length && Object.values(cva).some((c) => Object.keys(c.variants).some((v) => props.has(v))) ? ' · ' + Object.entries(cva).flatMap(([, c]) => Object.entries(c.variants).filter(([v]) => props.has(v)).map(([v, o]) => `${v}: ${Object.keys(o).join('|')}`)).join(' ; ') : ''}`;
    out.push({ name: 'ui.' + name, props: [...props].map(([k, v]) => `${k}=${v}`).join(' '), desc, root });
  }
  return { components: out, warnings };
}

// ------------------------------------------------------------------ serialisation
function attrsToMq(a) {
  return Object.entries(a).map(([k, v]) => {
    if (v === 'true') return k;
    if (/^'[^'{}"]*'$/.test(v) && !/[\s]/.test(v.slice(1, -1)) && v.length > 2) return `${k}=${v.slice(1, -1)}`;
    if (/^-?\d+(\.\d+)?$/.test(v)) return `${k}=${v}`;
    return `${k}={${v}}`;
  }).join(' ');
}
function nodeToMq(n, ind) {
  const pad = '  '.repeat(ind); const at = attrsToMq(n.attrs); const open = `${pad}<${n.tag}${at ? ' ' + at : ''}`;
  if (n.text !== undefined) return `${open}>${n.text.replace(/</g, '&lt;')}</${n.tag}>`;
  if (!n.children.length) return `${open}/>`;
  return `${open}>\n${n.children.map((c) => nodeToMq(c, ind + 1)).join('\n')}\n${pad}</${n.tag}>`;
}
export function componentsToMq(list) {
  return list.map((c) => `<component name="${c.name}" props="${c.props.replace(/"/g, '&quot;')}" desc="${c.desc.replace(/"/g, '&quot;')}">\n${nodeToMq(c.root, 1)}\n</component>`).join('\n\n');
}

// registry item JSON (or raw tsx) → { mq, names, warnings, deps }
export function convertRegistryItem(item, opts = {}) {
  const files = typeof item === 'string' ? [{ path: 'component.tsx', content: item }] : (item.files || []).filter((f) => /\.tsx?$/.test(f.path));
  const all = []; const warnings = [];
  for (const f of files) { const r = convertTsx(f.content, { ...opts, item: item.name || f.path }); all.push(...r.components); warnings.push(...r.warnings); }
  const deps = (item.registryDependencies || []).map((d) => String(d).replace(/^.*\//, '').replace(/\.json$/, ''));
  return { mq: componentsToMq(all), names: all.map((c) => c.name), warnings, deps };
}

// theme: registry theme item ({cssVars:{light,dark}}) → tokens lines `sh-x: light: … | dark: …`
export function registryThemeTokens(item, prefix = 'sh-') {
  const cv = item.cssVars || {}; const light = { ...(cv.theme || {}), ...(cv.light || {}) }; const dark = cv.dark || {};
  const conv = (v) => { if (v == null) return null; v = String(v).trim(); if (/^[\d.]+rem$/.test(v)) return String(Math.round(parseFloat(v) * 16)); const c = parseColor(v); return c ? toCss(c) : null; };
  const lines = [];
  for (const k of new Set([...Object.keys(light), ...Object.keys(dark)])) {
    const a = conv(light[k]), b = conv(dark[k]); if (a == null && b == null) continue;
    lines.push(`${prefix}${k}: ${a && b && a !== b ? `light: ${a} | dark: ${b}` : a || b}`);
  }
  if (!lines.some((l) => l.startsWith(prefix + 'destructive-foreground'))) lines.push(`${prefix}destructive-foreground: #FFFFFF`);
  return lines;
}

// Full import pipeline shared by the CLI and the editor.
// names: registry item names (or ['all']); fetchJson(url) → item; paste: registry JSON or .tsx text (offline import)
export async function importShadcn({ names = [], theme = 'neutral', style = 'new-york-v4', paste = '', fetchJson, onItem } = {}) {
  const base = SHADCN_REGISTRY.replace(/new-york-v4$/, style);
  const items = []; const warnings = [];
  if (paste && paste.trim()) {
    let it; try { it = JSON.parse(paste); } catch { it = { name: 'collé', files: [{ path: 'component.tsx', content: paste }] }; }
    for (const x of Array.isArray(it.items) ? it.items : [it]) items.push(x);
  }
  let themeLines = null;
  if (names.length && fetchJson) {
    const get = (n) => fetchJson(`${base}/${n}.json`);
    let uiNames = null;
    try { const idx = await get('registry'); uiNames = idx.items.filter((i) => i.type === 'registry:ui').map((i) => i.name); } catch (e) { if (!names.length) throw e; }
    let want = names.includes('all') ? uiNames || [] : names;
    const done = new Set(); const queue = [...want];
    while (queue.length) {
      const n = queue.shift(); if (done.has(n)) continue; done.add(n);
      if (uiNames && !uiNames.includes(n)) { warnings.push(`${n} : pas un composant UI du registre`); continue; }
      const it = await get(n); items.push(it); if (onItem) onItem(it);
      for (const d of it.registryDependencies || []) { const dn = String(d).replace(/^.*\//, '').replace(/\.json$/, ''); if (!done.has(dn)) queue.push(dn); }
    }
    try { themeLines = registryThemeTokens(await get(`theme-${theme}`)); } catch (e) { warnings.push('thème : ' + e.message); }
  }
  // two passes so cross-file references (<Button> inside AlertDialogAction…) resolve to ui.*
  const known = [];
  for (const it of items) { try { known.push(...convertRegistryItem(it).names.map((x) => x.slice(3))); } catch (e) { warnings.push(`${it.name} : ${e.message}`); } }
  const parts = []; const converted = [];
  for (const it of items) {
    try { const r = convertRegistryItem(it, { known }); parts.push(`<!-- ${it.name} -->\n${r.mq}`); converted.push({ item: it.name, names: r.names }); warnings.push(...r.warnings.map((w) => `${it.name}: ${w}`)); }
    catch (e) { warnings.push(`${it.name} : ${e.message}`); }
  }
  return { mq: `<!-- ${SHADCN_NOTICE} -->\n${parts.join('\n\n')}`, converted, names: converted.flatMap((c) => c.names), themeLines, warnings };
}
