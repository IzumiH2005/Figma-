// Maquette markup (.mq) parser & serializer.
// Node shape: { id, tag, attrs: {k: string|true}, children: [], line }
//   text node: { id, tag:'#text', text }
//   raw node (tokens/vars/styles/keyframes/data): { ..., raw: string }

export const RAW_TAGS = new Set(['tokens', 'vars', 'styles', 'keyframes', 'script', 'css', 'flow']);
export const TEXT_TAGS = new Set(['text', 'span', 'b', 'i', 'u', 's', 'a', 'code', 'note', 'textpath']);
const VOID_INLINE = new Set(['br']);

let _id = 0, _gen = 0;
export const newId = () => 'n' + (++_id).toString(36);
export function resetIds(n = 0) { _id = n; }
export function bumpIds(nodes) {
  // make sure future ids don't collide with ids present in a tree
  const walk = (n) => { const m = /^n([0-9a-z]+)$/.exec(n.id || ''); if (m) _id = Math.max(_id, parseInt(m[1], 36)); (n.children || []).forEach(walk); };
  nodes.forEach(walk);
}

export class ParseError extends Error {
  constructor(msg, line, col) { super(`${msg} (ligne ${line}, col ${col})`); this.line = line; this.col = col; }
}

export function parse(src) {
  let i = 0, line = 1, lineStart = 0;
  const gen = ++_gen; // node.pg: which parse a node comes from (saveSource aligns on pos only within it)
  const N = src.length;
  const err = (m) => { throw new ParseError(m, line, i - lineStart + 1); };
  const adv = (k = 1) => { for (let j = 0; j < k; j++) { if (src[i] === '\n') { line++; lineStart = i + 1; } i++; } };
  const peek = (s) => src.startsWith(s, i);
  const ws = () => { while (i < N && /\s/.test(src[i])) adv(); };

  function skipComment() {
    if (peek('<!--')) { const e = src.indexOf('-->', i); if (e < 0) err('Commentaire non fermé'); adv(e + 3 - i); return true; }
    return false;
  }
  function skipLineComment() {
    if (peek('//')) { while (i < N && src[i] !== '\n') adv(); return true; }
    if (peek('/*')) { const e = src.indexOf('*/', i); if (e < 0) err('Commentaire non fermé'); adv(e + 2 - i); return true; }
    return false;
  }

  function readName() {
    const m = /^[A-Za-z_][\w.\-]*/.exec(src.slice(i, i + 80));
    if (!m) err('Nom de balise attendu');
    adv(m[0].length); return m[0];
  }

  function readBalanced(open, close) {
    // assumes src[i] === open
    let depth = 0, start = i, q = null;
    while (i < N) {
      const c = src[i];
      if (q) { if (c === '\\') { adv(2); continue; } if (c === q) q = null; adv(); continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; adv(); continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) { adv(); return src.slice(start, i); } }
      adv();
    }
    err(`'${open}' non fermé`);
  }

  let quoted = null; // keys whose value the author wrote in quotes (kept on save)
  function readAttrs(stopAtBrace = false) {
    const attrs = {}; quoted = null;
    for (;;) {
      ws();
      if (i >= N) return attrs;
      if (skipLineComment()) continue;
      const c = src[i];
      if (c === '>' || peek('/>') || (stopAtBrace && c === '}')) return attrs;
      const m = /^[A-Za-z_@$:.\-][\w:.\-@$]*/.exec(src.slice(i, i + 120));
      if (!m) err(`Attribut invalide près de « ${src.slice(i, i + 12)} »`);
      const key = m[0]; adv(key.length);
      if (src[i] === '=') {
        adv();
        const q0 = src[i] === '"' || src[i] === "'";
        attrs[key] = readValue(stopAtBrace);
        if (q0) (quoted = quoted || []).push(key);
      } else attrs[key] = true;
    }
  }

  function readValue(stopAtBrace) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c; adv(); let s = '';
      while (i < N && src[i] !== q) { if (src[i] === '\\' && src[i + 1] === q) { s += q; adv(2); continue; } s += src[i]; adv(); }
      if (src[i] !== q) err('Chaîne non fermée');
      adv(); return s;
    }
    if (c === '{') return readBalanced('{', '}');
    // bare word: until whitespace or > or /> ; parentheses balanced
    let s = '', depth = 0;
    while (i < N) {
      const d = src[i];
      if (depth === 0 && (/\s/.test(d) || d === '>' || (d === '/' && src[i + 1] === '>') || (stopAtBrace && d === '}'))) break;
      if (d === '(' || d === '[') depth++;
      if (d === ')' || d === ']') depth--;
      s += d; adv();
    }
    return s;
  }

  // Comments are kept as metadata so that a round trip (editor save, drive --write)
  // doesn't lose them: node.before = comments on the lines above, node.trail = comments
  // on the same line after it, parent.tail = comments before the closing tag.
  function parseChildren(parentTag, textMode) {
    const kids = [];
    let buf = '', bufLine = line, bufStart = i, pending = [], pendingGap = false, pendingStart = 0, lastEnd = i;
    // node.gap = a blank line preceded it in the source (kept on save)
    const blank = (a, b) => /\n[ \t]*\r?\n/.test(src.slice(a, b));
    const push = (k, start, end) => {
      const gap = pending.length ? pendingGap : blank(lastEnd, start);
      if (gap && kids.length) k.gap = true;
      if (pending.length) { k.before = pending; k.cpos = pendingStart; pending = []; }
      if (k.tag !== '#text') { k.pg = gen; if (k.pos === undefined) { k.pos = start; k.end = end; } }
      kids.push(k); lastEnd = i;
    };
    const flush = () => {
      if (!buf) return;
      if (textMode) push({ id: newId(), tag: '#text', text: buf, line: bufLine }, bufStart);
      else {
        const t = buf.trim();
        if (t) push({ id: newId(), tag: 'text', attrs: {}, children: [{ id: newId(), tag: '#text', text: t.replace(/\s+/g, ' ') }], line: bufLine, implicit: true }, bufStart + buf.search(/\S/), bufStart + buf.trimEnd().length);
      }
      buf = '';
    };
    const keep = (s) => {
      const raw = src.slice(s, i), prev = kids[kids.length - 1];
      if (!textMode && prev && !pending.length && !src.slice(lastEnd, s).includes('\n')) { (prev.trail = prev.trail || []).push(raw); prev.tend = lastEnd = i; }
      else { if (!pending.length) { pendingGap = blank(lastEnd, s); pendingStart = s; } pending.push(raw); }
    };
    const close = () => { if (pending.length) kids.tail = pending; return kids; };
    while (i < N) {
      if (peek('<!--')) { flush(); const s = i; skipComment(); keep(s); continue; }
      if (!textMode && (src[i] === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) && /(^|\s)$/.test(src[i - 1] || ' ')) { flush(); const s = i; skipLineComment(); keep(s); continue; }
      if (peek('</')) {
        flush();
        adv(2); const name = readName(); ws();
        if (src[i] !== '>') err('> attendu');
        adv();
        if (name !== parentTag) err(`Balise fermante </${name}> inattendue (attendu </${parentTag}>)`);
        return close();
      }
      if (src[i] === '<' && /[A-Za-z]/.test(src[i + 1] || '')) { flush(); const s0 = i; push(parseElement(), s0); continue; }
      if (!buf) { bufLine = line; bufStart = i; }
      if (textMode && src[i] === '{') { buf += readBalanced('{', '}'); continue; }
      buf += src[i]; adv();
    }
    flush();
    if (parentTag !== null) err(`<${parentTag}> non fermé`);
    return close();
  }

  function parseElement() {
    const startLine = line, startPos = i;
    adv(); // <
    const tag = readName();
    const attrs = readAttrs();
    const node = { id: newId(), tag, attrs, children: [], line: startLine, pos: startPos };
    if (quoted) node.quoted = quoted;
    if (peek('/>')) { adv(2); node.end = i; return node; }
    if (src[i] !== '>') err(`> attendu pour <${tag}>`);
    adv();
    if (VOID_INLINE.has(tag)) { node.end = i; return node; }
    node.inner = i;
    if (RAW_TAGS.has(tag)) {
      const close = `</${tag}>`; const e = src.indexOf(close, i);
      if (e < 0) err(`<${tag}> non fermé`);
      node.raw = src.slice(i, e); adv(e + close.length - i);
      node.end = i; return node;
    }
    node.children = parseChildren(tag, TEXT_TAGS.has(tag));
    if (node.children.tail) { node.tail = node.children.tail; delete node.children.tail; }
    if (node.children.length && !src.slice(startPos, i).includes('\n')) node.oneLine = true; // <row><a/><b/></row> stays on one line
    node.end = i; return node;
  }

  const roots = parseChildren(null, false);
  if (roots.tail) { if (roots.length) roots[roots.length - 1].after = roots.tail; delete roots.tail; }
  return roots;
}

