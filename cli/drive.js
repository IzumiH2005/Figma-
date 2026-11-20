// `mq drive` — an agent pointer for the visual editor. Claude (or a script) drives the real editor with
// continuous, human-like mouse gestures (minimum-jerk velocity, slight arcs, 60 fps), so point editing, pen,
// pencil, rigs, Shape Builder… behave exactly as for a designer dragging with a mouse — fluid, not numeric.
//
//   mq drive projet.mq gestes.txt [--write] [--video session.mp4] [--shots dossier] [--scale 1]
//   mq drive projet.mq -e "select notch; edit; anchors"            (inline commands, separated by ;)
//
// Commands (one per line, # comments):
//   zoom <name> [pad]            zoom the canvas on a layer           select <name>      select a layer
//   edit [<name>]                enter point editing (also boolean operands, live result)     exit
//   anchors                      print anchors/handles of the edited path (local coords) → plan gestures
//   tool move|pen|pencil|shape:<kind>        key <combo>        wait <ms>
//   move <target> [ms]           click <target>        dblclick <target>
//   drag <target> to <target> [ms] [arc=px]   ·   drag <target> by <dx> <dy> [ms] [arc=px]  (dx dy in design px)
//   pen <x,y> <x,y>><hx,hy> …    pen clicks in design coords of the frame set by `at <name>`; ">hx,hy" drags a handle
//   pencil <x,y> <x,y> … [ms]    freehand stroke through points (design coords, `at`), smoothed like a hand
//   at <name>                    origin for pen/pencil/local coordinates
//   shot <file> [<name>]         screenshot (whole editor or one layer)     save   write the source now
// Targets: anchor <i> | anchor <s:i> | handle <i>.in|out | rig <k> | node <name> [fx fy] | local <x> <y> | <x> <y>
import fs from 'node:fs';
import path from 'node:path';

