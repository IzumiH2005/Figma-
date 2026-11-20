// Motion timeline: shows every entrance/loop animation of a screen as bars; scrub, play, drag to retime.
import { MQ, h, icon, clear } from './dom.js';

export class Timeline {
  constructor(app, root, hooks) {
    this.app = app; this.root = root; this.hooks = hooks; this.open = false; this.entries = []; this.t = 0; this.raf = null;
  }
  toggle(v = !this.open) { this.open = v; this.root.classList.toggle('open', v); document.body.classList.toggle('tl-open', v); if (v) this.render(); else { this.stop(true); this.hooks.setTrails([]); } }

  screenId() {
    const app = this.app;
    const sel = app.selNodes[0];
    const s = sel ? app.project.screenOf(sel.id) : null;
    return s ? s.id : (app.page && app.page.children.find((c) => c.tag === 'screen') || {}).id;
  }

  render() {
    if (!this.open) return;
    this.stop(true);
    const app = this.app;
    clear(this.root);
    const sid = this.screenId();
    const scr = sid && this.hooks.screenEl(sid);
    if (!scr || !scr._mq) { this.root.appendChild(h('div.tl-empty', null, 'Sélectionne un écran pour voir sa timeline.')); return; }
    this.screenEl = scr;
    // prepare paused animations on the canvas element
    this.entries = MQ.playAnims(scr._mq.anims, { project: app.project, paused: true, ignoreReduced: true });
    const total = Math.max(1500, MQ.totalDuration(this.entries) + 400);
    this.total = total;
    const scale = (ms) => (ms / total) * 100 + '%';
    const head = h('div.tl-head', null,
      h('button.btn', { onclick: () => this.play() }, icon('play', 13), 'Lire'),
      h('button.btn', { onclick: () => this.stop() }, icon('square', 13)),
      h('b', null, app.node(sid).attrs.name), h('span.muted', null, `${this.entries.length} animation(s) · ${Math.round(total)} ms`),
      h('select.sel.tl-rate', { title: 'Vitesse de lecture (ralenti pour vérifier arcs et spacing)', onchange: (e) => { this.rate = +e.target.value; }, onkeydown: (e) => e.stopPropagation() }, [1, 0.5, 0.25, 0.1].map((r) => h('option', { value: r, selected: (this.rate || 1) === r }, r === 1 ? 'Vitesse 1×' : `Ralenti ${r}×`))),
      h('button.btn' + (this.trails ? '.primary' : ''), { title: 'Trajectoires image par image (24 i/s) : vérifie les arcs et le spacing', onclick: () => { this.trails = !this.trails; this.render(); } }, icon('spline', 13), 'Trajectoires'),
      h('button.btn' + (app.recorder ? '.rec' : ''), { title: 'Auto-keyframe : chaque modification (position, rotation, opacité, échelle) devient une image clé au temps de la tête de lecture', onclick: () => this.toggleRecord() }, h('span.recdot'), app.recorder ? 'Enregistrement…' : 'Auto-keyframe'),
      h('span.grow'), h('span.muted', null, app.recorder ? 'Place la tête de lecture puis déplace / tourne / estompe l’élément' : 'Glisse une barre : délai · son bord droit : durée'),
      h('button.mini', { onclick: () => this.toggle(false) }, icon('x', 14)));
    const ruler = h('div.tl-ruler');
    for (let t = 0; t <= total; t += total > 4000 ? 1000 : 250) ruler.appendChild(h('span', { style: { left: scale(t) } }, t >= 1000 ? (t / 1000).toFixed(t % 1000 ? 2 : 0) + 's' : t + 'ms'));
    const rows = h('div.tl-rows');
    this.cursor = h('div.tl-cursor');
    const track = h('div.tl-track', null, ruler, rows, this.cursor);
    if (!this.entries.length) rows.appendChild(h('div.tl-empty', null, 'Aucune animation sur cet écran. Ajoute-en dans l\'onglet Motion (anim, loop, stagger).'));
    this.entries.forEach((e) => {
      const n = app.node(e.id);
      const label = n ? app.label(n) : (e.el.dataset.key || e.el.dataset.tag || '—');
      const bar = h('div.tl-bar.' + e.kind, { style: { left: scale(e.delay), width: e.kind === 'loop' ? `calc(100% - ${scale(e.delay)})` : scale(e.duration) } }, h('span', null, e.name), e.kind !== 'loop' ? h('i.tl-grip') : null);
      const row = h('div.tl-row' + (n && app.selection.includes(n.id) ? '.sel' : ''), { onclick: () => n && app.select(n.id) }, h('div.tl-label', null, label), h('div.tl-lane', null, bar));
      rows.appendChild(row);
      if (n && n.attrs.anim && e.kind === 'in') this.dragBar(bar, e, n, total);
    });
    track.addEventListener('pointerdown', (ev) => { if (ev.target.closest('.tl-bar')) return; const r = rows.getBoundingClientRect(); const seek = (x) => this.seek(Math.max(0, Math.min(1, (x - r.left - 160) / (r.width - 160))) * total); seek(ev.clientX); const mv = (e2) => seek(e2.clientX); const upf = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upf); }; addEventListener('pointermove', mv); addEventListener('pointerup', upf); });
    this.root.append(head, track);
    this.hooks.setTrails(this.trails ? this.sampleTrails(total) : []);
    this.seek(this.app.recorder ? Math.min(this.t || 0, total) : total);
  }

  toggleRecord() {
    const app = this.app;
    if (app.recorder) { app.recorder = null; this.root.classList.remove('recording'); this.render(); return; }
    app.recorder = { t: () => this.t || 0, onRecord: (k) => { this.hooks.toast && this.hooks.toast(`${k} image(s) clé(s) à ${Math.round(this.t)} ms`); setTimeout(() => this.render(), 30); } };
    this.root.classList.add('recording'); this.render(); this.seek(0);
  }

  dragBar(bar, e, n, total) {
    bar.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      const lane = bar.parentElement.getBoundingClientRect();
      const grip = ev.target.classList.contains('tl-grip');
      const sx = ev.clientX; const sp = MQ.parseSpec(n.attrs.anim, 'in');
      const d0 = sp.delay, du0 = sp.duration;
      let nd = d0, ndu = du0;
      const mv = (m) => {
        const dms = ((m.clientX - sx) / lane.width) * total;
        if (grip) { ndu = Math.max(50, Math.round((du0 + dms) / 10) * 10); bar.style.width = (ndu / total) * 100 + '%'; }
        else { nd = Math.max(0, Math.round((d0 + dms) / 10) * 10); bar.style.left = (nd / total) * 100 + '%'; }
      };
      const upf = () => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', upf);
        if (nd === d0 && ndu === du0) return;
        const rest = n.attrs.anim.split(/\s+/).slice(1).filter((w) => !/^\d+(ms)?$/.test(w) && !/^delay=/.test(w));
        this.app.change(() => { n.attrs.anim = [sp.name, ndu, ...(nd ? ['delay=' + nd] : []), ...rest].join(' '); });
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', upf);
    });
  }

  // onion skin: element centres sampled at 24 fps — dots close together = slow, far apart = fast
  sampleTrails(total) {
    const pts = new Map();
    const step = 1000 / 24;
    for (let t = 0; t <= total + 1; t += step) {
      this.seek(t);
      for (const e of this.entries) {
        if (e.kind === 'loop') continue;
        if (t < e.delay - step || t > e.delay + e.duration + step) continue;
        const r = e.el.getBoundingClientRect(); if (!r.width) continue;
        const w = this.hooks.toWorld(r.left + r.width / 2, r.top + r.height / 2);
        if (!pts.has(e)) pts.set(e, []);
        pts.get(e).push(w);
      }
    }
    const out = [];
    let k = 0;
    for (const [e, list] of pts) {
      let len = 0; for (let i = 1; i < list.length; i++) len += Math.hypot(list[i].x - list[i - 1].x, list[i].y - list[i - 1].y);
      if (len > 3) out.push({ pts: list, hue: (k++ * 67) % 360, sel: this.app.selection.includes(e.id) });
    }
    return out;
  }

  seek(t) {
    this.t = t;
    for (const e of this.entries) { try { e.animation.currentTime = e.kind === 'loop' ? t % (e.duration || 1) : Math.min(t, e.delay + e.duration); } catch (er) { /* */ } }
    if (this.cursor) this.cursor.style.left = `calc(160px + (100% - 160px) * ${t / this.total})`;
  }

  play() {
    this.stop(false);
    const t0 = performance.now();
    const tick = () => { const t = (performance.now() - t0) * (this.rate || 1); this.seek(Math.min(t, this.total)); if (t < this.total) this.raf = requestAnimationFrame(tick); else this.raf = null; };
    this.raf = requestAnimationFrame(tick);
  }
  stop(cancel) {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = null;
    if (cancel) { for (const e of this.entries) try { e.animation.cancel(); } catch (er) { /* */ } this.entries = []; if (this.hooks.setTrails && !this.open) this.hooks.setTrails([]); }
  }
}
