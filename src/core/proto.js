// Prototype runtime: navigation, transitions (incl. Smart Animate), overlays, variables, triggers.
import { makeCtx, renderScreen, renderStandalone } from './render.js';
import { evaluate, interp, lerpAny } from './expr.js';
import { splitTop, parseColor } from './project.js';
import { playAnims, resolveEasing, EASINGS, prefersReducedMotion, easeFn, getTimeScale } from './anim.js';
import { morphBetween, liveBoolean } from './vector.js';
import { GestureMixin } from './gesture.js';
import { groupRigs, groupPos, groupValues, rigBox, toBox } from './rig.js';

// identity of a keyed layer across re-renders: its key (or the nearest keyed ancestor's), scoped by component instance
function layerKey(n) {
  const k = n.dataset && n.dataset.key ? n : n.parentElement && n.parentElement.closest('[data-key]');
  if (!k) return null;
  const inst = k.closest('[data-inst]');
  return (inst ? inst.dataset.inst + '/' : '') + k.dataset.key;
}

export const TRANSITIONS = ['instant', 'none', 'dissolve', 'fade', 'smart', 'push', 'push-left', 'push-right', 'push-up', 'push-down', 'slide', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'ios', 'scale', 'zoom', 'flip'];
const EASE_NAMES = new Set([...Object.keys(EASINGS), 'spring', 'bouncy', 'snappy', 'gentle', 'wobbly', 'stiff', 'bounce']);
const REVERSE = { 'push-left': 'push-right', 'push-right': 'push-left', 'push-up': 'push-down', 'push-down': 'push-up', push: 'push-right', 'slide-left': 'unslide-right', slide: 'unslide-right', 'slide-right': 'unslide-left', 'slide-up': 'unslide-down', 'slide-down': 'unslide-up', ios: 'ios-back' };

export function parseTransition(words) {
  const t = { type: 'instant', duration: 300, easing: 'smooth' };
  let durSet = false;
  for (const w of words) {
    if (TRANSITIONS.includes(w)) { t.type = w === 'none' ? 'instant' : w === 'fade' ? 'dissolve' : w === 'zoom' ? 'scale' : w; continue; }
    if (/^\d+(ms)?$/.test(w)) { t.duration = parseFloat(w); durSet = true; continue; }
    if (/^\d+(\.\d+)?s$/.test(w)) { t.duration = parseFloat(w) * 1000; durSet = true; continue; }
    if (EASE_NAMES.has(w) || /^spring\(/.test(w) || /^cubic-bezier/.test(w)) { t.easing = w; continue; }
    if (w === 'arc' || w === 'overlap' || w === 'smear') { t[w] = true; continue; }
  }
  if (!durSet && t.type === 'smart') { t.duration = 420; t.autoDur = true; }
  if (!durSet && (t.type === 'ios' || t.type.startsWith('push') || t.type.startsWith('slide'))) t.duration = 380;
  return t;
}

// split "a; b; c" at top level
function splitActions(s) { s = String(s).trim(); if (/^\{[\s\S]*\}$/.test(s)) { let d = 0, whole = true; for (let i = 0; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && --d === 0 && i < s.length - 1) { whole = false; break; } } if (whole) s = s.slice(1, -1); } return splitTop(s, ';').filter(Boolean); }
function words(s) { return (String(s).match(/"[^"]*"|'[^']*'|\S+/g) || []).map((w) => w.replace(/^["']|["']$/g, '')); }

export class Player {
  constructor(project, host, opts = {}) {
    this.project = project; this.host = host; this.opts = opts;
    this.mode = opts.mode || 0;
    this.vars = opts.vars || project.initialVars();
    this.history = []; this.overlays = []; this.current = null; this.currentName = null;
    this.timers = []; this.keyHandlers = []; this.busy = false;
    this.inst = {}; // instance-local props (interactive components): { instKey: { prop: value } }
    host.style.position = host.style.position || 'relative';
    host.style.overflow = 'hidden';
    this._onKey = (e) => { for (const h of this.keyHandlers) if (h.key === e.key || h.key.toLowerCase() === e.key.toLowerCase()) { e.preventDefault(); h.fn(); } };
    window.addEventListener('keydown', this._onKey);
  }

  destroy() { this.clearTimers(); if (this._twRaf) cancelAnimationFrame(this._twRaf); this._tw = {}; window.removeEventListener('keydown', this._onKey); this.host.innerHTML = ''; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; this.keyHandlers = []; }
  emit(type, data) { this.opts.onEvent && this.opts.onEvent(type, data); }

  ctx() { return makeCtx(this.project, { mode: this.mode, vars: this.vars, runtime: this }); }

  scaleFactor() { const r = this.host.getBoundingClientRect(); return r.width / (this.host.offsetWidth || r.width || 1) || 1; }

  build(name) {
    const screen = this.project.screen(name);
    if (!screen) throw new Error(`Écran introuvable: ${name}`);
    const ctx = this.ctx();
    const el = renderScreen(screen, ctx);
    el.style.position = 'absolute'; el.style.left = '0'; el.style.top = '0';
    el._screenName = name;
    return el;
  }

  start(name) {
    this.clearTimers();
    this.host.innerHTML = '';
    this.history = []; this.overlays = [];
    if (!this.opts.keepVars) this.vars = this.opts.vars || this.project.initialVars();
    if (!this.opts.keepVars) this.inst = {};
    const s = name ? this.project.screen(name) : this.project.startScreen();
    if (!s) return;
    this.emit('prenavigate', { name: s.attrs.name });
    const el = this.build(s.attrs.name);
    this.fitHost(el);
    this.host.appendChild(el);
    this.current = el; this.currentName = s.attrs.name;
    this.mounted(el, true);
    this.emit('navigate', { name: this.currentName });
  }

  fitHost(el) {
    const { w, h } = el._mq;
    this.host.style.width = w + 'px'; this.host.style.height = h + 'px';
  }

