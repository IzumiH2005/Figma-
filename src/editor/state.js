// Editor state, history and tree operations
import { MQ, store } from './dom.js';

const CONTAINERS = new Set(['frame', 'row', 'col', 'grid', 'stack', 'box', 'screen', 'card', 'section', 'header', 'footer', 'nav', 'list', 'button']);
export const isContainer = (n) => n && CONTAINERS.has(n.tag);

function cloneTree(nodes) { return nodes.map((n) => MQ.clone(n, false)); }

export class App {
  constructor() {
    this.listeners = new Set();
    this.files = []; this.fileIndex = 0;
    this.project = null; this.pageIndex = 0;
    this.selection = []; this.hover = null;
    this.tool = 'move'; this.mode = 0;
    this.zoom = 0.5; this.panX = 60; this.panY = 60;
    this.protoView = false;
    this.undoStack = []; this.redoStack = [];
    this.error = null;
    this.clipboard = null;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what = 'all') { for (const fn of this.listeners) fn(what); }

  loadFile(i) {
    this.fileIndex = i;
    const f = this.files[i];
    try { this.project = MQ.loadProject(f.source); this.error = null; }
    catch (e) { this.error = e; this.project = MQ.loadProject(''); }
    MQ.ensureFonts(this.project);
    this.pageIndex = 0; this.selection = []; this.undoStack = []; this.redoStack = [];
    this.mode = 0;
    this.emit('file');
  }

  get page() { return this.project.pages[this.pageIndex] || null; }
  pageList() {
    const pg = this.page;
    if (pg && !pg.virtual) return pg.children;
    if (this.project.rootNode) return this.project.rootNode.children;
    return this.project.nodes;
  }
  get source() { return this.project.toSource(); }
  node(id) { return this.project.byId.get(id); }
  parent(id) { return this.project.parent(id); }
  get selNodes() { return this.selection.map((id) => this.node(id)).filter(Boolean); }

  select(ids, add = false) {
    ids = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (add) { const s = new Set(this.selection); for (const id of ids) s.has(id) ? s.delete(id) : s.add(id); this.selection = [...s]; }
    else this.selection = ids;
    this.emit('selection');
  }

  // ---- history
  snapshot() { return { nodes: cloneTree(this.project.nodes), sel: [...this.selection], page: this.pageIndex }; }
  begin() { this.undoStack.push(this.snapshot()); if (this.undoStack.length > 200) this.undoStack.shift(); this.redoStack = []; }
  commit(what = 'doc') {
    this.project.reindex();
    this.selection = this.selection.filter((id) => this.project.byId.has(id));
    this.persist();
    this.emit(what);
  }
  change(fn, what) { this.begin(); fn(); this.commit(what); }
  undo() { const s = this.undoStack.pop(); if (!s) return; this.redoStack.push(this.snapshot()); this.restore(s); }
  redo() { const s = this.redoStack.pop(); if (!s) return; this.undoStack.push(this.snapshot()); this.restore(s); }
  restore(s) { this.project.setTree(s.nodes); this.selection = s.sel.filter((id) => this.project.byId.has(id)); this.pageIndex = Math.min(s.page, this.project.pages.length - 1); this.persist(); this.emit('doc'); }

  setSource(src) {
    // full replace from code editor, preserving selection by path
    const paths = this.selection.map((id) => this.indexPath(id));
    this.begin();
    try {
      this.project.setSource(src);
      MQ.bumpIds(this.project.nodes);
      this.error = null;
    } catch (e) { this.undoStack.pop(); this.error = e; this.emit('error'); return false; }
    MQ.ensureFonts(this.project);
    this.selection = paths.map((p) => this.byIndexPath(p)).filter(Boolean).map((n) => n.id);
    this.persist();
    this.emit('doc');
    return true;
  }

  indexPath(id) {
    const path = []; let n = this.node(id);
    while (n) { const p = this.parent(n.id); const sib = p ? p.children : this.project.nodes; path.unshift(sib.indexOf(n)); n = p; }
    return path;
  }
  byIndexPath(path) { let list = this.project.nodes, n = null; for (const i of path) { n = list[i]; if (!n) return null; list = n.children || []; } return n; }

  persist() {
    const f = this.files[this.fileIndex];
    if (!f) return;
    f.source = this.project.toSource();
    store('draft:' + f.file, { base: f.baseHash, source: f.source, t: Date.now() });
  }

  // ---- tree ops
  siblings(id) { const p = this.parent(id); return p ? p.children : this.project.nodes; }

