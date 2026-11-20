import { fake, fakeList } from './plugins.js';
// Tiny safe expression language (no eval): literals, $vars, idents, member access,
// arrays/objects, arithmetic, comparisons, logic, ternary, function calls on builtins.

import { pathMixSame } from './pathkit.js';
import { parseColor, shade as _shade, tint as _tint, mix as _mix, toCss, contrast as _contrast } from './color.js';

const cache = new Map();

function tokenize(s) {
  const t = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1]))) {
      const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(s.slice(i)); t.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1, v = '';
      while (j < s.length && s[j] !== c) { if (s[j] === '\\') { v += s[j + 1]; j += 2; continue; } v += s[j++]; }
      t.push({ t: 'str', v }); i = j + 1; continue;
    }
    if (/[A-Za-z_$@]/.test(c)) {
      const m = /^[$@]?[A-Za-z_][\w-]*/.exec(s.slice(i));
      let v = m[0];
      // allow dashes in $token-names but not "a-b" arithmetic on plain idents
      if (!v.startsWith('$') && v.includes('-')) v = v.split('-')[0];
      t.push({ t: 'id', v }); i += v.length; continue;
    }
    const ops = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '=>'];
    const op = ops.find((o) => s.startsWith(o, i));
    if (op) { t.push({ t: 'op', v: op }); i += op.length; continue; }
    t.push({ t: 'op', v: c }); i++;
  }
  return t;
}

const PREC = { '??': 1, '||': 2, '&&': 3, '==': 4, '!=': 4, '===': 4, '!==': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7 };

function parseExpr(src) {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p]; const next = () => toks[p++];
  const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
  const expect = (v) => { if (!isOp(v)) throw new Error(`« ${v} » attendu dans {${src}}`); p++; };

  function primary() {
    const tk = next();
    if (!tk) throw new Error(`Expression incomplète: {${src}}`);
    if (tk.t === 'num' || tk.t === 'str') return { k: 'lit', v: tk.v };
    if (tk.t === 'id') {
      if (tk.v === 'true') return { k: 'lit', v: true };
      if (tk.v === 'false') return { k: 'lit', v: false };
      if (tk.v === 'null') return { k: 'lit', v: null };
      return { k: 'id', v: tk.v };
    }
    if (tk.v === '(') { const e = expr(); expect(')'); return e; }
    if (tk.v === '[') {
      const items = []; while (!isOp(']')) { items.push(expr()); if (isOp(',')) p++; else break; } expect(']'); return { k: 'arr', items };
    }
    if (tk.v === '{') {
      const props = [];
      while (!isOp('}')) {
        const kt = next(); const key = kt.v; expect(':'); props.push([key, expr()]); if (isOp(',')) p++; else break;
      }
      expect('}'); return { k: 'obj', props };
    }
    if (tk.v === '-' || tk.v === '!' || tk.v === '+') return { k: 'un', op: tk.v, a: postfix(primary()) };
    throw new Error(`Jeton inattendu « ${tk.v} » dans {${src}}`);
  }
  function postfix(e) {
    for (;;) {
      if (isOp('.') || isOp('?.')) { p++; const n = next(); e = { k: 'mem', o: e, p: { k: 'lit', v: n.v } }; continue; }
      if (isOp('[')) { p++; const ix = expr(); expect(']'); e = { k: 'mem', o: e, p: ix }; continue; }
      if (isOp('(')) { p++; const args = []; while (!isOp(')')) { args.push(expr()); if (isOp(',')) p++; else break; } expect(')'); e = { k: 'call', f: e, args }; continue; }
      return e;
    }
  }
  function binary(minP) {
    let left = postfix(primary());
    for (;;) {
      const tk = peek();
      if (!tk || tk.t !== 'op' || !(tk.v in PREC) || PREC[tk.v] < minP) return left;
      p++; const right = binary(PREC[tk.v] + 1);
      left = { k: 'bin', op: tk.v, a: left, b: right };
    }
  }
  function expr() {
    const c = binary(1);
    if (isOp('?')) { p++; const a = expr(); expect(':'); const b = expr(); return { k: 'tern', c, a, b }; }
    return c;
  }
  const e = expr();
  if (p < toks.length) throw new Error(`Jeton inattendu « ${toks[p].v} » dans {${src}}`);
  return e;
}

