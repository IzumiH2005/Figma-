// Shape Builder (Figma: Shift+M on overlapping shapes). The selection is cut into planar regions:
//   drag across regions → merge them into one shape · Alt+click → remove a region · click → keep it as its own shape
//   Enter applies (every kept region becomes an editable vector; merged groups are united) · Esc cancels.
import { MQ, h, toast } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

export class ShapeBuilder {
  constructor(canvas, app) { this.canvas = canvas; this.app = app; this.st = null; }
  get active() { return !!this.st; }

  // geometry of an element in its parent's coordinate space (unscaled px)
  geomOf(n, el, parentEl) {
    const z = this.app.zoom; const pr = parentEl.getBoundingClientRect(); const r = el.getBoundingClientRect();
    const x = (r.left - pr.left) / z, y = (r.top - pr.top) / z, w = r.width / z, hh = r.height / z;
    const P = MQ.Path;
    let subs = el._path;
    if (subs) { const vw = +el.dataset.vw || w, vh = +el.dataset.vh || hh; subs = P.scalePath(subs, w / vw, hh / vh); }
    else if (n.tag === 'ellipse') subs = P.shapePath('ellipse', w, hh, {});
    else { const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0; subs = P.shapePath('rect', w, hh, { radius: Math.min(rad, Math.min(w, hh) / 2) }); }
    return P.translatePath(subs, x, y);
  }

  start(ids) {
    const app = this.app; const nodes = ids.map((id) => app.node(id)).filter((n) => n && n.tag !== 'screen');
    if (nodes.length < 1) { toast('Sélectionne des formes qui se chevauchent'); return; }
    const parent = app.parent(nodes[0].id);
    if (!nodes.every((n) => app.parent(n.id) === parent)) { toast('Les formes doivent avoir le même parent'); return; }
    // keep layer order (bottom → top) so the top-most owner gives a region its colour
    const sib = app.siblings(nodes[0].id); nodes.sort((a, b) => sib.indexOf(a) - sib.indexOf(b));
    const els = nodes.map((n) => this.canvas.elOf(n.id)); if (els.some((e) => !e)) return;
    const parentEl = els[0].parentElement;
    const geoms = nodes.map((n, i) => this.geomOf(n, els[i], parentEl));
    const t0 = performance.now();
    const regions = MQ.PathOps.arrangeRegions(geoms);
    if (!regions.length) { toast('Aucune région fermée'); return; }
    this.st = { nodes, parentEl, regions, group: regions.map(() => -1), removed: new Set(), drag: null, nextGroup: 0, hot: -1 };
    this.canvas.root.classList.add('sbuild');
    toast(`Shape Builder : ${regions.length} régions (${Math.round(performance.now() - t0)} ms) — glisse pour fusionner, Alt+clic pour retirer, Entrée pour appliquer`);
    this.canvas.drawOverlay();
  }
  cancel() { this.st = null; this.canvas.root.classList.remove('sbuild'); this.canvas.drawOverlay(); }

  draw(overlay, svg) {
    const S = this.st; if (!S || !S.parentEl.isConnected) { if (S) this.cancel(); return; }
    const z = this.app.zoom; const R = this.canvas.rect; const pr = S.parentEl.getBoundingClientRect();
    const ox = pr.left - R.left, oy = pr.top - R.top;
    const P = MQ.Path;
    const palette = ['#7C5CFF', '#0E9F6E', '#E5484D', '#F59E0B', '#2F6FEB', '#D946EF'];
    S.regions.forEach((r, i) => {
      const d = P.serializePath(P.transformPath(r.subs, (p) => ({ x: ox + p.x * z, y: oy + p.y * z })));
      const el = document.createElementNS(NS, 'path'); el.setAttribute('d', d); el.dataset.region = i;
      const g = S.group[i]; const removed = S.removed.has(i);
      el.setAttribute('class', 'sb-region' + (i === S.hot ? ' hot' : '') + (removed ? ' removed' : '') + (g >= 0 ? ' merged' : ''));
      if (g >= 0) el.style.setProperty('--sb', palette[g % palette.length]);
      svg.appendChild(el);
    });
    overlay.appendChild(h('div.ov.ve-help', { style: { left: ox + 'px', top: Math.max(8, oy - 34) + 'px' } }, 'Shape Builder · glisser = fusionner · Alt+clic = retirer · Entrée = appliquer · Échap = annuler'));
  }