  setAttr(ids, key, value) {
    for (const id of [].concat(ids)) {
      const n = this.node(id); if (!n) continue;
      if (value === undefined || value === null || value === '' || value === false) delete n.attrs[key];
      else n.attrs[key] = value === true ? true : String(value);
    }
  }
  setAttrs(id, obj) { for (const [k, v] of Object.entries(obj)) this.setAttr(id, k, v); }

  remove(ids) {
    for (const id of ids) { const sib = this.siblings(id); const n = this.node(id); const i = sib.indexOf(n); if (i >= 0) sib.splice(i, 1); }
    this.selection = this.selection.filter((s) => !ids.includes(s));
  }

  insert(parentId, node, index) {
    const list = parentId ? this.node(parentId).children : this.pageList();
    if (index === undefined || index < 0 || index > list.length) list.push(node); else list.splice(index, 0, node);
    return node;
  }

  move(id, newParentId, index) {
    const n = this.node(id); if (!n) return;
    if (newParentId && this.isAncestor(id, newParentId)) return;
    const sib = this.siblings(id); const old = sib.indexOf(n);
    const target = newParentId ? this.node(newParentId).children : this.pageList();
    sib.splice(old, 1);
    if (sib === target && index > old) index--;
    target.splice(Math.max(0, Math.min(index ?? target.length, target.length)), 0, n);
  }

  isAncestor(a, b) { let n = this.node(b); while (n) { if (n.id === a) return true; n = this.parent(n.id); } return false; }

  duplicate(ids) {
    const out = [];
    for (const id of ids) {
      const n = this.node(id); const sib = this.siblings(id); const c = MQ.clone(n, true);
      if (c.attrs.name && n.tag === 'screen') c.attrs.name = uniqueName(this.project, c.attrs.name);
      if (n.tag === 'screen') { c.attrs.x = String((+n.attrs.x || n._autoX || 0) + this.project.sizeOf(n).w + 80); c.attrs.y = String(+n.attrs.y || 0); delete c.attrs.start; }
      else if (c.attrs.x !== undefined && /^-?\d/.test(c.attrs.x)) { c.attrs.x = String(+c.attrs.x + 16); c.attrs.y = String((+c.attrs.y || 0) + 16); }
      sib.splice(sib.indexOf(n) + 1, 0, c); out.push(c.id);
    }
    return out;
  }

  wrap(ids, tag, attrs = {}) {
    const nodes = ids.map((id) => this.node(id)).filter(Boolean);
    if (!nodes.length) return null;
    const sib = this.siblings(nodes[0].id);
    const idx = Math.min(...nodes.map((n) => sib.indexOf(n)));
    const w = { id: MQ.newId(), tag, attrs: { ...attrs }, children: [] };
    for (const n of nodes) { const s = this.siblings(n.id); s.splice(s.indexOf(n), 1); w.children.push(n); }
    // keep absolute positioning on the wrapper
    if (nodes.length === 1 && nodes[0].attrs.x !== undefined) { w.attrs.x = nodes[0].attrs.x; w.attrs.y = nodes[0].attrs.y; delete nodes[0].attrs.x; delete nodes[0].attrs.y; }
    sib.splice(Math.min(idx, sib.length), 0, w);
    return w;
  }

  unwrap(id) {
    const n = this.node(id); if (!n || !n.children) return [];
    const sib = this.siblings(id); const i = sib.indexOf(n);
    sib.splice(i, 1, ...n.children);
    return n.children.map((c) => c.id);
  }

  label(n) {
    if (!n) return '';
    if (n.attrs && (n.attrs.name || n.attrs.key) && n.tag !== 'icon') return n.attrs.name || n.attrs.key;
    if (n.tag === 'text' || n.tag === 'note') { const t = MQ.textOf(n).trim().replace(/\s+/g, ' '); return t.length > 28 ? t.slice(0, 26) + '…' : t || 'Texte'; }
    if (n.tag === 'icon') return 'icon · ' + (n.attrs.name || '');
    if (/^(\w+\.)?[A-Z]/.test(n.tag)) return n.tag + (n.attrs.label ? ' · ' + n.attrs.label : n.attrs.title ? ' · ' + n.attrs.title : '');
    return n.tag;
  }
}

export function uniqueName(project, base) {
  const names = new Set(project.screens().map((s) => s.attrs.name));
  if (!names.has(base)) return base;
  const m = /^(.*?)(\s\d+)?$/.exec(base); let k = 2;
  while (names.has(`${m[1]} ${k}`)) k++;
  return `${m[1]} ${k}`;
}

export function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
