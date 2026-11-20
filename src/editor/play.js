// Presentation / play mode
import { MQ, h, icon, clear } from './dom.js';

export class PlayMode {
  constructor(app) { this.app = app; this.root = null; }

  open(screenName) {
    const app = this.app; const p = app.project;
    if (this.root) this.close();
    const start = screenName ? p.screen(screenName) : p.startScreen();
    if (!start) return;
    const size = p.sizeOf(start);
    this.host = h('div.play-host');
    const frame = MQ.deviceFrame(size.device, this.host, size);
    this.fit = h('div.play-fit', null, frame);
    this.screenSel = h('select.sel', { onchange: (e) => this.player.go(e.target.value, { type: 'dissolve', duration: 250, easing: 'smooth' }), onkeydown: (e) => e.stopPropagation() }, p.screens().map((s) => h('option', { value: s.attrs.name }, s.attrs.name)));
    this.hint = h('div.play-hint', null, 'Clique sur les éléments interactifs · R recommencer · ← retour · H zones cliquables · Échap quitter');
    const bar = h('div.play-bar', null,
      h('span.play-title', null, icon('play', 14), p.name),
      this.screenSel,
      h('button.btn', { title: 'Retour (←)', onclick: () => this.player.back() }, icon('arrow-left', 14)),
      h('button.btn', { title: 'Recommencer (R)', onclick: () => this.player.start(start.attrs.name) }, icon('rotate-ccw', 14)),
      p.modes.length > 1 ? h('button.btn', { title: 'Changer de mode', onclick: () => this.player.exec('mode next', this.player.ctx().scope) }, icon('sun-moon', 14), p.modes.join('/')) : null,
      h('button.btn', { title: 'Zones cliquables (H)', onclick: () => this.flashHotspots() }, icon('pointer', 14)),
      h('span.grow'),
      h('button.btn', { title: 'Quitter (Échap)', onclick: () => this.close() }, icon('x', 14), 'Fermer'));
    this.root = h('div.play', null, bar, h('div.play-stage', { onclick: (e) => { if (!e.target.closest('[data-hot]') && this.host.contains(e.target)) this.flashHotspots(); } }, this.fit), this.hint);
    document.body.appendChild(this.root);
    this.player = new MQ.Player(p, this.host, { mode: app.mode, onEvent: (t, d) => { if (t === 'navigate') this.screenSel.value = d.name; if (t === 'error') this.hint.textContent = '⚠ ' + d.message; } });
    this.player.start(start.attrs.name);
    this.frame = frame;
    this.onResize = () => this.resize(); addEventListener('resize', this.onResize); this.resize();
    this.onKey = (e) => {
      if (e.key === 'Escape') this.close();
      else if (e.key === 'r' || e.key === 'R') this.player.start(start.attrs.name);
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { if (!(e.target && e.target.tagName === 'INPUT')) this.player.back(); }
      else if (e.key === 'h' || e.key === 'H') this.flashHotspots();
      e.stopPropagation();
    };
    addEventListener('keydown', this.onKey, true);
  }

  resize() {
    if (!this.frame) return;
    const W = innerWidth - 40, H = innerHeight - 120;
    const k = Math.min(1, W / this.frame.offsetWidth, H / this.frame.offsetHeight);
    this.fit.style.transform = `scale(${k})`;
  }

  flashHotspots() {
    for (const el of this.player.hotspots()) el.animate([{ outline: '2px solid rgba(80,140,255,.9)', outlineOffset: '0px', backgroundColor: 'rgba(80,140,255,.25)' }, { outline: '2px solid rgba(80,140,255,0)', outlineOffset: '4px', backgroundColor: 'rgba(80,140,255,0)' }], { duration: 700, easing: 'ease-out' });
  }

  close() {
    if (!this.root) return;
    this.player.destroy();
    removeEventListener('resize', this.onResize); removeEventListener('keydown', this.onKey, true);
    this.root.remove(); this.root = null;
  }
}