// ---------------------------------------------------------------- serialize

const needsQuote = (v) => v === '' || /[\s>"']/.test(v.replace(/\([^)]*\)/g, '()')) || v.includes('/>');
export function fmtAttr(k, v, keepQuotes = false) {
  if (v === true) return k;
  v = String(v);
  if (v.startsWith('{') && v.endsWith('}')) return `${k}=${v}`;
  if (keepQuotes || needsQuote(v)) return v.includes('"') ? `${k}='${v}'` : `${k}="${v}"`;
  return `${k}=${v}`;
}

export function serialize(nodes, indent = 0) {
  return nodes.map((n) => serializeNode(n, indent)).join('\n');
}

function inlineText(n) {
  const pre = (n.before || []).join('') + (n.trail || []).join('');
  if (n.tag === '#text') return pre + n.text;
  if (n.tag === 'br') return pre + '<br/>';
  const a = attrsOf(n);
  return `${pre}<${n.tag}${a}>${(n.children || []).map(inlineText).join('')}${(n.tail || []).join('')}</${n.tag}>`;
}

export function serializeNode(n, indent = 0) {
  const pad = '  '.repeat(indent);
  const before = (n.gap ? '\n' : '') + (n.before || []).map((c) => pad + c + '\n').join('');
  const trail = (n.trail || []).map((c) => ' ' + c).join('');
  const after = (n.after || []).map((c) => '\n' + pad + c).join('');
  return before + nodeBody(n, indent, pad) + trail + after;
}

// Save a tree back into its original source, rewriting only what changed: attribute edits
// are patched in place, a changed subtree is re-serialized at its own indentation, and
// everything else (comments, blank lines, line breaks inside tags, one-line rows) is kept.
export function saveSource(src, nodes, gen) {
  const full = () => serialize(nodes) + '\n';
  if (!src) return full();
  let orig; try { orig = parse(src); } catch (e) { return full(); }
  const edits = [];
  const sameAttrs = (a, b) => { const ka = Object.keys(a || {}), kb = Object.keys(b || {}); return ka.length === kb.length && ka.every((k) => k in (b || {}) && String(a[k]) === String(b[k])); };
  const attrDiff = (a = {}, b = {}) => { const d = {}; for (const k in a) if (!(k in b)) d[k] = null; for (const k in b) if (!(k in a) || String(a[k]) !== String(b[k])) d[k] = b[k]; return d; };
  const flat = (k) => (k.implicit ? '#' + inlineText(k) : null);
  const lineStart = (p) => src.lastIndexOf('\n', p - 1) + 1;
  const levelAt = (p) => { const ls = lineStart(p), pre = src.slice(ls, p); return pre.trim() ? -1 : Math.floor(pre.replace(/\t/g, '  ').length / 2); };
  const replace = (o, n) => {
    const lv = Math.max(0, levelAt(o.pos));
    edits.push({ pos: o.pos, end: o.end, text: nodeBody(n, lv, '  '.repeat(lv)).slice(2 * lv) });
  };
  const remove = (o) => {
    const s0 = o.cpos !== undefined ? o.cpos : o.pos, e0 = o.tend || o.end, ls = lineStart(s0);
    const nl = src.indexOf('\n', e0), rest = src.slice(e0, nl < 0 ? src.length : nl);
    if (!src.slice(ls, s0).trim() && !rest.trim()) {
      let from = ls, to = nl < 0 ? src.length : nl + 1;
      if (o.gap) from = src.lastIndexOf('\n', ls - 2) + 1; // take the blank line above with it
      edits.push({ pos: from, end: to, text: '' });
    } else edits.push({ pos: s0, end: e0, text: '' });
  };
  // pair old and new children: by source position when the new node comes from the same
  // parse as the file (insertions/deletions/moves stay local), else by index
  const align = (oc, nc) => {
    const byPos = new Map(oc.map((a) => [a.pos, a])), used = new Set(), pairs = [];
    let last = -1;
    for (const b of nc) {
      const a = gen !== undefined && b.pg === gen ? byPos.get(b.pos) : undefined;
      if (a && !used.has(a)) { if (a.pos < last) return null; used.add(a); last = a.pos; pairs.push([a, b]); } else pairs.push([null, b]);
    }
    if (gen === undefined || !used.size) { if (oc.length !== nc.length) return null; return oc.map((a, j) => [a, nc[j]]); }
    const out = []; let k = 0;
    for (const [a, b] of pairs) {
      if (a) { while (oc[k] !== a) out.push([oc[k++], null]); k++; }
      out.push([a, b]);
    }
    while (k < oc.length) out.push([oc[k++], null]);
    return out;
  };
  const kids = (o, oc, nc, inner, oneLine, parentLevel) => {
    const pairs = align(oc, nc); if (!pairs) return false;
    if (oneLine && pairs.some(([a, b]) => !a || !b)) return false;
    const sibLevel = oc.length ? levelAt(oc[0].pos) : parentLevel + 1;
    if (sibLevel < 0 && pairs.some(([a]) => !a)) return false;
    let at = inner, ins = '';
    const flushIns = () => { if (ins) { edits.push({ pos: at, end: at, text: ins }); ins = ''; } };
    for (const [a, b] of pairs) {
      if (a && b) {
        flushIns();
        if (flat(a) !== null || flat(b) !== null) { if (flat(a) !== flat(b)) { if (oneLine || flat(a) === null || flat(b) === null) return false; replace(a, b); } }
        else if (!match(a, b)) { if (oneLine) return false; replace(a, b); }
        at = a.tend || a.end;
      } else if (a) remove(a);
      else ins += '\n' + serializeNode(b, Math.max(0, sibLevel));
    }
    if (ins && at === inner && inner === 0) ins = ins.slice(1) + '\n';
    flushIns();
    return true;
  };
  const match = (o, n) => { const m = edits.length, r = match0(o, n); if (!r) edits.length = m; return r; };
  const match0 = (o, n) => { // false → the caller rewrites the whole element
    if (o.tag !== n.tag || o.pos === undefined || o.end === undefined) return false;
    if (o.raw !== undefined || n.raw !== undefined) { if (o.raw !== n.raw) return false; }
    else {
      const oc = o.children || [], nc = n.children || [];
      if (TEXT_TAGS.has(o.tag)) { if (oc.map(inlineText).join('') !== nc.map(inlineText).join('')) return false; }
      else if (!oc.length || !nc.length) { if (oc.length !== nc.length || (o.tail || []).join() !== (n.tail || []).join()) return false; }
      else if (!kids(o, oc, nc, o.inner, o.oneLine, Math.max(0, levelAt(o.pos)))) return false;
    }
    if (!sameAttrs(o.attrs, n.attrs)) edits.push({ pos: o.pos, attrs: attrDiff(o.attrs, n.attrs) });
    return true;
  };
  if (!kids(null, orig, nodes, 0, false, -1)) return full();
  let out = src;
  // apply from the end so earlier offsets stay valid; at the same offset, an attribute patch
  // (which reads the tag starting there) goes before an insertion or a removal
  const endOf = (e) => (e.attrs ? Infinity : e.end);
  for (const e of edits.sort((a, b) => b.pos - a.pos || endOf(b) - endOf(a))) {
    if (e.text !== undefined) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
    else out = patchSource(out, [e]);
  }
  return out;
}

const attrsOf = (n) => Object.entries(n.attrs || {}).map(([k, v]) => ' ' + fmtAttr(k, v, !!n.quoted && n.quoted.includes(k))).join('');

function nodeBody(n, indent, pad) {
  if (n.tag === '#text') return pad + n.text.trim();
  const a = attrsOf(n);
  if (n.raw !== undefined) {
    const body = dedent(n.raw).split('\n').map((l) => (l.trim() ? pad + '  ' + l : '')).join('\n');
    return `${pad}<${n.tag}${a}>\n${body}\n${pad}</${n.tag}>`;
  }
  const kids = n.children || [], tail = n.tail || [];
  if (TEXT_TAGS.has(n.tag)) return `${pad}<${n.tag}${a}>${kids.map(inlineText).join('')}${tail.join('')}</${n.tag}>`;
  if (!kids.length && !tail.length) return `${pad}<${n.tag}${a}/>`;
  if (n.oneLine && !tail.length && kids.every((c) => !c.before && !c.gap && !c.after && !c.trail && c.raw === undefined)) {
    const one = kids.map((c) => serializeNode(c, 0));
    if (one.every((x) => !x.includes('\n'))) return `${pad}<${n.tag}${a}>${one.join('')}</${n.tag}>`;
  }
  const inner = [...kids.map((c) => serializeNode(c, indent + 1)), ...tail.map((c) => pad + '  ' + c)];
  return `${pad}<${n.tag}${a}>\n${inner.join('\n')}\n${pad}</${n.tag}>`;
}

function dedent(s) {
  const lines = s.replace(/^\n+|\s+$/g, '').split('\n');
  const m = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length));
  return lines.map((l) => l.slice(isFinite(m) ? m : 0)).join('\n');
}