  regionAt(e) { const t = document.elementFromPoint(e.clientX, e.clientY); return t && t.dataset && t.dataset.region !== undefined ? +t.dataset.region : -1; }

  down(e) {
    const S = this.st; if (!S) return false;
    const i = this.regionAt(e);
    if (i < 0) { this.apply(); return false; }
    if (e.altKey) { S.removed.has(i) ? S.removed.delete(i) : S.removed.add(i); S.group[i] = -1; this.canvas.drawOverlay(); return true; }
    S.removed.delete(i);
    const g = S.nextGroup++; S.drag = { g, set: new Set([i]) }; S.group[i] = g;
    this.canvas.drawOverlay(); return true;
  }
  move(e) {
    const S = this.st; if (!S) return false;
    const i = this.regionAt(e);
    if (S.drag && i >= 0 && !S.drag.set.has(i)) { S.drag.set.add(i); S.removed.delete(i); S.group[i] = S.drag.g; }
    if (i !== S.hot || S.drag) { S.hot = i; this.canvas.drawOverlay(); }
    return true;
  }
  up() { const S = this.st; if (!S) return false; if (S.drag && S.drag.set.size === 1) { /* single click: own shape */ } S.drag = null; return true; }
  key(e) {
    if (!this.st) return false;
    if (e.key === 'Escape') { this.cancel(); return true; }
    if (e.key === 'Enter') { this.apply(); return true; }
    return true;
  }

  apply() {
    const S = this.st; if (!S) return; const app = this.app; const O = MQ.PathOps; const P = MQ.Path;
    // groups → union; ungrouped kept regions → one vector each
    const buckets = new Map();
    S.regions.forEach((r, i) => { if (S.removed.has(i)) return; const k = S.group[i] >= 0 ? 'g' + S.group[i] : 'r' + i; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(r); });
    const parentNode = app.parent(S.nodes[0].id);
    const stackParent = !parentNode || MQ.layoutOf(parentNode.tag, parentNode.attrs) === 'stack';
    const fillOf = (r) => { const n = S.nodes[Math.max(...r.owners)]; return n.attrs.fill ?? n.attrs.bg ?? '#D9D9E3'; };
    const out = [];
    for (const list of buckets.values()) {
      const subs = list.length > 1 ? O.unionSubs(list.map((r) => r.subs)) : list[0].subs;
      const bb = P.bbox(subs); if (bb.w < 0.5 || bb.h < 0.5) continue;
      const top = list.reduce((a, r) => (Math.max(...r.owners) > Math.max(...a.owners) ? r : a), list[0]);
      const attrs = { x: String(Math.round(bb.x * 10) / 10), y: String(Math.round(bb.y * 10) / 10), w: String(Math.round(bb.w * 10) / 10), h: String(Math.round(bb.h * 10) / 10), fill: fillOf(top), d: P.serializePath(P.translatePath(subs, -bb.x, -bb.y)) };
      const src = S.nodes[Math.max(...top.owners)];
      if (src.attrs.stroke) attrs.stroke = src.attrs.stroke;
      if (!stackParent) attrs.absolute = true;
      out.push({ id: MQ.newId(), tag: 'vector', attrs, children: [] });
    }
    app.change(() => {
      const sib = app.siblings(S.nodes[0].id); const idx = sib.indexOf(S.nodes[0]);
      app.remove(S.nodes.map((n) => n.id));
      sib.splice(Math.max(0, Math.min(idx, sib.length)), 0, ...out);
      app.selection = out.map((n) => n.id);
    });
    toast(`Shape Builder : ${out.length} forme(s) créée(s)`);
    this.cancel();
  }
}
