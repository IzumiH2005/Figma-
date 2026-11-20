import { fake, fakeList } from './plugins.js';
// Tiny safe expression language (no eval): literals, $vars, idents, member access,
// arrays/objects, arithmetic, comparisons, logic, ternary, function calls on builtins.

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
const BUILTINS = {
  fake: (k, seed) => fake(k, seed), fakeList: (n, fields, seed) => fakeList(n, fields, seed),
  shade: (c, p) => toCss(_shade(pc(c), pct(p, 10))), tint: (c, p) => toCss(_tint(pc(c), pct(p, 10))),
  mix: (a, b, p) => toCss(_mix(pc(a), pc(b), pct(p, 50))), alpha: (c, p) => { const x = pc(c); return toCss([x[0], x[1], x[2], x[3] * pct(p, 50)]); },
  onColor: (c, light = '#FFFFFF', dark = '#111114') => (_contrast(pc(c), pc(light)) >= _contrast(pc(c), pc(dark)) ? light : dark),
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