export function textOf(n) {
  if (!n) return '';
  if (n.tag === '#text') return n.text;
  return (n.children || []).map(textOf).join('');
}

export function clone(n, freshIds = true) {
  const c = { ...n, id: freshIds ? newId() : n.id };
  if (n.attrs) c.attrs = { ...n.attrs };
  if (n.children) c.children = n.children.map((k) => clone(k, freshIds));
  delete c.implicit;
  if (freshIds) { delete c.before; delete c.trail; delete c.tail; delete c.after; } // a copy doesn't duplicate the comments
  return c;
}

// Patch attributes of elements directly in the source text (keeps comments & formatting).
// edits: [{ pos, attrs: {k: v|null} }]  (pos = offset of the element's "<")
export function patchSource(src, edits) {
  const sorted = [...edits].filter((e) => e.pos !== undefined).sort((a, b) => b.pos - a.pos);
  for (const e of sorted) {
    if (src[e.pos] !== '<') continue;
    // find end of opening tag
    let i = e.pos + 1, q = null, depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (q) { if (c === q) q = null; i++; continue; }
      if (c === '"' || c === "'") { q = c; i++; continue; }
      if (c === '{' || c === '(') depth++;
      if (c === '}' || c === ')') depth--;
      if (depth === 0 && c === '>') break;
      i++;
    }
    let open = src.slice(e.pos, i + 1);
    for (const [k, v] of Object.entries(e.attrs)) {
      const r = attrRange(open, k);
      if (r) open = open.slice(0, r[0]) + (v === null ? '' : /^\s*/.exec(open.slice(r[0]))[0].replace(/^$/, ' ') + fmtAttr(k, v, /^[^=]*=["']/.test(open.slice(r[0], r[1]).trim()))) + open.slice(r[1]);
      else if (v !== null) open = open.replace(/(\s*\/?>)$/, ` ${fmtAttr(k, v)}$1`);
    }
    src = src.slice(0, e.pos) + open + src.slice(i + 1);
  }
  return src;
}

// Patch a class inside <styles> raw text: .name { k=v }
export function patchStyle(src, className, attrs) {
  const re = new RegExp(`(\\.${className.replace(/[-]/g, '\\-')}\\s*\\{)([^}]*)(\\})`);
  return src.replace(re, (m, a, body, c) => {
    for (const [k, v] of Object.entries(attrs)) {
      const kr = new RegExp(`(^|\\s)${k}=("[^"]*"|\\S+)`);
      if (kr.test(body)) body = body.replace(kr, (mm, sp) => (v === null ? '' : `${sp}${fmtAttr(k, v)}`));
      else if (v !== null) body = body.replace(/\s*$/, ` ${fmtAttr(k, v)} `);
    }
    return a + body + c;
  });
}

// [start, end) of " key=value" (including leading whitespace) inside an opening tag
function attrRange(open, key) {
  let i = 1; while (i < open.length && /[\w.\-]/.test(open[i])) i++; // tag name
  while (i < open.length) {
    const ws = i;
    while (i < open.length && /\s/.test(open[i])) i++;
    if (open[i] === '>' || open[i] === '/' && open[i + 1] === '>') return null;
    const ks = i;
    while (i < open.length && /[^\s=>]/.test(open[i]) && !(open[i] === '/' && open[i + 1] === '>')) i++;
    const k = open.slice(ks, i);
    if (open[i] === '=') {
      i++;
      const c = open[i];
      if (c === '"' || c === "'") { i = open.indexOf(c, i + 1) + 1; }
      else if (c === '{') { let d = 0; while (i < open.length) { if (open[i] === '{') d++; else if (open[i] === '}') { d--; if (d === 0) { i++; break; } } i++; } }
      else { let d = 0; while (i < open.length) { const x = open[i]; if (d === 0 && (/\s/.test(x) || x === '>' || (x === '/' && open[i + 1] === '>'))) break; if (x === '(' || x === '[') d++; if (x === ')' || x === ']') d--; i++; } }
    }
    if (k === key) return [ws, i];
    if (i === ks) i++;
  }
  return null;
}
