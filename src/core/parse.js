// Maquette markup (.mq) parser & serializer.
// Node shape: { id, tag, attrs: {k: string|true}, children: [], line }
//   text node: { id, tag:'#text', text }
//   raw node (tokens/vars/styles/keyframes/data): { ..., raw: string }

export const RAW_TAGS = new Set(['tokens', 'vars', 'styles', 'keyframes', 'script', 'css', 'flow']);
export const TEXT_TAGS = new Set(['text', 'span', 'b', 'i', 'u', 's', 'a', 'code', 'note', 'textpath']);
const VOID_INLINE = new Set(['br']);

let _id = 0;
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

  function readAttrs(stopAtBrace = false) {
    const attrs = {};
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
        attrs[key] = readValue(stopAtBrace);
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

  function parseChildren(parentTag, textMode) {
    const kids = [];
    let buf = '', bufLine = line;
    const flush = () => {
      if (!buf) return;
      if (textMode) kids.push({ id: newId(), tag: '#text', text: buf, line: bufLine });
      else {
        const t = buf.trim();
        if (t) kids.push({ id: newId(), tag: 'text', attrs: {}, children: [{ id: newId(), tag: '#text', text: t.replace(/\s+/g, ' ') }], line: bufLine, implicit: true });
      }
      buf = '';
    };
    while (i < N) {
      if (skipComment()) continue;
      if (!textMode && (src[i] === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) && /(^|\s)$/.test(src[i - 1] || ' ')) { flush(); skipLineComment(); continue; }
      if (peek('</')) {
        flush();
        adv(2); const name = readName(); ws();
        if (src[i] !== '>') err('> attendu');
        adv();
        if (name !== parentTag) err(`Balise fermante </${name}> inattendue (attendu </${parentTag}>)`);
        return kids;
      }
      if (src[i] === '<' && /[A-Za-z]/.test(src[i + 1] || '')) { flush(); kids.push(parseElement()); continue; }
      if (!buf) bufLine = line;
      if (textMode && src[i] === '{') { buf += readBalanced('{', '}'); continue; }
      buf += src[i]; adv();
    }
    flush();
    if (parentTag !== null) err(`<${parentTag}> non fermé`);
    return kids;
  }

  function parseElement() {
    const startLine = line, startPos = i;
    adv(); // <
    const tag = readName();
    const attrs = readAttrs();
    const node = { id: newId(), tag, attrs, children: [], line: startLine, pos: startPos };
    if (peek('/>')) { adv(2); return node; }
    if (src[i] !== '>') err(`> attendu pour <${tag}>`);
    adv();
    if (VOID_INLINE.has(tag)) return node;
    if (RAW_TAGS.has(tag)) {
      const close = `</${tag}>`; const e = src.indexOf(close, i);
      if (e < 0) err(`<${tag}> non fermé`);
      node.raw = src.slice(i, e); adv(e + close.length - i);
      return node;
    }
    node.children = parseChildren(tag, TEXT_TAGS.has(tag));
    return node;
  }

  const roots = parseChildren(null, false);
  return roots;
}

// ---------------------------------------------------------------- serialize

const needsQuote = (v) => v === '' || /[\s>"']/.test(v.replace(/\([^)]*\)/g, '()')) || v.includes('/>');
export function fmtAttr(k, v) {
  if (v === true) return k;
  v = String(v);
  if (v.startsWith('{') && v.endsWith('}')) return `${k}=${v}`;
  if (needsQuote(v)) return v.includes('"') ? `${k}='${v}'` : `${k}="${v}"`;
  return `${k}=${v}`;
}

export function serialize(nodes, indent = 0) {
  return nodes.map((n) => serializeNode(n, indent)).join('\n');
}

function inlineText(n) {
  if (n.tag === '#text') return n.text;
  if (n.tag === 'br') return '<br/>';
  const a = Object.entries(n.attrs || {}).map(([k, v]) => ' ' + fmtAttr(k, v)).join('');
  return `<${n.tag}${a}>${(n.children || []).map(inlineText).join('')}</${n.tag}>`;
}

export function serializeNode(n, indent = 0) {
  const pad = '  '.repeat(indent);
  if (n.tag === '#text') return pad + n.text.trim();
  const a = Object.entries(n.attrs || {}).map(([k, v]) => ' ' + fmtAttr(k, v)).join('');
  if (n.raw !== undefined) {
    const body = dedent(n.raw).split('\n').map((l) => (l.trim() ? pad + '  ' + l : '')).join('\n');
    return `${pad}<${n.tag}${a}>\n${body}\n${pad}</${n.tag}>`;
  }
  const kids = n.children || [];
  if (TEXT_TAGS.has(n.tag)) return `${pad}<${n.tag}${a}>${kids.map(inlineText).join('')}</${n.tag}>`;
  if (!kids.length) return `${pad}<${n.tag}${a}/>`;
  return `${pad}<${n.tag}${a}>\n${kids.map((c) => serializeNode(c, indent + 1)).join('\n')}\n${pad}</${n.tag}>`;
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
      if (r) open = open.slice(0, r[0]) + (v === null ? '' : ' ' + fmtAttr(k, v)) + open.slice(r[1]);
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
