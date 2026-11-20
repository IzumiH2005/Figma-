// `mq drive` — an agent pointer for the visual editor. Claude (or a script) drives the real editor with
// continuous, human-like mouse gestures (minimum-jerk velocity, slight arcs, 60 fps), so point editing, pen,
// pencil, rigs, resize/rotate handles, menus, prototype controls… behave exactly as for a designer with a mouse.
//
//   mq drive projet.mq gestes.txt [--write] [--video s.mp4] [--shots dossier] [--speed 2] [--scale 1]
//   mq drive projet.mq -e "select knob-gain; rigs; rig value 0.8"       (inline commands, separated by ;)
//   mq drive projet.mq --serve [7788] [--write]   then   mq drive send "zoom Lab; shot a.png" [--port 7788]
//      → one browser stays open between calls: no reload, instant feedback (stop with `mq drive send quit`)
//
// Every mutating gesture prints what it changed in the source (attribute diff), so the effect is readable as text.
//
// Commands (one per line, # comments; quotes group words: ui "Ajouter un composant")
//   view   zoom <name> [pad] · zoomin|zoomout [<target>] [steps] · pan <dx> <dy> · scroll <dy> [dx] [at <target>]
//   select <name…> (several = multi-selection) · edit [<name>] · exit · tool move|pen|pencil|shape:<kind>
//   mouse  move|hover <target> [ms] · click|dblclick|rclick <target> [mod=shift+alt] · menu "<label>"
//          drag <target> to <target> | by <dx> <dy> [ms=] [arc=] [mod=shift] · marquee <target> to <target>
//   draw   pen <x,y> <x,y>><hx,hy> … · pencil <x,y> <x,y> … [ms=] · at <name>   (design coords of the frame `at`)
//   rigs   rigs (list, editor or prototype) · rig <name> <v> [v2] [ms=]  drags the rig's handle to that value
//   shape  resize <name> <w> <h> [from=se] · rotate <name> <deg> · set <name> k=v … · undo · redo
//   keys   key <combo> · type "<text>"
//   proto  present [<screen>] · exit (gestures then act on the live prototype: rig, click proto "Bluetooth"…)
//   studio studio [<Component>] : opens the Component Studio; rig/click/proto then act on its live playground,
//          ui "<text>" on its panels (controls, variant matrix, properties) · exit closes it
//   check  info <name> · expect <name> <attr> <op> <value>   (op: = != < > <= >= ~)  · anchors · js <expr>
//   out    shot <file> [<name>] · save · diff on|off · wait <ms>|idle
// Targets: anchor <i> | anchor <s:i> | handle <i>.in|out | rig <name|i> | node <name> [fx fy] | local <x> <y>
//          | corner <name> nw|n|ne|e|se|s|sw|w | rotate <name> | layer <name> | ui "<text>" | css <selector> [n]
//          | proto <key|"text"> [n] | <x> <y>
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PAGE_JS = String.raw`
window.__D = {
  byName(n) { const all = [...app.project.byId.values()]; return all.find((x) => x.attrs && x.attrs.name === n) || all.find((x) => x.id === n) || all.find((x) => x.tag === 'screen' && x.attrs.name === n) || null; },
  need(n) { const x = this.byName(n); if (!x) throw new Error('calque introuvable : ' + n); return x; },
  rectOf(id) { const c = window.__canvas; const el = c.elOf(id) || (c.items && c.items.get(id)); if (el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
    const or = c.operandClientRect && c.operandClientRect(id); if (or) return { x: or.left, y: or.top, w: or.width, h: or.height };
    // boolean operand / non-rendered child: derive from the parent
    const p = app.parent(id); const n = app.node(id); if (!p) return null; const pr = this.rectOf(p.id); if (!pr) return null; const z = app.zoom;
    return { x: pr.x + (parseFloat(n.attrs.x) || 0) * z, y: pr.y + (parseFloat(n.attrs.y) || 0) * z, w: (parseFloat(n.attrs.w) || 0) * z, h: (parseFloat(n.attrs.h) || 0) * z }; },
  // an unselected boolean operand is grabbed with a deep click (⌘/Ctrl), like a hand would in Figma
  needsDeep(n) { const x = this.byName(n); return !!(x && window.__canvas.operandInfo && window.__canvas.operandInfo(x.id) && !app.selection.includes(x.id)); },
  select(names) { const ids = [].concat(names).map((n) => this.need(n).id); app.select(ids); return ids; },
  ensureSel(n) { const x = this.need(n); if (app.selection.length !== 1 || app.selection[0] !== x.id) { app.select([x.id]); return { retry: true }; } return null; },
  zoom(n, pad) { const x = this.need(n); window.__canvas.zoomToFit([x.id]); if (pad) window.__canvas.zoomBy(pad); app.emit('view'); return app.zoom; },
  edit(n) { const id = n ? this.select(n)[0] : app.selection[0]; window.__canvas.vedit.enter(id); return !!window.__canvas.vedit.active; },
  frame() { const v = window.__canvas.vedit; if (!v.active) return null; const F = v.frame(); const R = window.__canvas.rect; return F && { x: R.left + F.r.x, y: R.top + F.r.y, sx: F.sx, sy: F.sy }; },
  center(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  shown(el) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none'; },
  visible(el) { if (!this.shown(el)) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; },
  // the live prototype that owns the mouse: the Component Studio playground first, then present mode
  playing() { for (const p of [window.__studio, window.__play]) if (p && p.root && p.root.isConnected && p.player) return p; return null; },
  studio(name) { const s = window.__studio; if (!s) throw new Error('Studio indisponible'); s.open(name || undefined); if (name && s.name !== name) throw new Error('composant introuvable : ' + name); return s.name; },
  // element by visible text (or title / aria-label / placeholder): exact match first, then prefix, then substring
  byText(scope, text, n) {
    const T = text.trim().toLowerCase(); const cands = [];
    for (const el of scope.querySelectorAll('*')) {
      if (el.closest('#agent-cursor') || !this.shown(el)) continue;
      const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim().toLowerCase();
      const meta = [el.getAttribute('title'), el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.tagName === 'INPUT' ? el.value : null].filter(Boolean).map((s) => s.trim().toLowerCase());
      const all = [own, ...meta]; const score = all.includes(T) ? 0 : all.some((s) => s && s.startsWith(T)) ? 1 : all.some((s) => s && s.includes(T)) ? 2 : -1;
      if (score >= 0) { const r = el.getBoundingClientRect(); cands.push({ el, score, area: r.width * r.height, off: this.visible(el) ? 0 : 1 }); }
    }
    cands.sort((a, b) => a.score - b.score || a.off - b.off || a.area - b.area);
    const c = cands[n || 0]; if (!c) throw new Error('élément introuvable : "' + text + '"');
    if (c.off) c.el.scrollIntoView({ block: 'center', inline: 'nearest' }); // scrolled out of its panel: bring it into view first, like a hand on the wheel
    return c.el;
  },
  ui(text, n) { const play = this.playing(); return this.byText(play ? play.root : document.body, text, n); },
  // every rig currently reachable by the mouse: editor handles (custom green + built-in shape rigs) or live prototype
  rigList() {
    const R = MQ.Rig; const out = []; const play = this.playing();
    if (play) {
      const els = [...play.player.host.querySelectorAll('[data-rigged]')].filter((el) => el._rigs && this.visible(el));
      for (const el of els) for (const grp of R.groupRigs(el._rigs.filter((g) => g.bind.type !== 'attr'))) {
        const box = R.toBox(R.rigBox(el, grp.rigs[0].r)); const values = Object.fromEntries(grp.rigs.map((g) => [g.target, play.player.readBound(g.bind)]));
        out.push({ where: 'proto', name: grp.rigs.map((g) => g.target).join(','), owner: el.dataset.key || el.dataset.inst || '', grp, box, values, handle: R.groupPos(grp, values, box) });
      }
      return out;
    }
    const v = window.__canvas.vedit; const owner = app.selection.length === 1 ? (app.node(app.selection[0])?.attrs.name || app.selection[0]) : '';
    (v._custom || []).forEach((c, gi) => { const el = document.querySelector('.ve-rig.custom[data-crig="' + gi + '"]'); if (!el) return;
      const box = R.toBox(R.rigBox(c.el, c.grp.rigs[0].r)); const values = Object.fromEntries(c.grp.rigs.map((g) => [g.target, v.rigValue(g)]));
      out.push({ where: 'editor', name: c.grp.rigs.map((g) => g.target).join(','), owner, grp: c.grp, box, values, handle: this.center(el) }); });
    document.querySelectorAll('.ve-rig:not(.custom)').forEach((el) => { const [id] = el.dataset.rig.split('|'); const n = app.node(id); const p = el.dataset.rigName;
      out.push({ where: 'editor', name: p, owner, builtin: true, values: { [p]: n && n.attrs[p] }, handle: this.center(el) }); });
    return out;
  },
  findRig(spec) {
    const q = String(spec).trim().split(/\s+/); let name = q[0]; const nth = q[1] !== undefined && /^\d+$/.test(q[1]) ? +q[1] : 0;
    let owner = null; if (name.includes('.') && !/^\d/.test(name)) { const i = name.lastIndexOf('.'); owner = name.slice(0, i); name = name.slice(i + 1); }
    if (owner && !this.playing()) { const r = this.ensureSel(owner); if (r) return r; }
    const list = this.rigList();
    if (/^\d+$/.test(name)) { const r = list[+name]; if (!r) throw new Error('rig ' + name + ' introuvable (' + list.length + ' visibles)'); return r; }
    const hits = list.filter((r) => (r.name.split(',').includes(name) || r.name === name) && (!owner || r.owner === owner || !this.playing()));
    if (!hits.length) throw new Error('rig introuvable : ' + spec + (list.length ? ' — visibles : ' + list.map((r) => r.name).join(' · ') : ' — aucun rig visible (sélectionne le calque, ou present)'));
    return hits[Math.min(nth, hits.length - 1)];
  },
  rigs() { const f = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
    const list = this.rigList(); if (!list.length) return 'aucun rig visible (sélectionne un calque riggé, ou present)';
    return list.map((r, i) => '  [' + i + '] ' + (r.where === 'proto' ? '▶ ' : '') + (r.owner ? r.owner + '.' : '') + r.name + (r.builtin ? ' (forme)' : ' (' + r.grp.rigs.map((g) => g.r.mode + ' ' + g.r.min + '..' + g.r.max).join(' + ') + ')') + ' = ' + Object.values(r.values).map(f).join(', ')).join('\n'); },
  // positions along the control from the current value(s) to the target value(s): the mouse follows the track
  rigPath(spec, targets, steps) {
    const r = this.findRig(spec); if (r.retry) return r; if (r.builtin) throw new Error('rig de forme : utilise drag rig ' + r.name + ' by dx dy');
    const R = MQ.Rig; const gs = r.grp.rigs; const from = gs.map((g) => +r.values[g.target] || 0); const to = gs.map((g, i) => (targets[i] !== undefined ? +targets[i] : from[i]));
    const pts = []; for (let k = 0; k <= steps; k++) { const t = k / steps; const vals = Object.fromEntries(gs.map((g, i) => [g.target, from[i] + (to[i] - from[i]) * t])); pts.push(R.groupPos(r.grp, vals, r.box)); }
    pts[0] = r.handle; return { pts, from, to, name: r.name, owner: r.owner };
  },
  pt(t) {
    const q = t.trim().split(/\s+/); const k = q[0]; const rest = t.trim().slice(k.length).trim().replace(/^"(.*)"$/, '$1');
    if (k === 'anchor') { const key = q[1].includes(':') ? q[1] : '0:' + q[1]; const el = document.querySelector('.ve-anchor[data-va="' + key + '"]'); if (!el) throw new Error('ancre introuvable : ' + key); return this.center(el); }
    if (k === 'handle') { const [i, side] = q[1].split('.'); const key = (i.includes(':') ? i : '0:' + i) + ':' + side;
      const el = document.querySelector('.ve-handle[data-vh="' + key + '"]');
      if (!el) { // handles only show next to selected anchors: select the anchor first (click), then retry
        const a = document.querySelector('.ve-anchor[data-va="' + key.split(':').slice(0, 2).join(':') + '"]'); if (a) return { needSelect: this.center(a) }; throw new Error('poignée introuvable : ' + key); }
      return this.center(el); }
    if (k === 'rig') { const r = this.findRig(rest); return r.retry ? r : r.handle; }
    if (k === 'node') { const x = this.need(q[1]); const r = this.rectOf(x.id); const fx = q[2] !== undefined ? +q[2] : 0.5, fy = q[3] !== undefined ? +q[3] : 0.5; return { x: r.x + r.w * fx, y: r.y + r.h * fy }; }
    if (k === 'corner' || k === 'rotate') { const r = this.ensureSel(q[1]); if (r) return r;
      const el = document.querySelector(k === 'corner' ? '.cv-handle[data-handle="' + (q[2] || 'se') + '"]' : '.cv-rotate'); if (!el) throw new Error((k === 'corner' ? 'poignée ' + (q[2] || 'se') : 'poignée de rotation') + ' introuvable'); return this.center(el); }
    if (k === 'layer') { const x = this.need(q[1]); const el = document.querySelector('.lrow[data-id="' + x.id + '"]'); if (!el) { app.select([x.id]); return { retry: true }; } el.scrollIntoView({ block: 'nearest' }); return this.center(el); }
    if (k === 'ui') { const raw = t.trim().slice(k.length).trim(); const m = /^"(.*)"(?:\s+(\d+))?$/.exec(raw); // ui "Goutte 80" keeps its digits; ui Ajouter 2 = 3rd match
      return this.center(m ? this.ui(m[1], +(m[2] || 0)) : this.ui(raw.replace(/\s+\d+$/, ''), +(/\s(\d+)$/.exec(raw) || [0, 0])[1])); }
    if (k === 'css') { const m = /^(.*?)(?:\s+(\d+))?$/.exec(rest); const els = [...document.querySelectorAll(m[1])].filter((e) => this.visible(e)); const el = els[+(m[2] || 0)]; if (!el) throw new Error('aucun élément visible pour ' + m[1]); return this.center(el); }
    if (k === 'proto') { const play = this.playing(); if (!play) throw new Error('pas en mode présentation (present)');
      const raw = t.trim().slice(k.length).trim(); const m = /^"(.*)"(?:\s+(\d+))?$/.exec(raw) || /^(.*?)(?:\s+(\d+))?$/.exec(raw); const key = m[1]; const n = +(m[2] || 0);
      const byKey = [...play.player.host.querySelectorAll('[data-key="' + key + '"]')].filter((e) => this.visible(e));
      return this.center(byKey[n] || this.byText(play.player.host, key, n)); }
    if (k === 'local') { const F = this.frame(); if (F) return { x: F.x + +q[1] * F.sx, y: F.y + +q[2] * F.sy }; const o = this.origin(); return { x: o.x + +q[1] * app.zoom, y: o.y + +q[2] * app.zoom }; }
    if (/^-?[\d.]+$/.test(k)) return { x: +k, y: +q[1] };
    throw new Error('cible inconnue : ' + t);
  },
  _origin: null, at(n) { const x = this.need(n); const r = this.rectOf(x.id); this._origin = { x: r.x, y: r.y }; return this._origin; },
  origin() { return this._origin || { x: window.__canvas.rect.left, y: window.__canvas.rect.top }; },
  design(x, y) { const o = this.origin(); return { x: o.x + x * app.zoom, y: o.y + y * app.zoom }; },
  anchors() { const v = window.__canvas.vedit; if (!v.active) return 'pas en mode édition de points';
    const f = (n) => Math.round(n * 10) / 10; return v.subs.map((s, si) => 'tracé ' + si + (s.closed ? ' (fermé)' : '') + '\n' + s.nodes.map((nd, i) => '  anchor ' + (si ? si + ':' : '') + i + '  (' + f(nd.x) + ', ' + f(nd.y) + ')' + (nd.in ? '  in(' + f(nd.in.x) + ', ' + f(nd.in.y) + ')' : '') + (nd.out ? '  out(' + f(nd.out.x) + ', ' + f(nd.out.y) + ')' : '')).join('\n')).join('\n'); },
  snap() { const o = {}; for (const n of app.project.byId.values()) if (n.attrs && n.tag !== '#text') o[n.id] = { tag: n.tag, name: n.attrs.name || '', attrs: { ...n.attrs }, raw: n.raw || '', p: app.parent(n.id)?.id || null }; return o; },
  info(n) { const x = this.need(n); const r = this.rectOf(x.id); const z = app.zoom;
    return '<' + x.tag + ' ' + Object.entries(x.attrs).map(([k, v]) => (v === true ? k : k + '=' + (/\s/.test(String(v)) ? JSON.stringify(String(v)) : v))).join(' ') + '>' + (r ? '   [rendu ' + Math.round(r.w / z) + '×' + Math.round(r.h / z) + ']' : ''); },
  attr(n, k) { const x = this.need(n); if (k === 'w' || k === 'h') { const v = x.attrs[k]; if (v !== undefined && !isNaN(+v)) return +v; const r = this.rectOf(x.id); return r ? Math.round((k === 'w' ? r.w : r.h) / app.zoom) : null; }
    if (k === 'tag') return x.tag; if (k === 'selected') return app.selection.includes(x.id);
    if (k === 'children') return (x.children || []).filter((c) => c.tag !== '#text').length; return x.attrs[k] ?? null; },
  set(n, kv) { const x = this.need(n); app.change(() => { for (const [k, v] of Object.entries(kv)) { if (v === '') delete x.attrs[k]; else x.attrs[k] = v; } }, 'doc'); return true; },
  present(s) { const p = window.__play; const scr = s || (() => { const id = app.selection[0]; let n = id && app.node(id); while (n && n.tag !== 'screen') n = app.parent(n.id); return n && n.attrs.name; })(); p.open(scr || undefined); return !!this.playing(); },
  menu(label) { const L = label.toLowerCase(); const items = [...document.querySelectorAll('.ctxmenu .item')];
    const it = items.find((i) => i.textContent.trim().toLowerCase() === L) || items.find((i) => (i.querySelector('.lbl')?.textContent || '').toLowerCase().startsWith(L)) || items.find((i) => i.textContent.toLowerCase().includes(L));
    if (!it) throw new Error('entrée de menu introuvable : "' + label + '"' + (items.length ? ' — menu : ' + items.map((i) => i.querySelector('.lbl')?.textContent).filter(Boolean).join(' · ') : ' (aucun menu ouvert : rclick d\'abord)'));
    return this.center(it); },
};
// visible pointer for videos (headless Chromium draws no cursor)
(() => { const c = document.createElement('div'); c.id = 'agent-cursor';
  c.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-2px 0 0 -2px;z-index:2147483647;pointer-events:none;transition:transform .08s';
  c.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 1.5L15 9.2 9.2 10.4 6.4 16z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { c.style.transform = 'scale(.82)'; }, true); addEventListener('mouseup', () => { c.style.transform = ''; }, true);
})();
`;

