// Vector editing on the canvas: point editing (anchors, bézier handles), pen, pencil, shape rigs.
import { MQ, h, toast } from './dom.js';

const P = () => MQ.Path;
const NS = 'http://www.w3.org/2000/svg';

// rig handles for parametric shapes: each handle maps a local point to a parameter value
const RIGS = {
  star: (w, h, p) => { const inner = +p.inner || 0.45, n = +p.points || 5; const a = ((-90 + 180 / n) * Math.PI) / 180; return [{ param: 'inner', x: w / 2 + Math.cos(a) * (w / 2) * inner, y: h / 2 + Math.sin(a) * (h / 2) * inner, map: (lx, ly) => clamp(Math.hypot((lx - w / 2) / (w / 2), (ly - h / 2) / (h / 2)), 0.08, 0.98).toFixed(2) }]; },
  burst: (w, h, p) => { const d = +p.depth || 0.82, n = +p.points || 16; const a = ((-90 + 180 / n) * Math.PI) / 180; return [{ param: 'depth', x: w / 2 + Math.cos(a) * (w / 2) * d, y: h / 2 + Math.sin(a) * (h / 2) * d, map: (lx, ly) => clamp(Math.hypot((lx - w / 2) / (w / 2), (ly - h / 2) / (h / 2)), 0.3, 0.98).toFixed(2) }]; },
  ellipse: (w, h, p) => {
    const st = +p.start || 0, sw = p.sweep === undefined ? 360 : +p.sweep, r = +p.ratio || 0;
    const pt = (deg, k = 1) => ({ x: w / 2 + Math.cos((deg * Math.PI) / 180) * (w / 2) * k, y: h / 2 + Math.sin((deg * Math.PI) / 180) * (h / 2) * k });
    const ang = (lx, ly) => (Math.atan2((ly - h / 2) / (h / 2), (lx - w / 2) / (w / 2)) * 180) / Math.PI;
    return [
      { param: 'start', ...pt(st, 0.92), map: (lx, ly) => Math.round(ang(lx, ly)) },
      { param: 'sweep', ...pt(st + Math.min(sw, 359.9), 0.92), map: (lx, ly) => { let s = ang(lx, ly) - st; while (s <= 0) s += 360; return Math.round(s >= 358 ? 360 : s); } },
      { param: 'ratio', ...pt(st + Math.min(sw, 359.9) / 2, Math.max(0.05, r)), map: (lx, ly) => clamp(Math.hypot((lx - w / 2) / (w / 2), (ly - h / 2) / (h / 2)), 0, 0.95).toFixed(2) },
    ];
  },
  rect: (w, h, p) => { const r = +p.radius || 0; const k = Math.min(r, Math.min(w, h) / 2); return [{ param: 'radius', x: Math.max(10, k * 0.7 + 4), y: Math.max(10, k * 0.7 + 4), map: (lx, ly) => Math.round(clamp(((lx + ly) / 2 - 4) / 0.7, 0, Math.min(w, h) / 2)) }]; },
  polygon: (w, h, p) => { const r = +p.radius || 0; return [{ param: 'radius', x: w / 2, y: Math.max(8, r * 0.6 + 6), map: (lx, ly) => Math.round(clamp((ly - 6) / 0.6, 0, Math.min(w, h) / 3)) }]; },
  ring: (w, h, p) => { const r = +p.ratio || 0.6; return [{ param: 'ratio', x: w / 2 + (w / 2) * r, y: h / 2, map: (lx) => clamp((lx - w / 2) / (w / 2), 0.05, 0.95).toFixed(2) }]; },
  arrow: (w, h, p) => { const hd = +p.head || 0.42; return [{ param: 'head', x: w - w * hd, y: 4, map: (lx) => clamp((w - lx) / w, 0.1, 0.9).toFixed(2) }]; },
  bubble: (w, h, p) => { const t = +p.tail || 0.25; return [{ param: 'tail', x: w * t, y: h - 2, map: (lx) => clamp(lx / w, 0.08, 0.85).toFixed(2) }]; },
  wave: (w, h, p) => [{ param: 'amp', x: w / 4, y: 2, map: (lx, ly) => clamp(0.45 - ly / h, 0.02, 0.45).toFixed(2) }],
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class VectorEditor {
  constructor(canvas, app) { this.canvas = canvas; this.app = app; this.id = null; this.sel = new Set(); this.pen = null; this.pencil = null; this.drag = null; }

  get active() { return !!this.id; }

  // geometry helpers: local (path) coords <-> canvas-overlay coords
  frame() {
    const el = this.canvas.elOf(this.id); if (!el) return null;
    const r = this.canvas.local(el.getBoundingClientRect());
    const vw = +el.dataset.vw || r.w, vh = +el.dataset.vh || r.h;
    return { el, r, sx: r.w / vw, sy: r.h / vh, vw, vh };
  }
  toScreen(p, F) { return { x: F.r.x + p.x * F.sx, y: F.r.y + p.y * F.sy }; }
  toLocal(cx, cy, F) { const R = this.canvas.rect; return { x: (cx - R.left - F.r.x) / F.sx, y: (cy - R.top - F.r.y) / F.sy }; }

  // ------------------------------------------------------------ enter / exit point editing
  enter(id) {
    const app = this.app; let n = app.node(id); if (!n) return;
    const el = this.canvas.elOf(id);
    if (!['vector', 'shape', 'rect', 'ellipse', 'boolean', 'svg', 'path'].includes(n.tag)) return;
    if (n.tag !== 'vector' || !el || !el._path) {
      if (!el || !el._path) { toast('Sélectionne une forme rendue pour éditer ses points'); return; }
      // convert to an editable vector (Figma does the same when you edit a shape's points)
      app.change(() => { this.toVector(n, el); });
      n = app.node(id);
      if (n.tag !== 'vector') return;
      toast('Forme convertie en vecteur éditable');
    }
    this.id = id; this.sel.clear(); this.subs = P().parsePath(n.attrs.d || '');
    this.canvas.root.classList.add('vedit');
    this.canvas.drawOverlay();
  }
  exit() { if (!this.id) return; this.id = null; this.sel.clear(); this.canvas.root.classList.remove('vedit'); this.canvas.drawOverlay(); }

  toVector(n, el) {
    const box = el._box || { w: el.offsetWidth, h: el.offsetHeight };
    const keep = {}; for (const k of ['name', 'key', 'x', 'y', 'fill', 'stroke', 'shadow', 'opacity', 'rotate', 'anim', 'loop', 'blend', 'blur', 'tilt', 'depth', 'absolute', 'place', 'top', 'left', 'right', 'bottom', 'cap', 'join', 'dash', 'start', 'end', 'mask', 'class']) if (n.attrs[k] !== undefined) keep[k] = n.attrs[k];
    if (n.tag === 'rect' || n.tag === 'ellipse') if (keep.fill === undefined && n.attrs.bg) keep.fill = n.attrs.bg;
    n.tag = 'vector'; n.attrs = { ...keep, w: String(Math.round(box.w)), h: String(Math.round(box.h)), d: P().serializePath(el._path) };
    n.children = [];
  }

  commit() {
    const app = this.app; const n = app.node(this.id); if (!n) return;
    // normalize: keep the path inside its own box (Figma recomputes the vector bounds)
    const bb = P().bbox(this.subs);
    let subs = this.subs;
    const shift = bb.w > 0 && (Math.abs(bb.x) > 0.5 || Math.abs(bb.y) > 0.5 || Math.abs(bb.x + bb.w - +n.attrs.w) > 0.5 || Math.abs(bb.y + bb.h - +n.attrs.h) > 0.5);
    app.change(() => {
      if (shift) {
        subs = P().translatePath(subs, -bb.x, -bb.y); this.subs = subs;
        n.attrs.w = String(Math.max(1, Math.round(bb.w))); n.attrs.h = String(Math.max(1, Math.round(bb.h)));
        if (n.attrs.x !== undefined && /^-?\d/.test(n.attrs.x)) n.attrs.x = String(Math.round(+n.attrs.x + bb.x));
        if (n.attrs.y !== undefined && /^-?\d/.test(n.attrs.y)) n.attrs.y = String(Math.round(+n.attrs.y + bb.y));
      }
      n.attrs.d = P().serializePath(subs);
    });
  }

  // ------------------------------------------------------------ overlay drawing
  draw(overlay, svg) {
    if (this.pen || this.pencil) this.drawCreation(svg);
    const app = this.app;
    if (!this.id && app.selection.length === 1 && app.tool === 'move') this.drawRig(overlay);
    if (!this.id) return;
    const F = this.frame(); if (!F) { this.exit(); return; }
    const d = P().serializePath(P().transformPath(this.subs, (p) => this.toScreen(p, F)));
    const hit = document.createElementNS(NS, 'path'); hit.setAttribute('d', d); hit.setAttribute('class', 've-hit'); hit.dataset.vseg = '1'; svg.appendChild(hit);
    const line = document.createElementNS(NS, 'path'); line.setAttribute('d', d); line.setAttribute('class', 've-path'); svg.appendChild(line);
    this.subs.forEach((s, si) => s.nodes.forEach((nd, ni) => {
      const key = si + ':' + ni; const sel = this.sel.has(key);
      const near = sel || [...this.sel].some((k) => { const [a, b] = k.split(':').map(Number); return a === si && Math.abs(b - ni) <= 1; });
      if (near) for (const hk of ['in', 'out']) {
        if (!nd[hk]) continue;
        const a = this.toScreen(nd, F), b = this.toScreen(nd[hk], F);
        const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', a.x); l.setAttribute('y1', a.y); l.setAttribute('x2', b.x); l.setAttribute('y2', b.y); l.setAttribute('class', 've-arm'); svg.appendChild(l);
        overlay.appendChild(h('div.ov.ve-handle', { style: { left: b.x + 'px', top: b.y + 'px' }, dataset: { vh: key + ':' + hk } }));
      }
      const p = this.toScreen(nd, F);
      overlay.appendChild(h('div.ov.ve-anchor' + (sel ? '.sel' : '') + (nd.in || nd.out ? '.smooth' : ''), { style: { left: p.x + 'px', top: p.y + 'px' }, dataset: { va: key }, title: 'Glisser · double-clic : angle/courbe · Suppr : supprimer' }));
    }));
    overlay.appendChild(h('div.ov.ve-help', { style: { left: F.r.x + 'px', top: F.r.y + F.r.h + 12 + 'px' } }, 'Points : glisser · Alt casse les poignées · clic sur le tracé ajoute un point · double-clic angle/courbe · Entrée pour terminer'));
  }

  drawRig(overlay) {
    const id = this.app.selection[0]; const n = this.app.node(id); if (!n) return;
    const kind = n.tag === 'shape' ? n.attrs.kind || 'rect' : n.tag === 'rect' ? 'rect' : n.tag === 'ellipse' ? 'ellipse' : null;
    if (!kind || !RIGS[kind]) return;
    const el = this.canvas.elOf(id); if (!el) return;
    const r = this.canvas.local(el.getBoundingClientRect());
    const vw = +el.dataset.vw || el.offsetWidth, vh = +el.dataset.vh || el.offsetHeight;
    const params = n.tag === 'shape' ? n.attrs : { radius: n.attrs.radius, start: n.attrs.start, sweep: n.attrs.sweep, ratio: n.attrs.ratio };
    RIGS[kind](vw, vh, params).forEach((hd, i) => {
      overlay.appendChild(h('div.ov.ve-rig', { title: `${hd.param} (glisser)`, style: { left: r.x + hd.x * (r.w / vw) + 'px', top: r.y + hd.y * (r.h / vh) + 'px' }, dataset: { rig: `${id}|${kind}|${i}` } }));
    });
  }

  drawCreation(svg) {
    const C = this.pen || this.pencil; if (!C) return;
    const z = this.app.zoom; const L = this.canvas.local(C.lel.getBoundingClientRect());
    const toS = (p) => ({ x: L.x + p.x * z, y: L.y + p.y * z });
    let d;
    if (this.pencil) d = 'M' + this.pencil.pts.map(([x, y]) => { const s = toS({ x, y }); return `${s.x} ${s.y}`; }).join(' L');
    else { d = P().serializePath(P().transformPath([{ closed: false, nodes: this.pen.nodes }], toS)); if (this.pen.hover && this.pen.nodes.length) { const a = toS(this.pen.nodes[this.pen.nodes.length - 1]), b = toS(this.pen.hover); d += ` M${a.x} ${a.y} L${b.x} ${b.y}`; } }
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', 've-path'); svg.appendChild(p);
    if (this.pen) this.pen.nodes.forEach((nd, i) => { const s = toS(nd); const c = document.createElementNS(NS, 'rect'); c.setAttribute('x', s.x - 4); c.setAttribute('y', s.y - 4); c.setAttribute('width', 8); c.setAttribute('height', 8); c.setAttribute('class', 've-anchor-svg' + (i === 0 ? ' first' : '')); svg.appendChild(c); });
  }

  // ------------------------------------------------------------ pointer handling (returns true when consumed)
  down(e) {
    const t = e.target; const app = this.app;
    if (t.dataset && t.dataset.rig) {
      const [id, kind, i] = t.dataset.rig.split('|'); const n = app.node(id); const el = this.canvas.elOf(id);
      app.begin(); this.drag = { rig: true, id, kind, i: +i, el, n }; e.preventDefault(); return true;
    }
    if (app.tool === 'pen') return this.penDown(e);
    if (app.tool === 'pencil') return this.pencilDown(e);
    if (!this.id) return false;
    const F = this.frame(); if (!F) return false;
    if (t.dataset && t.dataset.va) {
      const key = t.dataset.va;
      if (e.shiftKey) { this.sel.has(key) ? this.sel.delete(key) : this.sel.add(key); } else if (!this.sel.has(key)) { this.sel.clear(); this.sel.add(key); }
      this.drag = { anchors: [...this.sel], sx: e.clientX, sy: e.clientY, orig: JSON.parse(JSON.stringify(this.subs)), F };
      this.canvas.drawOverlay(); return true;
    }
    if (t.dataset && t.dataset.vh) { const [si, ni, hk] = t.dataset.vh.split(':'); this.drag = { handle: [+si, +ni, hk], F, alt: e.altKey }; return true; }
    if (t.dataset && t.dataset.vseg) {
      const l = this.toLocal(e.clientX, e.clientY, F); const nr = P().nearest(this.subs, l.x, l.y);
      if (nr) { const s = this.subs[nr.sub]; const N = s.nodes; const bi = nr.k; const ai = (bi - 1 + N.length) % N.length; const mid = P().splitAt(N[ai], N[bi], nr.t); N.splice(bi === 0 ? N.length : bi, 0, mid); this.sel.clear(); this.sel.add(nr.sub + ':' + (bi === 0 ? N.length - 1 : bi)); this.commit(); }
      return true;
    }
    // click outside the path: leave edit mode
    if (!F.el.contains(t)) { this.exit(); return false; }
    this.sel.clear(); this.canvas.drawOverlay(); return true;
  }

  move(e) {
    const D = this.drag;
    if (this.pen) { this.penMove(e); return true; }
    if (this.pencil && this.pencil.down) { const L = this.pencil.lel.getBoundingClientRect(); const z = this.app.zoom; this.pencil.pts.push([(e.clientX - L.left) / z, (e.clientY - L.top) / z]); this.canvas.drawOverlay(); return true; }
    if (!D) return false;
    if (D.rig) {
      const { n, el, kind, i } = D; const r = el.getBoundingClientRect(); const vw = +el.dataset.vw || el.offsetWidth, vh = +el.dataset.vh || el.offsetHeight;
      const lx = (e.clientX - r.left) * (vw / r.width), ly = (e.clientY - r.top) * (vh / r.height);
      const params = n.tag === 'shape' ? n.attrs : n.attrs;
      const hd = RIGS[kind](vw, vh, params)[i]; n.attrs[hd.param] = String(hd.map(lx, ly));
      this.app.emit('doc'); return true;
    }
    const F = D.F || this.frame(); if (!F) return true;
    if (D.anchors) {
      let dx = (e.clientX - D.sx) / F.sx, dy = (e.clientY - D.sy) / F.sy;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      for (const key of D.anchors) {
        const [si, ni] = key.split(':').map(Number); const o = D.orig[si].nodes[ni]; const nd = this.subs[si].nodes[ni];
        nd.x = o.x + dx; nd.y = o.y + dy; if (o.in) nd.in = { x: o.in.x + dx, y: o.in.y + dy }; if (o.out) nd.out = { x: o.out.x + dx, y: o.out.y + dy };
      }
      this.preview(); return true;
    }
    if (D.handle) {
      const [si, ni, hk] = D.handle; const nd = this.subs[si].nodes[ni]; const l = this.toLocal(e.clientX, e.clientY, F);
      nd[hk] = { x: l.x, y: l.y };
      const other = hk === 'in' ? 'out' : 'in';
      if (!e.altKey && !D.alt && nd[other]) { // mirrored angle, keep the other arm's length (Figma "mirror angle")
        const len = Math.hypot(nd[other].x - nd.x, nd[other].y - nd.y); const ang = Math.atan2(l.y - nd.y, l.x - nd.x) + Math.PI;
        nd[other] = { x: nd.x + Math.cos(ang) * len, y: nd.y + Math.sin(ang) * len };
      }
      this.preview(); return true;
    }
    return false;
  }

  up(e) {
    if (this.pencil && this.pencil.down) return this.pencilUp(e);
    const D = this.drag; this.drag = null;
    if (!D) return !!this.pen;
    if (D.rig) { this.app.commit(); return true; }
    if (D.anchors || D.handle) { this.commit(); return true; }
    return false;
  }

  dbl(e) {
    const t = e.target;
    if (this.pen) { this.finishPen(false); return true; }
    if (this.id && t.dataset && t.dataset.va) {
      const [si, ni] = t.dataset.va.split(':').map(Number); const s = this.subs[si]; const nd = s.nodes[ni];
      if (nd.in || nd.out) { nd.in = null; nd.out = null; }
      else { const N = s.nodes; const prev = N[(ni - 1 + N.length) % N.length], next = N[(ni + 1) % N.length]; const dx = (next.x - prev.x) / 6, dy = (next.y - prev.y) / 6; nd.in = { x: nd.x - dx, y: nd.y - dy }; nd.out = { x: nd.x + dx, y: nd.y + dy }; }
      this.commit(); return true;
    }
    return false;
  }

  key(e) {
    if (this.pen && (e.key === 'Enter' || e.key === 'Escape')) { this.finishPen(false); return true; }
    if (!this.id) return false;
    if (e.key === 'Enter' || e.key === 'Escape') { this.exit(); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel.size) {
      const bySub = new Map(); for (const k of this.sel) { const [si, ni] = k.split(':').map(Number); if (!bySub.has(si)) bySub.set(si, []); bySub.get(si).push(ni); }
      for (const [si, list] of bySub) { list.sort((a, b) => b - a).forEach((ni) => this.subs[si].nodes.splice(ni, 1)); }
      this.subs = this.subs.filter((s) => s.nodes.length > 1); this.sel.clear();
      if (!this.subs.length) { const id = this.id; this.exit(); this.app.change(() => this.app.remove([id])); return true; }
      this.commit(); return true;
    }
    if (e.key.startsWith('Arrow') && this.sel.size) {
      const st = e.shiftKey ? 10 : 1; const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      for (const k of this.sel) { const [si, ni] = k.split(':').map(Number); const nd = this.subs[si].nodes[ni]; nd.x += dx; nd.y += dy; if (nd.in) { nd.in.x += dx; nd.in.y += dy; } if (nd.out) { nd.out.x += dx; nd.out.y += dy; } }
      this.commit(); return true;
    }
    return false;
  }

  preview() { const F = this.frame(); if (F) MQ.Vector.setVectorD(F.el, P().serializePath(this.subs)); this.canvas.drawOverlay(); }

  // ------------------------------------------------------------ pen
  container(e) {
    const c = this.canvas.containerAt(e.clientX, e.clientY, []);
    if (!c) return null;
    return { id: c.id, lel: this.canvas.layoutEl(c.el, c.node), stack: this.canvas.layoutKind(this.canvas.layoutEl(c.el, c.node)) === 'stack' };
  }
  penDown(e) {
    if (!this.pen) { const c = this.container(e); if (!c) { toast('Commence le tracé dans un écran ou un cadre'); return true; } this.pen = { ...c, nodes: [] }; }
    const L = this.pen.lel.getBoundingClientRect(); const z = this.app.zoom;
    const p = { x: (e.clientX - L.left) / z, y: (e.clientY - L.top) / z, in: null, out: null };
    const first = this.pen.nodes[0];
    if (first && this.pen.nodes.length > 2 && Math.hypot((p.x - first.x) * z, (p.y - first.y) * z) < 10) { this.finishPen(true); return true; }
    this.pen.nodes.push(p); this.pen.dragging = p; this.pen.sx = e.clientX; this.pen.sy = e.clientY;
    this.canvas.drawOverlay(); return true;
  }
  penMove(e) {
    const L = this.pen.lel.getBoundingClientRect(); const z = this.app.zoom;
    const l = { x: (e.clientX - L.left) / z, y: (e.clientY - L.top) / z };
    if (this.pen.dragging && (e.buttons & 1) && Math.hypot(e.clientX - this.pen.sx, e.clientY - this.pen.sy) > 3) { const p = this.pen.dragging; p.out = { x: l.x, y: l.y }; p.in = { x: 2 * p.x - l.x, y: 2 * p.y - l.y }; }
    this.pen.hover = l; this.canvas.drawOverlay();
  }
  finishPen(closed) {
    const pen = this.pen; this.pen = null;
    if (!pen || pen.nodes.length < 2) { this.canvas.drawOverlay(); return; }
    this.createVector(pen, [{ closed, nodes: pen.nodes.map((n) => ({ x: n.x, y: n.y, in: n.in, out: n.out })) }], closed);
  }
  createVector(c, subs, closed) {
    const app = this.app; const bb = P().bbox(subs);
    const local = P().translatePath(subs, -bb.x, -bb.y);
    const node = { id: MQ.newId(), tag: 'vector', attrs: { x: String(Math.round(bb.x)), y: String(Math.round(bb.y)), w: String(Math.max(1, Math.round(bb.w))), h: String(Math.max(1, Math.round(bb.h))), d: P().serializePath(local), ...(closed ? { fill: '#D9D9E3', stroke: '1.5 #111' } : { stroke: '2.5 #111' }) }, children: [] };
    if (!c.stack) node.attrs.absolute = true;
    app.change(() => { app.insert(c.id, node); app.selection = [node.id]; });
    app.tool = 'move'; app.emit('tool');
  }
  // ------------------------------------------------------------ pencil
  pencilDown(e) { const c = this.container(e); if (!c) { toast('Dessine dans un écran ou un cadre'); return true; } const L = c.lel.getBoundingClientRect(); const z = this.app.zoom; this.pencil = { ...c, down: true, pts: [[(e.clientX - L.left) / z, (e.clientY - L.top) / z]] }; return true; }
  pencilUp() {
    const pc = this.pencil; this.pencil = null;
    if (!pc || pc.pts.length < 3) { this.canvas.drawOverlay(); return true; }
    const z = this.app.zoom; const simple = P().simplify(pc.pts, 2.2 / z);
    const first = simple[0], last = simple[simple.length - 1];
    const closed = simple.length > 3 && Math.hypot(first[0] - last[0], first[1] - last[1]) * z < 14;
    const subs = P().smoothPath(closed ? simple.slice(0, -1) : simple, closed, 1);
    this.createVector(pc, subs, closed);
    return true;
  }
}
