// Component Studio: a workbench for one component at a time.
//   · Playground : a live Player (rigs, change/inc/dec, smart animate) on an instance, with Storybook-like controls
//   · Variantes  : the matrix of every enum/boolean value (two axes), each cell rendered statically; click = try it
//   · Définition : properties (text, number, boolean, variant, instance swap, slot), rigs, description, usages
// Everything is written back into the .mq source through app.change (undoable, bidirectional with the code).
import { MQ, h, icon, clear, toast, ask, menu } from './dom.js';
import { input, num, select, toggle } from './right.js';

const isCompTag = (t) => /^(\w+\.)?[A-Z]/.test(t || '');
const TYPES = {
  text: ['type', 'Texte'], number: ['hash', 'Nombre'], boolean: ['toggle-left', 'Booléen'], enum: ['list', 'Variante'],
  swap: ['replace', 'Échange d\'instance'], slot: ['box-select', 'Slot'],
};

// ------------------------------------------------------------------ model helpers (also used by the right panel)
const annoRe = (k) => new RegExp(`(^|[\\s.;,(])${k}\\s*:\\s*(swap\\([^)]*\\)|[\\w-]+(?:\\|[\\w-]+)+)`);

export function setAnno(desc, k, val) {
  let d = String(desc || '');
  const re = annoRe(k);
  if (re.test(d)) d = val ? d.replace(re, (m, pre) => `${pre}${k}: ${val}`) : d.replace(re, '$1').replace(/\s*;\s*;/g, ' ;').replace(/(^\s*;\s*|\s*;\s*$)/g, '').trim();
  else if (val) d = d ? `${d.replace(/[\s;]+$/, '')} ; ${k}: ${val}` : `${k}: ${val}`;
  return d.replace(/\s{2,}/g, ' ').trim();
}

export function slotsOf(node) {
  const out = [];
  const walk = (n) => { if (!n) return; if (n.tag === 'slot') out.push({ name: n.attrs.name ? String(n.attrs.name) : null, node: n }); (n.children || []).forEach(walk); };
  (node.children || []).forEach(walk);
  return out;
}

export function namedIn(node) {
  const out = [];
  const walk = (n) => { if (!n || n.tag === '#text') return; if (n.attrs && n.attrs.name && n.tag !== 'component') out.push(String(n.attrs.name)); (n.children || []).forEach(walk); };
  (node.children || []).forEach(walk);
  return [...new Set(out)];
}

export function propModel(project, c) {
  const desc = c.desc || '';
  const list = Object.entries(c.props).map(([k, def]) => {
    const m = annoRe(k).exec(desc);
    const ann = m ? m[2] : null;
    if (typeof def === 'boolean') return { k, type: 'boolean', def };
    if (ann && ann.startsWith('swap(')) return { k, type: 'swap', def, opts: ann.slice(5, -1).split('|').map((s) => s.trim()).filter(Boolean) };
    if (typeof def === 'string' && project.components[def]) return { k, type: 'swap', def, opts: [] };
    if (ann) return { k, type: 'enum', def, opts: ann.split('|') };
    if (typeof def === 'number') return { k, type: 'number', def };
    return { k, type: 'text', def: def == null ? '' : typeof def === 'object' ? JSON.stringify(def) : String(def) };
  });
  for (const s of slotsOf(c.node)) list.push({ k: s.name || 'children', type: 'slot', def: null, slot: s });
  return list;
}

