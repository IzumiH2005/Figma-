// Project model: indexes a parsed .mq tree (tokens, vars, styles, keyframes, components, pages, screens)
import { parse, serialize, saveSource, newId, textOf } from './parse.js';
import { evaluate, Scope } from './expr.js';
import { parseColor, ramp, neutrals, resolveColorFns, toHex } from './color.js';
import { generateSystem, systemTokens } from './system.js';

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
    this.gen = this.nodes.length ? this.nodes[0].pg : undefined;
    this.reindex();
  }

  setTree(nodes) { this.nodes = nodes; this.reindex(); }

  toSource() { return saveSource(this.source, this.nodes, this.gen); }

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
    this.tokens = {}; this.vars = {}; this.styles = {}; this.keyframes = {}; this.components = {}; this.pages = []; this.css = ''; this.flows = {}; this.assets = {};
    this.byId = new Map(); this.parentOf = new Map(); this.styleOrigin = {};
    const fonts = (meta.fonts || '').split(/\s*[|]\s*|\s*,\s*(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
    this.fonts = fonts;

    if (this.kitSource) this._ingest(parse(this.kitSource), true);
    this._ingest(top, false);
    // <system …/> : generated design-system tokens override the kit, never the project's own <tokens>
    const sysNode = top.find((n) => n.tag === 'system');
    if (sysNode) {
      try {
        this.system = generateSystem(sysNode.attrs); this.systemNode = sysNode;
        for (const [k, v] of Object.entries(systemTokens(this.system))) {
          const cur = this.tokens[k]; if (cur && !cur._kit && !cur._sys) continue;
          let arr; if (v && typeof v === 'object') { arr = [v.light, v.dark]; arr._named = { light: v.light, dark: v.dark }; } else arr = [String(v)];
          arr._sys = true; this.tokens[k] = arr;
        }
        if (this.system.scales['font-sans'] && !this.fonts.length) this.fonts = [`${this.system.scales['font-sans']}:400;500;600;700`, ...(this.system.scales['font-display'] !== this.system.scales['font-sans'] ? [`${this.system.scales['font-display']}:600;700;800`] : [])];
      } catch (e) { this.systemError = e.message; }
    }
    this.expandTokens();
    this.typescale = meta.typescale || 'ui';
    const scale = TYPESCALES[this.typescale] || TYPESCALES.ui;
    for (const [k, [size, lh, weight, extra]] of Object.entries(scale)) {
      if (this.styles['t-' + k]) continue;
      this.styles['t-' + k] = { size: String(size), lh: String(lh), weight: String(weight), ...(extra || {}) };
    }

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
          for (const [k, v] of parseKeyLines(n.raw || '')) {
            let arr = splitTop(v, '|').map(unq);
            // named modes: `light: #fff | dark: #0a0a0a` (independent of the order of the project's modes)
            const named = arr.length > 1 && arr.every((x) => /^[a-z][\w-]*\s*:\s*\S/.test(x) && !/^(url|data|linear|radial|conic)\s*:/.test(x));
            if (named) { const map = {}; for (const x of arr) { const i = x.indexOf(':'); map[x.slice(0, i).trim()] = unq(x.slice(i + 1).trim()); } arr = Object.values(map); arr._named = map; }
            if (fromKit) arr._kit = true; this.tokens[k] = arr;
          }
          break;
        case 'vars':
          for (const [k, v] of parseKeyLines(n.raw || '')) this.vars[k] = v;
          break;
        case 'styles':
          for (const [k, a] of parseBlocks(n.raw || '')) { this.styles[k.replace(/^\./, '')] = a; this.styleOrigin[k.replace(/^\./, '')] = fromKit ? 'kit' : 'project'; }
          break;
        case 'keyframes': {
          const frames = parseBlocks(n.raw || '').map(([off, a]) => ({ offset: parseFloat(off) / 100, attrs: a }));
          this.keyframes[n.attrs.name] = frames;
          break;
        }
        case 'css': this.css += n.raw || ''; break;
        case 'assets': // embedded images: `nom: data:image/webp;base64,…` (or a URL); used as <image src=nom/>
          for (const [k, v] of parseKeyLines(n.raw || '')) this.assets[k] = unq(v);
          break;
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

  // ramp(#hex) and neutrals(#hex) generate 50→950 tonal scales (name-50 … name-950)
  expandTokens() {
    for (const [k, vals] of Object.entries({ ...this.tokens })) {
      const v = vals[0];
      if (typeof v !== 'string') continue;
      const m = /^(ramp|neutrals)\((.*)\)$/.exec(v.trim());
      if (!m) continue;
      const arg = m[2].split(',')[0].trim();
      const strength = m[2].split(',')[1];
      const col = parseColor(arg.startsWith('$') ? this.token(arg.slice(1)) : arg);
      if (!col && m[1] === 'ramp') continue;
      const steps = m[1] === 'ramp' ? ramp(col) : neutrals(col, strength ? parseFloat(strength) : undefined);
      for (const [step, hex] of Object.entries(steps)) if (!this.tokens[`${k}-${step}`] || this.tokens[`${k}-${step}`]._gen) { this.tokens[`${k}-${step}`] = [hex]; this.tokens[`${k}-${step}`]._gen = true; }
      this.tokens[k] = [m[1] === 'ramp' ? toHex(col) : steps[500]];
      this.ramps = this.ramps || {};
      this.ramps[k] = Object.keys(steps);
    }
  }

  // token value for current mode (resolves token references and color functions)
  token(name, mode = 0, depth = 0) {
    const t = this.tokens[name];
    if (!t) return undefined;
    let v;
    if (t._named) { const nm = this.modes[mode] || 'light'; v = t._named[nm] ?? t._named[/dark/i.test(nm) ? 'dark' : 'light'] ?? t[0]; }
    else v = t[Math.min(mode, t.length - 1)];
    if (typeof v === 'string' && v.startsWith('$') && depth < 8) {
      const r = this.token(v.slice(1).split('/')[0], mode, depth + 1);
      if (r !== undefined) return v.includes('/') ? withAlpha(r, v.split('/')[1]) : r;
    }
    if (typeof v === 'string' && v.includes('$') && depth < 8) v = v.replace(/\$([A-Za-z_][\w\-.]*)/g, (mm, n) => { const r = this.token(n, mode, depth + 1); return r === undefined ? mm : r; });
    return typeof v === 'string' ? resolveColorFns(v) : v;
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

// Type scales: name -> [size, line-height, weight, extra]
export const TYPESCALES = {
  ui: { display: [56, 1.05, 700, { ls: '-1.5' }], h1: [40, 1.1, 700, { ls: '-1' }], h2: [32, 1.15, 700, { ls: '-0.6' }], h3: [28, 1.2, 700, { ls: '-0.4' }], h4: [24, 1.25, 600, { ls: '-0.3' }], title: [20, 1.3, 600], 'body-lg': [18, 1.5, 400], body: [16, 1.5, 400], 'body-sm': [14, 1.45, 400], label: [14, 1.3, 600], caption: [12, 1.35, 500], overline: [12, 1.3, 600, { upper: true, ls: '1' }] },
  ios: { display: [34, 1.2, 700, { ls: '0.4' }], h1: [28, 1.21, 700], h2: [22, 1.27, 700], h3: [20, 1.25, 600], title: [17, 1.29, 600], body: [17, 1.29, 400], callout: [16, 1.31, 400], subhead: [15, 1.33, 400], footnote: [13, 1.38, 400], caption: [12, 1.33, 400], caption2: [11, 1.18, 400] },
  material: { display: [57, 1.12, 400, { ls: '-0.25' }], h1: [32, 1.25, 400], h2: [28, 1.29, 400], h3: [24, 1.33, 400], title: [22, 1.27, 500], 'title-sm': [16, 1.5, 500, { ls: '0.15' }], body: [16, 1.5, 400, { ls: '0.5' }], 'body-sm': [14, 1.43, 400, { ls: '0.25' }], label: [14, 1.43, 500, { ls: '0.1' }], caption: [12, 1.33, 400, { ls: '0.4' }] },
  web: { display: [72, 1.05, 600, { ls: '-2' }], h1: [56, 1.1, 600, { ls: '-1.5' }], h2: [48, 1.1, 600, { ls: '-1' }], h3: [40, 1.15, 600, { ls: '-0.8' }], h4: [32, 1.2, 600, { ls: '-0.5' }], h5: [24, 1.3, 600], h6: [20, 1.35, 600], title: [18, 1.4, 600], 'body-lg': [18, 1.55, 400], body: [16, 1.55, 400], 'body-sm': [14, 1.5, 400], caption: [12, 1.4, 500], button: [16, 1.2, 600] },
  tailwind: { '7xl': [72, 1, 700], '6xl': [60, 1, 700], '5xl': [48, 1, 700], '4xl': [36, 1.11, 700], '3xl': [30, 1.2, 700], '2xl': [24, 1.33, 600], xl: [20, 1.4, 600], lg: [18, 1.55, 400], base: [16, 1.5, 400], sm: [14, 1.43, 400], xs: [12, 1.33, 400] },
};
export const SPACING = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 120, 160];

export function parseProps(s) {
  const a = s ? parseAttrString(s) : {};
  const out = {};
  for (const [k, v] of Object.entries(a)) {
    if (v === true) { out[k] = true; continue; }
    if (/^\{[\s\S]*\}$/.test(v)) { try { out[k] = evaluate(v.slice(1, -1), new Scope({}, null, { dollar: () => undefined })); continue; } catch (e) { /* fall through */ } }
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

export { parse, serialize, newId, textOf, parseColor };
