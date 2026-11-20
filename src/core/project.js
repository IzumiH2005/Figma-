// Project model: indexes a parsed .mq tree (tokens, vars, styles, keyframes, components, pages, screens)
import { parse, serialize, newId, textOf } from './parse.js';
import { evaluate, Scope } from './expr.js';

export const DEVICES = {
  'iphone-16': { w: 393, h: 852, safeTop: 59, safeBottom: 34, radius: 55, kind: 'phone', island: true },
  'iphone-16-pro-max': { w: 440, h: 956, safeTop: 62, safeBottom: 34, radius: 60, kind: 'phone', island: true },
  'iphone-15': { w: 393, h: 852, safeTop: 59, safeBottom: 34, radius: 55, kind: 'phone', island: true },
  'iphone-se': { w: 375, h: 667, safeTop: 20, safeBottom: 0, radius: 0, kind: 'phone' },
  'iphone-mini': { w: 375, h: 812, safeTop: 50, safeBottom: 34, radius: 44, kind: 'phone', notch: true },
  'pixel-9': { w: 412, h: 915, safeTop: 40, safeBottom: 24, radius: 36, kind: 'phone', punch: true },
  'android': { w: 360, h: 800, safeTop: 32, safeBottom: 24, radius: 28, kind: 'phone', punch: true },
  'ipad': { w: 820, h: 1180, safeTop: 24, safeBottom: 20, radius: 24, kind: 'tablet' },
  'ipad-landscape': { w: 1180, h: 820, safeTop: 24, safeBottom: 20, radius: 24, kind: 'tablet' },
  'watch': { w: 205, h: 251, safeTop: 0, safeBottom: 0, radius: 54, kind: 'watch' },
  'desktop': { w: 1440, h: 900, safeTop: 0, safeBottom: 0, radius: 0, kind: 'desktop' },
  'laptop': { w: 1280, h: 800, safeTop: 0, safeBottom: 0, radius: 0, kind: 'desktop' },
  'hd': { w: 1920, h: 1080, safeTop: 0, safeBottom: 0, radius: 0, kind: 'desktop' },
  'tablet': { w: 768, h: 1024, safeTop: 0, safeBottom: 0, radius: 0, kind: 'tablet' },
  'mobile-web': { w: 390, h: 844, safeTop: 0, safeBottom: 0, radius: 0, kind: 'phone' },
  'square': { w: 1080, h: 1080, safeTop: 0, safeBottom: 0, radius: 0, kind: 'social' },
  'story': { w: 1080, h: 1920, safeTop: 0, safeBottom: 0, radius: 0, kind: 'social' },
  'og': { w: 1200, h: 630, safeTop: 0, safeBottom: 0, radius: 0, kind: 'social' },
};