const PAGE_JS = String.raw`
window.__D = {
  byName(n) { const all = [...app.project.byId.values()]; return all.find((x) => x.attrs && x.attrs.name === n) || all.find((x) => x.id === n) || null; },
  rectOf(id) { const c = window.__canvas; const el = c.elOf(id) || (c.items && c.items.get(id)); if (el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
    // boolean operand / non-rendered child: derive from the parent
    const p = app.parent(id); const n = app.node(id); if (!p) return null; const pr = this.rectOf(p.id); if (!pr) return null; const z = app.zoom;
    return { x: pr.x + (parseFloat(n.attrs.x) || 0) * z, y: pr.y + (parseFloat(n.attrs.y) || 0) * z, w: (parseFloat(n.attrs.w) || 0) * z, h: (parseFloat(n.attrs.h) || 0) * z }; },
  select(n) { const x = this.byName(n); if (!x) throw new Error('calque introuvable : ' + n); app.select([x.id]); return x.id; },
  zoom(n, pad) { const x = this.byName(n); if (!x) throw new Error('calque introuvable : ' + n); window.__canvas.zoomToFit([x.id]); if (pad) { app.zoom *= pad; } app.emit('view'); return app.zoom; },
  edit(n) { const id = n ? this.select(n) : app.selection[0]; window.__canvas.vedit.enter(id); return !!window.__canvas.vedit.active; },
  frame() { const v = window.__canvas.vedit; if (!v.active) return null; const F = v.frame(); const R = window.__canvas.rect; return F && { x: R.left + F.r.x, y: R.top + F.r.y, sx: F.sx, sy: F.sy }; },
  pt(t) {
    const q = t.trim().split(/\s+/); const k = q[0];
    const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    if (k === 'anchor') { const key = q[1].includes(':') ? q[1] : '0:' + q[1]; const el = document.querySelector('.ve-anchor[data-va="' + key + '"]'); if (!el) throw new Error('ancre introuvable : ' + key); return center(el); }
    if (k === 'handle') { const [i, side] = q[1].split('.'); const key = (i.includes(':') ? i : '0:' + i) + ':' + side;
      let el = document.querySelector('.ve-handle[data-vh="' + key + '"]');
      if (!el) { // handles only show next to selected anchors: select the anchor first (click), then retry
        const a = document.querySelector('.ve-anchor[data-va="' + key.split(':').slice(0, 2).join(':') + '"]'); if (a) { const c = center(a); return { needSelect: c }; } throw new Error('poignée introuvable : ' + key); }
      return center(el); }
    if (k === 'rig') { const el = document.querySelectorAll('.ve-rig')[+q[1] || 0]; if (!el) throw new Error('poignée de rig introuvable'); return center(el); }
    if (k === 'node') { const x = this.byName(q[1]); if (!x) throw new Error('calque introuvable : ' + q[1]); const r = this.rectOf(x.id); const fx = q[2] !== undefined ? +q[2] : 0.5, fy = q[3] !== undefined ? +q[3] : 0.5; return { x: r.x + r.w * fx, y: r.y + r.h * fy }; }
    if (k === 'local') { const F = this.frame(); if (F) return { x: F.x + +q[1] * F.sx, y: F.y + +q[2] * F.sy }; const o = this.origin(); return { x: o.x + +q[1] * app.zoom, y: o.y + +q[2] * app.zoom }; }
    if (/^-?[\d.]+$/.test(k)) return { x: +k, y: +q[1] };
    throw new Error('cible inconnue : ' + t);
  },
  _origin: null, at(n) { const x = this.byName(n); if (!x) throw new Error('calque introuvable : ' + n); const r = this.rectOf(x.id); this._origin = { x: r.x, y: r.y }; return this._origin; },
  origin() { return this._origin || { x: window.__canvas.rect.left, y: window.__canvas.rect.top }; },
  design(x, y) { const o = this.origin(); return { x: o.x + x * app.zoom, y: o.y + y * app.zoom }; },
  anchors() { const v = window.__canvas.vedit; if (!v.active) return 'pas en mode édition de points';
    const f = (n) => Math.round(n * 10) / 10; return v.subs.map((s, si) => 'tracé ' + si + (s.closed ? ' (fermé)' : '') + '\n' + s.nodes.map((nd, i) => '  anchor ' + (si ? si + ':' : '') + i + '  (' + f(nd.x) + ', ' + f(nd.y) + ')' + (nd.in ? '  in(' + f(nd.in.x) + ', ' + f(nd.in.y) + ')' : '') + (nd.out ? '  out(' + f(nd.out.x) + ', ' + f(nd.out.y) + ')' : '')).join('\n')).join('\n'); },
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

export async function drive({ file, script, write, video, shots, scale = 1, buildEditorHTML, chromium }) {
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
  await page.waitForFunction(() => window.app && window.__canvas, null, { timeout: 15000 }); await page.waitForTimeout(800);
  await page.addScriptTag({ content: PAGE_JS });
  let cur = { x: vw / 2, y: vh / 2 }; await page.mouse.move(cur.x, cur.y);
  const D = (fn, ...a) => page.evaluate(({ fn, a }) => window.__D[fn](...a), { fn, a });
  const outDir = shots || path.dirname(file);
  const log = (m) => console.log('  ' + m);

  // continuous gesture: 60 fps, minimum-jerk timing, optional arc (perpendicular bulge, like a wrist movement)
  async function glide(to, ms = 450, arc = 0) {
    const from = { ...cur }; const n = Math.max(6, Math.round(ms / 16)); const dx = to.x - from.x, dy = to.y - from.y; const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    for (let i = 1; i <= n; i++) {
      const t = i / n, s = mj(t), b = Math.sin(Math.PI * s) * arc;
      await page.mouse.move(from.x + dx * s + nx * b, from.y + dy * s + ny * b);
      await page.waitForTimeout(16);
    }
    cur = { ...to };
  }
  async function resolve(target) {
    let p = await D('pt', target);
    if (p.needSelect) { await glide(p.needSelect, 300); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(80); p = await D('pt', target); }
    return p;
  }
  const opt = (parts, key, d) => { const m = parts.find((x) => x.startsWith(key + '=')); return m ? +m.split('=')[1] : d; };
  const plain = (parts) => parts.filter((x) => !/^\w+=/.test(x));

  // files: one command per line (comments after #); inline -e: commands separated by ;
  const lines = (script.includes('\n') ? script.split('\n') : script.split(';')).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\s+/); const cmd = parts[0]; const args = plain(parts.slice(1));
    try {
      switch (cmd) {
        case 'zoom': log(`zoom ${args[0]} → ${(await D('zoom', args[0], args[1] ? +args[1] : 0)).toFixed(2)}`); await page.waitForTimeout(250); break;
        case 'select': await D('select', args[0]); await page.waitForTimeout(120); break;
        case 'edit': { const ok = await D('edit', args[0] || null); log(ok ? `édition des points : ${args[0] || 'sélection'}` : '✖ édition impossible'); await page.waitForTimeout(150); break; }
        case 'exit': await page.keyboard.press('Escape'); await page.waitForTimeout(120); break;
        case 'anchors': console.log((await D('anchors')).replace(/^/gm, '    ')); break;
        case 'tool': await page.evaluate((t) => { app.tool = t; app.emit('tool'); }, args[0]); break;
        case 'key': await page.keyboard.press(args[0]); await page.waitForTimeout(120); break;
        case 'wait': await page.waitForTimeout(+args[0] || 300); break;
        case 'at': await D('at', args[0]); break;
        case 'move': await glide(await resolve(args.join(' ').replace(/\s+\d+$/, '')), +(/\d+$/.exec(line) || [450])[0]); break;
        case 'click': case 'dblclick': {
          const p = await resolve(args.join(' ')); await glide(p, 380);
          if (cmd === 'click') { await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); } else await page.mouse.dblclick(p.x, p.y);
          await page.waitForTimeout(120); break;
        }
        case 'drag': {
          const ms = opt(parts, 'ms', 650), arc = opt(parts, 'arc', 0);
          const toIdx = args.indexOf('to'), byIdx = args.indexOf('by');
          const src = args.slice(0, Math.max(toIdx, byIdx)).join(' ');
          const a = await resolve(src); await glide(a, 360);
          let b;
          if (byIdx >= 0) { const z = await page.evaluate(() => app.zoom); b = { x: a.x + +args[byIdx + 1] * z, y: a.y + +args[byIdx + 2] * z }; }
          else b = await resolve(args.slice(toIdx + 1).join(' '));
          await page.mouse.down(); await page.waitForTimeout(60);
          await glide(b, ms, arc);
          await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(140);
          break;
        }
        case 'pen': {
          await page.evaluate(() => { app.tool = 'pen'; app.emit('tool'); });
          for (const tok of args) {
            const [p, h] = tok.split('>'); const [x, y] = p.split(',').map(Number); const P = await D('design', x, y);
            await glide(P, 280); await page.mouse.down();
            if (h) { const [hx, hy] = h.split(',').map(Number); await glide(await D('design', hx, hy), 260); }
            await page.mouse.up(); await page.waitForTimeout(70);
          }
          await page.keyboard.press('Enter'); await page.waitForTimeout(150); break;
        }
        case 'pencil': {
          await page.evaluate(() => { app.tool = 'pencil'; app.emit('tool'); });
          const pts = []; for (const tok of args) { if (!tok.includes(',')) continue; const [x, y] = tok.split(',').map(Number); pts.push(await D('design', x, y)); }
          const total = opt(parts, 'ms', 900);
          // Catmull-Rom through the points, sampled densely: a continuous hand stroke
          const dense = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
            for (let k = 0; k < 12; k++) { const t = k / 12, t2 = t * t, t3 = t2 * t; dense.push({ x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3), y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3) }); } }
          dense.push(pts[pts.length - 1]);
          await glide(dense[0], 300); await page.mouse.down();
          for (const q of dense) { await page.mouse.move(q.x, q.y); await page.waitForTimeout(Math.max(4, total / dense.length)); }
          await page.mouse.up(); cur = dense[dense.length - 1]; await page.waitForTimeout(200);
          await page.evaluate(() => { app.tool = 'move'; app.emit('tool'); }); break;
        }
        case 'shot': {
          const f = path.isAbsolute(args[0]) ? args[0] : path.join(outDir, args[0]); fs.mkdirSync(path.dirname(f), { recursive: true });
          if (args[1]) { const id = (await page.evaluate((n) => window.__D.byName(n)?.id, args[1])); const r = await page.evaluate((id) => window.__D.rectOf(id), id); const pad = 40; await page.screenshot({ path: f, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: r.h + pad * 2 } }); }
          else await page.screenshot({ path: f });
          log('📸 ' + f); break;
        }
        case 'save': if (write) { fs.writeFileSync(file, await page.evaluate(() => app.source)); log('💾 ' + file); } break;
        default: log(`? commande inconnue : ${cmd}`);
      }
    } catch (e) { console.error(`  ✖ ${line} — ${e.message.split('\n')[0]}`); }
  }
  const out = await page.evaluate(() => app.source);
  if (write) { fs.writeFileSync(file, out); console.log(`✓ source mis à jour : ${file}`); }
  if (errors.length) console.error('  erreurs de page : ' + errors.slice(0, 3).join(' | '));
  const vpath = video ? await page.video().path() : null;
  await context.close(); await browser.close(); fs.rmSync(tmp, { force: true });
  return { source: out, video: vpath };
}