// minimum-jerk profile (human reaching movement): smooth start and stop, no constant-speed robot look
const mj = (t) => t * t * t * (10 - 15 * t + 6 * t * t);

// split a script into commands (newlines, or ; outside quotes) and a command into words (quotes group words)
export function splitScript(script) {
  let lines;
  if (script.includes('\n')) lines = script.split('\n'); // files: one command per line
  else { // inline -e: ; separates commands (outside quotes)
    lines = []; let cur = ''; let q = false;
    for (const ch of script) { if (ch === '"') q = !q; if (!q && ch === ';') { lines.push(cur); cur = ''; continue; } cur += ch; }
    lines.push(cur);
  }
  return lines.map((l) => (/^\s*js\s/.test(l) ? l : l.replace(/(^|\s)#.*$/, '')).trim()).filter(Boolean);
}
const words = (line) => (line.match(/"[^"]*"|\S+/g) || []);
const unq = (s) => s.replace(/^"(.*)"$/, '$1');

// readable diff of two source snapshots: "knob-gain.value 0.62 → 0.8"
function diffSnap(a, b) {
  const out = []; const label = (n, id) => n.name || `${n.tag}#${id}`;
  const show = (v) => (v === undefined ? '∅' : v === true ? 'oui' : String(v).length > 48 ? String(v).slice(0, 45) + '…' : String(v));
  for (const id of Object.keys(b)) {
    const y = b[id], x = a[id];
    if (!x) { if (!y.p || a[y.p]) { const kids = Object.values(b).filter((z) => z.p && !a[z.p]).length; out.push(`+ <${y.tag}${y.name ? ' name=' + y.name : ''}>${kids ? ` (${kids} descendants ajoutés)` : ''}`); } continue; }
    for (const k of new Set([...Object.keys(x.attrs), ...Object.keys(y.attrs)])) if (String(x.attrs[k]) !== String(y.attrs[k])) out.push(`${label(y, id)}.${k}  ${show(x.attrs[k])} → ${show(y.attrs[k])}`);
    if (x.raw !== y.raw && y.tag !== '#text') out.push(`${label(y, id)} (contenu modifié)`);
  }
  for (const id of Object.keys(a)) if (!b[id] && (!a[id].p || b[a[id].p])) out.push(`− <${a[id].tag}${a[id].name ? ' name=' + a[id].name : ''}>`);
  return out;
}

export async function drive({ file, script, write, video, shots, scale = 1, speed = 1, serve, buildEditorHTML, chromium }) {
  const src = fs.readFileSync(file, 'utf8');
  const html = await buildEditorHTML({ projects: [{ file: path.basename(file), source: src }] });
  const tmp = path.join(process.env.TMPDIR || '/tmp', `mq-drive-${process.pid}.html`); fs.writeFileSync(tmp, html);
  const vw = 1440, vh = 900;
  const browser = await chromium.launch();
  const vdir = video ? fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'mqdrive-')) : null;
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: +scale, ...(video ? { recordVideo: { dir: vdir, size: { width: vw, height: vh } } } : {}) });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  // the editor keeps drafts in localStorage: start clean
  await page.goto('file://' + tmp); await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } }); await page.reload();
  await page.waitForFunction(() => window.app && window.__canvas, null, { timeout: 15000 }); await page.waitForTimeout(600);
  await page.addScriptTag({ content: PAGE_JS });
  let cur = { x: vw / 2, y: vh / 2 }; await page.mouse.move(cur.x, cur.y);
  const D = (fn, ...a) => page.evaluate(({ fn, a }) => window.__D[fn](...a), { fn, a });
  const outDir = shots || path.dirname(file);
  const sp = Math.max(0.1, +speed || 1); const T = (ms) => Math.max(16, Math.round(ms / sp));
  let showDiff = true; let failures = 0; let buf = [];
  const log = (m) => { const s = '  ' + m; buf.push(s); if (!serve) console.log(s); };
  const err = (m) => { const s = '  ✖ ' + m; buf.push(s); if (!serve) console.error(s); };

  // wait until the editor has painted (two animation frames) instead of guessing fixed delays
  const settle = async (extra = 0) => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); if (extra) await page.waitForTimeout(extra); };
  // continuous gesture: 60 fps, minimum-jerk timing, optional arc (perpendicular bulge, like a wrist movement)
  async function glide(to, ms = 450, arc = 0, exact = false) {
    const from = { ...cur }; const dx = to.x - from.x, dy = to.y - from.y; const L = Math.hypot(dx, dy) || 1;
    // Fitts-like: short hops are quicker than long reaches
    const dur = T(exact ? ms : Math.min(ms, 160 + L * 0.9)); const n = Math.max(4, Math.round(dur / 16));
    const nx = -dy / L, ny = dx / L;
    for (let i = 1; i <= n; i++) {
      const t = i / n, s = mj(t), b = Math.sin(Math.PI * s) * arc;
      await page.mouse.move(from.x + dx * s + nx * b, from.y + dy * s + ny * b);
      await page.waitForTimeout(16);
    }
    cur = { ...to };
  }
  // follow a polyline (rig tracks, rotation arcs) with a minimum-jerk profile over its whole length
  async function trace(pts, ms) {
    const segs = [0]; for (let i = 1; i < pts.length; i++) segs.push(segs[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = segs[segs.length - 1] || 1; const n = Math.max(8, Math.round(T(ms) / 16));
    for (let i = 1; i <= n; i++) {
      const d = mj(i / n) * total; let j = 1; while (j < segs.length - 1 && segs[j] < d) j++;
      const a = pts[j - 1], b = pts[j]; const u = (d - segs[j - 1]) / ((segs[j] - segs[j - 1]) || 1);
      await page.mouse.move(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u); await page.waitForTimeout(16);
    }
    cur = { ...pts[pts.length - 1] };
  }
  async function resolve(target) {
    for (let k = 0; k < 4; k++) {
      const p = await D('pt', target);
      if (p.needSelect) { await glide(p.needSelect, 300); await page.mouse.down(); await page.mouse.up(); await settle(); continue; }
      if (p.retry) { await settle(); continue; }
      return p;
    }
    throw new Error('cible instable : ' + target);
  }
  const opt = (parts, key, d) => { const m = parts.find((x) => x.startsWith(key + '=')); return m ? m.split('=')[1] : d; };
  const plain = (parts) => parts.filter((x) => !/^\w+=/.test(x));
  const MODS = { shift: 'Shift', alt: 'Alt', ctrl: 'Control', control: 'Control', cmd: 'Meta', meta: 'Meta' };
  const withMods = async (parts, fn) => {
    const ks = String(opt(parts, 'mod', '')).split('+').filter(Boolean).map((m) => MODS[m.toLowerCase()] || m);
    for (const k of ks) await page.keyboard.down(k);
    try { await fn(); } finally { for (const k of ks.reverse()) await page.keyboard.up(k); }
  };
  const press = async (button = 'left') => { await page.mouse.down({ button }); await page.waitForTimeout(T(45)); await page.mouse.up({ button }); };

  const MUTATING = new Set(['click', 'dblclick', 'drag', 'marquee', 'pen', 'pencil', 'rig', 'resize', 'rotate', 'set', 'undo', 'redo', 'key', 'type', 'menu', 'edit']);

  async function run1(line) {
    const parts = words(line); const cmd = parts[0]; const args = plain(parts.slice(1)); const joined = args.join(' ');
    const watch = showDiff && MUTATING.has(cmd) && !(await page.evaluate(() => !!(window.__play && window.__play.root && window.__play.root.isConnected)));
    const before = watch ? await D('snap') : null;
    switch (cmd) {
      case 'zoom': log(`zoom ${args[0]} → ${(await D('zoom', args[0], args[1] ? +args[1] : 0)).toFixed(2)}`); await settle(); break;
      case 'zoomin': case 'zoomout': {
        const steps = +(args.find((a) => /^\d+$/.test(a)) || 3); const tgt = args.filter((a) => !/^\d+$/.test(a)).join(' ');
        if (tgt) await glide(await resolve(tgt), 300);
        await page.keyboard.down('Control'); for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, cmd === 'zoomin' ? -120 : 120); await page.waitForTimeout(T(40)); } await page.keyboard.up('Control');
        await settle(); log(`zoom → ${(await page.evaluate(() => app.zoom)).toFixed(2)}`); break;
      }
      case 'pan': { // middle-button drag, like a designer's wheel-click
        const dx = +args[0] || 0, dy = +args[1] || 0; const c = await page.evaluate(() => { const r = window.__canvas.rect; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await glide(c, 250); await page.mouse.down({ button: 'middle' }); await glide({ x: c.x + dx, y: c.y + dy }, 500); await page.mouse.up({ button: 'middle' }); await settle(); break;
      }
      case 'scroll': {
        const atI = args.indexOf('at'); if (atI >= 0) await glide(await resolve(args.slice(atI + 1).join(' ')), 300);
        const dy = +args[0] || 0, dx = +(atI === 1 ? 0 : args[1] || 0); const n = Math.max(1, Math.round(Math.hypot(dx, dy) / 60));
        for (let i = 0; i < n; i++) { await page.mouse.wheel(dx / n, dy / n); await page.waitForTimeout(T(24)); } await settle(); break;
      }
      case 'select': await D('select', args); await settle(); break;
      case 'edit': { const ok = await D('edit', args[0] || null); log(ok ? `édition des points : ${args[0] || 'sélection'}` : '✖ édition impossible'); await settle(); break; }
      case 'exit': case 'close': {
        const playing = await page.evaluate(() => { for (const p of [window.__play, window.__studio]) if (p && p.root && p.root.isConnected) { p.close(); return true; } return false; });
        if (!playing) await page.keyboard.press('Escape'); await settle(); break;
      }
      case 'studio': { const nm = await D('studio', args[0] || null); await settle(500); log(nm ? `◆ Studio : ${nm}` : '◆ Studio (aucun composant)'); break; }
      case 'present': { const ok = await D('present', args[0] || null); await settle(350); log(ok ? `▶ présentation ${args[0] || ''}`.trim() : '✖ présentation impossible'); break; }
      case 'anchors': log((await D('anchors')).replace(/\n/g, '\n  ')); break;
      case 'rigs': log('rigs :\n' + (await D('rigs'))); break;
      case 'info': log(await D('info', args[0])); break;
      case 'js': log(JSON.stringify(await page.evaluate((e) => { const v = (0, eval)(e); return v === undefined ? null : v; }, line.slice(3)))); break;
      case 'tool': await page.evaluate((t) => { app.tool = t; app.emit('tool'); }, args[0]); break;
      case 'key': await page.keyboard.press(args[0]); await settle(); break;
      case 'type': await page.keyboard.type(unq(parts.slice(1).join(' ')), { delay: T(35) }); await settle(); break;
      case 'undo': await page.keyboard.press('Control+z'); await settle(); break;
      case 'redo': await page.keyboard.press('Control+Shift+z'); await settle(); break;
      case 'wait': if (args[0] === 'idle') await settle(250); else await page.waitForTimeout(+args[0] || 300); break;
      case 'at': await D('at', args[0]); break;
      case 'diff': showDiff = args[0] !== 'off'; break;
      case 'set': { const kv = Object.fromEntries(parts.slice(2).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), unq(p.slice(i + 1))]; })); await D('set', parts[1], kv); await settle(); break; }
      case 'move': case 'hover': { const ms = /\s(\d+)$/.exec(joined); await glide(await resolve(ms ? joined.slice(0, ms.index) : joined), ms ? +ms[1] : 450); if (cmd === 'hover') await settle(120); break; }
      case 'click': case 'dblclick': case 'rclick': {
        if (cmd === 'rclick' && args[0] === 'node') await D('select', [args[1]]); // the menu acts on that layer
        const p = await resolve(joined); await glide(p, 380);
        await withMods(parts, async () => {
          if (cmd === 'click') await press();
          else if (cmd === 'rclick') await press('right');
          else { await press(); await page.waitForTimeout(T(70)); await page.mouse.down({ clickCount: 2 }); await page.mouse.up({ clickCount: 2 }); }
        });
        await settle(60); break;
      }
      case 'menu': { const p = await D('menu', unq(parts.slice(1).join(' '))); await glide(p, 300); await press(); await settle(60); break; }
      case 'drag': case 'marquee': {
        const ms = +opt(parts, 'ms', 650), arc = +opt(parts, 'arc', 0);
        const toIdx = args.indexOf('to'), byIdx = args.indexOf('by');
        const src = args.slice(0, Math.max(toIdx, byIdx)).join(' ');
        const a = await resolve(src); await glide(a, 360);
        const deep = /^node\s/.test(src) && cmd === 'drag' && await page.evaluate((n) => window.__D.needsDeep(n), args[1]);
        if (deep) { await page.keyboard.down('Control'); await page.mouse.down(); await page.keyboard.up('Control'); await page.waitForTimeout(T(50)); await glide(byIdx >= 0 ? { x: a.x + +args[byIdx + 1] * (await page.evaluate(() => app.zoom)), y: a.y + +args[byIdx + 2] * (await page.evaluate(() => app.zoom)) } : await resolve(args.slice(toIdx + 1).join(' ')), ms, arc, parts.some((x) => x.startsWith('ms='))); await page.waitForTimeout(T(40)); await page.mouse.up(); await settle(60); break; }
        let b;
        if (byIdx >= 0) { const z = await page.evaluate(() => (window.__D.playing() ? 1 : app.zoom)); b = { x: a.x + +args[byIdx + 1] * z, y: a.y + +args[byIdx + 2] * z }; }
        else b = await resolve(args.slice(toIdx + 1).join(' '));
        await withMods(parts, async () => { await page.mouse.down(); await page.waitForTimeout(T(50)); await glide(b, ms, arc, parts.some((x) => x.startsWith('ms='))); await page.waitForTimeout(T(40)); await page.mouse.up(); });
        await settle(60); break;
      }
      case 'rig': { // rig <name> <v> [v2] : drag the handle along its track to that value
        const nums = args.filter((a, i) => i > 0 && /^-?[\d.]+$/.test(a)); const name = args.filter((a, i) => i === 0 || !/^-?[\d.]+$/.test(a)).join(' ');
        let pth = await D('rigPath', name, nums, 24); if (pth.retry) { await settle(); pth = await D('rigPath', name, nums, 24); }
        await glide(pth.pts[0], 360); await page.mouse.down(); await page.waitForTimeout(T(50));
        await trace(pth.pts, +opt(parts, 'ms', 700)); await page.waitForTimeout(T(40)); await page.mouse.up(); await settle(80);
        if (!watch) { const r = await page.evaluate((n) => { try { const x = window.__D.findRig(n); return x.values; } catch (e) { return null; } }, name); log(`${pth.owner ? pth.owner + '.' : ''}${pth.name} : ${pth.from.join(', ')} → ${r ? Object.values(r).map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)).join(', ') : '?'}`); }
        break;
      }
      case 'resize': { // resize <name> <w> <h> [from=se]
        const name = args[0]; const from = opt(parts, 'from', 'se'); const z = await page.evaluate(() => app.zoom);
        const cw = await D('attr', name, 'w'), ch = await D('attr', name, 'h');
        const a = await resolve(`corner ${name} ${from}`); await glide(a, 360);
        const sx = from.includes('w') ? -1 : from.includes('e') ? 1 : 0, sy = from.includes('n') ? -1 : from.includes('s') ? 1 : 0;
        const b = { x: a.x + sx * ((+args[1] || cw) - cw) * z, y: a.y + sy * ((+args[2] || ch) - ch) * z };
        await withMods(parts, async () => { await page.mouse.down(); await page.waitForTimeout(T(50)); await glide(b, 650); await page.mouse.up(); }); await settle(60); break;
      }
      case 'rotate': { // rotate <name> <deg>: the handle travels along a circle around the layer's centre
        const name = args[0]; const target = +args[1] || 0; const cur0 = +(await D('attr', name, 'rotate')) || 0;
        const a = await resolve(`rotate ${name}`); const c = await page.evaluate((n) => { const x = window.__D.need(n); const r = window.__D.rectOf(x.id); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }, name);
        const R = Math.hypot(a.x - c.x, a.y - c.y); const a0 = Math.atan2(a.y - c.y, a.x - c.x); const da = ((target - cur0) * Math.PI) / 180;
        const pts = []; for (let k = 0; k <= 24; k++) { const t = a0 + (da * k) / 24; pts.push({ x: c.x + Math.cos(t) * R, y: c.y + Math.sin(t) * R }); }
        await glide(a, 360); await page.mouse.down(); await page.waitForTimeout(T(50)); await trace(pts, 750); await page.mouse.up(); await settle(60); break;
      }
      case 'expect': { // expect <name> <attr> <op> <value>
        const [name, attr, op, ...rv] = parts.slice(1); const want = unq(rv.join(' ')); const got = await D('attr', name, attr);
        const n = (v) => parseFloat(v); const ok = { '=': String(got) === want || (!isNaN(n(got)) && n(got) === n(want)), '!=': String(got) !== want, '<': n(got) < n(want), '>': n(got) > n(want), '<=': n(got) <= n(want), '>=': n(got) >= n(want), '~': String(got ?? '').includes(want) }[op];
        if (ok === undefined) throw new Error('opérateur inconnu : ' + op);
        if (ok) log(`✓ ${name}.${attr} ${op} ${want}  (${got})`); else { failures++; err(`attendu ${name}.${attr} ${op} ${want}, obtenu ${got}`); }
        break;
      }
      case 'pen': {
        await page.evaluate(() => { app.tool = 'pen'; app.emit('tool'); });
        for (const tok of args) {
          const [p, h] = tok.split('>'); const [x, y] = p.split(',').map(Number); const P = await D('design', x, y);
          await glide(P, 280); await page.mouse.down();
          if (h) { const [hx, hy] = h.split(',').map(Number); await glide(await D('design', hx, hy), 260); }
          await page.mouse.up(); await page.waitForTimeout(T(60));
        }
        await page.keyboard.press('Enter'); await settle(); break;
      }
      case 'pencil': {
        await page.evaluate(() => { app.tool = 'pencil'; app.emit('tool'); });
        const pts = []; for (const tok of args) { if (!tok.includes(',')) continue; const [x, y] = tok.split(',').map(Number); pts.push(await D('design', x, y)); }
        const total = +opt(parts, 'ms', 900);
        // Catmull-Rom through the points, sampled densely: a continuous hand stroke
        const dense = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
          for (let k = 0; k < 12; k++) { const t = k / 12, t2 = t * t, t3 = t2 * t; dense.push({ x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3), y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3) }); } }
        dense.push(pts[pts.length - 1]);
        await glide(dense[0], 300); await page.mouse.down();
        for (const q of dense) { await page.mouse.move(q.x, q.y); await page.waitForTimeout(Math.max(4, T(total) / dense.length)); }
        await page.mouse.up(); cur = dense[dense.length - 1]; await settle(100);
        await page.evaluate(() => { app.tool = 'move'; app.emit('tool'); }); break;
      }
      case 'shot': {
        const f = path.isAbsolute(args[0]) ? args[0] : path.join(outDir, args[0]); fs.mkdirSync(path.dirname(f), { recursive: true });
        if (args[1]) { const r = await page.evaluate((n) => { const D = window.__D; if (D.playing()) { const el = D.playing().player.host.querySelector('[data-key="' + n + '"]'); if (el) { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; } } return D.rectOf(D.need(n).id); }, args[1]); const pad = 40; await page.screenshot({ path: f, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(vw, r.w + pad * 2), height: Math.min(vh, r.h + pad * 2) } }); }
        else await page.screenshot({ path: f });
        log('📸 ' + f); break;
      }
      case 'save': if (write) { fs.writeFileSync(file, await page.evaluate(() => app.source)); log('💾 ' + file); } else log('(save ignoré : ajoute --write)'); break;
      default: log(`? commande inconnue : ${cmd}`);
    }
    if (before) { const d = diffSnap(before, await D('snap')); if (d.length) log('Δ ' + d.slice(0, 12).join('\n    ') + (d.length > 12 ? `\n    … +${d.length - 12}` : '')); }
  }

  async function run(text) {
    buf = []; const e0 = errors.length;
    for (const line of splitScript(text)) {
      if (serve) buf.push('› ' + line);
      try { await run1(line); } catch (e) { failures++; err(`${line} — ${String(e.message).split('\n')[0].replace(/^.*?Error: /, '')}`); }
    }
    if (errors.length > e0) err('erreurs de page : ' + errors.slice(e0, e0 + 3).join(' | '));
    return buf.join('\n');
  }

  const finish = async () => {
    const out = await page.evaluate(() => app.source);
    if (write) { fs.writeFileSync(file, out); console.log(`✓ source mis à jour : ${file}`); }
    const vpath = video ? await page.video().path() : null;
    await context.close(); await browser.close(); fs.rmSync(tmp, { force: true });
    return { source: out, video: vpath, failures };
  };

  if (serve) { // persistent session: POST a script, get the log back
    const port = +serve || 7788;
    await new Promise((resolveDone) => {
      let queue = Promise.resolve();
      const srv = http.createServer((req, res) => {
        let body = ''; req.on('data', (c) => { body += c; });
        req.on('end', () => { queue = queue.then(async () => {
          if (body.trim() === 'quit') { res.end('bye\n'); srv.close(); resolveDone(); return; }
          const outText = await run(body); res.end(outText + '\n');
          if (write) fs.writeFileSync(file, await page.evaluate(() => app.source));
        }); });
      });
      srv.listen(port, '127.0.0.1', () => console.log(`mq drive : session ouverte sur 127.0.0.1:${port} — mq drive send "…" [--port ${port}], « quit » pour fermer`));
    });
    return finish();
  }
  if (script) await run(script);
  return finish();
}

// client for a --serve session
export async function send(script, port = 7788) {
  return new Promise((resolveOut, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/' }, (res) => { let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => resolveOut(s)); });
    req.on('error', reject); req.end(script);
  });
}
