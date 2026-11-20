// Motion timeline: shows every entrance/loop animation of a screen as bars; scrub, play, drag to retime.
import { MQ, h, icon, clear } from './dom.js';

export class Timeline {
  constructor(app, root, hooks) {
    this.app = app; this.root = root; this.hooks = hooks; this.open = false; this.entries = []; this.t = 0; this.raf = null;
  }
  toggle(v = !this.open) { this.open = v; this.root.classList.toggle('open', v); document.body.classList.toggle('tl-open', v); if (v) this.render(); else this.stop(true); }

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
    this.entries = MQ.playAnims(scr._mq.anims, { project: app.project, paused: true });
    const total = Math.max(1500, MQ.totalDuration(this.entries) + 400);
    this.total = total;
    const scale = (ms) => (ms / total) * 100 + '%';
    const head = h('div.tl-head', null,
      h('button.btn', { onclick: () => this.play() }, icon('play', 13), 'Lire'),
      h('button.btn', { onclick: () => this.stop() }, icon('square', 13)),
      h('b', null, app.node(sid).attrs.name), h('span.muted', null, `${this.entries.length} animation(s) · ${Math.round(total)} ms`),
      h('span.grow'), h('span.muted', null, 'Glisse une barre pour changer le délai, son bord droit pour la durée'),
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
    this.seek(total);
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

  seek(t) {
    this.t = t;
    for (const e of this.entries) { try { e.animation.currentTime = e.kind === 'loop' ? t % (e.duration || 1) : Math.min(t, e.delay + e.duration); } catch (er) { /* */ } }
    if (this.cursor) this.cursor.style.left = `calc(160px + (100% - 160px) * ${t / this.total})`;
  }

  play() {
    this.stop(false);
    const t0 = performance.now();
    const tick = () => { const t = performance.now() - t0; this.seek(Math.min(t, this.total)); if (t < this.total) this.raf = requestAnimationFrame(tick); else this.raf = null; };
    this.raf = requestAnimationFrame(tick);
  }
  stop(cancel) {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = null;
    if (cancel) { for (const e of this.entries) try { e.animation.cancel(); } catch (er) { /* */ } this.entries = []; }
  }
}