const pc = (c) => parseColor(String(c)) || [0, 0, 0, 1];
const pct = (p, d) => { const n = Number(p ?? d); return n > 1 ? n / 100 : n; };
export const FALLBACK = { morph: null, shape: null, gen: 0 }; // gen: bump to invalidate named-shape caches (live key editing)
// keys / remap: one value curve through several stops (numbers, colours, paths, arrays, objects),
// like Rive's data-binding converters or Framer's useTransform
const isPathStr = (v) => typeof v === 'string' && /^\s*[Mm]\s*-?[\d.]/.test(v);
const asNum = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^\s*-?\d*\.?\d+\s*$/.test(v) ? +v : NaN);
export function lerpAny(a, b, u) {
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => lerpAny(x, b[i] ?? x, u));
  const na = asNum(a), nb = asNum(b); if (!isNaN(na) && !isNaN(nb)) return na + (nb - na) * u;
  if (isPathStr(a) && isPathStr(b)) return BUILTINS.pathmix(u, a, b);
  const ca = typeof a === 'string' && parseColor(a), cb = typeof b === 'string' && parseColor(b); if (ca && cb) return toCss(_mix(ca, cb, u));
  if (a && b && typeof a === 'object' && typeof b === 'object') { const o = { ...a }; for (const k of Object.keys(b)) o[k] = k in a ? lerpAny(a[k], b[k], u) : b[k]; return o; }
  return u < 0.5 ? a : b;
}
const SEG_EASE = { linear: (u) => u, smooth: (u) => u * u * (3 - 2 * u), in: (u) => u * u, out: (u) => 1 - (1 - u) * (1 - u), step: (u) => (u < 1 ? 0 : 1) };
function remapAny(t, stops, vals, ease) {
  stops = (stops || []).map(Number); vals = vals || []; const n = Math.min(stops.length, vals.length);
  if (!n) return undefined; if (n === 1) return vals[0];
  t = Number(t) || 0; if (t <= stops[0]) return vals[0]; if (t >= stops[n - 1]) return vals[n - 1];
  let i = 0; while (i < n - 2 && t > stops[i + 1]) i++;
  const u = (t - stops[i]) / (stops[i + 1] - stops[i] || 1);
  return lerpAny(vals[i], vals[i + 1], (SEG_EASE[ease] || SEG_EASE.linear)(Math.min(1, Math.max(0, u))));
}
const BUILTINS = {
  fake: (k, seed) => fake(k, seed), fakeList: (n, fields, seed) => fakeList(n, fields, seed),
  shade: (c, p) => toCss(_shade(pc(c), pct(p, 10))), tint: (c, p) => toCss(_tint(pc(c), pct(p, 10))),
  mix: (a, b, p) => toCss(_mix(pc(a), pc(b), pct(p, 50))), alpha: (c, p) => { const x = pc(c); return toCss([x[0], x[1], x[2], x[3] * pct(p, 50)]); },
  onColor: (c, light = '#FFFFFF', dark = '#111114') => (_contrast(pc(c), pc(light)) >= _contrast(pc(c), pc(dark)) ? light : dark),
  // pathmix(t, d0, d1, …): interpolate between path keyframes (t 0..1). Same structure → exact node-by-node;
  // otherwise a resampling morph registered by vector.js (flubber)
  pathmix: (t, ...ds) => { ds = ds.flat().map(String); if (ds.length < 2) return ds[0] || ''; const r = pathMixSame(t, ds); if (r != null) return r;
    const n = ds.length - 1; const x = Math.min(1, Math.max(0, +t || 0)) * n; const i = Math.min(n - 1, Math.floor(x)); const u = x - i;
    return FALLBACK.morph ? FALLBACK.morph(ds[i], ds[i + 1])(u) : (u < 0.5 ? ds[i] : ds[i + 1]); },
  // remap($t, [0, .3, 1], [a, b, c] [, smooth]) · keys($t, a, b, c) (stops spaced evenly over 0..1) · lerp(a, b, u)
  remap: (t, stops, vals, ease) => remapAny(t, stops, vals, ease),
  keys: (t, ...vals) => { if (vals.length === 1 && Array.isArray(vals[0])) vals = vals[0]; const n = vals.length; return remapAny(t, vals.map((_, i) => (n < 2 ? 0 : i / (n - 1))), vals); },
  lerp: (a, b, u) => lerpAny(a, b, Number(u) || 0),
  min: (...a) => Math.min(...a.flat()), max: (...a) => Math.max(...a.flat()), round: Math.round, floor: Math.floor, ceil: Math.ceil, abs: Math.abs,
  len: (x) => (x == null ? 0 : x.length ?? Object.keys(x).length),
  upper: (s) => String(s).toUpperCase(), lower: (s) => String(s).toLowerCase(),
  fixed: (n, d = 2) => Number(n).toFixed(d),
  money: (n, cur = '€', d = 2) => { const v = Number(n); const s = Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); return (v < 0 ? '−' : '') + s + ' ' + cur; },
  pad: (n, w = 2) => String(n).padStart(w, '0'),
  range: (a, b) => { if (b === undefined) { b = a; a = 0; } const r = []; for (let k = a; k < b; k++) r.push(k); return r; },
  includes: (arr, v) => (arr || []).includes(v),
  join: (arr, sep = ', ') => (arr || []).join(sep),
  str: (x) => String(x), num: (x) => Number(x),
  replace: (s, a, b) => String(s ?? '').split(a).join(b), split: (s, sep) => String(s ?? '').split(sep), trim: (s) => String(s ?? '').trim(),
  first: (a) => (a || [])[0], last: (a) => (a || [])[(a || []).length - 1], find: (arr, k, v) => (arr || []).find((x) => x[k] === v), map: (arr, k) => (arr || []).map((x) => x[k]),
  percent: (v, d = 0) => (Number(v) * 100).toFixed(d) + ' %', date: (o = 0) => { const d = new Date(Date.now() + o * 864e5); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); },
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  pick: (i, ...opts) => opts[((i % opts.length) + opts.length) % opts.length],
  push: (arr, v) => [...(arr || []), v],
  without: (arr, v) => (arr || []).filter((x) => x !== v),
  toggleIn: (arr, v) => ((arr || []).includes(v) ? arr.filter((x) => x !== v) : [...(arr || []), v]),
  sum: (arr, k) => (arr || []).reduce((s, x) => s + Number(k ? x[k] : x), 0),
  slice: (a, s, e) => (a || []).slice(s, e),
  filter: (arr, k, v) => (arr || []).filter((x) => (v === undefined ? x[k] : x[k] === v)),
  now: () => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); },
};

