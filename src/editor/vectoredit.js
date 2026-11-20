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
  // layer effects and shader fills: centre, angle, size, scale… handles on the layer itself
  fx: (w, h, p) => (p.fx && p.fx !== true && MQ.Fx ? MQ.Fx.handles(String(p.fx), w, h) : []),
  shader: (w, h, p) => (p.shader && p.shader !== true && MQ.Shader ? MQ.Shader.shaderHandles(String(p.shader), w, h) : []),
  // mesh gradient: every colour point of the membrane is a handle (Figma's 4×4 mesh, any size here)
  mesh: (w, h, p) => {
    const L = MQ.Mesh && MQ.Mesh.meshLayer(p.fill); if (!L || !L.mesh) return [];
    const out = [];
    L.mesh.rows.forEach((row, i) => row.forEach((pt, j) => out.push({
      param: 'fill', name: `mesh.${i},${j}`, mesh: true, color: pt.c, x: pt.x * w, y: pt.y * h,
      map: (lx, ly) => { const M = MQ.Mesh.meshLayer(p.fill); const q = M.mesh.rows[i][j]; q.x = clamp(lx / w, -0.25, 1.25); q.y = clamp(ly / h, -0.25, 1.25); q.set = true; return M.put(M.mesh); },
    })));
    return out;
  },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class VectorEditor {
  constructor(canvas, app) { this.canvas = canvas; this.app = app; this.id = null; this.sel = new Set(); this.pen = null; this.pencil = null; this.drag = null; }

  get active() { return !!this.id; }

  // geometry helpers: local (path) coords <-> canvas-overlay coords
  frame() {
    if (this.op) { // operand of a <boolean>: placed inside the parent's box at its x/y
      const pel = this.canvas.elOf(this.op.parentId); if (!pel) return null;
      const pr = this.canvas.local(pel.getBoundingClientRect()); const pvw = +pel.dataset.vw || pr.w, pvh = +pel.dataset.vh || pr.h;
      const sx = pr.w / pvw, sy = pr.h / pvh; const part = this.op.part();
      return { el: pel, r: { x: pr.x + part.x * sx, y: pr.y + part.y * sy, w: (part.w || 1) * sx, h: (part.h || 1) * sy }, sx, sy, vw: part.w, vh: part.h };
    }
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
    // Figma: you can edit the points of a shape inside a boolean group; the result updates live
    const parent = app.parent(id);
    if (parent && parent.tag === 'boolean' && n.tag === 'vector' && n.attrs.d) {
      const pel = this.canvas.elOf(parent.id); if (!pel || !pel._bool) { toast('Booléen non rendu'); return; }
      const index = parent.children.filter((c) => c.tag !== '#text').indexOf(n);
      this.op = { parentId: parent.id, index, part: () => { const q = (this.canvas.elOf(parent.id)?._bool || pel._bool).parts[index]; return { x: q.x, y: q.y, w: +n.attrs.w || P().bbox(q.local).w, h: +n.attrs.h || P().bbox(q.local).h }; } };
      this.id = id; this.sel.clear(); this.subs = P().parsePath(n.attrs.d);
      this.canvas.root.classList.add('vedit'); this.canvas.drawOverlay(); return;
    }
    this.op = null;
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
  exit() { if (!this.id) return; this.id = null; this.op = null; this.sel.clear(); this.canvas.root.classList.remove('vedit'); this.canvas.drawOverlay(); }

  toVector(n, el) {
    const box = el._box || { w: el.offsetWidth, h: el.offsetHeight };
    const keep = {}; for (const k of ['name', 'key', 'x', 'y', 'fill', 'stroke', 'shadow', 'opacity', 'rotate', 'anim', 'loop', 'blend', 'blur', 'tilt', 'depth', 'absolute', 'place', 'top', 'left', 'right', 'bottom', 'cap', 'join', 'dash', 'start', 'end', 'mask', 'class']) if (n.attrs[k] !== undefined) keep[k] = n.attrs[k];
    if (n.tag === 'rect' || n.tag === 'ellipse') if (keep.fill === undefined && n.attrs.bg) keep.fill = n.attrs.bg;
    n.tag = 'vector'; n.attrs = { ...keep, w: String(Math.round(box.w)), h: String(Math.round(box.h)), d: P().serializePath(el._path) };
    n.children = [];
  }

  commit() {
    const app = this.app; const n = app.node(this.id); if (!n) return;
    if (this.op) { app.change(() => { n.attrs.d = P().serializePath(this.subs); }); return; } // operand: keep its box & position (x may be an expression)
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
    if (!this.id && app.selection.length === 1 && app.tool === 'move') this.drawRig(overlay, svg);
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

  drawRig(overlay, svg) {
    const id = this.app.selection[0]; const n = this.app.node(id); if (!n) return;
    const el = this.canvas.elOf(id); if (!el) return;
    this.drawCustomRigs(overlay, svg, id, el);
    const kind = n.tag === 'shape' ? n.attrs.kind || 'rect' : n.tag === 'rect' ? 'rect' : n.tag === 'ellipse' ? 'ellipse' : null;
    const isMesh = typeof n.attrs.fill === 'string' && n.attrs.fill.includes('meshgrid(');
    const kinds = [kind, n.attrs.fx ? 'fx' : null, n.attrs.shader ? 'shader' : null, isMesh ? 'mesh' : null].filter((k) => k && RIGS[k]);
    if (!kinds.length) return;
    const r = this.canvas.local(el.getBoundingClientRect());
    const vw = +el.dataset.vw || el.offsetWidth, vh = +el.dataset.vh || el.offsetHeight;
    const sx = r.w / vw, sy = r.h / vh;
    const path = (d, cls) => { if (!svg) return; const t = document.createElementNS(NS, 'path'); t.setAttribute('d', d); t.setAttribute('class', cls); svg.appendChild(t); };
    for (const k of kinds) {
      const params = n.tag === 'shape' || k === 'fx' || k === 'shader' || k === 'mesh' ? n.attrs : { radius: n.attrs.radius, start: n.attrs.start, sweep: n.attrs.sweep, ratio: n.attrs.ratio };
      const hs = RIGS[k](vw, vh, params);
      // the membrane: iso-curves of the surface between the points
      if (k === 'mesh') { const L = MQ.Mesh.meshLayer(n.attrs.fill); for (const d of MQ.Mesh.meshCurves(L.mesh, r.w, r.h)) path(d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (m0, x, y) => `${(+x + r.x).toFixed(1)} ${(+y + r.y).toFixed(1)}`), 've-mesh-line'); }
      hs.forEach((hd, i) => {
        const name = hd.name || hd.param;
        const X = r.x + hd.x * sx, Y = r.y + hd.y * sy;
        // transform gizmo (Figma's on-canvas shader controls): ring around the effect's origin + arm to the handle
        if (hd.guide) { const g = hd.guide; const cx = r.x + g.cx * sx, cy = r.y + g.cy * sy; if (g.r) { const R = g.r * Math.min(sx, sy); path(`M${cx - R} ${cy}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0`, 've-gizmo'); } path(`M${cx} ${cy}L${X} ${Y}`, 've-gizmo arm'); }
        const cls = hd.mesh ? '.fx.mesh' : hd.name ? '.fx' : '';
        const style = { left: X + 'px', top: Y + 'px' }; if (hd.mesh) style.background = this.colorOf(hd.color);
        overlay.appendChild(h('div.ov.ve-rig' + cls, { title: hd.mesh ? `${name} · glisser · double-clic : couleur` : `${name} (glisser)`, style, dataset: { rig: `${id}|${k}|${i}`, rigName: name } }));
      });
      if (k === 'mesh') {
        const bar = h('div.ov.ve-meshbar', { style: { left: r.x + 'px', top: r.y + r.h + 12 + 'px' } });
        for (const [op, label] of [['row', '+ Ligne'], ['col', '+ Colonne'], ['reset', 'Réinitialiser']]) bar.appendChild(h('button.ve-meshbtn', { dataset: { meshop: `${id}|${op}` } }, label));
        overlay.appendChild(bar);
      }
    }
  }
  colorOf(c) { const s = String(c || ''); if (s.startsWith('$')) { try { const v = this.app.project.token(s.slice(1)); if (v) return String(v); } catch (e) { /* unknown token */ } } return s; }
  meshOp(id, op) {
    const app = this.app; const n = app.node(id); const L = n && MQ.Mesh.meshLayer(n.attrs.fill); if (!L) return;
    app.begin();
    const m = op === 'reset' ? MQ.Mesh.meshReset(L.mesh) : MQ.Mesh.meshInsert(L.mesh, op, (c) => this.colorOf(c));
    n.attrs.fill = L.put(m); app.emit('doc'); app.commit();
  }

  // custom rigs (rig:<target>="…") carried by the selected element or any element inside it
  customRigs(id, el) {
    const R = MQ.Rig; const out = [];
    const els = [el, ...el.querySelectorAll('[data-rigged]')].filter((x) => x._rigs);
    for (const x of els) {
      const mine = x._rigs.filter((g) => (g.bind.type === 'attr' && g.bind.id === id && !g.bind.owned) || (g.bind.type === 'prop' && g.bind.id === id && g.bind.top) || g.bind.type === 'var');
      for (const grp of R.groupRigs(mine)) out.push({ el: x, grp });
    }
    return out;
  }
  drawCustomRigs(overlay, svg, id, el) {
    const R = MQ.Rig; const list = this.customRigs(id, el); this._custom = list;
    list.forEach(({ el: x, grp }, gi) => {
      const box = this.canvas.local(R.rigBox(x, grp.rigs[0].r));
      const vals = Object.fromEntries(grp.rigs.map((g) => [g.target, this.rigValue(g)]));
      const p = R.groupPos(grp, vals, box);
      // track: a line for x/y, an arc for angle, a 2D frame for groups
      const r0 = grp.rigs[0].r; let d = '';
      if (grp.rigs.length > 1) d = `M${box.x} ${box.y}h${box.w}v${box.h}h${-box.w}Z`;
      else if (r0.mode === 'x' || r0.mode === 'y') { const a = R.handlePos(r0, r0.min, box), b = R.handlePos(r0, r0.max, box); d = `M${a.x} ${a.y}L${b.x} ${b.y}`; }
      else if (r0.mode === 'angle') { const pts = []; for (let k = 0; k <= 32; k++) { const q = R.handlePos(r0, r0.min + (k / 32) * (r0.max - r0.min), box); pts.push(`${q.x} ${q.y}`); } d = 'M' + pts.join('L'); }
      else { const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 }; d = `M${c.x} ${c.y}L${p.x} ${p.y}`; }
      if (svg && d) { const t = document.createElementNS(NS, 'path'); t.setAttribute('d', d); t.setAttribute('class', 've-rig-track'); svg.appendChild(t); }
      const label = grp.rigs.map((g) => `${g.r.label || g.target} ${vals[g.target] ?? '–'}`).join(' · ');
      overlay.appendChild(h('div.ov.ve-rig.custom', { title: label + ' (glisser · Maj = précis)', style: { left: p.x + 'px', top: p.y + 'px' }, dataset: { crig: String(gi), rigName: grp.rigs.map((g) => g.target).join(',') } }));
      overlay.appendChild(h('div.ov.ve-rig-label', { style: { left: p.x + 10 + 'px', top: p.y - 22 + 'px' } }, label));
    });
  }
  // double-click a membrane point: native colour picker, written back into the meshgrid token
  pickMeshColor(key) {
    const [id, , i] = key.split('|'); const app = this.app; const n = app.node(id); const L = n && MQ.Mesh.meshLayer(n.attrs.fill); if (!L) return;
    const C = L.mesh.C; const pt = L.mesh.rows[Math.floor(+i / C)][+i % C];
    const rgb = MQ.parseColor(this.colorOf(pt.c)); const hex = rgb ? MQ.Color.toHex(rgb).slice(0, 7) : '#888888';
    const inp = h('input', { type: 'color', value: hex, style: { position: 'fixed', left: '-40px', top: '0', opacity: '0' } }); document.body.appendChild(inp);
    let began = false;
    inp.addEventListener('input', () => { if (!began) { app.begin(); began = true; } const M = MQ.Mesh.meshLayer(n.attrs.fill); M.mesh.rows[Math.floor(+i / C)][+i % C].c = inp.value; n.attrs.fill = M.put(M.mesh); app.emit('doc'); });
    inp.addEventListener('change', () => { if (began) app.commit(); inp.remove(); });
    inp.click();
  }
  rigValue(g) { const b = g.bind; const v = b.type === 'var' ? (this.app.project.initialVars?.() || {})[b.name] : b.value; return v === undefined || v === '' ? undefined : isNaN(+v) ? v : +v; }
  writeRig(g, v) {
    const b = g.bind; const app = this.app;
    if (b.type === 'attr' || b.type === 'prop') { const n = app.node(b.id); if (!n) return; n.attrs[b.name] = String(v); return; }
    if (b.type === 'var') { // edit the default in the <vars> block (the canvas shows initial values)
      const vn = [...app.project.byId.values()].find((x) => x.tag === 'vars'); if (!vn) return;
      const re = new RegExp('^(\\s*\\$?' + b.name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '\\s*[:=]\\s*)([^\\n]*?)(;?\\s*(//.*)?)$', 'm');
      if (re.test(vn.raw || '')) vn.raw = vn.raw.replace(re, (m0, p1, p2, p3) => p1 + v + p3); else vn.raw = (vn.raw || '').replace(/\s*$/, '') + `\n    ${b.name}: ${v}\n  `;
      app.project.vars[b.name] = String(v);
    }
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
    if (t.dataset && t.dataset.crig !== undefined && this._custom) {
      const c = this._custom[+t.dataset.crig]; if (!c) return false;
      const box = MQ.Rig.toBox(MQ.Rig.rigBox(c.el, c.grp.rigs[0].r));
      app.begin(); this.drag = { crig: true, grp: c.grp, box, sx: e.clientX, sy: e.clientY, start: MQ.Rig.groupPos(c.grp, Object.fromEntries(c.grp.rigs.map((g) => [g.target, this.rigValue(g)])), box) };
      e.preventDefault(); return true;
    }
    if (t.dataset && t.dataset.meshop) { const [id, op] = t.dataset.meshop.split('|'); this.meshOp(id, op); e.preventDefault(); return true; }
    if (t.dataset && t.dataset.rig) {
      const [id, kind, i] = t.dataset.rig.split('|'); const n = app.node(id); const el = this.canvas.elOf(id);
      const r = el.getBoundingClientRect(); const vw = +el.dataset.vw || el.offsetWidth, vh = +el.dataset.vh || el.offsetHeight;
      app.begin(); this.drag = { rig: true, id, kind, i: +i, el, n, r, vw, vh }; e.preventDefault(); return true;
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
    if (D.crig) {
      // Shift = fine control (¼ of the pointer movement), like a pro scrubber
      const k = e.shiftKey ? 0.25 : 1; const px = D.start.x + (e.clientX - D.sx) * k, py = D.start.y + (e.clientY - D.sy) * k;
      const vals = MQ.Rig.groupValues(D.grp, px, py, D.box);
      for (const g of D.grp.rigs) this.writeRig(g, vals[g.target]);
      this.app.emit('doc'); return true;
    }
    if (D.rig) {
      const { n, kind, i, r, vw, vh } = D;
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
    if (D.rig || D.crig) { this.app.commit(); return true; }
    if (D.anchors || D.handle) { this.commit(); return true; }
    return false;
  }

  dbl(e) {
    const t = e.target;
    if (t.dataset && t.dataset.rig && t.dataset.rig.split('|')[1] === 'mesh') { this.pickMeshColor(t.dataset.rig); return true; }
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

  preview() {
    const F = this.frame(); if (!F) return;
    if (this.op) { // recompute the boolean with the edited operand → live result, like Figma
      const b = F.el._bool; const parts = b.parts.map((q, i) => P().translatePath(i === this.op.index ? this.subs : q.local, q.x, q.y));
      MQ.Vector.setVectorD(F.el, P().serializePath(MQ.Vector.booleanResult(parts, b.op, b)));
    } else MQ.Vector.setVectorD(F.el, P().serializePath(this.subs));
    this.canvas.drawOverlay();
  }

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