  mounted(el, entering, freshAnims) {
    const info = el._mq;
    if (entering) {
      this.anims = playAnims(info.anims, { project: this.project });
      // on:load / on:after-N on the screen itself
      this.fireLifecycle(info.events, el);
      el.querySelectorAll('[data-lifecycle]').forEach((n) => this.fireLifecycle(n._mqEvents, n));
    } else {
      // rerender: loops keep running; entrance anims of layers that just appeared were started by rerender()
      this.anims = [...playAnims(info.anims.filter((a) => a.kind === 'loop'), { project: this.project }), ...(freshAnims || [])];
    }
  }

  fireLifecycle(events, el) {
    if (!events) return;
    for (const [trig, ev] of Object.entries(events)) {
      if (trig === 'on:load') this.exec(ev.action, ev.scope, el);
      const m = /^on:(after|delay)-?(\d+)$/.exec(trig);
      if (m) this.timers.push(setTimeout(() => this.exec(ev.action, ev.scope, el), +m[2]));
      const k = /^on:key-(.+)$/.exec(trig);
      if (k) this.keyHandlers.push({ key: k[1], fn: () => this.exec(ev.action, ev.scope, el) });
    }
  }

  // called by the renderer for every element with on:* attributes
  bind(el, events) {
    el._mqEvents = events;
    const run = (ev, extra) => (e) => { if (e) e.stopPropagation(); this.emit('trigger', { el, action: ev.action }); this.exec(ev.action, extra ? ev.scope.child(extra(e)) : ev.scope, el); };
    for (const [trig, ev] of Object.entries(events)) {
      switch (trig) {
        case 'on:click': case 'on:tap': el.addEventListener('click', run(ev)); el.dataset.hot = '1'; if (!/^(INPUT|TEXTAREA)$/.test(el.tagName)) { el.tabIndex = 0; el.setAttribute('role', 'button'); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } }); } break;
        case 'on:dblclick': case 'on:doubletap': el.addEventListener('dblclick', run(ev)); el.dataset.hot = '1'; break;
        case 'on:press': el.addEventListener('pointerdown', run(ev)); el.dataset.hot = '1'; break;
        case 'on:release': el.addEventListener('pointerup', run(ev)); break;
        case 'on:enter': case 'on:hover': el.addEventListener('pointerenter', run(ev)); break;
        case 'on:leave': el.addEventListener('pointerleave', run(ev)); break;
        case 'on:change': case 'on:input': el.addEventListener('input', run(ev, (e) => ({ value: e.target.value }))); break;
        // focus / blur: inputs (focus, blur) or containers (focusin, focusout). The per-frame re-render moves focus to the
        // rebuilt input: those hand-overs are not real focus changes and are ignored.
        case 'on:focus': el.addEventListener(/^(INPUT|TEXTAREA)$/.test(el.tagName) ? 'focus' : 'focusin', (e) => { if (!this._refocus) run(ev, () => ({ value: e.target.value ?? '' }))(e); }); break;
        case 'on:blur': el.addEventListener(/^(INPUT|TEXTAREA)$/.test(el.tagName) ? 'blur' : 'focusout', (e) => {
          if (this._refocus) return; const bindKey = e.target.dataset && e.target.dataset.bind; const value = e.target.value ?? '';
          setTimeout(() => { const a = document.activeElement; if (bindKey && a && a.dataset && a.dataset.bind === bindKey && a !== e.target && a.isConnected) return; run(ev, () => ({ value }))(e); }, 0);
        }); break;
        case 'on:submit': el.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(ev, () => ({ value: e.target.value }))(e); }); break;
        case 'on:longpress': {
          let t; el.addEventListener('pointerdown', (e) => { t = setTimeout(() => run(ev)(e), 500); });
          ['pointerup', 'pointerleave'].forEach((n) => el.addEventListener(n, () => clearTimeout(t)));
          el.dataset.hot = '1'; break;
        }
        default: {
          if (/^on:(load|after|delay|key)/.test(trig)) el.dataset.lifecycle = '1';
        }
      }
    }
    this.bindGestures(el, events);
    if (el.dataset.bind) {
      el.addEventListener('input', (e) => { this.vars[el.dataset.bind] = e.target.value; this.scheduleRerender(); });
    }
  }

  // live rigs: dragging a rigged element changes a $variable or the instance's own props
  bindRigs(el) {
    const live = (el._rigs || []).filter((g) => g.bind.type !== 'attr');
    if (!live.length || el._rigBound) return; el._rigBound = true;
    el.dataset.hot = '1'; el.style.touchAction = 'none'; if (!el.style.cursor) el.style.cursor = 'grab';
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      // a control inside the rigged component (a −/+ button, a link) keeps its own click
      const hit = e.target && e.target.closest ? e.target.closest('[data-hot]') : null;
      if (hit && hit !== el && el.contains(hit)) return;
      const groups = groupRigs(live);
      const values = (g) => Object.fromEntries(g.rigs.map((x) => [x.target, x.bind.value]));
      let best = null;
      for (const g of groups) {
        const box = toBox(rigBox(el, g.rigs[0].r));
        // a rig scoped to a part (in=dial) only starts on that part (16 px of slack for a handle on its edge)
        if (g.rigs[0].r.in) { const M = 16; if (e.clientX < box.x - M || e.clientX > box.x + box.w + M || e.clientY < box.y - M || e.clientY > box.y + box.h + M) continue; }
        const p = groupPos(g, values(g), box); const d = Math.hypot(p.x - e.clientX, p.y - e.clientY);
        if (!best || d < best.d) best = { g, box, d };
      }
      if (!best) return;
      e.stopPropagation(); e.preventDefault();
      const { g, box } = best; const prev = el.style.cursor; document.body.style.cursor = 'grabbing';
      const apply = (ev) => {
        const vals = groupValues(g, ev.clientX, ev.clientY, box); let changed = false;
        for (const x of g.rigs) { const v = vals[x.target]; if (this.readBound(x.bind) !== v) { this.writeBound(x.bind, v); changed = true; } }
        if (changed) { this.emit('rig', { values: vals }); this.scheduleRerender(); }
      };
      apply(e);
      const mv = (ev) => apply(ev);
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.style.cursor = ''; el.style.cursor = prev; };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  }
  readBound(b) { return b.type === 'var' ? this.vars[b.name] : (this.inst[b.key] || {})[b.name] ?? b.value; }
  writeBound(b, v) { if (b.type === 'var') this.vars[b.name] = v; else (this.inst[b.key] = this.inst[b.key] || {})[b.name] = v; }

  bindSwipe(el, dir, fn) {
    let sx, sy, active = false;
    el.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; active = true; });
    el.addEventListener('pointerup', (e) => {
      if (!active) return; active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy; const T = 40;
      const ok = (dir === 'left' && dx < -T && Math.abs(dx) > Math.abs(dy)) || (dir === 'right' && dx > T && Math.abs(dx) > Math.abs(dy)) || (dir === 'up' && dy < -T && Math.abs(dy) > Math.abs(dx)) || (dir === 'down' && dy > T && Math.abs(dy) > Math.abs(dx));
      if (ok) fn(e);
    });
  }

  // set $x = v tween 2400 [courbe] : the VARIABLE itself travels (numbers, colours, paths, arrays, objects), one
  // instant re-render per frame, so every binding (text, keys(), along=, pathmix) follows. Resolves at the end.
  tweenVar(name, to, dur, ease) { return this.tweenOn(this.vars, name, 'var:' + name, to, dur, ease); }

  // obj[prop] travels to `to` (numbers, colours, paths, arrays, objects); id = one running tween per target
  tweenOn(obj, prop, id, to, dur, ease) {
    const from = obj[prop]; this._tw = this._tw || {};
    if (this._tw[id]) this._tw[id].cancel();
    if (prefersReducedMotion() || from === undefined || dur <= 0) { obj[prop] = to; return this.rerender({ type: 'instant' }); }
    const f = easeFn(resolveEasing(ease || 'in-out').easing);
    return new Promise((done) => {
      const tw = (this._tw[id] = { obj, prop, from, to, f, dur, t0: performance.now(), done, cancel: () => { if (this._tw[id] === tw) delete this._tw[id]; done(); } });
      // one ticker for every running tween: several values travelling together cost one re-render per frame
      if (!this._twRaf) this._twRaf = requestAnimationFrame((now) => this.tweenTick(now));
    });
  }

  tweenTick(now) {
    this._twRaf = 0; const all = Object.entries(this._tw || {}); if (!all.length) return;
    const ended = [];
    for (const [id, tw] of all) {
      const u = Math.min(1, ((now - tw.t0) * getTimeScale()) / tw.dur);
      tw.obj[tw.prop] = u >= 1 ? tw.to : lerpAny(tw.from, tw.to, tw.f(u));
      if (u >= 1) ended.push([id, tw]);
    }
    for (const [id, tw] of ended) { delete this._tw[id]; tw.done(); }
    this.rerender({ type: 'instant' });
    if (Object.keys(this._tw).length) this._twRaf = requestAnimationFrame((t) => this.tweenTick(t));
  }

  // continuous inputs (drag, scrub, rig, typing) fire faster than the screen refreshes: coalesce to one re-render per frame
  scheduleRerender(t) {
    if (this._rr) return;
    this._rr = true;
    const run = () => { this._rr = false; this.rerender(t || { type: 'instant' }); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else queueMicrotask(run);
  }

  // ------------------------------------------------------------ actions
  async exec(action, scope, el, opts = {}) {
    const steps = splitActions(action);
    let dirty = null;
    // the instance's own state (change/inc/dec) as it is NOW: later steps of the chain see their effect
    const live = () => { let key = null; try { key = scope.lookup('__inst'); } catch (e) { /* not in a component */ } return key && this.inst[key] ? scope.child({ ...this.inst[key] }) : scope; };
    for (const step of steps) {
      // "change …; wait 1200; change …": show the pending change (with its transition) before waiting
      if (dirty && /^(wait|delay)\b/.test(step.trim())) { await this.rerender(dirty); dirty = null; }
      const r = await this.step(step.trim(), live(), el);
      if (r && r.dirty) dirty = r.transition || dirty || (opts.instant ? { type: 'instant' } : { type: 'smart', duration: 260, easing: 'smooth' });
      if (r && r.navigated) dirty = null;
      if (r && r.stop) break;
    }
    if (dirty) await this.rerender(dirty);
  }

  async step(step, scope, el) {
    if (!step) return;
    if (step.includes('${')) step = step.replace(/\$\{([^}]+)\}/g, (_, e) => '$' + evaluate(e, scope));
    const w = words(step);
    const cmd = w[0];
    const resolveName = (n) => String(interp(n, scope));
    try {
      switch (cmd) {
        case 'go': case 'navigate': return await this.go(resolveName(w[1]), parseTransition(w.slice(2)));
        case 'back': return await this.back(w.length > 1 ? parseTransition(w.slice(1)) : null);
        case 'overlay': case 'open': return await this.openOverlay(resolveName(w[1]), w.slice(2), scope);
        case 'close': return await this.closeOverlay(w.slice(1));
        case 'swap': { await this.closeOverlay(['instant']); return await this.openOverlay(resolveName(w[1]), w.slice(2), scope); }
        case 'set': {
          const m = /^set\s+\$?(\{[^{}]*\}|[\w-]+)\s*=\s*(.+?)(\s+(smart|instant|dissolve|tween)(\s+\d+)?(\s+[^\s&]+)?)?(\s*&)?$/.exec(step);
          if (!m) throw new Error(`set invalide: ${step}`);
          if (m[1][0] === '{') m[1] = String(interp(m[1], scope)).replace(/^\$/, ''); // set ${bind} = … : name held by a prop
          const ex = m[2].trim();
          const val = /^\{[^{}]*\}$/.test(ex) ? interp(ex, scope) : evaluate(ex, scope);
          if (m[4] === 'tween') { const p = this.tweenVar(m[1], val, m[5] ? +m[5] : 600, (m[6] || '').trim()); if (!m[7]) await p; return; } // « & » : en parallèle
          this.vars[m[1]] = val;
          return { dirty: true, transition: m[3] ? parseTransition(words(m[3])) : null };
        }
        case 'change': { // change k=v k2={expr} [smart 300 ease] → the enclosing instance's own props (Figma "Change to", on any prop)
          const key = scope.lookup('__inst'); if (!key) throw new Error('change : à utiliser dans un composant');
          const rest = step.replace(/^change\s+/, ''); const re = /([\w-]+)\s*=\s*(\{[^{}]*\}|"[^"]*"|'[^']*'|\S+)/g; let m, last = 0;
          const loc0 = (this.inst[key] = this.inst[key] || {}); const pend = {}; const loc = pend;
          while ((m = re.exec(rest))) {
            const [, k, ex] = m; last = re.lastIndex;
            let v;
            if (/^\{/.test(ex)) v = interp(ex, scope);
            else if (/^["']/.test(ex)) v = ex.slice(1, -1);
            else if (/^-?\d+(\.\d+)?$/.test(ex)) v = +ex;
            else if (ex === 'true' || ex === 'false') v = ex === 'true';
            else v = ex; // enum value
            loc[k] = v;
          }
          const tail = words(rest.slice(last));
          if (tail[0] === 'tween') { // change k=v tween 600 bouncy [&] : the instance's props travel, frame by frame
            const nowait = tail.includes('&'); const t2 = tail.filter((x) => x !== '&'); const dur = /^\d+$/.test(t2[1] || '') ? +t2[1] : 600; const ease = t2[/^\d+$/.test(t2[1] || '') ? 2 : 1] || '';
            const cur = scope.child({}); const ps = [];
            for (const k of Object.keys(pend)) { if (!(k in loc0)) { try { loc0[k] = cur.lookup(k); } catch (e) { /* */ } } ps.push(this.tweenOn(loc0, k, key + '.' + k, pend[k], dur, ease)); }
            if (!nowait) await Promise.all(ps);
            return;
          }
          Object.assign(loc0, pend);
          return { dirty: true, transition: tail.length ? parseTransition(tail) : null };
        }
        case 'toggle': { const n = w[1].replace(/^\$/, ''); const key = !w[1].startsWith('$') && !(n in this.vars) && scope.lookup('__inst'); if (key) { const loc = (this.inst[key] = this.inst[key] || {}); loc[n] = !(n in loc ? loc[n] : scope.lookup(n)); return { dirty: true, transition: w.length > 2 ? parseTransition(w.slice(2)) : null }; } this.vars[n] = !this.vars[n]; return { dirty: true, transition: w.length > 2 ? parseTransition(w.slice(2)) : null }; }
        case 'inc': case 'dec': { const n = w[1].replace(/^\$/, ''); const by = w[2] && /^-?\d/.test(w[2]) ? +w[2] : 1; const key = !w[1].startsWith('$') && !(n in this.vars) && scope.lookup('__inst'); if (key) { const loc = (this.inst[key] = this.inst[key] || {}); loc[n] = (+(n in loc ? loc[n] : scope.lookup(n)) || 0) + (cmd === 'inc' ? by : -by); return { dirty: true }; } this.vars[n] = (+this.vars[n] || 0) + (cmd === 'inc' ? by : -by); return { dirty: true }; }
        case 'mode': {
          const modes = this.project.modes; const target = w[1] || 'next';
          this.mode = target === 'next' ? (this.mode + 1) % modes.length : Math.max(0, modes.indexOf(target));
          return { dirty: true, transition: { type: 'dissolve', duration: 300, easing: 'smooth' } };
        }
        case 'wait': case 'delay': await new Promise((r) => this.timers.push(setTimeout(r, +w[1] || 300))); return;
        case 'scroll': return this.scrollTo(w[1], scope);
        case 'url': case 'open-url': { if (!this.opts.headless) window.open(w[1], '_blank'); return; }
        case 'play': { // play <ElementName> <preset> [dur]
          const target = this.findByKey(w[1]);
          if (target) playAnims([{ el: target, spec: w.slice(2).join(' ') || 'shake', kind: 'in' }], { project: this.project });
          return;
        }
        case 'restart': this.start(); return { navigated: true };
        case 'if': {
          // "if <cond> then A [else B]" or the brace form "if {cond} A [else B]"
          const m = /^if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+))?$/.exec(step) || /^if\s+\{([^{}]*)\}\s+(.+?)(?:\s+else\s+(.+))?$/.exec(step);
          if (!m) throw new Error(`if invalide: ${step}`);
          const branch = evaluate(m[1], scope) ? m[2] : m[3];
          if (branch) return await this.step(branch.trim(), scope, el);
          return;
        }
        case 'log': console.log('[mq]', step.slice(4)); return;
        default: throw new Error(`Action inconnue: ${cmd}`);
      }
    } catch (e) { console.warn('[maquette]', e.message); this.emit('error', { message: e.message }); }
  }

  findByKey(key) {
    const roots = [this.current, ...this.overlays.map((o) => o.el)].filter(Boolean);
    for (const r of roots) { const f = r.querySelector(`[data-key="${CSS.escape(key)}"]`); if (f) return f; }
    return null;
  }

  scrollTo(target, scope) {
    const body = this.current && this.current.querySelector('.mq-screen-body');
    if (!body) return;
    if (target === 'top' || !target) { body.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const el = this.findByKey(String(interp(target, scope)));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async go(name, t) {
    if (this.busy) return { navigated: true };
    if (!this.project.screen(name)) { this.emit('error', { message: `Écran introuvable: ${name}` }); return; }
    this.busy = true;
    try {
      while (this.overlays.length) await this.closeOverlay(['instant']);
      this.clearTimers();
      const oldEl = this.current;
      this.emit('prenavigate', { name });
      const newEl = this.build(name);
      this.history.push({ name: this.currentName, t });
      await this.transition(oldEl, newEl, t, false);
      this.current = newEl; this.currentName = name;
      this.mounted(newEl, true);
      this.emit('navigate', { name });
    } finally { this.busy = false; }
    return { navigated: true };
  }

  async back(tOverride) {
    if (this.overlays.length) { await this.closeOverlay([]); return { navigated: true }; }
    const prev = this.history.pop();
    if (!prev || this.busy) return { navigated: true };
    this.busy = true;
    try {
      this.clearTimers();
      const t = tOverride || prev.t || { type: 'instant' };
      this.emit('prenavigate', { name: prev.name });
      const newEl = this.build(prev.name);
      await this.transition(this.current, newEl, t, true);
      this.current = newEl; this.currentName = prev.name;
      this.mounted(newEl, true);
      this.emit('navigate', { name: prev.name });
    } finally { this.busy = false; }
    return { navigated: true };
  }

  async rerender(t = { type: 'instant' }) {
    if (!this.current) return;
    const name = this.currentName;
    const oldEl = this.current;
    const scrolls = [...oldEl.querySelectorAll('.mq-screen-body, [data-id]')].filter((n) => n.scrollTop || n.scrollLeft).map((n) => ({ id: n.dataset.id, key: n.dataset.key, body: n.classList.contains('mq-screen-body'), top: n.scrollTop, left: n.scrollLeft }));
    const active = document.activeElement && oldEl.contains(document.activeElement) && document.activeElement.dataset.bind ? { bind: document.activeElement.dataset.bind, s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd } : null;
    const oldKeys = new Set([...oldEl.querySelectorAll('[data-key]')].map(layerKey));
    const newEl = this.build(name);
    // layers that were already there and whose one-shot anim keeps its end (a burst that vanished) start at that end,
    // before smart animate measures them — otherwise they'd pop back and fly around
    const settled = ((newEl._mq && newEl._mq.anims) || []).filter((a) => a.kind !== 'loop' && a.el && oldKeys.has(layerKey(a.el)));
    for (const e of playAnims(settled, { project: this.project, holdOnly: true })) { try { e.animation.finish(); } catch (err) {} }
    // entrance anims of layers that just appeared (if=…, new key=…) start with the transition, not after it:
    // a burst shown when "liked" turns true, a number re-keyed on each change — the rest of the screen stays put
    const fresh = ((newEl._mq && newEl._mq.anims) || []).filter((a) => a.kind !== 'loop' && a.el && (() => { const k = layerKey(a.el); return k && !oldKeys.has(k); })());
    let freshAnims = [];
    const startFresh = () => { if (fresh.length && !freshAnims.length) freshAnims = playAnims(fresh, { project: this.project }); };
    const restore = () => {
      for (const s of scrolls) {
        const n = s.body ? newEl.querySelector('.mq-screen-body') : newEl.querySelector(`[data-id="${s.id}"]`);
        if (n) { n.scrollTop = s.top; n.scrollLeft = s.left; }
      }
      if (active) { const inp = newEl.querySelector(`[data-bind="${active.bind}"]`); if (inp) { this._refocus = true; try { inp.focus(); inp.setSelectionRange(active.s, active.e); } catch (e) { /* */ } finally { this._refocus = false; } } }
      startFresh();
    };
    // the new screen is current right away: a click during a running transition re-renders from it, not from a stale one
    this.current = newEl;
    if (t.type === 'smart') await this.smart(oldEl, newEl, t, { same: true, before: restore });
    else if (t.type === 'dissolve') { this.host.insertBefore(newEl, oldEl.nextSibling); restore(); await this.anim(newEl, [{ opacity: 0 }, { opacity: 1 }], t); oldEl.remove(); }
    else { oldEl.replaceWith(newEl); restore(); }
    if (this.current !== newEl) return; // superseded by a newer re-render meanwhile
    this.mounted(newEl, false, freshAnims);
    for (const o of this.overlays) {
      const fresh = this.buildOverlayContent(o.name, o.scope);
      o.content.replaceWith(fresh); o.content = fresh;
    }
  }

  anim(el, frames, t, extra = {}) {
    const ez = resolveEasing(t.easing, t.duration);
    const a = el.animate(frames, { duration: /^spring|bouncy|snappy|gentle|wobbly|stiff/.test(t.easing || '') ? ez.duration : t.duration, easing: ez.easing, fill: 'both', ...extra });
    return a.finished.catch(() => {}).then(() => a);
  }

  async transition(oldEl, newEl, t, reverse) {
    const host = this.host;
    let type = t.type;
    if (reverse) type = REVERSE[type] || type;
    const W = (newEl._mq && newEl._mq.w) || host.offsetWidth;
    if (newEl._mq) this.fitHost(newEl);
    if (prefersReducedMotion() && type !== 'instant') { type = 'dissolve'; t = { ...t, duration: Math.min(t.duration, 200) }; }
    const cleanup = (...els) => els.forEach((e) => { e.getAnimations().forEach((a) => a.cancel()); e.style.translate = ''; });
    const D = t.duration;
    switch (type) {
      case 'instant': host.appendChild(newEl); oldEl.remove(); return;
      case 'dissolve': host.appendChild(newEl); await this.anim(newEl, [{ opacity: 0 }, { opacity: 1 }], t); oldEl.remove(); cleanup(newEl); return;
      case 'smart': await this.smart(oldEl, newEl, t, { same: false }); return;
      case 'scale': host.appendChild(newEl); await Promise.all([this.anim(newEl, [{ opacity: 0, scale: '0.94' }, { opacity: 1, scale: '1' }], t), this.anim(oldEl, [{ opacity: 1 }, { opacity: 0 }], t)]); oldEl.remove(); cleanup(newEl); return;
      case 'flip': {
        host.style.perspective = '1400px'; host.appendChild(newEl); newEl.style.backfaceVisibility = oldEl.style.backfaceVisibility = 'hidden';
        await Promise.all([this.anim(oldEl, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${reverse ? 180 : -180}deg)` }], t), this.anim(newEl, [{ transform: `rotateY(${reverse ? -180 : 180}deg)` }, { transform: 'rotateY(0deg)' }], t)]);
        oldEl.remove(); cleanup(newEl); host.style.perspective = ''; return;
      }
      case 'ios': case 'ios-back': {
        const back = type === 'ios-back';
        if (back) host.insertBefore(newEl, oldEl); else host.appendChild(newEl);
        const top = back ? oldEl : newEl, under = back ? newEl : oldEl;
        await Promise.all([
          this.anim(top, back ? [{ translate: '0 0' }, { translate: `${W}px 0` }] : [{ translate: `${W}px 0`, boxShadow: '0 0 30px rgba(0,0,0,.3)' }, { translate: '0 0', boxShadow: '0 0 30px rgba(0,0,0,0)' }], { ...t, easing: t.easing === 'smooth' ? 'standard' : t.easing }),
          this.anim(under, back ? [{ translate: `${-W * 0.3}px 0`, filter: 'brightness(.8)' }, { translate: '0 0', filter: 'brightness(1)' }] : [{ translate: '0 0', filter: 'brightness(1)' }, { translate: `${-W * 0.3}px 0`, filter: 'brightness(.8)' }], { ...t, easing: t.easing === 'smooth' ? 'standard' : t.easing }),
        ]);
        oldEl.remove(); cleanup(newEl); newEl.style.filter = ''; return;
      }
      default: {
        const H = (newEl._mq && newEl._mq.h) || host.offsetHeight;
        const vec = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
        let m = /^(push|slide|unslide)(?:-(left|right|up|down))?$/.exec(type);
        if (!m) { host.appendChild(newEl); oldEl.remove(); return; }
        const kind = m[1], dir = m[2] || 'left';
        const [vx, vy] = vec[dir];
        const off = (k) => `${-vx * W * k}px ${-vy * H * k}px`; // where the entering screen starts
        const out = (k) => `${vx * W * k}px ${vy * H * k}px`;
        if (kind === 'push') {
          host.appendChild(newEl);
          await Promise.all([this.anim(newEl, [{ translate: off(1) }, { translate: '0 0' }], t), this.anim(oldEl, [{ translate: '0 0' }, { translate: out(1) }], t)]);
        } else if (kind === 'slide') {
          host.appendChild(newEl);
          await Promise.all([this.anim(newEl, [{ translate: off(1) }, { translate: '0 0' }], t), this.anim(oldEl, [{ filter: 'brightness(1)' }, { filter: 'brightness(.75)' }], t)]);
        } else { // unslide: the old screen leaves in direction, revealing new under it
          host.insertBefore(newEl, oldEl);
          await Promise.all([this.anim(oldEl, [{ translate: '0 0' }, { translate: out(1) }], t), this.anim(newEl, [{ filter: 'brightness(.75)' }, { filter: 'brightness(1)' }], t)]);
        }
        oldEl.remove(); cleanup(newEl); newEl.style.filter = '';
      }
    }
  }

  // ------------------------------------------------------------ smart animate
  async smart(oldEl, newEl, t, { same, before } = {}) {
    const host = this.host;
    const sc = this.scaleFactor();
    const hostR = host.getBoundingClientRect();
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left - hostR.left) / sc, y: (r.top - hostR.top) / sc, w: r.width / sc, h: r.height / sc }; };
    const ident = (el, root) => {
      // same screen: a key is scoped by its component instance (two LikeButtons both have a "burst")
      if (el.dataset.key) return 'k:' + (same ? layerKey(el) : el.dataset.key);
      if (!same) return null;
      const parts = []; let n = el;
      while (n && n !== root) {
        if (n.dataset && n.dataset.key) { parts.unshift('k:' + layerKey(n)); break; }
        const p = n.parentElement; if (!p) break;
        const sameId = n.dataset && n.dataset.id ? [...p.children].filter((c) => c.dataset && c.dataset.id === n.dataset.id) : [...p.children].filter((c) => c.tagName === n.tagName && c.className === n.className);
        parts.unshift((n.dataset && n.dataset.id ? n.dataset.id : n.className) + '#' + sameId.indexOf(n));
        n = p;
      }
      return parts.join('/');
    };
    const collect = (root) => {
      const m = new Map();
      root.querySelectorAll(same ? '[data-tag], [data-key]' : '[data-key]').forEach((el) => { const k = ident(el, root); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(el); });
      return m;
    };
    const oldMap = collect(oldEl);
    const oldInfo = new Map();
    // elements driven by a running animation (loops, entrances) have no stable geometry: never FLIP them
    const animated = new Set();
    for (const a of oldEl.getAnimations({ subtree: true })) { if (a.effect && a.effect.target && a.playState === 'running') { let n = a.effect.target; while (n && n !== oldEl) { animated.add(n); n = n.parentElement; } } }
    for (const [k, els] of oldMap) oldInfo.set(k, els.map((el) => { const cs = getComputedStyle(el); return { el, d: el.dataset.d, bool: el._bool, r: rect(el), bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius, opacity: cs.opacity, od: cs.offsetPath && cs.offsetPath !== 'none' ? cs.offsetPath + '|' + cs.offsetDistance : null, moving: animated.has(el) && !el.contains(oldEl), visible: cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0 }; }));
    const oldBg = getComputedStyle(oldEl).backgroundColor;

    host.appendChild(newEl);
    if (before) before();
    const newMap = collect(newEl);
    const pairs = [];
    for (const [k, els] of newMap) {
      const olds = oldInfo.get(k); if (!olds) continue;
      els.forEach((el, i) => { const o = olds[i]; if (o && o.visible && !o.moving && el.getClientRects().length) pairs.push({ el, o, k, r: rect(el) }); });
    }
    const matchedNew = new Set(pairs.map((p) => p.el));
    const matchedOld = new Set(pairs.map((p) => p.o.el));
    const ancestorsOfMatched = new Set();
    for (const p of pairs) { let n = p.el.parentElement; while (n && n !== newEl) { ancestorsOfMatched.add(n); n = n.parentElement; } }
    const pairOf = new Map(pairs.map((p) => [p.el, p]));
    let overlapIndex = 0;
    // timing ∝ distance (un grand déplacement prend plus de temps qu'un petit)
    let D = t.duration;
    if (t.autoDur && pairs.length) { const maxD = Math.max(...pairs.map((p) => Math.hypot(p.o.r.x - p.r.x, p.o.r.y - p.r.y) + Math.abs(p.o.r.w - p.r.w) * 0.5)); D = Math.round(Math.max(260, Math.min(620, 240 + maxD * 0.45))); }
    const ez = resolveEasing(t.easing, D);
    const dur = /^spring|bouncy|snappy|gentle|wobbly|stiff/.test(t.easing || '') ? ez.duration : D;
    const opts = { duration: dur, easing: ez.easing, fill: 'both' };
    const anims = [];

    if (!same) {
      // old screen stays on top, fading; its matched layers are hidden
      host.appendChild(oldEl);
      oldEl.style.pointerEvents = 'none';
      matchedOld.forEach((e) => (e.style.visibility = 'hidden'));
      oldEl.style.background = 'transparent';
      anims.push(oldEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur * 0.55, easing: 'ease-out', fill: 'both' }));
      const newBg = getComputedStyle(newEl).backgroundColor;
      if (oldBg && newBg && oldBg !== newBg) anims.push(newEl.animate([{ backgroundColor: oldBg }, { backgroundColor: newBg }], opts));
    } else {
      oldEl.remove();
    }

    for (const p of pairs) {
      const { el, o, r } = p;
      let anc = el.parentElement; while (anc && anc !== newEl && !pairOf.has(anc)) anc = anc.parentElement;
      const ap = anc && pairOf.get(anc);
      let dx, dy;
      if (ap) { dx = (o.r.x - ap.o.r.x) - (r.x - ap.r.x); dy = (o.r.y - ap.o.r.y) - (r.y - ap.r.y); }
      else { dx = o.r.x - r.x; dy = o.r.y - r.y; }
      let sx = r.w ? o.r.w / r.w : 1, sy = r.h ? o.r.h / r.h : 1;
      const isText = el.dataset.tag === 'text' || el.dataset.tag === 'icon';
      if (isText) { const u = Math.abs(sx - sy) < 0.35 ? (sx + sy) / 2 : 1; sx = sy = u; }
      if (ap) { sx = 1; sy = 1; }
      // a container never stretches (its children would be distorted): it moves, its children animate on their own;
      // if it has a visible background and grew, the new area is revealed by a clip instead
      const isContainer = !isText && [...el.children].some((c) => c.dataset && (c.dataset.id || c.dataset.tag || c.dataset.comp));
      let reveal = null;
      if (isContainer && (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01)) {
        const bgA = (parseColor(getComputedStyle(el).backgroundColor) || [0, 0, 0, 0])[3];
        if (bgA > 0.05 && (o.r.w < r.w - 0.5 || o.r.h < r.h - 0.5)) reveal = { right: Math.max(0, r.w - o.r.w), bottom: Math.max(0, r.h - o.r.h) };
        sx = 1; sy = 1;
      }
      const cs = getComputedStyle(el);
      // a layer riding a motion path: travel along the curve (offset-distance), not in a straight line
      const odNow = cs.offsetPath && cs.offsetPath !== 'none' ? cs.offsetPath + '|' + cs.offsetDistance : null;
      const onPath = o.od && odNow && o.od !== odNow && o.od.split('|')[0] === odNow.split('|')[0];
      const changed = !onPath && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01);
      const from = {}, to = {};
      if (onPath) { from.offsetDistance = o.od.split('|')[1]; to.offsetDistance = cs.offsetDistance; }
      if (changed) { from.translate = `${dx}px ${dy}px`; to.translate = '0px 0px'; from.scale = `${sx} ${sy}`; to.scale = '1 1'; }
      if (o.bg !== cs.backgroundColor) { from.backgroundColor = o.bg; to.backgroundColor = cs.backgroundColor; }
      if (o.color !== cs.color) { from.color = o.color; to.color = cs.color; }
      if (o.radius !== cs.borderTopLeftRadius) { from.borderRadius = o.radius; to.borderRadius = cs.borderRadius; }
      if (o.opacity !== cs.opacity) { from.opacity = o.opacity; to.opacity = cs.opacity; }
      if (reveal) { const rad = cs.borderTopLeftRadius || '0px'; from.clipPath = `inset(0px ${reveal.right}px ${reveal.bottom}px 0px round ${rad})`; to.clipPath = `inset(0px 0px 0px 0px round ${rad})`; }
      if (!Object.keys(from).length && !(o.d && el.dataset.d && o.d !== el.dataset.d)) continue;
      if (!Object.keys(from).length) { if (!liveBoolean(el, o.bool, el._bool, dur, easeFn(ez.easing))) morphBetween(el, o.d, el.dataset.d, dur, (p) => 1 - Math.pow(1 - p, 3)); continue; }
      const prevOrigin = el.style.transformOrigin;
      if (changed) el.style.transformOrigin = '0 0';
      const frames = [from, to];
      const dist = Math.hypot(dx, dy);
      p.delta = [dx, dy];
      const parentStill = !ap || !ap.delta || (Math.abs(ap.delta[0]) < 0.5 && Math.abs(ap.delta[1]) < 0.5);
      if ((t.arc || t.smear) && changed && dist > 40 && parentStill) {
        const mid = { offset: 0.5 };
        let mx = dx / 2, my = dy / 2;
        if (t.arc) { let nx = -dy / dist, ny = dx / dist; if (ny > 0) { nx = -nx; ny = -ny; } mx += nx * dist * 0.2; my += ny * dist * 0.2; }
        mid.translate = `${mx}px ${my}px`;
        let msx = (sx + 1) / 2, msy = (sy + 1) / 2;
        if (t.smear) { if (Math.abs(dx) > Math.abs(dy)) msx *= 1.08; else msy *= 1.08; mid.filter = 'blur(1.2px)'; from.filter = 'blur(0px)'; to.filter = 'blur(0px)'; }
        mid.scale = `${msx} ${msy}`;
        frames.splice(1, 0, mid);
      }
      const lag = t.overlap && changed && dist > 2 && parentStill ? Math.min(180, (overlapIndex++) * 45) : 0;
      if (o.d && el.dataset.d && o.d !== el.dataset.d && !liveBoolean(el, o.bool, el._bool, dur, easeFn(ez.easing), lag)) { const target = el.dataset.d; setTimeout(() => morphBetween(el, o.d, target, dur, (p) => 1 - Math.pow(1 - p, 3)), lag); }
      const a = el.animate(frames, { ...opts, delay: lag });
      a.finished.catch(() => {}).then(() => { el.style.transformOrigin = prevOrigin; });
      anims.push(a);
    }
    // fade in unmatched layers (maximal subtrees without matches)
    const fadeIn = [];
    const walk = (n) => {
      for (const c of n.children) {
        if (c.tagName === 'STYLE') continue;
        if (matchedNew.has(c) || ancestorsOfMatched.has(c)) { walk(c); continue; }
        if (c.classList.contains('mq-statusbar') || c.classList.contains('mq-homebar')) continue;
        // internal render parts of a matched layer (vector fill/stroke, icon svg, effect layers) belong to it: never fade them
        if (matchedNew.has(n) && !(c.dataset && c.dataset.id)) continue;
        if (!(c.dataset && c.dataset.id) && !c.querySelector('[data-id]')) { if (n !== newEl && !matchedNew.has(n)) fadeIn.push(c); continue; }
        fadeIn.push(c);
      }
    };
    walk(newEl);
    if (fadeIn.length < 400) for (const c of fadeIn) anims.push(c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: same ? dur * 0.8 : dur * 0.7, delay: same ? 0 : dur * 0.25, easing: 'ease-out', fill: 'backwards' }));
    await Promise.all(anims.map((a) => a.finished.catch(() => {})));
    if (!same) oldEl.remove();
    anims.forEach((a) => { try { a.cancel(); } catch (e) { /* */ } });
  }

  // ------------------------------------------------------------ overlays
  buildOverlayContent(name, scope) {
    const screen = this.project.screen(name);
    const ctx = this.ctx();
    if (screen) {
      const el = renderScreen(screen, ctx);
      el._isScreen = true;
      return el;
    }
    const comp = this.project.components[name];
    if (comp) {
      const node = { id: 'ov-' + name, tag: name, attrs: {}, children: [] };
      const el = renderStandalone(node, ctx);
      return el;
    }
    throw new Error(`Overlay introuvable: ${name}`);
  }

  async openOverlay(name, args, scope) {
    let pos = 'center', dim = 0.45, closeOnBackdrop = true, blur = 0;
    const rest = [];
    for (const a of args) {
      const kv = /^(\w+)=(.+)$/.exec(a);
      if (kv) { if (kv[1] === 'pos' || kv[1] === 'position') pos = kv[2]; else if (kv[1] === 'dim') dim = +kv[2]; else if (kv[1] === 'blur') blur = +kv[2]; continue; }
      if (['center', 'bottom', 'top', 'left', 'right', 'bottom-right', 'top-right', 'top-left', 'bottom-left'].includes(a)) { pos = a; continue; }
      if (a === 'noclose' || a === 'modal') { closeOnBackdrop = false; continue; }
      rest.push(a);
    }
    const t = parseTransition(rest);
    if (t.type === 'instant' && !rest.includes('instant')) { t.type = pos === 'center' ? 'scale' : 'move'; t.duration = pos === 'center' ? 260 : 380; t.easing = pos === 'center' ? 'smooth' : 'standard'; }
    let content;
    try { content = this.buildOverlayContent(name, scope); } catch (e) { this.emit('error', { message: e.message }); return; }
    const layer = document.createElement('div');
    layer.className = 'mq-overlay';
    layer.style.cssText = 'position:absolute;inset:0;z-index:10000;display:grid;';
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `position:absolute;inset:0;background:rgba(0,0,0,${dim});${blur ? `backdrop-filter:blur(${blur}px);` : ''}`;
    layer.appendChild(backdrop);
    const holder = document.createElement('div');
    const P = { center: 'center center', bottom: 'end stretch', top: 'start stretch', left: 'stretch start', right: 'stretch end', 'bottom-right': 'end end', 'top-right': 'start end', 'top-left': 'start start', 'bottom-left': 'end start' };
    layer.style.placeItems = P[pos] || 'center';
    holder.style.cssText = 'position:relative;grid-area:1/1;display:grid;';
    if (pos === 'bottom' || pos === 'top') holder.style.justifyItems = 'stretch';
    if (content._isScreen) { content.style.position = 'relative'; if (pos === 'bottom' || pos === 'top') { content.style.width = '100%'; } }
    holder.appendChild(content);
    layer.appendChild(holder);
    this.host.appendChild(layer);
    const rec = { name, layer, holder, content, pos, t, scope };
    this.overlays.push(rec);
    if (closeOnBackdrop) backdrop.addEventListener('click', () => this.closeOverlay([]));
    const enter = this.overlayFrames(pos, t.type);
    await Promise.all([this.anim(backdrop, [{ opacity: 0 }, { opacity: 1 }], { ...t, easing: 'smooth' }), this.anim(holder, enter, t)]);
    holder.getAnimations().forEach((a) => a.cancel()); backdrop.getAnimations().forEach((a) => a.cancel());
    playAnims((content._mq && content._mq.anims) || [], { project: this.project });
    if (content._mq && content._mq.events) this.fireLifecycle(content._mq.events, content);
    this.emit('overlay', { name });
  }

  overlayFrames(pos, type) {
    if (type === 'dissolve') return [{ opacity: 0 }, { opacity: 1 }];
    if (type === 'scale' || pos === 'center') return [{ opacity: 0, scale: '0.92' }, { opacity: 1, scale: '1' }];
    const from = { bottom: '0 100%', top: '0 -100%', left: '-100% 0', right: '100% 0', 'bottom-right': '0 30px', 'top-right': '0 -30px', 'top-left': '0 -30px', 'bottom-left': '0 30px' }[pos] || '0 30px';
    return [{ translate: from, opacity: pos.includes('-') ? 0 : 1 }, { translate: '0 0', opacity: 1 }];
  }

  async closeOverlay(args = []) {
    const rec = this.overlays.pop();
    if (!rec) return;
    const instant = args.includes('instant');
    if (!instant) {
      const frames = this.overlayFrames(rec.pos, rec.t.type).slice().reverse();
      await Promise.all([this.anim(rec.holder, frames, { ...rec.t, duration: rec.t.duration * 0.8 }), this.anim(rec.layer.firstChild, [{ opacity: 1 }, { opacity: 0 }], { ...rec.t, duration: rec.t.duration * 0.8 })]);
    }
    rec.layer.remove();
    this.emit('overlay-close', { name: rec.name });
  }

  // all hotspots currently visible (for "show hotspots" hints & automated tours)
  hotspots() {
    const roots = [this.current, ...this.overlays.map((o) => o.layer)].filter(Boolean);
    return roots.flatMap((r) => [...r.querySelectorAll('[data-hot]')]);
  }
}

Object.assign(Player.prototype, GestureMixin);
