// Infinite canvas: rendering, selection, drag/reorder/reparent, resize, guides, drawing tools, prototype noodles
import { MQ, h, clear, menu, toast } from './dom.js';
import { isContainer, uniqueName } from './state.js';
import { VectorEditor } from './vectoredit.js';
import { ShapeBuilder } from './shapebuilder.js';

const SNAP = 6;
const round = (v) => Math.round(v);

export class Canvas {
  constructor(app, root, hooks) {
    this.app = app; this.root = root; this.hooks = hooks || {};
    this.world = h('div.cv-world');
    this.overlay = h('div.cv-overlay');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('cv-svg');
    this.overlay.appendChild(this.svg);
    this.root.append(this.world, this.overlay);
    this.items = new Map(); this.links = [];
    this.drag = null; this.spaceDown = false;
    this.vedit = new VectorEditor(this, app);
    this.sbuild = new ShapeBuilder(this, app);
    this.bind();
  }

  // ------------------------------------------------------------ coords
  get rect() { return this.root.getBoundingClientRect(); }
  toWorld(cx, cy) { const r = this.rect; return { x: (cx - r.left - this.app.panX) / this.app.zoom, y: (cy - r.top - this.app.panY) / this.app.zoom }; }
  local(r) { const R = this.rect; return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height }; }
  applyTransform() {
    this.world.style.transform = `translate(${this.app.panX}px, ${this.app.panY}px) scale(${this.app.zoom})`;
    this.root.style.backgroundPosition = `${this.app.panX}px ${this.app.panY}px`;
    this.root.style.backgroundSize = `${24 * this.app.zoom}px ${24 * this.app.zoom}px`;
    this.drawOverlay();
    this.hooks.onZoom && this.hooks.onZoom();
  }

  // ------------------------------------------------------------ render
  render() {
    const app = this.app; const p = app.project;
    clear(this.world); this.items.clear(); this.links = [];
    const page = app.page; if (!page) { this.drawOverlay(); return; }
    this.errors = []; const missing = new Set();
    for (const n of page.children) {
      if (n.tag === '#text') continue;
      const x = n.attrs.x !== undefined && /^-?\d/.test(n.attrs.x) ? +n.attrs.x : (n._autoX || 0);
      const y = n.attrs.y !== undefined && /^-?\d/.test(n.attrs.y) ? +n.attrs.y : (n._autoY || 0);
      const ctx = MQ.makeCtx(p, { mode: app.mode, editor: true });
      let el;
      try {
        if (n.tag === 'screen') el = MQ.renderScreen(n, ctx);
        else { el = MQ.renderStandalone(n, ctx); el.dataset.id = n.id; el.dataset.tag = n.tag; }
      } catch (e) { el = h('div.cv-error', null, 'Erreur de rendu : ' + e.message); el.dataset.id = n.id; }
      if (n.tag === 'screen' && app.showGrid) el.appendChild(gridOverlay(n, p));
      if (app.showGrid) for (const fr of el.querySelectorAll('[data-id]')) { const fn = app.node(fr.dataset.id); if (fn && fn.attrs && fn.attrs.guides && fn.tag !== 'screen') { fr.style.position = fr.style.position || 'relative'; fr.appendChild(MQ.Guides.guidesOverlay(MQ.Guides.parseGuides(fn.attrs.guides, fr.offsetWidth || +fn.attrs.w || 0, fr.offsetHeight || +fn.attrs.h || 0))); } }
      const wrap = h('div.cv-item', { style: { left: x + 'px', top: y + 'px' } }, el);
      wrap.dataset.item = n.id;
      this.world.appendChild(wrap);
      this.items.set(n.id, wrap);
      if (el._mq) { this.links.push(...(el._mq.links || []).map((l) => ({ ...l, screen: n.id }))); this.errors.push(...el._mq.errors); }
      if (ctx.missingPacks) ctx.missingPacks.forEach((pk) => missing.add(pk));
    }
    // icon packs referenced but not loaded yet: fetch then re-render once
    for (const pk of missing) MQ.loadPack(pk).then((ok) => { if (ok) { clearTimeout(this._packTimer); this._packTimer = setTimeout(() => this.render(), 30); } });
    this.applyTransform();
    requestAnimationFrame(() => this.drawOverlay());
  }

  elOf(id) { return this.world.querySelector(`[data-id="${CSS.escape(id)}"]`); }
  screenEl(id) { const w = this.items.get(id); return w && w.firstChild; }

  // ------------------------------------------------------------ overlay
  drawOverlay() {
    const app = this.app;
    [...this.overlay.querySelectorAll('.ov')].forEach((e) => e.remove());
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    if (!app.page) return;
    // screen labels
    for (const n of app.page.children) {
      if (n.tag !== 'screen') continue;
      const el = this.screenEl(n.id); if (!el) continue;
      const r = this.local(el.getBoundingClientRect());
      const sel = app.selection.includes(n.id);
      const lab = h('div.ov.cv-label' + (sel ? '.sel' : ''), { style: { left: r.x + 'px', top: r.y - 22 + 'px', maxWidth: Math.max(24, r.w) + 'px' } }, (n.attrs.start ? '▶ ' : '') + (n.attrs.name || 'Écran'));
      lab.dataset.screenLabel = n.id;
      this.overlay.appendChild(lab);
    }
    // hover
    if (app.hover && !app.selection.includes(app.hover) && !this.drag) {
      const cr = this.rectOf(app.hover);
      if (cr) { const r = this.local(cr); this.overlay.appendChild(h('div.ov.cv-hover', { style: box(r) })); }
    }
    // selection
    const single = app.selection.length === 1;
    for (const id of (this.sbuild && this.sbuild.active ? [] : app.selection)) {
      const els = this.world.querySelectorAll(`[data-id="${CSS.escape(id)}"]`);
      if (!els.length) { // boolean operand: outline + size, no resize handles
        const cr = this.operandClientRect(id); if (!cr) continue;
        const r = this.local(cr); this.overlay.appendChild(h('div.ov.cv-sel.operand', { style: box(r) }));
        if (single) this.overlay.appendChild(h('div.ov.cv-size', { style: { left: r.x + r.w / 2 + 'px', top: r.y + r.h + 8 + 'px' } }, `${round(r.w / app.zoom)} × ${round(r.h / app.zoom)}`));
        continue;
      }
      els.forEach((el, k) => {
        const r = this.local(el.getBoundingClientRect());
        const b = h('div.ov.cv-sel' + (k > 0 ? '.ghost' : ''), { style: box(r) });
        this.overlay.appendChild(b);
        if (k === 0 && single && !this.drag?.reorder && !this.vedit.active) {
          for (const hd of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
            const hh = h('div.ov.cv-handle.' + hd); hh.dataset.handle = hd;
            const [px, py] = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] }[hd];
            hh.style.left = r.x + r.w * px + 'px'; hh.style.top = r.y + r.h * py + 'px';
            this.overlay.appendChild(hh);
          }
          const n = app.node(id);
          if (n && n.tag !== 'screen' && r.w > 6 && r.h > 6) { const ro = h('div.ov.cv-rotate', { title: 'Rotation (Maj : par 15°)' }); ro.dataset.rotate = id; ro.style.left = r.x + r.w + 12 + 'px'; ro.style.top = r.y - 12 + 'px'; this.overlay.appendChild(ro); }
          const scale = 1 / app.zoom;
          this.overlay.appendChild(h('div.ov.cv-size', { style: { left: r.x + r.w / 2 + 'px', top: r.y + r.h + 8 + 'px' } }, `${round(r.w * scale)} × ${round(r.h * scale)}`));
          if (app.protoView && n && n.tag !== 'screen') {
            const nd = h('div.ov.cv-noodle', { title: 'Glisser vers un écran pour créer un lien' }); nd.dataset.noodle = id;
            nd.style.left = r.x + r.w + 'px'; nd.style.top = r.y + r.h / 2 + 'px';
            this.overlay.appendChild(nd);
          }
        }
      });
    }
    // prototype links
    const showAll = app.protoView;
    for (const l of this.links) {
      if (!l.target) continue;
      if (!showAll && !app.selection.includes(l.owner)) continue;
      const tgt = app.project.screen(l.target); if (!tgt) continue;
      const tEl = this.screenEl(tgt.id); if (!tEl || !l.from.isConnected) continue;
      const a = this.local(l.from.getBoundingClientRect()), b = this.local(tEl.getBoundingClientRect());
      this.arrow(a, b, app.selection.includes(l.owner), l.action);
    }
    if (this.drag && this.drag.guides) for (const g of this.drag.guides) this.overlay.appendChild(h('div.ov.cv-guide' + (g.v ? '.v' : '.hz'), { style: g.v ? { left: g.pos + 'px', top: g.a + 'px', height: g.b - g.a + 'px' } : { top: g.pos + 'px', left: g.a + 'px', width: g.b - g.a + 'px' } }));
    if (this.drag && this.drag.insertBar) this.overlay.appendChild(h('div.ov.cv-insert', { style: box(this.drag.insertBar) }));
    if (this.drag && this.drag.target) this.overlay.appendChild(h('div.ov.cv-droptarget', { style: box(this.drag.target) }));
    if (this.drag && this.drag.marquee) this.overlay.appendChild(h('div.ov.cv-marquee', { style: box(this.drag.marquee) }));
    if (this.drag && this.drag.draw) this.overlay.appendChild(h('div.ov.cv-draw', { style: box(this.drag.draw) }));
    if (this.drag && this.drag.noodle) { const { a, b } = this.drag.noodle; this.curve(a.x, a.y, b.x, b.y, true); }
    if (this.measure) this.drawMeasure(this.measure);
    this.vedit.draw(this.overlay, this.svg);
    this.sbuild.draw(this.overlay, this.svg);
    if (this.trails && this.trails.length) {
      const NS = 'http://www.w3.org/2000/svg'; const R = this.rect;
      const toS = (p) => ({ x: p.x * this.app.zoom + this.app.panX, y: p.y * this.app.zoom + this.app.panY });
      for (const tr of this.trails) {
        const col = `hsl(${tr.hue} 85% 55%)`;
        const pts = tr.pts.map(toS);
        const pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' ')); pl.setAttribute('class', 'cv-trail'); pl.style.stroke = col; this.svg.appendChild(pl);
        pts.forEach((p, i) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', i === 0 || i === pts.length - 1 ? 4.5 : 2.6); c.setAttribute('class', 'cv-trail-dot'); c.style.fill = col; this.svg.appendChild(c); });
      }
    }
    if (this.markers && this.markers.length) {
      const seen = new Set();
      for (const m of this.markers) {
        if (!m.id || seen.has(m.id)) continue; seen.add(m.id);
        const el = this.elOf(m.id); if (!el || !el.isConnected) continue;
        const r = this.local(el.getBoundingClientRect()); if (!r.w) continue;
        const mk = h('div.ov.cv-marker.' + m.level, { title: m.msg, style: { left: r.x + r.w - 4 + 'px', top: r.y - 4 + 'px' } }, m.level === 'error' ? '!' : m.level === 'warn' ? '!' : 'i');
        mk.dataset.mark = m.id;
        this.overlay.appendChild(mk);
      }
    }
  }

  arrow(a, b, hot, action) {
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const left = b.x > x1 ? true : b.x + b.w < a.x ? false : true;
    const x2 = left ? b.x : b.x + b.w, y2 = Math.max(b.y + 12, Math.min(b.y + b.h - 12, y1));
    this.curve(x1, y1, x2, y2, hot, action);
  }

  curve(x1, y1, x2, y2, hot, label) {
    const NS = 'http://www.w3.org/2000/svg';
    const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (x2 >= x1 ? 1 : -1);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', `M${x1} ${y1} C ${x1 + Math.abs(dx)} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    p.setAttribute('class', 'cv-link' + (hot ? ' hot' : ''));
    this.svg.appendChild(p);
    const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x1); c.setAttribute('cy', y1); c.setAttribute('r', 4); c.setAttribute('class', 'cv-link-dot' + (hot ? ' hot' : ''));
    this.svg.appendChild(c);
    const t = document.createElementNS(NS, 'path'); const ang = Math.atan2(y2 - (y2), x2 - (x2 - dx)); const s = 7;
    t.setAttribute('d', `M${x2} ${y2} l${-s * Math.cos(ang - 0.5)} ${-s * Math.sin(ang - 0.5)} M${x2} ${y2} l${-s * Math.cos(ang + 0.5)} ${-s * Math.sin(ang + 0.5)}`);
    t.setAttribute('class', 'cv-link' + (hot ? ' hot' : ''));
    this.svg.appendChild(t);
    if (hot && label) {
      const tr = /\b(smart|dissolve|push[-\w]*|slide[-\w]*|ios|scale|flip|instant)\b/.exec(label);
      if (tr) { const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', (x1 + x2) / 2); tx.setAttribute('y', (y1 + y2) / 2 - 8); tx.setAttribute('class', 'cv-link-label'); tx.textContent = tr[1]; this.svg.appendChild(tx); }
    }
  }

  drawMeasure({ a, b }) {
    const lines = [];
    const z = 1 / this.app.zoom;
    if (b.x > a.x + a.w) lines.push({ x1: a.x + a.w, y1: a.y + a.h / 2, x2: b.x, y2: a.y + a.h / 2, d: b.x - a.x - a.w });
    else if (a.x > b.x + b.w) lines.push({ x1: b.x + b.w, y1: a.y + a.h / 2, x2: a.x, y2: a.y + a.h / 2, d: a.x - b.x - b.w });
    else { if (a.x > b.x) lines.push({ x1: b.x, y1: a.y + a.h / 2, x2: a.x, y2: a.y + a.h / 2, d: a.x - b.x }); if (a.x + a.w < b.x + b.w) lines.push({ x1: a.x + a.w, y1: a.y + a.h / 2, x2: b.x + b.w, y2: a.y + a.h / 2, d: b.x + b.w - a.x - a.w }); }
    if (b.y > a.y + a.h) lines.push({ x1: a.x + a.w / 2, y1: a.y + a.h, x2: a.x + a.w / 2, y2: b.y, d: b.y - a.y - a.h });
    else if (a.y > b.y + b.h) lines.push({ x1: a.x + a.w / 2, y1: b.y + b.h, x2: a.x + a.w / 2, y2: a.y, d: a.y - b.y - b.h });
    else { if (a.y > b.y) lines.push({ x1: a.x + a.w / 2, y1: b.y, x2: a.x + a.w / 2, y2: a.y, d: a.y - b.y }); if (a.y + a.h < b.y + b.h) lines.push({ x1: a.x + a.w / 2, y1: a.y + a.h, x2: a.x + a.w / 2, y2: b.y + b.h, d: b.y + b.h - a.y - a.h }); }
    this.overlay.appendChild(h('div.ov.cv-measure-box', { style: box(b) }));
    for (const l of lines) {
      const v = l.x1 === l.x2;
      this.overlay.appendChild(h('div.ov.cv-mline' + (v ? '.v' : ''), { style: v ? { left: l.x1 + 'px', top: Math.min(l.y1, l.y2) + 'px', height: Math.abs(l.y2 - l.y1) + 'px' } : { top: l.y1 + 'px', left: Math.min(l.x1, l.x2) + 'px', width: Math.abs(l.x2 - l.x1) + 'px' } }));
      this.overlay.appendChild(h('div.ov.cv-mlabel', { style: { left: (l.x1 + l.x2) / 2 + 'px', top: (l.y1 + l.y2) / 2 + 'px' } }, String(round(l.d * z))));
    }
  }

  // ------------------------------------------------------------ hit testing
  chainAt(target) {
    const chain = [];
    let el = target && target.closest ? target.closest('[data-id]') : null;
    while (el && this.world.contains(el)) {
      if (el.dataset.id && this.app.node(el.dataset.id)) chain.unshift(el.dataset.id);
      el = el.parentElement ? el.parentElement.closest('[data-id]') : null;
    }
    return chain; // top-down: [screen/top, ..., deepest]
  }

  pickFromChain(chain, deep) {
    const app = this.app;
    if (!chain.length) return null;
    if (deep) return chain[chain.length - 1];
    const sel = app.selection[0];
    if (sel && chain.includes(sel)) return sel;
    // selection context: siblings of current selection, or children of selected container
    if (sel) {
      const ctxParent = app.parent(sel);
      for (let i = 1; i < chain.length; i++) if (ctxParent && chain[i - 1] === ctxParent.id) return chain[i];
      for (let i = 1; i < chain.length; i++) if (chain[i - 1] === sel) return chain[i];
    }
    return chain.length > 1 ? chain[1] : chain[0];
  }

  // ------------------------------------------------------------ boolean operands
  // Operands have no DOM of their own: their geometry lives in the parent boolean's recipe (el._bool). They are picked,
  // outlined and dragged here, and the boolean is recomputed live (with its corner radius → metaball fusion).
  operandInfo(id) {
    const app = this.app; const n = app.node(id); const par = n && app.parent(id);
    if (!par || par.tag !== 'boolean') return null;
    const pel = this.elOf(par.id); if (!pel || !pel._bool) return null;
    const index = par.children.filter((c) => c.tag !== '#text').indexOf(n);
    const q = pel._bool.parts[index]; if (!q) return null;
    return { n, par, pel, index, q };
  }
  operandClientRect(id) {
    const o = this.operandInfo(id); if (!o) return null;
    const R = o.pel.getBoundingClientRect(); const sx = R.width / +o.pel.dataset.vw, sy = R.height / +o.pel.dataset.vh;
    const b = MQ.Path.bbox(o.q.local); const d = this.drag && this.drag.operand && this.drag.operand.par.id === o.par.id && this.drag.operand.indices.includes(o.index) ? this.drag : null;
    const x = o.q.x + (d ? d.mx || 0 : 0), y = o.q.y + (d ? d.my || 0 : 0);
    return { left: R.left + (x + b.x) * sx, top: R.top + (y + b.y) * sy, width: b.w * sx, height: b.h * sy };
  }
  rectOf(id) { const el = this.elOf(id); return el ? el.getBoundingClientRect() : this.operandClientRect(id); }
  operandAt(boolId, cx, cy) {
    const app = this.app; const pel = this.elOf(boolId); const par = app.node(boolId);
    if (!pel || !pel._bool || !par) return null;
    const R = pel.getBoundingClientRect(); const sx = R.width / +pel.dataset.vw, sy = R.height / +pel.dataset.vh;
    const lx = (cx - R.left) / sx, ly = (cy - R.top) / sy;
    const kids = par.children.filter((c) => c.tag !== '#text');
    const inside = (subs) => { let w = 0; for (const p of MQ.Path.flatten(subs, 1)) { const pts = p.pts; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > ly) !== (yj > ly) && lx < ((xj - xi) * (ly - yi)) / (yj - yi) + xi) w++; } } return w % 2 === 1; };
    let best = null, bestD = Infinity;
    for (let i = pel._bool.parts.length - 1; i >= 0; i--) { // topmost first
      const q = pel._bool.parts[i]; const sub = MQ.Path.translatePath(q.local, q.x, q.y);
      if (inside(sub)) return kids[i] && kids[i].id;
      const b = MQ.Path.bbox(sub); const dd = Math.hypot(Math.max(b.x - lx, 0, lx - b.x - b.w), Math.max(b.y - ly, 0, ly - b.y - b.h));
      if (dd < bestD) { bestD = dd; best = kids[i] && kids[i].id; }
    }
    return bestD < 12 / sx ? best : null;
  }
  // chain-based pick, refined inside a boolean: deep click (⌘/Ctrl) or a selected sibling operand → the operand under the pointer
  pickAt(chain, deep, cx, cy) {
    const app = this.app; let pick = this.pickFromChain(chain, deep);
    const last = chain[chain.length - 1]; const ln = last && app.node(last);
    if (ln && ln.tag === 'boolean' && cx !== undefined) {
      const sel = app.selection[0]; const sp = sel && app.parent(sel);
      if (deep || (sp && sp.id === last)) { const op = this.operandAt(last, cx, cy); if (op) pick = op; }
    }
    return pick;
  }
  // boolean bounds follow the result (Figma): operands are shifted so the outline starts at 0,0
  normalizeBoolean(id) {
    const app = this.app; const par = app.node(id); const pel = this.elOf(id);
    if (!par || !pel || !pel._bool) return;
    const kids = par.children.filter((c) => c.tag !== '#text');
    const b0 = pel._bool;
    const numeric = (v) => v === undefined || /^-?\d+(\.\d+)?$/.test(String(v));
    const pos = (k, q, a) => (numeric(k.attrs[a]) ? +k.attrs[a] || 0 : q[a]); // expression-driven operands: their evaluated value
    const res = MQ.Vector.booleanResult(b0.parts.map((q, i) => MQ.Path.translatePath(q.local, pos(kids[i], q, 'x'), pos(kids[i], q, 'y'))), b0.op, b0);
    const bb = MQ.Path.bbox(res); if (!bb.w || !bb.h) return;
    const canShift = kids.every((k) => numeric(k.attrs.x) && numeric(k.attrs.y));
    if (!canShift) return; // operands animated by expressions: keep the authored box (other states have other extents)
    const ox = canShift ? Math.round(bb.x) : 0, oy = canShift ? Math.round(bb.y) : 0;
    if (ox || oy) for (const k of kids) { app.setAttr(k.id, 'x', round((+k.attrs.x || 0) - ox)); app.setAttr(k.id, 'y', round((+k.attrs.y || 0) - oy)); }
    if (numeric(par.attrs.x) && par.attrs.x !== undefined) app.setAttr(id, 'x', round(+par.attrs.x + ox));
    if (numeric(par.attrs.y) && par.attrs.y !== undefined) app.setAttr(id, 'y', round(+par.attrs.y + oy));
    app.setAttr(id, 'w', Math.ceil(bb.x + bb.w - ox)); app.setAttr(id, 'h', Math.ceil(bb.y + bb.h - oy));
  }
  moveOperand(e, d) {
    const o = d.operand; const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.started) { if (Math.abs(dx) + Math.abs(dy) < 3) return; d.started = true; o.pel._clipLive = true; }
    const R = o.pel.getBoundingClientRect(); const sx = R.width / +o.pel.dataset.vw, sy = R.height / +o.pel.dataset.vh;
    let mx = dx / sx, my = dy / sy;
    if (e.shiftKey) { if (Math.abs(mx) > Math.abs(my)) my = 0; else mx = 0; }
    d.mx = Math.round(mx); d.my = Math.round(my);
    const b = o.pel._bool;
    const parts = b.parts.map((q, i) => MQ.Path.translatePath(q.local, q.x + (o.indices.includes(i) ? d.mx : 0), q.y + (o.indices.includes(i) ? d.my : 0)));
    MQ.Vector.setVectorD(o.pel, MQ.Path.serializePath(MQ.Vector.booleanResult(parts, b.op, b)));
    this.drawOverlay();
  }

  containerAt(cx, cy, exclude) {
    const els = document.elementsFromPoint(cx, cy);
    for (const e of els) {
      if (!this.world.contains(e)) continue;
      let c = e.closest('[data-id]');
      while (c && this.world.contains(c)) {
        const id = c.dataset.id; const n = this.app.node(id);
        const excluded = exclude && exclude.some((x) => x === id || this.app.isAncestor(x, id));
        if (n && !excluded && isContainer(n) && !c.dataset.comp) return { id, el: c, node: n };
        c = c.parentElement && c.parentElement.closest('[data-id]');
      }
    }
    return null;
  }

  layoutEl(el, node) { return node.tag === 'screen' ? el.querySelector('.mq-screen-body') : el; }
  layoutKind(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'flex') return cs.flexDirection.startsWith('row') ? 'row' : 'col';
    if (cs.display === 'grid') return cs.gridTemplateColumns.trim().split(/\s+/).length > 1 ? 'grid' : 'stack';
    return 'stack';
  }

  // ------------------------------------------------------------ events
  bind() {
    const root = this.root;
    root.addEventListener('wheel', (e) => {
      e.preventDefault();
      const app = this.app;
      if (e.ctrlKey || e.metaKey) {
        const r = this.rect; const mx = e.clientX - r.left, my = e.clientY - r.top;
        const z = Math.max(0.05, Math.min(8, app.zoom * Math.pow(1.0018, -e.deltaY * (e.deltaMode ? 30 : 1))));
        app.panX = mx - (mx - app.panX) * (z / app.zoom); app.panY = my - (my - app.panY) * (z / app.zoom); app.zoom = z;
      } else { app.panX -= e.shiftKey ? e.deltaY : e.deltaX; app.panY -= e.shiftKey ? 0 : e.deltaY; }
      this.applyTransform();
    }, { passive: false });

    root.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    root.addEventListener('dblclick', (e) => this.dbl(e));
    root.addEventListener('contextmenu', (e) => { e.preventDefault(); this.context(e); });
    root.addEventListener('pointerleave', () => { if (this.app.hover) { this.app.hover = null; this.drawOverlay(); } });
  }

  down(e) {
    const app = this.app;
    if (this.editing) { if (!e.target.closest('.cv-editing')) e.target.ownerDocument.activeElement && e.target.ownerDocument.activeElement.blur(); return; }
    const t = e.target;
    if (!(t.dataset && t.dataset.screenLabel && e.detail > 1)) e.preventDefault();
    if (document.activeElement && document.activeElement !== document.body && !this.root.contains(document.activeElement)) document.activeElement.blur();
    if (e.button === 1 || this.spaceDown || app.tool === 'hand') { this.drag = { pan: true, sx: e.clientX, sy: e.clientY, px: app.panX, py: app.panY }; this.root.classList.add('panning'); return; }
    if (e.button !== 0) return;
    if (this.sbuild.down(e)) return;
    if (this.vedit.down(e)) return;
    // handles / noodle / labels
    if (t.dataset && t.dataset.handle) return this.startResize(e, t.dataset.handle);
    if (t.dataset && t.dataset.rotate) return this.startRotate(e, t.dataset.rotate);
    if (t.dataset && t.dataset.noodle) { const r = this.local(t.getBoundingClientRect()); this.drag = { noodle: { a: { x: r.x + r.w / 2, y: r.y + r.h / 2 }, b: { x: r.x, y: r.y } }, from: t.dataset.noodle }; return; }
    if (t.dataset && t.dataset.screenLabel) {
      const id = t.dataset.screenLabel;
      if (!app.selection.includes(id)) app.select(id, e.shiftKey);
      return this.startMove(e, [id]);
    }
    if (app.tool !== 'move') return this.startDraw(e);
    const chain = this.chainAt(t);
    if (!chain.length) {
      if (!e.shiftKey) app.select([]);
      const p = this.local({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
      this.drag = { marquee: { x: p.x, y: p.y, w: 0, h: 0 }, sx: p.x, sy: p.y, scope: null };
      return;
    }
    const pick = this.pickAt(chain, e.metaKey || e.ctrlKey, e.clientX, e.clientY);
    const node = app.node(pick);
    if (node && node.tag === 'screen' && !app.selection.includes(pick) && !e.shiftKey) {
      // marquee inside screen
      app.select(pick);
      const p = this.local({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
      this.drag = { marquee: { x: p.x, y: p.y, w: 0, h: 0 }, sx: p.x, sy: p.y, scope: pick, pending: true };
      return;
    }
    if (e.shiftKey) { app.select(pick, true); return; }
    if (!app.selection.includes(pick)) app.select(pick);
    this.startMove(e, app.selection.slice(), e.altKey);
  }

  startMove(e, ids, dup) {
    const app = this.app;
    const first = app.node(ids[0]);
    if (!first) return;
    { const ops = ids.map((id) => this.operandInfo(id)); // dragging operands of one boolean: live recompute
      if (ops.every(Boolean) && ops.every((o) => o.par.id === ops[0].par.id)) { this.drag = { move: true, ids, sx: e.clientX, sy: e.clientY, started: false, operand: { par: ops[0].par, pel: ops[0].pel, indices: ops.map((o) => o.index), ids } }; return; } }
    const el = this.elOf(ids[0]);
    const topLevel = ids.every((id) => app.page.children.includes(app.node(id)));
    const abs = el && getComputedStyle(el).position === 'absolute';
    this.drag = { move: true, ids, sx: e.clientX, sy: e.clientY, started: false, topLevel, abs, dup };
  }

  startResize(e, handle) {
    const app = this.app; const id = app.selection[0]; const n = app.node(id); const el = n.tag === 'screen' ? this.screenEl(id) : this.elOf(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.drag = { resize: handle, id, sx: e.clientX, sy: e.clientY, w0: r.width / app.zoom, h0: r.height / app.zoom, el, abs: getComputedStyle(el).position === 'absolute', x0: +n.attrs.x || el.offsetLeft, y0: +n.attrs.y || el.offsetTop, ratio: r.width / r.height };
  }

  startRotate(e, id) {
    const app = this.app; const el = this.elOf(id); const n = app.node(id); if (!el || !n) return;
    const r = el.getBoundingClientRect(); const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    app.begin(); this.drag = { rotate: true, id, c, a0: Math.atan2(e.clientY - c.y, e.clientX - c.x), rot0: parseFloat(n.attrs.rotate) || 0 };
  }

  startDraw(e) {
    const app = this.app;
    const p = this.local({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
    const cont = this.containerAt(e.clientX, e.clientY, []);
    this.drag = { draw: { x: p.x, y: p.y, w: 0, h: 0 }, sx: p.x, sy: p.y, tool: app.tool, cont, cx: e.clientX, cy: e.clientY };
  }

  move(e) {
    if (this.sbuild.active) { this.sbuild.move(e); return; }
    if (this.vedit.move(e)) return;
    const app = this.app; const d = this.drag;
    if (!d) {
      if (this.editing || !this.root.contains(e.target) && !this.overlay.contains(e.target)) return;
      const chain = this.chainAt(e.target);
      const hov = chain.length ? this.pickAt(chain, e.metaKey || e.ctrlKey, e.clientX, e.clientY) : null;
      const measure = e.altKey && app.selection.length === 1 && hov && hov !== app.selection[0];
      if (hov !== app.hover || measure || this.measure) {
        app.hover = hov;
        this.measure = null;
        if (measure) { const a = this.elOf(app.selection[0]), b = this.elOf(hov); if (a && b) this.measure = { a: this.local(a.getBoundingClientRect()), b: this.local(b.getBoundingClientRect()) }; }
        this.drawOverlay();
        this.hooks.onHover && this.hooks.onHover(hov);
      }
      return;
    }
    if (d.pan) { app.panX = d.px + e.clientX - d.sx; app.panY = d.py + e.clientY - d.sy; this.applyTransform(); return; }
    if (d.noodle) { const p = this.local({ left: e.clientX, top: e.clientY, width: 0, height: 0 }); d.noodle.b = p; this.drawOverlay(); return; }
    if (d.marquee) {
      const p = this.local({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
      d.marquee = { x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) };
      if (d.marquee.w + d.marquee.h > 4) { d.pending = false; this.marqueeSelect(d); }
      this.drawOverlay(); return;
    }
    if (d.draw) {
      const p = this.local({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
      let w = p.x - d.sx, hh = p.y - d.sy;
      if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; }
      d.draw = { x: Math.min(d.sx, d.sx + w), y: Math.min(d.sy, d.sy + hh), w: Math.abs(w), h: Math.abs(hh) };
      this.drawOverlay(); return;
    }
    if (d.resize) return this.doResize(e);
    if (d.rotate) {
      let ang = d.rot0 + ((Math.atan2(e.clientY - d.c.y, e.clientX - d.c.x) - d.a0) * 180) / Math.PI;
      ang = e.shiftKey ? Math.round(ang / 15) * 15 : Math.round(ang);
      ang = ((ang + 180) % 360 + 360) % 360 - 180;
      const n = app.node(d.id); if (ang) n.attrs.rotate = String(ang); else delete n.attrs.rotate;
      app.emit('doc'); return;
    }
    if (d.move && d.operand) return this.moveOperand(e, d);
    if (d.move) {
      const dx = (e.clientX - d.sx) / app.zoom, dy = (e.clientY - d.sy) / app.zoom;
      if (!d.started) {
        if (Math.abs(dx) + Math.abs(dy) < 3 / app.zoom) return;
        d.started = true;
        if (d.dup) { app.begin(); const nids = app.duplicate(d.ids); app.commit('doc'); app.select(nids); d.ids = nids; d.dupDone = true; }
        d.els = d.ids.map((id) => (d.topLevel ? this.items.get(id) : this.elOf(id)));
        d.orig = d.els.map((el) => {
          if (!el) return null;
          if (d.topLevel) return { left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 };
          const par = el.offsetParent || el.parentElement; const pr = par.getBoundingClientRect(), r = el.getBoundingClientRect();
          if (d.abs) { el.style.translate = 'none'; el.style.transform = (el.style.transform || '').replace(/translate[XY]?\([^)]*\)/g, ''); }
          return { left: (r.left - pr.left) / app.zoom - par.clientLeft, top: (r.top - pr.top) / app.zoom - par.clientTop };
        });
        if (!d.topLevel && !d.abs) { d.reorder = true; d.els.forEach((el) => el && (el.style.opacity = '0.35')); }
        if (d.topLevel || d.abs) d.snapLines = this.snapCandidates(d);
      }
      if (d.reorder) return this.reorderPreview(e, d);
      let mx = dx, my = dy;
      d.guides = [];
      if (d.snapLines && !e.metaKey) {
        const s = this.snap(d, dx, dy); mx = s.dx; my = s.dy; d.guides = s.guides;
      }
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) my = 0; else mx = 0; }
      d.els.forEach((el, i) => { if (!el || !d.orig[i]) return; el.style.left = round(d.orig[i].left + mx) + 'px'; el.style.top = round(d.orig[i].top + my) + 'px'; if (!d.topLevel) { el.style.right = 'auto'; el.style.bottom = 'auto'; } });
      d.mx = mx; d.my = my;
      this.drawOverlay();
    }
  }

  snapCandidates(d) {
    // candidate x/y lines in world-space (top-level) or parent-local space (absolute children)
    const app = this.app; const xs = [], ys = [];
    if (d.topLevel) {
      for (const [id, w] of this.items) {
        if (d.ids.includes(id)) continue;
        const l = parseFloat(w.style.left), t = parseFloat(w.style.top), ww = w.offsetWidth, hh = w.offsetHeight;
        xs.push(l, l + ww / 2, l + ww); ys.push(t, t + hh / 2, t + hh);
      }
    } else {
      const el = d.els[0]; const par = el.offsetParent; if (!par) return null;
      xs.push(0, par.clientWidth / 2, par.clientWidth); ys.push(0, par.clientHeight / 2, par.clientHeight);
      // layout guides of the parent frame (or of the screen) are snapping targets too
      { const host = par.closest('[data-id]'); const hn = host && app.node(host.dataset.id); const spec = hn && (hn.attrs.guides || hn.attrs.grid || (hn.tag === 'screen' && app.showGrid ? MQ.Guides.autoGuides(host.offsetWidth) : null));
        if (spec && spec !== 'none') { const off = host === par ? { x: 0, y: 0 } : { x: host.getBoundingClientRect().left - par.getBoundingClientRect().left, y: host.getBoundingClientRect().top - par.getBoundingClientRect().top }; const z = app.zoom; const L = MQ.Guides.guideLines(MQ.Guides.parseGuides(spec, host.offsetWidth, host.offsetHeight)); xs.push(...L.xs.map((x) => x + off.x / z)); ys.push(...L.ys.map((y) => y + off.y / z)); } }
      for (const s of par.children) { if (d.els.includes(s) || !s.dataset || !s.dataset.id) continue; xs.push(s.offsetLeft, s.offsetLeft + s.offsetWidth / 2, s.offsetLeft + s.offsetWidth); ys.push(s.offsetTop, s.offsetTop + s.offsetHeight / 2, s.offsetTop + s.offsetHeight); }
    }
    return { xs, ys };
  }

  snap(d, dx, dy) {
    const el = d.els[0]; const o = d.orig[0]; const w = el.offsetWidth, hh = el.offsetHeight;
    const th = SNAP / this.app.zoom; let bx = null, by = null;
    for (const off of [0, w / 2, w]) for (const x of d.snapLines.xs) { const diff = x - (o.left + dx + off); if (Math.abs(diff) < th && (!bx || Math.abs(diff) < Math.abs(bx.diff))) bx = { diff, x }; }
    for (const off of [0, hh / 2, hh]) for (const y of d.snapLines.ys) { const diff = y - (o.top + dy + off); if (Math.abs(diff) < th && (!by || Math.abs(diff) < Math.abs(by.diff))) by = { diff, y }; }
    const guides = [];
    const toScreen = (vx, vy) => {
      if (d.topLevel) return { x: vx * this.app.zoom + this.app.panX, y: vy * this.app.zoom + this.app.panY };
      const pr = this.local(el.offsetParent.getBoundingClientRect()); return { x: pr.x + vx * this.app.zoom, y: pr.y + vy * this.app.zoom };
    };
    if (bx) { dx += bx.diff; const a = toScreen(bx.x, -5000), b = toScreen(bx.x, 5000); guides.push({ v: true, pos: a.x, a: -5000, b: 10000 }); }
    if (by) { dy += by.diff; const a = toScreen(-5000, by.y); guides.push({ v: false, pos: a.y, a: -5000, b: 10000 }); }
    return { dx, dy, guides };
  }

  reorderPreview(e, d) {
    const cont = this.containerAt(e.clientX, e.clientY, d.ids);
    d.drop = null; d.insertBar = null; d.target = null;
    if (!cont) { this.drawOverlay(); return; }
    const lel = this.layoutEl(cont.el, cont.node);
    const kind = this.layoutKind(lel);
    const cr = this.local(cont.el.getBoundingClientRect());
    d.target = cr;
    if (kind === 'stack') {
      const lr = lel.getBoundingClientRect();
      d.drop = { parent: cont.id, abs: { x: round((e.clientX - lr.left) / this.app.zoom - 20), y: round((e.clientY - lr.top) / this.app.zoom - 20) } };
    } else {
      const kids = [...lel.children].filter((c) => c.dataset && c.dataset.id && !d.ids.includes(c.dataset.id) && getComputedStyle(c).position !== 'absolute');
      const horiz = kind === 'row';
      let index = kids.length, bar;
      for (let i = 0; i < kids.length; i++) {
        const r = kids[i].getBoundingClientRect();
        const before = horiz ? e.clientX < r.left + r.width / 2 : (kind === 'grid' ? (e.clientY < r.top + r.height / 2 && e.clientX < r.right) || e.clientY < r.top : e.clientY < r.top + r.height / 2);
        if (before) { index = i; const lr = this.local(r); bar = horiz || kind === 'grid' ? { x: lr.x - 2, y: lr.y, w: 3, h: lr.h } : { x: lr.x, y: lr.y - 2, w: lr.w, h: 3 }; break; }
      }
      if (!bar) {
        if (kids.length) { const lr = this.local(kids[kids.length - 1].getBoundingClientRect()); bar = horiz || kind === 'grid' ? { x: lr.x + lr.w + 1, y: lr.y, w: 3, h: lr.h } : { x: lr.x, y: lr.y + lr.h + 1, w: lr.w, h: 3 }; }
        else bar = { x: cr.x + 4, y: cr.y + 4, w: horiz ? 3 : cr.w - 8, h: horiz ? cr.h - 8 : 3 };
      }
      // map DOM index -> node index among parent's children
      const pnode = cont.node;
      const refId = kids[index] && kids[index].dataset.id;
      const refNode = refId && this.app.node(refId);
      let nodeIndex = refNode && pnode.children.includes(refNode) ? pnode.children.indexOf(refNode) : pnode.children.length;
      d.drop = { parent: cont.id, index: nodeIndex };
      d.insertBar = bar;
    }
    this.drawOverlay();
  }

  marqueeSelect(d) {
    const app = this.app; const m = d.marquee; const hits = [];
    const inter = (r) => r.x < m.x + m.w && r.x + r.w > m.x && r.y < m.y + m.h && r.y + r.h > m.y;
    if (d.scope) {
      const scr = app.node(d.scope);
      for (const c of scr.children) { if (c.tag === '#text') continue; const el = this.elOf(c.id); if (el && inter(this.local(el.getBoundingClientRect()))) hits.push(c.id); }
      app.selection = hits.length ? hits : [d.scope];
    } else {
      for (const [id, w] of this.items) if (inter(this.local(w.getBoundingClientRect()))) hits.push(id);
      app.selection = hits;
    }
    app.emit('selection');
  }

  doResize(e) {
    const app = this.app; const d = this.drag; const n = app.node(d.id);
    let dx = (e.clientX - d.sx) / app.zoom, dy = (e.clientY - d.sy) / app.zoom;
    let w = d.w0, hh = d.h0, x = d.x0, y = d.y0;
    if (d.resize.includes('e')) w = d.w0 + dx;
    if (d.resize.includes('w')) { w = d.w0 - dx; x = d.x0 + dx; }
    if (d.resize.includes('s')) hh = d.h0 + dy;
    if (d.resize.includes('n')) { hh = d.h0 - dy; y = d.y0 + dy; }
    if (e.shiftKey && d.resize.length === 2) { hh = w / d.ratio; }
    w = Math.max(1, round(w)); hh = Math.max(1, round(hh));
    d.result = { w, h: hh, x: round(x), y: round(y) };
    const horiz = /[ew]/.test(d.resize), vert = /[ns]/.test(d.resize);
    d.horiz = horiz; d.vert = vert;
    if (n.tag === 'screen') { if (horiz) d.el.style.width = w + 'px'; if (vert) d.el.style.height = hh + 'px'; if (d.resize.includes('w')) this.items.get(d.id).style.left = x + 'px'; if (d.resize.includes('n')) this.items.get(d.id).style.top = y + 'px'; }
    else {
      if (horiz) { d.el.style.width = w + 'px'; d.el.style.flex = '0 0 auto'; }
      if (vert) { d.el.style.height = hh + 'px'; }
      if (d.abs) { if (d.resize.includes('w')) d.el.style.left = x + 'px'; if (d.resize.includes('n')) d.el.style.top = y + 'px'; }
    }
    this.drawOverlay();
  }

  up(e) {
    if (this.sbuild.up(e)) return;
    if (this.vedit.up(e)) return;
    const app = this.app; const d = this.drag;
    if (!d) return;
    this.drag = null; this.root.classList.remove('panning');
    if (d.pan) return;
    if (d.noodle) {
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      let target = null;
      for (const el of els) { const s = el.closest && el.closest('.mq-screen'); if (s && this.world.contains(s)) { target = s.dataset.screen; break; } if (el.dataset && el.dataset.screenLabel) { target = app.node(el.dataset.screenLabel).attrs.name; break; } }
      if (target) { const fromNode = app.node(d.from); const scr = app.project.screenOf(d.from); if (!scr || scr.attrs.name !== target) { app.change(() => app.setAttr(d.from, 'on:click', `go ${/\s/.test(target) ? JSON.stringify(target) : target} smart`)); toast(`Lien créé → ${target}`); } }
      this.drawOverlay(); return;
    }
    if (d.marquee) { if (d.pending) app.select(d.scope); this.drawOverlay(); return; }
    if (d.rotate) { app.commit(); return; }
    if (d.draw) return this.finishDraw(d, e);
    if (d.resize) {
      if (!d.result) return;
      const n = app.node(d.id); const r = d.result;
      app.change(() => {
        if (d.horiz) app.setAttr(d.id, 'w', r.w);
        if (d.vert) app.setAttr(d.id, 'h', r.h);
        if (n.tag === 'screen') { if (d.resize.includes('w')) app.setAttr(d.id, 'x', r.x); if (d.resize.includes('n')) app.setAttr(d.id, 'y', r.y); }
        else if (d.abs) { if (d.resize.includes('w')) app.setAttr(d.id, 'x', r.x); if (d.resize.includes('n')) app.setAttr(d.id, 'y', r.y); }
      });
      return;
    }
    if (d.move && d.operand) {
      const o = d.operand; o.pel._clipLive = false;
      if (!d.started) { if (!e.shiftKey && app.selection.length > 1) { const pick = this.operandAt(o.par.id, e.clientX, e.clientY); if (pick) app.select(pick); } return; }
      if (!d.mx && !d.my) { app.emit('doc'); return; }
      app.change(() => {
        // start from the evaluated position: an operand placed by an expression ({$on ? 0 : 40}) becomes a literal where it was dropped
        const kids = o.par.children.filter((c) => c.tag !== '#text'); const parts = o.pel._bool.parts;
        o.ids.forEach((id) => { const n = app.node(id); const q = parts[kids.findIndex((k) => k.id === id)]; const x0 = q ? q.x : +n.attrs.x || 0, y0 = q ? q.y : +n.attrs.y || 0; app.setAttr(id, 'x', round(x0 + d.mx)); app.setAttr(id, 'y', round(y0 + d.my)); });
        // refresh the recipe so normalisation sees the new positions
        this.normalizeBoolean(o.par.id);
      });
      return;
    }
    if (d.move) {
      if (!d.started) {
        if (!e.shiftKey) { const chain = this.chainAt(e.target); const pick = this.pickAt(chain, e.metaKey || e.ctrlKey, e.clientX, e.clientY); if (pick && app.selection.length > 1) app.select(pick); }
        return;
      }
      if (d.reorder) {
        d.els.forEach((el) => el && (el.style.opacity = ''));
        if (!d.drop) { this.drawOverlay(); return; }
        app.change(() => {
          for (const id of d.ids) {
            const n = app.node(id);
            if (d.drop.abs) { app.move(id, d.drop.parent, undefined); n.attrs.x = String(d.drop.abs.x); n.attrs.y = String(d.drop.abs.y); }
            else { app.move(id, d.drop.parent, d.drop.index); delete n.attrs.x; delete n.attrs.y; delete n.attrs.absolute; if (d.drop.index !== undefined) d.drop.index++; }
          }
        });
        return;
      }
      app.change(() => {
        d.ids.forEach((id, i) => {
          const el = d.els[i]; if (!el) return;
          const n = app.node(id);
          app.setAttr(id, 'x', round(parseFloat(el.style.left)));
          app.setAttr(id, 'y', round(parseFloat(el.style.top)));
          if (!d.topLevel) { for (const k of ['right', 'bottom', 'place', 'inset']) delete n.attrs[k]; }
        });
      });
    }
  }

  finishDraw(d, e) {
    const app = this.app; const z = app.zoom;
    let { w, h: hh } = d.draw; const click = w < 4 && hh < 4;
    const tool = d.tool;
    if (tool.startsWith('shape:')) { d.kind = tool.slice(6); d.tool = 'shape'; return this.finishDraw({ ...d, tool: 'shape' }, e); }
    const defaults = { shape: [120, 120], frame: [200, 120], rect: [120, 80], ellipse: [80, 80], text: [0, 0], image: [240, 160], note: [240, 0], icon: [24, 24] }[tool] || [100, 100];
    w = click ? defaults[0] : round(w / z); hh = click ? defaults[1] : round(hh / z);
    const make = () => {
      const id = MQ.newId();
      switch (tool) {
        case 'frame': return { id, tag: 'frame', attrs: { w: String(w), h: String(hh), fill: '#FFFFFF', radius: '12' }, children: [] };
        case 'rect': return { id, tag: 'rect', attrs: { w: String(w), h: String(hh), fill: '#D9D9E3', radius: '8' }, children: [] };
        case 'ellipse': return { id, tag: 'ellipse', attrs: { w: String(w), h: String(hh), fill: '#D9D9E3' }, children: [] };
        case 'image': return { id, tag: 'image', attrs: { src: 'gen:mountains/' + Math.floor(Math.random() * 99), w: String(w), h: String(hh), radius: '12' }, children: [] };
        case 'note': return { id, tag: 'note', attrs: { w: String(w) }, children: [{ id: MQ.newId(), tag: '#text', text: 'Note…' }] };
        case 'icon': return { id, tag: 'icon', attrs: { name: 'star', size: '24' }, children: [] };
        case 'shape': return { id, tag: 'shape', attrs: { kind: d.kind || 'star', w: String(w), h: String(hh), fill: '#6E56F8' }, children: [] };
        default: return { id, tag: 'text', attrs: click ? {} : { w: String(w) }, children: [{ id: MQ.newId(), tag: '#text', text: 'Texte' }] };
      }
    };
    const node = make();
    const start = this.toWorld(d.cx, d.cy);
    const worldPos = { x: round(Math.min(start.x, start.x + (d.draw.x - d.sx) / z)), y: round(Math.min(start.y, start.y + (d.draw.y - d.sy) / z)) };
    app.change(() => {
      if (!d.cont || tool === 'note') {
        if (tool === 'frame') {
          node.tag = 'screen'; node.attrs = { name: uniqueName(app.project, 'Écran'), w: String(click ? 393 : w), h: String(click ? 852 : hh), x: String(worldPos.x), y: String(worldPos.y), fill: '#FFFFFF' };
        } else { node.attrs.x = String(worldPos.x); node.attrs.y = String(worldPos.y); }
        app.insert(null, node);
      } else {
        const lel = this.layoutEl(d.cont.el, d.cont.node);
        const kind = this.layoutKind(lel);
        if (kind === 'stack') {
          const lr = lel.getBoundingClientRect();
          node.attrs.x = String(round((d.cx - lr.left) / z)); node.attrs.y = String(round((d.cy - lr.top) / z));
        }
        app.insert(d.cont.id, node);
      }
      app.selection = [node.id];
    });
    app.tool = 'move'; app.emit('tool');
    if (tool === 'text' || tool === 'note') requestAnimationFrame(() => this.editText(node.id));
  }

  dbl(e) {
    const app = this.app;
    if (this.vedit.dbl(e)) return;
    { const s0 = app.selNodes[0]; const ch0 = this.chainAt(e.target);
      // double-click a boolean → select the operand under the pointer (Figma enters the group); again → edit its points
      if (s0 && s0.tag === 'boolean' && ch0.includes(s0.id)) { const op = this.operandAt(s0.id, e.clientX, e.clientY); if (op) { app.select(op); return; } this.vedit.enter(s0.id); return; }
      const sp = s0 && this.operandInfo(s0.id);
      if (sp && ch0.includes(sp.par.id)) { const op = this.operandAt(sp.par.id, e.clientX, e.clientY); if (op && op !== s0.id) { app.select(op); return; } this.vedit.enter(s0.id); return; }
      if (s0 && ['vector', 'shape', 'path'].includes(s0.tag) && ch0.includes(s0.id)) { this.vedit.enter(s0.id); return; } }
    if (e.target.dataset && e.target.dataset.screenLabel) return this.renameScreen(e.target.dataset.screenLabel, e.target);
    const chain = this.chainAt(e.target);
    if (!chain.length) return;
    const sel = app.selection[0];
    const n = sel && app.node(sel);
    if (n && (n.tag === 'text' || n.tag === 'note') && chain.includes(sel)) return this.editText(sel);
    let next = null;
    if (sel && chain.includes(sel)) next = chain[chain.indexOf(sel) + 1];
    else next = this.pickFromChain(chain, false);
    if (next) {
      app.select(next);
      const nn = app.node(next);
      if (nn && (nn.tag === 'text' || nn.tag === 'note') && chain[chain.length - 1] === next) this.editText(next);
    } else if (n && /^(\w+\.)?[A-Z]/.test(n.tag)) this.hooks.onEditComponent && this.hooks.onEditComponent(n.tag);
  }

  renameScreen(id, labelEl) {
    const app = this.app; const n = app.node(id);
    const inp = h('input.cv-rename', { value: n.attrs.name || '' });
    const r = labelEl.getBoundingClientRect(); const R = this.rect;
    inp.style.left = r.left - R.left + 'px'; inp.style.top = r.top - R.top + 'px';
    this.overlay.appendChild(inp); inp.focus(); inp.select();
    const done = (ok) => { const v = inp.value.trim(); inp.remove(); if (ok && v && v !== n.attrs.name) app.change(() => renameScreenEverywhere(app, n.attrs.name, v, n)); };
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); ev.stopPropagation(); });
    inp.addEventListener('blur', () => done(true));
  }

  editText(id) {
    const app = this.app; const n = app.node(id); const el = this.elOf(id);
    if (!n || !el) return;
    const simple = (n.children || []).every((c) => c.tag === '#text') && !MQ.textOf(n).includes('{');
    if (!simple) { this.hooks.onEditCode && this.hooks.onEditCode(id); toast('Texte riche/dynamique : édition dans le code'); return; }
    this.editing = id;
    el.contentEditable = 'plaintext-only';
    el.classList.add('cv-editing');
    el.focus();
    const range = document.createRange(); range.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(range);
    const finish = (save) => {
      el.removeEventListener('blur', onBlur); el.removeEventListener('keydown', onKey);
      el.contentEditable = 'false'; el.classList.remove('cv-editing'); this.editing = null;
      const txt = el.innerText.replace(/\n$/, '');
      if (save && txt !== MQ.textOf(n)) app.change(() => { n.children = [{ id: MQ.newId(), tag: '#text', text: txt }]; delete n.implicit; });
      else app.emit('doc');
    };
    const onBlur = () => finish(true);
    const onKey = (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') { finish(false); } if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) el.blur(); };
    el.addEventListener('blur', onBlur); el.addEventListener('keydown', onKey);
    this.drawOverlay();
  }

  context(e) {
    const app = this.app;
    const chain = this.chainAt(e.target);
    // right-click inside the current selection keeps it (Figma): the menu acts on what is selected
    const opSel = app.selection.some((id) => { const o = this.operandInfo(id); return o && chain.includes(o.par.id); });
    if (chain.length && !opSel && !chain.some((id) => app.selection.includes(id))) { const pick = this.pickAt(chain, e.metaKey || e.ctrlKey, e.clientX, e.clientY); app.select(pick); }
    this.hooks.onContext && this.hooks.onContext(e.clientX, e.clientY);
  }

  // ------------------------------------------------------------ view
  zoomToFit(ids) {
    const app = this.app; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const els = ids && ids.length ? ids.map((id) => this.elOf(id) || this.items.get(id)).filter(Boolean) : [...this.items.values()];
    if (!els.length) return;
    for (const el of els) { const r = el.getBoundingClientRect(); const a = this.toWorld(r.left, r.top), b = this.toWorld(r.right, r.bottom); minX = Math.min(minX, a.x); minY = Math.min(minY, a.y); maxX = Math.max(maxX, b.x); maxY = Math.max(maxY, b.y); }
    const R = this.rect; const pad = 80;
    const z = Math.min(4, Math.max(0.05, Math.min((R.width - pad * 2) / (maxX - minX || 1), (R.height - pad * 2) / (maxY - minY || 1))));
    app.zoom = z; app.panX = (R.width - (maxX - minX) * z) / 2 - minX * z; app.panY = (R.height - (maxY - minY) * z) / 2 - minY * z + 10;
    this.applyTransform();
  }
  zoomBy(f) { const R = this.rect; const app = this.app; const mx = R.width / 2, my = R.height / 2; const z = Math.max(0.05, Math.min(8, app.zoom * f)); app.panX = mx - (mx - app.panX) * (z / app.zoom); app.panY = my - (my - app.panY) * (z / app.zoom); app.zoom = z; this.applyTransform(); }
  zoomTo(z) { this.zoomBy(z / this.app.zoom); }
}

// Figma-like layout grid: grid="cols margin gutter" (or default by device), baseline="8"
export function gridOverlay(screen, project) {
  const { w, h } = project.sizeOf(screen);
  let spec = screen.attrs.guides || screen.attrs.grid;
  if (spec === 'none') return h0('span');
  if (!spec || spec === true || spec === 'auto') spec = MQ.Guides.autoGuides(w);
  const g = MQ.Guides.guidesOverlay(MQ.Guides.parseGuides(spec, w, h));
  g.classList.add('cv-grid');
  const base = screen.attrs.baseline ? +screen.attrs.baseline : 0;
  if (base) g.style.backgroundImage = `repeating-linear-gradient(to bottom, rgba(255,40,90,.10) 0 1px, transparent 1px ${base}px)`;
  return g;
}
const h0 = (t) => document.createElement(t);

function box(r) { return { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }; }

export function renameScreenEverywhere(app, oldName, newName, node) {
  node.attrs.name = newName;
  const re = new RegExp(`\\b(go|overlay|swap|open|navigate)\\s+("${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"|${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=\\s|;|$)`, 'g');
  const rep = /\s/.test(newName) ? JSON.stringify(newName) : newName;
  const walk = (n) => { for (const [k, v] of Object.entries(n.attrs || {})) if ((k.startsWith('on:') || k.startsWith('@')) && typeof v === 'string') n.attrs[k] = v.replace(re, (_, c) => `${c} ${rep}`); (n.children || []).forEach(walk); };
  app.project.nodes.forEach(walk);
}