// split "a | b | c" at top level (not inside parens/quotes)
export function splitTop(s, sep) {
  const out = []; let depth = 0, q = null, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') depth--;
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const unq = (s) => (/^(["']).*\1$/.test(s) ? s.slice(1, -1) : s);

function parseKeyLines(raw) {
  const out = [];
  for (let line of raw.split('\n')) {
    line = line.replace(/(^|\s)\/\/.*$/, '').trim();
    if (!line) continue;
    const m = /^([$\w.\-]+)\s*[:=]\s*(.*)$/.exec(line);
    if (m) out.push([m[1].replace(/^\$/, ''), m[2].trim().replace(/;$/, '')]);
  }
  return out;
}

// Parses "attrs" written like markup attributes: `fill=$bg radius=12 row gap=8`
export function parseAttrString(s) {
  const nodes = parse(`<x ${s}/>`);
  return nodes[0].attrs;
}

function parseBlocks(raw) {
  // ".name { attrs }" or "50 { attrs }"
  const out = []; const re = /([.\w\-%]+)\s*\{([^}]*)\}/g; let m;
  while ((m = re.exec(raw))) out.push([m[1], parseAttrString(m[2].replace(/\n/g, ' '))]);
  return out;
}

export class Project {
  constructor(source, opts = {}) {
    this.opts = opts;
    this.kitSource = opts.kit || '';
    this.setSource(source);
  }

  setSource(source) {
    this.source = source;
    this.nodes = parse(source);
    this.reindex();
  }

  setTree(nodes) { this.nodes = nodes; this.reindex(); }

  toSource() { return serialize(this.nodes) + '\n'; }

  get rootNode() {
    return this.nodes.find((n) => n.tag === 'project') || null;
  }
  get topLevel() {
    const r = this.rootNode; return r ? r.children : this.nodes;
  }

  reindex() {
    const top = this.topLevel;
    const meta = this.rootNode ? this.rootNode.attrs : {};
    this.meta = meta;
    this.name = meta.name || 'Sans titre';
    this.modes = (meta.modes || 'default').split(/[,\s|]+/).filter(Boolean);
    this.tokens = {}; this.vars = {}; this.styles = {}; this.keyframes = {}; this.components = {}; this.pages = []; this.css = ''; this.flows = {};
    this.byId = new Map(); this.parentOf = new Map();
    const fonts = (meta.fonts || '').split(/\s*[|]\s*|\s*,\s*(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
    this.fonts = fonts;

    if (this.kitSource) this._ingest(parse(this.kitSource), true);
    this._ingest(top, false);

    const index = (n, parent) => {
      this.byId.set(n.id, n);
      if (parent) this.parentOf.set(n.id, parent);
      (n.children || []).forEach((c) => index(c, n));
    };
    this.nodes.forEach((n) => index(n, null));
    // auto-place screens on the canvas
    for (const page of this.pages) {
      let cx = 0;
      for (const s of page.children) {
        if (s.tag === '#text') continue;
        const d = this.sizeOf(s);
        if (s.attrs.x === undefined) s._autoX = cx; else s._autoX = undefined;
        if (s.attrs.y === undefined) s._autoY = 0;
        const x = s.attrs.x !== undefined ? +s.attrs.x : cx;
        cx = Math.max(cx, x + d.w + 100);
      }
    }
  }

  _ingest(top, fromKit) {
    const loosePage = { id: 'page-default', tag: 'page', attrs: { name: 'Page 1' }, children: [], virtual: true };
    for (const n of top) {
      switch (n.tag) {
        case 'tokens':
          for (const [k, v] of parseKeyLines(n.raw || '')) this.tokens[k] = splitTop(v, '|').map(unq);
          break;
        case 'vars':
          for (const [k, v] of parseKeyLines(n.raw || '')) this.vars[k] = v;
          break;
        case 'styles':
          for (const [k, a] of parseBlocks(n.raw || '')) this.styles[k.replace(/^\./, '')] = a;
          break;
        case 'keyframes': {
          const frames = parseBlocks(n.raw || '').map(([off, a]) => ({ offset: parseFloat(off) / 100, attrs: a }));
          this.keyframes[n.attrs.name] = frames;
          break;
        }
        case 'css': this.css += n.raw || ''; break;
        case 'flow': this.flows[n.attrs.name || 'main'] = n.raw || ''; break;
        case 'component': {
          const name = n.attrs.name;
          if (!name) break;
          const root = (n.children || []).find((c) => c.tag !== '#text') || null;
          this.components[name] = { name, node: n, root, props: parseProps(n.attrs.props || ''), fromKit, desc: n.attrs.desc || '' };
          break;
        }
        case 'page': if (!fromKit) this.pages.push(n); break;
        case 'screen': case 'note': case 'frame': case 'row': case 'col': case 'stack': case 'grid':
          if (!fromKit) loosePage.children.push(n); break;
        default: break;
      }
    }
    if (loosePage.children.length) this.pages.unshift(loosePage);
  }

  sizeOf(screen) {
    const d = DEVICES[screen.attrs.device] || null;
    const w = screen.attrs.w !== undefined && !isNaN(+screen.attrs.w) ? +screen.attrs.w : d ? d.w : 390;
    let h = screen.attrs.h !== undefined && !isNaN(+screen.attrs.h) ? +screen.attrs.h : d ? d.h : 844;
    return { w, h, device: d };
  }

  screens(pageIndex = null) {
    const pages = pageIndex === null ? this.pages : [this.pages[pageIndex]].filter(Boolean);
    return pages.flatMap((p) => p.children.filter((s) => s.tag === 'screen'));
  }
  screen(name) { return this.screens().find((s) => s.attrs.name === name) || null; }
  startScreen() { const all = this.screens(); return all.find((s) => s.attrs.start) || all[0] || null; }

  // token value for current mode (resolves token references)
  token(name, mode = 0, depth = 0) {
    const t = this.tokens[name];
    if (!t) return undefined;
    let v = t[Math.min(mode, t.length - 1)];
    if (typeof v === 'string' && v.startsWith('$') && depth < 8) {
      const r = this.token(v.slice(1).split('/')[0], mode, depth + 1);
      if (r !== undefined) return v.includes('/') ? withAlpha(r, v.split('/')[1]) : r;
    }
    return v;
  }

  initialVars() {
    const out = {}; const sc = new Scope({}, null, { dollar: (n) => out[n] });
    for (const [k, v] of Object.entries(this.vars)) {
      try { out[k] = evaluate(v, sc); } catch (e) { out[k] = unq(v); }
    }
    return out;
  }

  pathOf(id) {
    const out = []; let n = this.byId.get(id);
    while (n) { out.unshift(n); n = this.parentOf.get(n.id); }
    return out;
  }
  screenOf(id) { return this.pathOf(id).find((n) => n.tag === 'screen') || null; }
  parent(id) { return this.parentOf.get(id) || null; }
}

export function parseProps(s) {
  const a = s ? parseAttrString(s) : {};
  const out = {};
  for (const [k, v] of Object.entries(a)) {
    if (v === true) { out[k] = true; continue; }
    out[k] = coerce(v);
  }
  return out;
}

export function coerce(v) {
  if (typeof v !== 'string') return v;
  if (v === 'true') return true; if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  return unq(v);
}

export function withAlpha(color, a) {
  let alpha = parseFloat(a); if (alpha > 1) alpha /= 100;
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${c[0]},${c[1]},${c[2]},${+(c[3] * alpha).toFixed(3)})`;
}

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0], red: [255, 0, 0, 1] };
export function parseColor(s) {
  if (!s || typeof s !== 'string') return null;
  s = s.trim();
  if (NAMED[s]) return NAMED[s].slice();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = (k) => parseInt(h.slice(k, k + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? +(n(6) / 255).toFixed(3) : 1];
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
}

export { parse, serialize, newId, textOf };