const fmtDef = (p) => {
  if (p.type === 'boolean') return p.def ? 'true' : 'false';
  if (p.type === 'number') return String(+p.def || 0);
  const s = String(p.def ?? '').replace(/'/g, '’');
  if (p.type === 'text') return `'${s}'`;
  return /^[\w.-]+$/.test(s) ? s : `'${s}'`;
};

// writes props="…" and the type annotations of the description from a prop model list (slots excluded)
export function writeModel(node, list) {
  const plain = list.filter((p) => p.type !== 'slot');
  node.attrs.props = plain.map((p) => `${p.k}=${fmtDef(p)}`).join(' ');
  let d = node.attrs.desc || '';
  for (const p of plain) d = setAnno(d, p.k, p.type === 'enum' ? p.opts.join('|') : p.type === 'swap' && p.opts && p.opts.length ? `swap(${p.opts.join('|')})` : null);
  if (d) node.attrs.desc = d; else delete node.attrs.desc;
}

// renames {old} → {new} inside expressions of a component's tree, and the attribute on every instance
export function renameProp(project, compNode, name, from, to) {
  const re = new RegExp(`(?<![\\w$.'"-])${from}(?![\\w'"-])`, 'g');
  const fix = (s) => (typeof s === 'string' && s.includes('{') ? s.replace(/\{[^{}]*\}/g, (seg) => seg.replace(re, to)) : s);
  const walk = (n) => {
    if (n.tag === '#text') { n.text = fix(n.text); return; }
    for (const k of Object.keys(n.attrs || {})) {
      const v = fix(n.attrs[k]);
      if (k.startsWith('on:') && typeof v === 'string') n.attrs[k] = v.replace(new RegExp(`\\b(change|toggle|inc|dec|set)\\s+${from}\\b`, 'g'), `$1 ${to}`);
      else n.attrs[k] = v;
    }
    (n.children || []).forEach(walk);
  };
  (compNode.children || []).forEach(walk);
  if (compNode.attrs['rig:' + from] !== undefined) { compNode.attrs['rig:' + to] = compNode.attrs['rig:' + from]; delete compNode.attrs['rig:' + from]; }
  const all = (list) => { for (const n of list || []) { if (n.tag === name && n.attrs && n.attrs[from] !== undefined) { n.attrs[to] = n.attrs[from]; delete n.attrs[from]; } all(n.children); } };
  all(project.nodes);
}

export function instancesOf(project, name) {
  const out = [];
  const walk = (list, screen) => { for (const n of list || []) { if (n.tag === 'component') continue; const s = n.tag === 'screen' ? n : screen; if (n.tag === name) out.push({ node: n, screen: s }); walk(n.children, s); } };
  walk(project.nodes, null);
  return out;
}

// ------------------------------------------------------------------ rigs
export function rigEntries(node) {
  return Object.entries(node.attrs || {}).filter(([k]) => k.startsWith('rig:')).map(([k, v]) => ({ key: k, target: k.slice(4), spec: String(v), r: MQ.Rig.parseRig(v) }));
}
export function rigSpec(r) {
  const parts = [r.mode, `${r.min}..${r.max}`];
  if (r.step) parts.push(`step=${r.step}`);
  if (r.mode === 'angle' && (r.from !== -135 || r.to !== 135)) parts.push(`from=${r.from}`, `to=${r.to}`);
  if (r.in) parts.push(`in=${r.in}`);
  if (r.at != null && r.at !== '') parts.push(`at=${r.at}`);
  if (r.group) parts.push(`group=${r.group}`);
  if (r.label) parts.push(`label=${String(r.label).replace(/\s+/g, '-')}`);
  return parts.join(' ');
}

// rig editor for a node (component definition or any element). targets: [[value, label]]
export function rigEditor(app, node, targets, childNames, hint) {
  const id = node.id;
  const live = () => app.node(id) || node;
  const write = (oldKey, target, r) => app.change(() => {
    const n = live(); const entries = Object.entries(n.attrs); const nk = 'rig:' + target;
    n.attrs = Object.fromEntries(entries.filter(([k]) => k !== nk || k === oldKey).map(([k, v]) => (k === oldKey ? [nk, rigSpec(r)] : [k, v])));
    if (!(nk in n.attrs)) n.attrs[nk] = rigSpec(r);
  });
  const rows = [];
  for (const e of rigEntries(node)) {
    const r = { ...e.r };
    const tg = targets.some(([v]) => v === e.target) ? targets : [[e.target, e.target], ...targets];
    const card = h('div.rigcard', { dataset: { rig: e.target } },
      h('div.rigrow', null,
        h('span.rigdot'),
        select(tg, e.target, (v) => write(e.key, v, r)),
        select([['x', '↔ x'], ['y', '↕ y'], ['angle', '↻ angle'], ['radius', '◎ rayon']], r.mode, (v) => write(e.key, e.target, { ...r, mode: v })),
        h('button.mini', { title: 'Supprimer ce rig', onclick: () => app.change(() => { delete live().attrs[e.key]; }) }, icon('trash-2', 13))),
      h('div.grid3', null,
        num('min', r.min, (v) => write(e.key, e.target, { ...r, min: +v || 0 })),
        num('max', r.max, (v) => write(e.key, e.target, { ...r, max: +v || 0 })),
        num('pas', r.step || 0, (v) => write(e.key, e.target, { ...r, step: +v || 0 }))),
      r.mode === 'angle' ? h('div.grid2', null, num('de', r.from, (v) => write(e.key, e.target, { ...r, from: +v || 0 }), '°'), num('à', r.to, (v) => write(e.key, e.target, { ...r, to: +v || 0 }), '°')) : null,
      h('div.grid2', null,
        select([['', 'Zone : tout l\'élément'], ...childNames.map((c) => [c, 'Zone : ' + c])], r.in || '', (v) => write(e.key, e.target, { ...r, in: v || null })),
        input('rig-group-' + e.target, r.group || '', (v) => write(e.key, e.target, { ...r, group: v || null }), { placeholder: 'groupe (2D)' })));
    rows.push(card);
  }
  const free = targets.filter(([v]) => !(node.attrs && ('rig:' + v) in node.attrs));
  rows.push(h('div.chips', null,
    h('button.chip', {
      onclick: (ev) => {
        const r = ev.currentTarget.getBoundingClientRect();
        const items = free.length ? free.map(([v, l]) => ({ label: l, run: () => app.change(() => { const n = live(); const cur = guessRange(app.project, n, v); n.attrs['rig:' + v] = rigSpec({ mode: cur.mode, min: cur.min, max: cur.max, step: cur.step, from: -135, to: 135 }); }) })) : [{ label: 'Tout est déjà riggé', run: () => {} }];
        items.push({ label: 'Autre cible…', run: async () => { const t = await ask('Cible du rig', '', 'Un attribut (rotate, w, points…), une prop du composant ou une variable ($nom).'); if (t) app.change(() => { live().attrs['rig:' + t.trim()] = 'x 0..100'; }); } });
        menu(r.left, r.bottom + 4, items);
      },
    }, icon('plus', 12), ' Ajouter un rig')));
  if (hint) rows.push(h('div.hint', null, hint));
  return rows;
}

function guessRange(project, node, target) {
  const isAngle = /rotate|angle|hue/.test(target);
  if (isAngle) return { mode: 'angle', min: 0, max: 360, step: 1 };
  let cur;
  if (target.startsWith('$')) cur = project.vars[target.slice(1)];
  else if (node.tag === 'component') { const p = (project.components[node.attrs.name] || {}).props || {}; cur = p[target]; }
  else cur = node.attrs[target];
  const v = parseFloat(cur);
  if (!isNaN(v) && v > 0 && v < 1) return { mode: 'x', min: 0, max: 1, step: 0 };
  if (!isNaN(v) && Number.isInteger(v) && v >= 1 && v < 20) return { mode: 'x', min: 0, max: Math.max(10, v * 2), step: 1 };
  if (target === 'points' || target === 'sides') return { mode: 'x', min: 3, max: 12, step: 1 };
  if (target === 'opacity') return { mode: 'y', min: 1, max: 0, step: 0 };
  const hi = !isNaN(v) && v > 100 ? Math.ceil(v * 2 / 10) * 10 : 100;
  return { mode: /^(y|h|top)$/.test(target) ? 'y' : 'x', min: 0, max: hi, step: 1 };
}

// ------------------------------------------------------------------ the studio
export class Studio {
  constructor(app, hooks) {
    this.app = app; this.hooks = hooks; this.root = null; this.player = null;
    this.name = null; this.values = {}; this.width = 520; this.scale = 1; this.axes = {}; this.filter = ''; this.showKit = false;
    app.on((what) => {
      if (!this.root || !['doc', 'all', 'mode', 'file'].includes(what)) return;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => { this.raf = null; this.render(); });
    });
  }

  get comp() { return this.name ? this.app.project.components[this.name] : null; }

  open(name) {
    const app = this.app;
    if (!name) { const n = app.selNodes[0]; name = n && isCompTag(n.tag) && app.project.components[n.tag] ? n.tag : null; }
    if (!name) { const own = Object.values(app.project.components).filter((c) => !c.fromKit); name = own.length ? own[0].name : null; }
    if (!this.root) {
      this.root = h('div.studio', { onkeydown: (e) => { if (e.key === 'Escape' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) this.close(); } });
      this.onKey = (e) => { if (e.key === 'Escape' && this.root && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) { e.stopPropagation(); this.close(); } };
      addEventListener('keydown', this.onKey, true);
      document.body.appendChild(this.root);
    }
    this.select(name);
    return !!this.comp;
  }

  close() {
    if (this.player) { this.player.destroy(); this.player = null; }
    if (this.root) this.root.remove();
    this.root = null;
    removeEventListener('keydown', this.onKey, true);
    this.app.emit('selection');
  }

  select(name) { this.name = name; this.values = {}; this.axes = {}; this.render(); }

  // ---- layout
  render() {
    if (!this.root || this.rendering) return;
    this.rendering = true;
    try { this.renderNow(); } finally { this.rendering = false; }
  }

  renderNow() {
    const focus = document.activeElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.f : null;
    const side = this.root.querySelector('.st-side'); const scroll = side ? side.scrollTop : 0;
    const c = this.comp;
    if (this.name && !c) this.name = null;
    clear(this.root);
    const app = this.app;
    const modes = app.project.modes;
    this.root.append(
      h('div.st-bar', null,
        h('span.st-title', null, icon('component', 15), 'Component Studio'),
        c ? h('span.tagpill.comp', null, '◆ ' + c.name) : null,
        h('span.grow'),
        h('button.btn', { onclick: () => this.create() }, icon('plus', 14), 'Nouveau composant'),
        c && !c.fromKit ? h('button.btn', { title: 'Placer une instance (avec les valeurs du playground) dans l\'écran courant', onclick: () => this.insert() }, icon('square-dashed-mouse-pointer', 14), 'Insérer') : null,
        c && !c.fromKit ? h('button.btn', { onclick: () => { const id = c.node.id; this.close(); app.select(id); this.hooks.onEditCode && this.hooks.onEditCode(); } }, icon('code-xml', 14), 'Code') : null,
        modes.length > 1 ? h('button.btn', { title: 'Changer de mode', onclick: () => { app.mode = (app.mode + 1) % modes.length; app.emit('mode'); } }, icon('sun-moon', 14), modes[app.mode]) : null,
        h('button.btn', { title: 'Fermer (Échap)', onclick: () => this.close() }, icon('x', 14), 'Fermer')),
      h('div.st-main', null, this.listCol(), this.centerCol(), this.sideCol()));
    const s2 = this.root.querySelector('.st-side'); if (s2) s2.scrollTop = scroll;
    if (focus) { const f = this.root.querySelector(`[data-f="${focus}"]`); if (f) f.focus(); }
  }

  listCol() {
    const app = this.app; const p = app.project;
    const all = Object.values(p.components);
    const f = this.filter.toLowerCase();
    const match = (c) => !f || c.name.toLowerCase().includes(f);
    const own = all.filter((c) => !c.fromKit && match(c));
    const kit = all.filter((c) => c.fromKit && match(c));
    const row = (c) => {
      const pm = propModel(p, c); const rigs = rigEntries(c.node).length; const uses = instancesOf(p, c.name).length;
      return h('div.st-item' + (c.name === this.name ? '.on' : ''), { dataset: { comp: c.name }, title: c.desc || c.name, onclick: () => this.select(c.name) },
        h('span.st-iname', null, c.name),
        h('span.st-imeta', null, pm.length ? `${pm.length} prop${pm.length > 1 ? 's' : ''}` : '', rigs ? h('span.st-badge.rig', null, rigs + ' rig') : null, uses ? h('span.st-badge', null, '×' + uses) : null));
    };
    const search = h('input.inp', { placeholder: 'Filtrer…', value: this.filter, dataset: { f: 'st-filter' }, oninput: (e) => { this.filter = e.target.value; const sel = e.target.selectionStart; this.render(); const i = this.root.querySelector('[data-f="st-filter"]'); if (i) { i.focus(); i.setSelectionRange(sel, sel); } }, onkeydown: (e) => e.stopPropagation() });
    return h('div.st-list', null,
      h('div.st-pad', null, search),
      h('div.st-head', null, `Projet (${own.length})`),
      own.length ? own.map(row) : h('div.hint.st-pad', null, 'Aucun composant. « Nouveau composant » ou sélectionne un calque puis Ctrl+Alt+K.'),
      h('div.st-head', { style: { cursor: 'pointer' }, onclick: () => { this.showKit = !this.showKit; this.render(); } }, icon(this.showKit ? 'chevron-down' : 'chevron-right', 12), ` Kit & shadcn (${kit.length})`),
      this.showKit ? kit.map(row) : null);
  }

  // ---- centre: playground + controls + matrix
  centerCol() {
    const c = this.comp;
    if (!c) return h('div.st-center', null, h('div.st-empty', null, icon('component', 28), h('div', null, 'Choisis un composant à gauche, ou crée-en un.')));
    const p = this.app.project;
    const model = propModel(p, c);
    const stage = h('div.st-stage');
    const host = h('div.st-host');
    const fit = h('div.st-fit', { style: { zoom: String(this.scale) } }, host);
    stage.appendChild(fit);
    const readout = h('div.st-readout');
    const tools = h('div.st-tools', null,
      h('span.st-label', null, 'Playground'),
      h('span.hint', null, 'interactif'),
      h('span.grow'),
      select([['320', '320 px'], ['520', '520 px'], ['760', '760 px'], ['1040', '1040 px']], String(this.width), (v) => { this.width = +v; this.render(); }),
      select([['0.75', '75 %'], ['1', '100 %'], ['1.5', '150 %'], ['2', '200 %']], String(this.scale), (v) => { this.scale = +v; this.render(); }),
      h('button.btn', { title: 'Réinitialiser l\'état', onclick: () => this.mountPlayer(host, readout) }, icon('rotate-ccw', 13)));
    const controls = this.controls(model);
    const matrix = this.matrix(model);
    const col = h('div.st-center', null, h('div.st-card', null, tools, stage, readout, controls), matrix);
    requestAnimationFrame(() => this.mountPlayer(host, readout));
    return col;
  }

  bg() { const p = this.app.project; return p.token('bg', this.app.mode) || p.token('background', this.app.mode) || '#fff'; }

  sampleChildren(c) {
    const kids = [];
    for (const s of slotsOf(c.node)) {
      if (s.node.children && s.node.children.length) continue; // has default content
      const attrs = s.name ? { slot: s.name } : {};
      kids.push({ id: MQ.newId(), tag: 'frame', attrs: { ...attrs, p: '12', radius: '8', stroke: '1 dashed #8B7BFF', fill: 'rgba(139,123,255,.08)' }, children: [{ id: MQ.newId(), tag: 'text', attrs: { size: '12', color: '#8B7BFF' }, children: [{ id: MQ.newId(), tag: '#text', text: s.name ? 'slot · ' + s.name : 'slot' }] }] });
    }
    return kids;
  }

  instanceNode(extra = {}) {
    const c = this.comp; const attrs = {};
    for (const [k, v] of Object.entries({ ...this.values, ...extra })) {
      if (v === undefined || v === null) continue;
      attrs[k] = typeof v === 'boolean' ? (v ? true : 'false') : String(v);
    }
    return { id: MQ.newId(), tag: c.name, attrs: { name: 'studio-instance', ...attrs }, children: this.sampleChildren(c) };
  }

  mountPlayer(host, readout, height) {
    if (!this.root || !host.isConnected) return;
    if (this.player) { this.player.destroy(); this.player = null; }
    clear(host);
    const app = this.app;
    let src = app.project.toSource();
    const inst = MQ.serialize([this.instanceNode()]);
    const H = height || 2000;
    const screen = `<screen name="__studio" w=${this.width} h=${H} fill="${this.bg()}">\n<col name="studio-pad" w=fill p=40 gap=16 align=center>\n${inst}\n</col>\n</screen>\n`;
    src = src.includes('</project>') ? src.replace(/<\/project>\s*$/, screen + '</project>\n') : src + screen;
    let proj;
    try { proj = MQ.loadProject(src); } catch (e) { host.textContent = '⚠ ' + e.message; return; }
    try {
      this.player = new MQ.Player(proj, host, { mode: app.mode });
      this.player.start('__studio');
    } catch (e) { host.textContent = '⚠ ' + e.message; return; }
    if (!height) {
      // second pass at the content's own height (a screen has a fixed height in the Player)
      const pad = host.querySelector('[data-key="studio-pad"]');
      const need = pad ? Math.max(160, Math.ceil(pad.getBoundingClientRect().height / (this.scale || 1))) : 400;
      return this.mountPlayer(host, readout, need);
    }
    this.readout = readout; this.updateReadout();
    if (!host._wired) { host._wired = true; const upd = () => setTimeout(() => this.updateReadout(), 40); host.addEventListener('pointerup', upd); host.addEventListener('click', upd); }
  }

  // live state (instance-local values + variables) of the playground, with "keep as default"
  updateReadout() {
    const ro = this.readout; if (!ro || !this.player) return;
    clear(ro);
    const c = this.comp; if (!c) return;
    const inst = Object.values(this.player.inst || {})[0] || {};
    const shown = Object.keys(c.props).map((k) => [k, inst[k] !== undefined ? inst[k] : this.values[k] !== undefined ? this.values[k] : c.props[k], inst[k] !== undefined]);
    const vars = Object.entries(this.player.vars || {}).filter(([k]) => JSON.stringify(c.node).includes('$' + k));
    ro.append(...shown.map(([k, v, changed]) => h('span.st-kv' + (changed ? '.changed' : ''), null, h('b', null, k), ' ', fmtVal(v))), ...vars.map(([k, v]) => h('span.st-kv.var', null, h('b', null, '$' + k), ' ', fmtVal(v))));
    if (Object.keys(inst).length) ro.append(h('button.chip', { title: 'Reporter ces valeurs dans les contrôles', onclick: () => { Object.assign(this.values, inst); this.render(); } }, 'Garder ces valeurs'));
  }

  controls(model) {
    const c = this.comp; const set = (k, v) => { if (v === undefined) delete this.values[k]; else this.values[k] = v; this.render(); };
    const rows = model.filter((m) => m.type !== 'slot').map((m) => {
      const cur = this.values[m.k] !== undefined ? this.values[m.k] : m.def;
      let ctl;
      if (m.type === 'boolean') ctl = toggle(!!cur && cur !== 'false', (v) => set(m.k, v));
      else if (m.type === 'enum') ctl = h('div.chips', null, m.opts.map((o) => h('button.chip' + (String(cur) === o ? '.on' : ''), { onclick: () => set(m.k, o) }, o)));
      else if (m.type === 'swap') {
        const opts = (m.opts.length ? m.opts : Object.keys(this.app.project.components).filter((n) => !this.app.project.components[n].fromKit && n !== c.name));
        ctl = select(opts.map((o) => [o, o]), String(cur), (v) => set(m.k, v));
      } else if (m.type === 'number') {
        const rig = rigEntries(c.node).find((e) => e.target === m.k);
        const lo = rig ? Math.min(rig.r.min, rig.r.max) : Math.min(0, +m.def), hi = rig ? Math.max(rig.r.min, rig.r.max) : Math.max(+m.def * 2 || 10, 1);
        const step = rig && rig.r.step ? rig.r.step : (hi - lo) <= 2 ? 0.01 : 1;
        const out = h('span.st-num', null, fmtVal(cur));
        ctl = h('div.st-slider', null, h('input', { type: 'range', min: lo, max: hi, step, value: cur, dataset: { f: 'ctl-' + m.k }, oninput: (e) => { out.textContent = e.target.value; }, onchange: (e) => set(m.k, +e.target.value), onkeydown: (e) => e.stopPropagation() }), out);
      } else ctl = input('ctl-' + m.k, String(cur ?? ''), (v) => set(m.k, v));
      return h('div.st-ctl', null, h('label', null, icon(TYPES[m.type][0], 12), m.k), ctl);
    });
    if (!rows.length) return h('div.st-controls', null, h('div.hint', null, 'Pas encore de propriété : ajoute-en dans la colonne de droite.'));
    return h('div.st-controls', null, rows, Object.keys(this.values).length ? h('button.chip', { onclick: () => { this.values = {}; this.render(); } }, 'Valeurs par défaut') : null);
  }

  matrix(model) {
    const app = this.app; const c = this.comp;
    // enum, boolean and instance-swap props (with listed preferred values) are all matrix axes
    const dims = model.filter((m) => m.type === 'enum' || m.type === 'boolean' || (m.type === 'swap' && m.opts && m.opts.length > 1)).map((m) => ({ k: m.k, vals: m.type === 'boolean' ? [true, false] : m.opts }));
    const wrap = h('div.st-card.st-matrix');
    const head = h('div.st-tools', null, h('span.st-label', null, 'Variantes'));
    wrap.appendChild(head);
    if (!dims.length) { wrap.appendChild(h('div.hint', null, 'Aucune propriété de variante (enum, booléen ou échange d’instance). Ajoute une « Variante » pour obtenir la matrice, comme les component sets de Figma.')); return wrap; }
    const ax = this.axes;
    if (!ax.row || !dims.find((d) => d.k === ax.row)) ax.row = dims[0].k;
    if (!ax.userCol && (!ax.col || !dims.find((d) => d.k === ax.col) || ax.col === ax.row)) ax.col = (dims.find((d) => d.k !== ax.row) || {}).k || '';
    head.append(h('span.grow'), h('span.hint', null, 'lignes'), select(dims.map((d) => [d.k, d.k]), ax.row, (v) => { ax.row = v; if (ax.col === v) ax.col = ''; this.render(); }),
      h('span.hint', null, 'colonnes'), select([['', '—'], ...dims.filter((d) => d.k !== ax.row).map((d) => [d.k, d.k])], ax.col, (v) => { ax.col = v; ax.userCol = true; this.render(); }));
    const R = dims.find((d) => d.k === ax.row); const C = dims.find((d) => d.k === ax.col) || { k: null, vals: [null] };
    const ctx = MQ.makeCtx(app.project, { mode: app.mode, editor: true });
    const cellW = Math.min(this.width, 260);
    const grid = h('div.st-grid', { style: { gridTemplateColumns: `auto repeat(${C.vals.length}, minmax(${Math.min(cellW, 160)}px, auto))` } });
    grid.appendChild(h('div.st-corner', null, C.k ? `${R.k} ╲ ${C.k}` : R.k));
    for (const cv of C.vals) grid.appendChild(h('div.st-colh', null, C.k ? String(cv) : ''));
    for (const rv of R.vals) {
      grid.appendChild(h('div.st-rowh', null, String(rv)));
      for (const cv of C.vals) {
        const extra = { [R.k]: rv }; if (C.k) extra[C.k] = cv;
        const cur = { ...this.values }; const isCur = Object.entries(extra).every(([k, v]) => String(cur[k] !== undefined ? cur[k] : c.props[k]) === String(v));
        const cell = h('div.st-cell' + (isCur ? '.on' : ''), { style: { background: this.bg() }, title: Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(' '), onclick: () => { Object.assign(this.values, extra); this.render(); } });
        const box = h('div.st-cellbox', { style: { width: cellW + 'px' } });
        try { const el = MQ.renderStandalone({ id: MQ.newId(), tag: 'col', attrs: { w: String(cellW), align: 'center' }, children: [this.instanceNode(extra)] }, ctx); el.style.pointerEvents = 'none'; box.appendChild(el); } catch (e) { box.textContent = '⚠ ' + e.message; }
        cell.appendChild(box); grid.appendChild(cell);
      }
    }
    wrap.appendChild(h('div.st-gridwrap', null, grid));
    return wrap;
  }

  // ---- right: the definition
  sideCol() {
    const c = this.comp; const app = this.app; const p = app.project;
    if (!c) return h('div.st-side');
    const side = h('div.st-side');
    const ro = c.fromKit;
    const live = () => app.node(c.node.id);
    if (ro) side.appendChild(sec2('Composant du kit', h('div.hint', null, 'Composant intégré, en lecture seule. « Copier dans le projet » pour le personnaliser.'), h('button.btn', { onclick: () => this.copyToProject() }, icon('copy', 13), 'Copier dans le projet')));
    // identity
    const uses = instancesOf(p, c.name);
    side.appendChild(sec2('Composant',
      ro ? null : h('div.prow', null, h('label', null, 'Nom'), input('st-name', c.name, (v) => this.rename(v))),
      ro ? h('div.hint', null, c.desc) : h('textarea.inp.st-desc', { dataset: { f: 'st-desc' }, placeholder: 'Description (les annotations « k: a|b » typent les variantes)', onkeydown: (e) => e.stopPropagation(), onchange: (e) => app.change(() => { const n = live(); const v = e.target.value.trim(); if (v) n.attrs.desc = v; else delete n.attrs.desc; }) }, c.desc || ''),
      h('div.kv', null, h('span', null, 'Utilisations'), h('b', null, String(uses.length))),
      uses.length ? h('div.chips', null, uses.slice(0, 8).map((u) => h('button.chip', { onclick: () => { this.close(); app.select(u.node.id); this.hooks.focus && this.hooks.focus(u.node.id); } }, (u.node.attrs.name || u.node.attrs.label || c.name) + (u.screen ? ' · ' + u.screen.attrs.name : '')))) : null));
    // properties
    const model = propModel(p, c);
    const edit = (fn) => app.change(() => { const n = live(); const m = propModel(p, c).filter((x) => x.type !== 'slot'); fn(m, n); writeModel(n, m); });
    const rows = model.map((m, i) => {
      const [ic, tl] = TYPES[m.type];
      if (m.type === 'slot') {
        return h('div.st-prop', { dataset: { prop: m.k } },
          h('div.st-prow', null, h('span.st-ptype', { title: tl }, icon(ic, 12)), h('b.st-pname', null, m.slot.name ? m.k : 'children'), h('span.hint', null, m.slot.name ? `enfants slot=${m.k}` : 'enfants sans slot='), h('span.grow'),
            ro ? null : h('button.mini', { title: 'Supprimer le slot', onclick: () => app.change(() => { const walk = (n) => { if (!n.children) return; const j = n.children.findIndex((x) => x.id === m.slot.node.id); if (j >= 0) n.children.splice(j, 1); else n.children.forEach(walk); }; walk(live()); }) }, icon('trash-2', 13))));
      }
      const name = ro ? h('b.st-pname', null, m.k) : input('pn-' + m.k, m.k, (v) => { v = v.replace(/[^\w]/g, ''); const now = this.comp; if (!v || v === m.k || !now || now.props[v] !== undefined || now.props[m.k] === undefined) return; app.change(() => { const n = live(); const list = propModel(p, c).filter((x) => x.type !== 'slot'); list.find((x) => x.k === m.k).k = v; renameProp(p, n, c.name, m.k, v); n.attrs.desc = setAnno(n.attrs.desc || '', m.k, null); writeModel(n, list); }); }, { mono: true });
      const typeSel = ro ? h('span.hint', null, tl) : select(Object.entries(TYPES).filter(([t]) => t !== 'slot').map(([t, [, l]]) => [t, l]), m.type, (t) => edit((list) => { const x = list.find((y) => y.k === m.k); x.type = t; x.def = t === 'boolean' ? false : t === 'number' ? 0 : t === 'enum' ? (x.opts && x.opts[0]) || 'a' : t === 'swap' ? (Object.keys(p.components).find((n) => n !== c.name && !p.components[n].fromKit) || 'Button') : String(x.def ?? ''); if (t === 'enum' && !(x.opts && x.opts.length > 1)) x.opts = [String(x.def), 'b']; if (t === 'swap') x.opts = x.opts || []; }));
      let defCtl;
      if (m.type === 'boolean') defCtl = toggle(!!m.def, (v) => edit((list) => { list[i].def = v; }));
      else if (m.type === 'enum') defCtl = select(m.opts.map((o) => [o, o]), String(m.def), (v) => edit((list) => { list[i].def = v; }));
      else if (m.type === 'swap') defCtl = select(Object.keys(p.components).filter((n) => n !== c.name).map((n) => [n, n]), String(m.def), (v) => edit((list) => { list[i].def = v; }));
      else defCtl = input('pd-' + m.k, String(m.def ?? ''), (v) => edit((list) => { list[i].def = m.type === 'number' ? +v || 0 : v; }), { mono: m.type === 'number' });
      if (ro && defCtl) defCtl = h('span.mono', null, fmtVal(m.def));
      return h('div.st-prop', { dataset: { prop: m.k } },
        h('div.st-prow', null, h('span.st-ptype', { title: tl }, icon(ic, 12)), name, typeSel,
          ro ? null : h('button.mini', { title: 'Supprimer la propriété', onclick: () => edit((list, n) => { list.splice(list.findIndex((x) => x.k === m.k), 1); n.attrs.desc = setAnno(n.attrs.desc || '', m.k, null); }) }, icon('trash-2', 13))),
        h('div.st-prow', null, h('span.hint.st-dl', null, 'défaut'), defCtl),
        m.type === 'enum' && !ro ? h('div.st-prow', null, h('span.hint.st-dl', null, 'valeurs'), input('po-' + m.k, m.opts.join('|'), (v) => edit((list) => { const o = v.split(/[|,\s]+/).filter(Boolean); if (o.length < 2) return; list[i].opts = o; if (!o.includes(String(list[i].def))) list[i].def = o[0]; }), { mono: true, placeholder: 'a|b|c' })) : null,
        m.type === 'swap' && !ro ? h('div.st-prow', null, h('span.hint.st-dl', null, 'préférés'), input('po-' + m.k, (m.opts || []).join('|'), (v) => edit((list) => { list[i].opts = v.split(/[|,\s]+/).filter(Boolean); }), { mono: true, placeholder: 'IconButton|Button' })) : null);
    });
    side.appendChild(sec2('Propriétés', ...rows, ro ? null : h('div.chips', null, h('button.chip', { onclick: (e) => this.addPropMenu(e) }, icon('plus', 12), ' Ajouter une propriété')),
      h('div.hint', null, 'Utilise une prop dans le composant avec {nom} : texte, couleur, taille, condition if={nom}… Une prop Échange d\'instance s\'affiche avec <instance of={nom}/>.')));
    // rigs
    if (!ro) {
      const targets = [...Object.keys(c.props).map((k) => [k, k]), ...Object.keys(p.vars).map((k) => ['$' + k, '$' + k])];
      side.appendChild(sec2('Rigs (contrôles à la souris)', ...rigEditor(app, live() || c.node, targets, namedIn(c.node), 'Un rig transforme un geste (glisser, tourner) en valeur de prop. « Zone » : l\'élément nommé qui sert de piste. Deux rigs du même groupe = pad 2D.')));
    }
    // hygiene & motion: every variant rendered and linted, motion recipes on the root
    side.appendChild(this.auditSection(model, ro));
    // interactions found in the tree
    const inter = [];
    const walk = (n, depth) => { if (!n || n.tag === '#text') return; for (const [k, v] of Object.entries(n.attrs || {})) if (k.startsWith('on:') || k.startsWith('hover:') || k.startsWith('press:')) inter.push([n.attrs.name || n.tag, k, String(v)]); (n.children || []).forEach((x) => walk(x, depth + 1)); };
    (c.node.children || []).forEach((x) => walk(x, 0));
    side.appendChild(sec2('Interactions & états', inter.length ? inter.map(([who, k, v]) => h('div.st-inter', null, h('b', null, who), h('span.mono', null, k), h('span.mono.hint', null, v))) : h('div.hint', null, 'Aucune. Ex. on:click="change on={!on} smart 320 gentle" sur un enfant rend chaque instance interactive (état propre à l\'instance).'),
      ro ? null : h('div.chips', null, [['Bascule on/off', 'toggle'], ['Compteur +/-', 'counter'], ['Survol', 'hover']].map(([l, t]) => h('button.chip', { onclick: () => this.addInteraction(t) }, l)))));
    return side;
  }

  // ---- hygiene audit of every variant + motion recipes (the component is clean AND alive)
  auditSection(model, ro) {
    const c = this.comp; const app = this.app; const p = app.project;
    const box = h('div');
    const run = () => {
      clear(box);
      const dims = model.filter((m) => m.type === 'enum' || m.type === 'boolean').map((m) => ({ k: m.k, vals: m.type === 'boolean' ? [true, false] : m.opts }));
      let combos = [{}];
      for (const d of dims) { const next = []; for (const cmb of combos) for (const v of d.vals) next.push({ ...cmb, [d.k]: v }); combos = next; if (combos.length > 36) break; }
      combos = combos.slice(0, 36);
      const host = h('div', { style: { position: 'fixed', left: '-10000px', top: '0', width: '480px' } }); document.body.appendChild(host);
      const ctx = MQ.makeCtx(p, { mode: app.mode });
      const results = combos.map((extra, i) => {
        const el = MQ.renderStandalone({ id: MQ.newId(), tag: 'col', attrs: { w: '480', p: '24', align: 'start', fill: this.bg() }, children: [this.instanceNode(extra)] }, ctx);
        el.dataset.screen = 'variante ' + (i + 1); host.appendChild(el);
        const issues = MQ.lintScreen(el, p, { attrs: { w: '480', name: 'audit' } }).filter((x) => !['bounds', 'edge-margin', 'type-count', 'multi-primary', 'thumb-zone'].includes(x.code));
        return { extra, issues };
      });
      host.remove();
      const all = results.flatMap((r) => r.issues);
      const score = MQ.scoreIssues(all).score;
      box.appendChild(h('div.kv', null, h('span', null, `${combos.length} variante(s) auditée(s)`), h('b', { style: { color: score >= 95 ? '#0E9F6E' : score >= 85 ? '#B7791F' : '#E5484D' } }, score + '/100')));
      const bad = results.filter((r) => r.issues.length);
      if (!bad.length) box.appendChild(h('div.okmsg', null, icon('check-circle-2', 14), 'Toutes les variantes passent : espacements, contrastes, cibles, anatomie, retour au toucher.'));
      for (const r of bad.slice(0, 12)) {
        const tag = Object.entries(r.extra).map(([k, v]) => `${k}=${v}`).join(' ') || 'défaut';
        box.appendChild(h('div.st-audit', { onclick: () => { Object.assign(this.values, r.extra); this.render(); } },
          h('b.mono', null, tag), ...r.issues.slice(0, 4).map((x) => h('div.issue.' + x.level, null, icon(x.level === 'error' ? 'circle-x' : x.level === 'warn' ? 'triangle-alert' : 'info', 12), h('span', null, x.msg)))));
      }
    };
    // motion recipes on the component root (MOTION_RECIPES in the runtime)
    const root = c.node.children && c.node.children.find((x) => x.tag !== '#text');
    const cur = new Set(String((root && root.attrs.motion) || '').split(/[\s,]+/).filter(Boolean));
    const RECIPES = [['press', 'Appui (squash)'], ['lift', 'Survol (élévation)'], ['glow', 'Focus doux'], ['appear', 'Apparition'], ['pop', 'Apparition rebond'], ['rise', 'Apparition en arc'], ['cascade', 'Enfants en cascade'], ['breathe', 'Respiration']];
    const chips = h('div.chips', null, RECIPES.map(([k, l]) => h('button.chip' + (cur.has(k) ? '.on' : ''), { title: k, disabled: ro || !root, onclick: () => {
      cur.has(k) ? cur.delete(k) : cur.add(k);
      // exclusive groups: one entrance at a time
      if (['appear', 'pop', 'rise'].includes(k) && cur.has(k)) ['appear', 'pop', 'rise'].filter((x) => x !== k).forEach((x) => cur.delete(x));
      app.change(() => { const n = app.node(root.id); if (cur.size) n.attrs.motion = [...cur].join(' '); else delete n.attrs.motion; });
      this.render();
    } }, l)));
    return sec2('Hygiène & motion',
      h('div.hint', null, 'Audit de chaque combinaison de props (contraste, cibles tactiles, écart icône/libellé, padding, rayons imbriqués, grille, retour au toucher).'),
      h('div.chips', null, h('button.chip', { onclick: run }, icon('scan-search', 12), ' Auditer toutes les variantes'), h('button.chip', { onclick: () => this.render() }, icon('rotate-ccw', 12), ' Rejouer l’apparition')),
      box,
      h('div.sectitle', { style: { marginTop: '10px' } }, 'Recettes de motion'), chips,
      h('div.hint', null, 'Appui = press:scale 0.97 · Survol = ombre douce + 1,5 % · Apparition = fade-up amortie… Les attributs écrits à la main restent prioritaires.'));
  }

  addPropMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    menu(r.left, r.bottom + 4, Object.entries(TYPES).map(([t, [ic, l]]) => ({ label: l, icon: ic, run: () => this.addProp(t) })));
  }

  async addProp(type) {
    const app = this.app; const c = this.comp; const p = app.project;
    const suggestion = { text: 'label', number: 'value', boolean: 'on', enum: 'variant', swap: 'icon', slot: 'content' }[type];
    let k = await ask(type === 'slot' ? 'Nom du slot' : 'Nom de la propriété', suggestion, type === 'slot' ? 'Les enfants d\'une instance avec slot=nom s\'y placeront. Laisse « children » pour le slot par défaut.' : 'Identifiant (lettres, chiffres, _).');
    if (!k) return; k = k.replace(/[^\w]/g, ''); if (!k) return;
    if (type !== 'slot' && c.props[k] !== undefined) { toast(`La propriété ${k} existe déjà`); return; }
    app.change(() => {
      const n = app.node(c.node.id);
      if (type === 'slot') {
        const root = (n.children || []).find((x) => x.tag !== '#text');
        const slot = { id: MQ.newId(), tag: 'slot', attrs: k === 'children' ? {} : { name: k }, children: [] };
        if (root && root.children) root.children.push(slot); else n.children.push(slot);
        return;
      }
      const list = propModel(p, c).filter((x) => x.type !== 'slot');
      const comps = Object.keys(p.components).filter((x) => x !== c.name && !p.components[x].fromKit);
      list.push({ k, type, def: type === 'boolean' ? false : type === 'number' ? 0 : type === 'enum' ? 'primary' : type === 'swap' ? comps[0] || 'Button' : 'Texte', opts: type === 'enum' ? ['primary', 'secondary'] : type === 'swap' ? comps.slice(0, 3) : undefined });
      writeModel(n, list);
      // make the new prop visible right away in the component (a text label, or a swap slot)
      const root = (n.children || []).find((x) => x.tag !== '#text');
      if (root && root.children && type === 'text') root.children.push({ id: MQ.newId(), tag: 'text', attrs: {}, children: [{ id: MQ.newId(), tag: '#text', text: `{${k}}` }] });
      if (root && root.children && type === 'swap') root.children.unshift({ id: MQ.newId(), tag: 'instance', attrs: { of: `{${k}}` }, children: [] });
    });
  }

  addInteraction(kind) {
    const app = this.app; const c = this.comp; const p = app.project;
    app.change(() => {
      const n = app.node(c.node.id); const root = (n.children || []).find((x) => x.tag !== '#text'); if (!root) return;
      const list = propModel(p, c).filter((x) => x.type !== 'slot');
      if (kind === 'toggle') {
        if (!list.find((x) => x.k === 'on')) { list.push({ k: 'on', type: 'boolean', def: false }); writeModel(n, list); }
        root.attrs['on:click'] = 'change on={!on} smart 280 gentle'; root.attrs.cursor = 'pointer';
        if (!root.attrs.opacity) root.attrs.opacity = '{on ? 1 : 0.6}';
      } else if (kind === 'counter') {
        if (!list.find((x) => x.k === 'count')) { list.push({ k: 'count', type: 'number', def: 0 }); writeModel(n, list); }
        root.attrs['on:click'] = 'inc count'; root.attrs.cursor = 'pointer';
        (root.children = root.children || []).push({ id: MQ.newId(), tag: 'text', attrs: { weight: '600' }, children: [{ id: MQ.newId(), tag: '#text', text: '{count}' }] });
      } else if (kind === 'hover') {
        root.attrs['hover:scale'] = '1.03'; root.attrs['press:scale'] = '0.97'; root.attrs.cursor = 'pointer';
      }
    });
  }

  async create() {
    const app = this.app;
    let name = await ask('Nouveau composant', 'MonComposant', 'Commence par une majuscule, ex : PriceCard.');
    if (!name) return; name = name.replace(/[^\w]/g, ''); if (!name) return; if (!/^[A-Z]/.test(name)) name = name[0].toUpperCase() + name.slice(1);
    if (app.project.components[name]) { toast(`${name} existe déjà`); this.select(name); return; }
    app.change(() => {
      const t = (s) => ({ id: MQ.newId(), tag: '#text', text: s });
      const comp = { id: MQ.newId(), tag: 'component', attrs: { name, props: "label='Libellé' tone=primary", desc: 'tone: primary|neutral' }, children: [
        { id: MQ.newId(), tag: 'row', attrs: { gap: '8', px: '16', h: '40', radius: '12', align: 'center', fill: "{tone == 'primary' ? $primary : $surface-2}" }, children: [
          { id: MQ.newId(), tag: 'text', attrs: { weight: '600', color: "{tone == 'primary' ? onColor($primary) : $text}" }, children: [t('{label}')] }] }] };
      const top = app.project.rootNode ? app.project.rootNode.children : app.project.nodes;
      const firstPage = top.findIndex((x) => x.tag === 'page' || x.tag === 'screen');
      top.splice(firstPage < 0 ? top.length : firstPage, 0, comp);
    });
    this.select(name);
  }

  copyToProject() {
    const app = this.app; const c = this.comp; if (!c) return;
    app.change(() => {
      const n = MQ.clone(c.node, true);
      const top = app.project.rootNode ? app.project.rootNode.children : app.project.nodes;
      const firstPage = top.findIndex((x) => x.tag === 'page' || x.tag === 'screen');
      top.splice(firstPage < 0 ? top.length : firstPage, 0, n);
    });
    toast(`${c.name} copié dans le projet (il remplace la version du kit)`);
  }

  rename(v) {
    const app = this.app; const c = this.comp; v = (v || '').replace(/[^\w]/g, '');
    if (!v || v === c.name) return; if (!/^[A-Z]/.test(v)) v = v[0].toUpperCase() + v.slice(1);
    if (app.project.components[v]) { toast(`${v} existe déjà`); return; }
    const old = c.name;
    app.change(() => {
      app.node(c.node.id).attrs.name = v;
      const walk = (list) => { for (const n of list || []) { if (n.tag === old) n.tag = v; if (n.tag === 'instance' && n.attrs.of === old) n.attrs.of = v; for (const [k, a] of Object.entries(n.attrs || {})) if (typeof a === 'string' && a === old && !k.startsWith('on:')) n.attrs[k] = v; walk(n.children); } };
      walk(app.project.nodes);
      const cn = app.node(c.node.id); cn.attrs.desc = String(cn.attrs.desc || '').replace(new RegExp(`swap\\(([^)]*)\\b${old}\\b`), (m) => m.replace(old, v)) || undefined; if (!cn.attrs.desc) delete cn.attrs.desc;
    });
    this.name = v; this.render();
  }

  insert() {
    const app = this.app; const c = this.comp; if (!c) return;
    const sel = app.selNodes[0];
    let screen = sel; while (screen && screen.tag !== 'screen') screen = app.parent(screen.id);
    if (!screen) screen = app.project.screens(app.pageIndex)[0] || app.project.screens()[0];
    if (!screen) { toast('Aucun écran où insérer'); return; }
    const node = this.instanceNode(); delete node.attrs.name; node.children = [];
    let target = sel && sel.tag !== 'screen' && sel.children && !isCompTag(sel.tag) ? sel : screen;
    if (target.tag === 'component') target = screen;
    app.change(() => { app.insert(target.id, node); app.selection = [node.id]; });
    this.close();
    this.hooks.focus && this.hooks.focus(node.id);
    toast(`${c.name} inséré dans ${screen.attrs.name}`);
  }
}

function sec2(title, ...kids) { return h('div.sec', null, h('div.sectitle', null, title), h('div.secbody', null, kids)); }
function fmtVal(v) { if (typeof v === 'number') return String(+v.toFixed(3)); if (typeof v === 'boolean') return v ? 'true' : 'false'; if (v == null) return '—'; return typeof v === 'object' ? JSON.stringify(v) : String(v); }