function ev(e, scope) {
  switch (e.k) {
    case 'lit': return e.v;
    case 'id': return scope.lookup(e.v);
    case 'arr': return e.items.map((x) => ev(x, scope));
    case 'obj': { const o = {}; for (const [k, v] of e.props) o[k] = ev(v, scope); return o; }
    case 'un': { const a = ev(e.a, scope); return e.op === '-' ? -a : e.op === '+' ? +a : !a; }
    case 'mem': { const o = ev(e.o, scope); return o == null ? undefined : o[ev(e.p, scope)]; }
    case 'tern': return ev(e.c, scope) ? ev(e.a, scope) : ev(e.b, scope);
    case 'call': {
      if (e.f.k === 'id' && e.f.v === 'dollar') return scope.lookup('$' + ev(e.args[0], scope));
      if (e.f.k === 'id' && (e.f.v === 'pathmix' || e.f.v === 'keys')) { // keyframes: path data, or the name of a vector layer (bare or quoted)
        const [t, ...rest] = e.args; const pm = e.f.v === 'pathmix';
        const shape = (n) => (scope.root && scope.root.shape ? scope.root.shape(n) : FALLBACK.shape ? FALLBACK.shape(n) : null);
        const ds = rest.map((x) => { let v = ev(x, scope); const bare = v === undefined && x.k === 'id' && !x.v.startsWith('$'); if (bare) v = x.v;
          // keys(): only a bare name (or any string for pathmix) is looked up as a layer; colours and text stay as they are
          if (typeof v === 'string' && !/^\s*[Mm]/.test(v) && (pm || bare)) { const r = shape(v.trim()); if (r) v = r; }
          return v; });
        return pm ? BUILTINS.pathmix(ev(t, scope), ...ds) : BUILTINS.keys(ev(t, scope), ...ds);
      }
      const fn = e.f.k === 'id' ? BUILTINS[e.f.v] : null;
      if (!fn) throw new Error(`Fonction inconnue: ${e.f.v}`);
      return fn(...e.args.map((x) => ev(x, scope)));
    }
    case 'bin': {
      if (e.op === '&&') return ev(e.a, scope) && ev(e.b, scope);
      if (e.op === '||') return ev(e.a, scope) || ev(e.b, scope);
      if (e.op === '??') return ev(e.a, scope) ?? ev(e.b, scope);
      const a = ev(e.a, scope), b = ev(e.b, scope);
      switch (e.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b;
        case '==': case '===': return a == b; case '!=': case '!==': return a != b; // eslint-disable-line eqeqeq
        case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b;
      }
    }
  }
  throw new Error('Expression invalide');
}

export function compile(src) {
  let c = cache.get(src);
  if (!c) { c = parseExpr(src); cache.set(src, c); }
  return c;
}

export function evaluate(src, scope) {
  return ev(compile(src), scope);
}

// Scope: chain of plain objects + $-lookup into vars then tokens
export class Scope {
  constructor(locals, parent, root) { this.locals = locals || {}; this.parent = parent || null; this.root = root || (parent && parent.root) || null; }
  child(locals) { return new Scope(locals, this, this.root); }
  lookup(name) {
    if (name.startsWith('$')) return this.root ? this.root.dollar(name.slice(1)) : undefined;
    let s = this;
    while (s) { if (name in s.locals) return s.locals[name]; s = s.parent; }
    return undefined;
  }
}

// Interpolate "a {expr} b" ; returns raw value when string is exactly "{expr}"
export function interp(str, scope) {
  if (typeof str !== 'string' || !str.includes('{')) return str;
  if (/^\{[\s\S]*\}$/.test(str) && balancedOnce(str)) return evaluate(str.slice(1, -1), scope);
  return str.replace(/\{([^{}]+)\}/g, (_, e) => { const v = evaluate(e, scope); return v == null ? '' : v; });
}
function balancedOnce(s) {
  let d = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}') { d--; if (d === 0 && i < s.length - 1) return false; } }
  return true;
}
