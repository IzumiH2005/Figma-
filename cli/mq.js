#!/usr/bin/env node
// Maquette CLI — the agent-side interface: render PNGs, record prototype videos, inspect & lint layouts, build the editor.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildRuntime, buildEditorHTML, readExamples } from '../scripts/build.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `Maquette CLI

  mq render  <file.mq> [-s Écran,Écran] [-o dossier] [--scale 2] [--mode dark] [--frame] [--full]
  mq board   <file.mq> [-o board.png] [--page 0] [--scale 1]        vue d'ensemble du canvas
  mq inspect <file.mq> [-s Écran] [--depth 4]                        arbre de layout calculé (texte)
  mq lint    <file.mq> [--fix] [--only code,cat] [--min-score 90]    hygiène UI : contraste, cibles, grille 4/8, échelle typo, tokens, CTA…
  mq audit   <file.mq>                                               score d'hygiène par catégorie (erreurs et avertissements seulement)
  mq motion  <file.mq> [-s Écran]                                    spec de motion : timing, spacing (graphe), transitions
  mq video   <file.mq> [--flow nom|fichier.flow] [-o demo.mp4] [--gif] [--scale 2] [--no-frame] [--slowmo 0.25]
  mq anim    <file.mq> -s Écran [-o anim.mp4] [--ms 2500]            enregistre les animations d'entrée
  mq build   <file.mq...> [-o maquette.html] [--artifact]            éditeur autonome avec projets intégrés (--artifact : pour publication)
  mq export  <file.mq> [-o proto.html]                               prototype HTML autonome (lecture seule)
  mq fmt     <file.mq> [--write]                                     reformate le source
  mq kit                                                             liste les composants du kit + props
  mq icons   [recherche]                                             cherche des noms d'icônes (lucide)
  mq scenes                                                          liste les générateurs d'images

Script de flow (.flow ou <flow name=…> dans le projet) — une commande par ligne :
  start Écran | wait 800 | click "Texte ou clé" | tap clé | hover clé | type clé "texte"
  scroll 400 | scroll clé | swipe left [clé] | back | key Enter | shot nom.png | caption "Texte"
`;

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--no-')) o[a.slice(5)] = false;
    else if (a.startsWith('--')) { const k = a.slice(2); const n = argv[i + 1]; if (n === undefined || n.startsWith('-')) o[k] = true; else { o[k] = n; i++; } }
    else if (a.startsWith('-') && a.length === 2) { o[a.slice(1)] = argv[++i]; }
    else o._.push(a);
  }
  return o;
}

let _runtime = null;
async function runtime() { if (!_runtime) _runtime = await buildRuntime(); return _runtime; }

async function browserPage({ scale = 1, viewport = { width: 1400, height: 1000 }, video = null } = {}) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor: +scale, ...(video ? { recordVideo: video } : {}) });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('  [page]', e.message));
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.error('  [console]', m.text()); });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body></body></html>`);
  await page.addScriptTag({ content: await runtime() });
  return { browser, context, page };
}

function readProject(file) {
  if (!file) { console.error('Fichier .mq requis'); process.exit(1); }
  return fs.readFileSync(file, 'utf8');
}

async function loadInPage(page, source, mode) {
  return page.evaluate(async ({ source, mode }) => {
    const p = MQ.loadProject(source);
    window.__p = p;
    MQ.ensureStyles(); await MQ.ensureFonts(p);
    const m = typeof mode === 'string' && isNaN(+mode) ? Math.max(0, p.modes.indexOf(mode)) : +(mode || 0);
    window.__mode = m;
    return { name: p.name, screens: p.screens().map((s) => s.attrs.name), modes: p.modes, flows: Object.keys(p.flows) };
  }, { source, mode });
}

async function waitFonts(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // force-load every family/weight actually used on the page
    const seen = new Set();
    document.querySelectorAll('.mq-text, .mq-screen').forEach((el) => { const cs = getComputedStyle(el); const f = cs.fontFamily.split(',')[0].trim(); seen.add(`${cs.fontStyle === 'italic' ? 'italic ' : ''}${cs.fontWeight} 16px ${f}`); });
    await Promise.all([...seen].map((f) => document.fonts.load(f).catch(() => {})));
    await new Promise((r) => setTimeout(r, 60)); await document.fonts.ready;
  });
}

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// ---------------------------------------------------------------- commands

async function cmdRender(o) {
  const src = readProject(o._[1]);
  const outDir = o.o || 'out';
  fs.mkdirSync(outDir, { recursive: true });
  const { browser, page } = await browserPage({ scale: o.scale || 2 });
  const info = await loadInPage(page, src, o.mode);
  const wanted = o.s ? String(o.s).split(',') : info.screens;
  const files = [];
  for (const name of wanted) {
    const ok = await page.evaluate(({ name, frame, full }) => {
      document.body.innerHTML = '';
      const p = window.__p;
      const el = MQ.screenElement(p, name, { mode: window.__mode });
      const holder = document.createElement('div');
      holder.id = 'shot'; holder.style.cssText = `display:inline-block;padding:${frame ? 48 : 0}px;${frame ? 'background:radial-gradient(circle at 30% 20%,#2b2d42,#0e0f14 70%)' : ''}`;
      const s = p.screen(name);
      if (!s) return false;
      if (frame) holder.appendChild(MQ.deviceFrame(p.sizeOf(s).device, el, p.sizeOf(s))); else holder.appendChild(el);
      document.body.appendChild(holder);
      if (full) { const b = el.querySelector('.mq-screen-body'); const H = Math.max(el.offsetHeight, b.scrollHeight); el.style.height = H + 'px'; }
      return true;
    }, { name, frame: !!o.frame, full: !!o.full });
    if (!ok) { console.error(`✖ écran introuvable: ${name}`); continue; }
    await waitFonts(page);
    const file = path.join(outDir, `${slug(name)}.png`);
    await page.locator('#shot').screenshot({ path: file, omitBackground: !o.frame });
    files.push(file);
    console.log(`✓ ${file}`);
  }
  await browser.close();
  return files;
}

async function cmdBoard(o) {
  const src = readProject(o._[1]);
  const { browser, page } = await browserPage({ scale: o.scale || 1 });
  await loadInPage(page, src, o.mode);
  const size = await page.evaluate(({ pageIdx }) => {
    const p = window.__p;
    const pg = p.pages[pageIdx || 0];
    document.body.innerHTML = '';
    const board = document.createElement('div');
    board.id = 'board';
    board.style.cssText = 'position:relative;background:#1b1c21;background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:24px 24px;font-family:Inter,system-ui,sans-serif';
    let maxX = 0, maxY = 0; const pad = 80;
    for (const s of pg.children) {
      if (s.tag === '#text') continue;
      const x = (s.attrs.x !== undefined ? +s.attrs.x : s._autoX || 0) + pad, y = (s.attrs.y !== undefined ? +s.attrs.y : s._autoY || 0) + pad;
      let el;
      if (s.tag === 'screen') el = MQ.screenElement(p, s, { mode: window.__mode });
      else { const ctx = MQ.makeCtx(p, { mode: window.__mode, editor: true }); el = MQ.renderStandalone(s, ctx); }
      el.style.position = 'absolute'; el.style.left = x + 'px'; el.style.top = y + 'px';
      if (s.tag === 'screen') {
        el.style.borderRadius = '6px'; el.style.boxShadow = '0 10px 40px rgba(0,0,0,.4)';
        const lab = document.createElement('div'); lab.textContent = s.attrs.name + (s.attrs.start ? '  ▶' : '');
        lab.style.cssText = `position:absolute;left:${x}px;top:${y - 26}px;color:#a9abb8;font-size:14px;font-weight:500`;
        board.appendChild(lab);
      }
      board.appendChild(el);
      const { w, h } = s.tag === 'screen' ? p.sizeOf(s) : { w: 320, h: 200 };
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    }
    document.body.appendChild(board);
    for (const c of board.children) { maxX = Math.max(maxX, c.offsetLeft + c.offsetWidth); maxY = Math.max(maxY, c.offsetTop + c.offsetHeight); }
    board.style.width = maxX + pad + 'px'; board.style.height = maxY + pad + 'px';
    return { w: maxX + pad, h: maxY + pad };
  }, { pageIdx: +(o.page || 0) });
  await page.setViewportSize({ width: Math.min(size.w, 16000), height: Math.min(size.h, 16000) });
  await waitFonts(page);
  const file = o.o || 'out/board.png';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.locator('#board').screenshot({ path: file });
  console.log(`✓ ${file} (${size.w}×${size.h})`);
  await browser.close();
}

async function cmdInspect(o) {
  const src = readProject(o._[1]);
  const { browser, page } = await browserPage();
  const info = await loadInPage(page, src, o.mode);
  const wanted = o.s ? String(o.s).split(',') : info.screens;
  await page.evaluate(() => document.fonts.ready);
  for (const name of wanted) {
    const txt = await page.evaluate(async ({ name, depth }) => {
      document.body.innerHTML = '';
      const el = MQ.screenElement(window.__p, name, { mode: window.__mode });
      document.body.appendChild(el);
      await document.fonts.ready;
      return MQ.inspectScreen(el, { depth: depth ? +depth : 99 });
    }, { name, depth: o.depth });
    console.log(txt + '\n');
  }
  await browser.close();
}

async function cmdLint(o, audit = false) {
  const file = o._[1];
  const src = readProject(file);
  const { browser, page } = await browserPage();
  const info = await loadInPage(page, src, o.mode);
  await waitFonts(page);
  const out = await page.evaluate(async ({ screens, fix, audit, only }) => {
    const p = window.__p;
    const run = () => {
      let issues = MQ.lintProject(p);
      for (const name of screens) {
        document.body.innerHTML = '';
        const el = MQ.screenElement(p, name, { mode: window.__mode });
        document.body.appendChild(el);
        issues = issues.concat(MQ.lintScreen(el, p, p.screen(name)));
      }
      if (only) issues = issues.filter((i) => only.split(',').includes(i.code) || only.split(',').includes(i.cat));
      return issues;
    };
    let issues = run();
    let fixed = 0, source = null;
    if (fix) {
      source = p.source;
      for (let pass = 0; pass < 3; pass++) {
        const r = MQ.fixSource(source, p, issues); if (!r.count || r.source === source) break;
        fixed += r.count; source = r.source; p.setSource(source); issues = run();
      }
    }
    const score = MQ.scoreIssues(issues);
    const quiet = audit ? issues.filter((i) => i.level !== 'info') : issues;
    return { text: MQ.formatIssues(quiet, true), n: issues.filter((i) => i.level !== 'info').length, fixed, source, score: score.score, infos: issues.length - quiet.length };
  }, { screens: info.screens, fix: !!o.fix, audit, only: o.only || null });
  console.log(out.text);
  if (audit && out.infos) console.log(`  (+ ${out.infos} suggestion(s) mineure(s) : mq lint pour le détail)`);
  if (o.fix) { fs.writeFileSync(file, out.source); console.log(`\n⚙ ${out.fixed} correction(s) appliquée(s) dans ${file}`); }
  await browser.close();
  if (o['min-score'] && out.score < +o['min-score']) { console.error(`✖ score ${out.score} < ${o['min-score']}`); process.exit(2); }
  return out.n;
}

// ---------------------------------------------------------------- motion spec (timing ≠ spacing)
async function cmdMotion(o) {
  const src = readProject(o._[1]);
  const { browser, page } = await browserPage();
  const info = await loadInPage(page, src, o.mode);
  const wanted = o.s ? String(o.s).split(',') : info.screens;
  const txt = await page.evaluate(({ wanted }) => {
    const p = window.__p; const out = [];
    const dummy = document.createElement('div'); document.body.appendChild(dummy);
    const spacing = (easing, W = 32, N = 12) => {
      // dots at equal time steps: tight dots = slow, far apart = fast (Williams' spacing chart)
      let pts = [];
      try { const a = dummy.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000, easing, fill: 'both' }); a.pause(); for (let i = 0; i <= N; i++) { a.currentTime = (i / N) * 1000; pts.push(parseFloat(getComputedStyle(dummy).opacity)); } a.cancel(); } catch (e) { pts = Array.from({ length: N + 1 }, (_, i) => i / N); }
      const lo = Math.min(0, ...pts), hi = Math.max(1, ...pts); const row = Array(W + 1).fill('·');
      for (const v of pts) row[Math.round(((v - lo) / (hi - lo)) * W)] = '●';
      return row.join('');
    };
    const easeName = (sp) => sp.easing;
    for (const name of wanted) {
      const s = p.screen(name); if (!s) { out.push(`✖ écran introuvable : ${name}`); continue; }
      document.body.innerHTML = ''; document.body.appendChild(dummy);
      const el = MQ.screenElement(p, s); document.body.appendChild(el);
      const anims = el._mq.anims;
      const rows = anims.map((a) => {
        const sp = MQ.parseSpec(a.spec, a.kind);
        const ez = MQ.resolveEasing(sp.easing, sp.duration);
        const base = /^spring|bouncy|snappy|gentle|wobbly|stiff/.test(sp.easing || '') ? ez.duration : sp.duration;
        const shaped = MQ.shapeFrames([{ opacity: 0, translate: '0px 10px' }, { opacity: 1, translate: '0px 0px' }], sp, ez.easing);
        const dur = Math.round(base * (a.durScale || 1) * shaped.durMul);
        const start = Math.round((sp.delay || 0) + (a.delay || 0));
        const who = a.el.dataset.key || a.el.dataset.comp || (a.el.dataset.tag === 'text' ? '"' + a.el.textContent.trim().slice(0, 18) + '"' : a.el.dataset.tag) || '?';
        const mods = ['antic', 'snap', 'overshoot', 'arc', 'accent'].filter((k) => sp[k]).map((k) => k === 'accent' ? sp.accent : k === 'antic' ? 'anticipation' : k);
        return { who, kind: a.kind, name: sp.name, start, dur, ease: easeName(sp), mods, chart: spacing(ez.easing), loop: a.kind === 'loop' };
      }).sort((x, y) => x.start - y.start);
      const ents = rows.filter((r) => !r.loop);
      const settle = ents.length ? Math.max(...ents.map((r) => r.start + r.dur)) : 0;
      out.push(`${name} — ${ents.length} entrée(s), ${rows.length - ents.length} boucle(s) · l'écran se pose en ${settle} ms`);
      for (const r of rows) out.push(`  ${r.who.padEnd(22).slice(0, 22)} ${(r.loop ? '∞ ' : '') + r.name.padEnd(12)} ${('t=' + r.start).padStart(7)} ${(r.dur + 'ms').padStart(7)}  ${r.ease.padEnd(10).slice(0, 18)} |${r.chart}| ${r.mods.join(' ')}`);
      // transitions leaving this screen
      const tr = [];
      const walk = (n) => { for (const [k, v] of Object.entries(n.attrs || {})) if (k.startsWith('on:')) for (const step of String(v).split(';')) { const m = /\b(go|overlay|back|set|toggle)\b\s*(.*)$/.exec(step.trim()); if (m && (m[1] !== 'set' || /smart|dissolve/.test(m[2]))) { const t = MQ.parseTransition(m[2].split(/\s+/)); tr.push(`  ${k.padEnd(14)} ${m[1]} ${m[2].split(/\s+/)[0] || ''}`.padEnd(40) + ` ${t.type} ${t.autoDur ? '≈distance' : t.duration + 'ms'} ${t.easing}${['arc', 'overlap', 'smear'].filter((f) => t[f]).map((f) => ' +' + f).join('')}`); } } (n.children || []).forEach(walk); };
      walk(s);
      if (tr.length) { out.push('  transitions :'); out.push(...[...new Set(tr)].map((x) => '  ' + x)); }
      out.push('');
    }
    out.push('Graphe de spacing : un point par intervalle de temps égal. Points serrés = lent, espacés = rapide.');
    return out.join('\n');
  }, { wanted });
  console.log(txt);
  await browser.close();
}

// ---------------------------------------------------------------- video

function parseFlow(text) {
  return text.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '').trim()).filter(Boolean).map((l) => {
    const w = (l.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((x) => x.replace(/^["']|["']$/g, ''));
    return { cmd: w[0], args: w.slice(1), line: l };
  });
}

const STAGE_JS = `
window.__stage = function(name, frame, caption) {
  const p = window.__p;
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;width:100vw;height:100vh;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 30% 15%,#2c2f4a 0%,#12131a 55%,#0b0b0f 100%);font-family:Inter,system-ui,sans-serif';
  const s = name ? p.screen(name) : p.startScreen();
  const size = p.sizeOf(s);
  const host = document.createElement('div');
  const col = document.createElement('div'); col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:22px';
  const cap = document.createElement('div'); cap.id='caption'; cap.style.cssText='color:#e8e8f0;font:600 22px Inter,system-ui;letter-spacing:-.2px;min-height:28px;transition:opacity .3s';
  cap.textContent = caption || '';
  if (frame) { const f = MQ.deviceFrame(size.device, host, size); col.appendChild(f); } else { host.style.borderRadius='12px'; host.style.boxShadow='0 30px 80px rgba(0,0,0,.5)'; col.appendChild(host); }
  if (caption !== null) col.appendChild(cap);
  document.body.appendChild(col);
  const player = new MQ.Player(p, host, { mode: window.__mode, headless: true });
  window.__player = player;
  player.start(s.attrs.name);
  const cur = document.createElement('div'); cur.id = 'cursor';
  cur.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.9);box-shadow:0 4px 14px rgba(0,0,0,.35);pointer-events:none;z-index:99999;opacity:0;transition:opacity .25s;backdrop-filter:blur(2px)';
  document.body.appendChild(cur);
  return true;
};
window.__find = function(q) {
  const pl = window.__player;
  const roots = [pl.current, ...pl.overlays.map(o => o.layer)].filter(Boolean).reverse();
  for (const r of roots) {
    let el = r.querySelector('[data-key="' + CSS.escape(q) + '"]');
    if (!el) el = [...r.querySelectorAll('[data-key]')].find(e => e.dataset.key.split('#')[0] === q);
    if (!el) { const t = [...r.querySelectorAll('.mq-text, input')].find(e => (e.textContent || e.placeholder || '').trim() === q) || [...r.querySelectorAll('.mq-text, input')].find(e => (e.textContent || e.placeholder || '').trim().toLowerCase().includes(q.toLowerCase())); if (t) el = t.closest('[data-hot]') || t; }
    if (!el) el = r.querySelector('[data-comp="' + CSS.escape(q) + '"]');
    if (el) { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; }
  }
  return null;
};
window.__cursor = async function(x, y, click) {
  const c = document.getElementById('cursor'); c.style.opacity = '1';
  const fx = parseFloat(c.dataset.x || x), fy = parseFloat(c.dataset.y || (y + 120));
  const a = c.animate([{ left: fx + 'px', top: fy + 'px' }, { left: x + 'px', top: y + 'px' }], { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  await a.finished; c.style.left = x + 'px'; c.style.top = y + 'px'; a.cancel();
  c.dataset.x = x; c.dataset.y = y;
  if (click) await c.animate([{ transform: 'scale(1)' }, { transform: 'scale(.72)' }, { transform: 'scale(1)' }], { duration: 260 }).finished;
};
window.__caption = function(t) { const c = document.getElementById('caption'); if (c) c.textContent = t; };
window.__tour = function() {
  // auto-generate a click-through: follow first unvisited 'go' link on each screen
  const p = window.__p; const steps = []; const seen = new Set();
  let cur = p.startScreen(); if (!cur) return steps;
  steps.push('start ' + JSON.stringify(cur.attrs.name)); steps.push('wait 1400');
  for (let guard = 0; guard < 12 && cur; guard++) {
    seen.add(cur.attrs.name);
    let next = null, key = null;
    const visit = (n) => { if (next) return; for (const [k, v] of Object.entries(n.attrs || {})) { const m = /\\bgo\\s+("[^"]+"|[\\w-]+)/.exec(String(v)); if ((k === 'on:click' || k === '@click') && m) { const t = m[1].replace(/"/g,''); if (!seen.has(t) && p.screen(t)) { next = p.screen(t); key = n.attrs.name || n.attrs.key || (n.attrs.label) || MQ.textOf(n).trim(); return; } } } (n.children || []).forEach(visit); };
    visit(cur);
    if (!next || !key) break;
    steps.push('click ' + JSON.stringify(key)); steps.push('wait 1300');
    cur = next;
  }
  return steps;
};
`;

async function cmdVideo(o, animOnly = false) {
  const file = o._[1];
  const src = readProject(file);
  const scale = +(o.scale || 2);
  const frame = o.frame !== false;
  // first pass: compute stage size
  const probe = await browserPage();
  const info = await loadInPage(probe.page, src, o.mode);
  let flowText = null;
  if (animOnly) flowText = `start ${JSON.stringify(o.s || info.screens[0])}\nwait ${o.ms || 2500}`;
  else if (o.flow && fs.existsSync(o.flow)) flowText = fs.readFileSync(o.flow, 'utf8');
  else if (o.flow || info.flows.length) flowText = await probe.page.evaluate((n) => window.__p.flows[n], o.flow || info.flows[0]);
  if (!flowText) { await probe.page.addScriptTag({ content: STAGE_JS }); flowText = (await probe.page.evaluate(() => window.__tour())).join('\n'); console.log('Flow auto :\n  ' + flowText.split('\n').join('\n  ')); }
  const steps = parseFlow(flowText);
  const startName = (steps.find((s) => s.cmd === 'start') || { args: [info.screens[0]] }).args[0];
  const dims = await probe.page.evaluate((n) => { const p = window.__p; const s = p.screen(n) || p.startScreen(); const z = p.sizeOf(s); const d = z.device; const bez = d && d.radius ? (d.kind === 'tablet' ? 18 : 12) : 0; return { w: z.w + bez * 2, h: z.h + bez * 2 + (d && d.kind === 'desktop' ? 36 : 0) }; }, startName);
  await probe.browser.close();
  const hasCaption = steps.some((s) => s.cmd === 'caption');
  const vw = Math.ceil((dims.w + 140) / 2) * 2, vh = Math.ceil((dims.h + (hasCaption ? 150 : 100)) / 2) * 2;
  const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'mqvid-'));
  const { browser, context, page } = await browserPage({ scale, viewport: { width: vw, height: vh }, video: { dir: tmpDir, size: { width: vw * scale, height: vh * scale } } });
  await loadInPage(page, src, o.mode);
  await page.addScriptTag({ content: STAGE_JS });
  if (o.slowmo) await page.evaluate((k) => MQ.setTimeScale(+k), o.slowmo);
  const t0 = Date.now();
  let started = false;
  const shots = [];
  for (const st of steps) {
    const a = st.args;
    switch (st.cmd) {
      case 'start': await page.evaluate(({ n, f, c }) => window.__stage(n, f, c), { n: a[0], f: frame, c: hasCaption ? '' : null }); await waitFonts(page); started = true; break;
      case 'wait': await page.waitForTimeout(+a[0] || 500); break;
      case 'caption': await page.evaluate((t) => window.__caption(t), a.join(' ')); break;
      case 'click': case 'tap': case 'hover': {
        if (!started) { await page.evaluate(({ f, c }) => window.__stage(null, f, c), { f: frame, c: hasCaption ? '' : null }); started = true; }
        const pos = await page.evaluate((q) => window.__find(q), a[0]);
        if (!pos) { console.error(`  ✖ élément introuvable: ${a[0]}`); break; }
        await page.evaluate(({ x, y, c }) => window.__cursor(x, y, c), { x: pos.x, y: pos.y, c: st.cmd !== 'hover' });
        if (st.cmd === 'hover') await page.mouse.move(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
        break;
      }
      case 'type': {
        const pos = await page.evaluate((q) => window.__find(q), a[0]);
        if (pos) { await page.evaluate(({ x, y }) => window.__cursor(x, y, true), pos); await page.mouse.click(pos.x, pos.y); }
        await page.keyboard.type(a[1] || '', { delay: 70 });
        break;
      }
      case 'key': await page.keyboard.press(a[0]); break;
      case 'back': await page.evaluate(() => window.__player.back()); break;
      case 'scroll': {
        const by = /^-?\d+$/.test(a[0]) ? +a[0] : null;
        await page.evaluate(({ by, q }) => { const b = window.__player.current.querySelector('.mq-screen-body'); if (by !== null) b.scrollBy({ top: by, behavior: 'smooth' }); else { const k = window.__player.findByKey(q); if (k) k.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, { by, q: a[0] });
        await page.waitForTimeout(700);
        break;
      }
      case 'swipe': {
        const dir = a[0] || 'left';
        const pos = a[1] ? await page.evaluate((q) => window.__find(q), a[1]) : await page.evaluate(() => { const b = window.__player.host.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
        const d = { left: [-160, 0], right: [160, 0], up: [0, -220], down: [0, 220] }[dir];
        await page.evaluate(({ x, y }) => window.__cursor(x, y, false), pos);
        await page.mouse.move(pos.x, pos.y); await page.mouse.down();
        await page.evaluate(({ x, y }) => { const c = document.getElementById('cursor'); c.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${x}px,${y}px)` }], { duration: 300, fill: 'forwards' }); }, { x: d[0], y: d[1] });
        await page.mouse.move(pos.x + d[0], pos.y + d[1], { steps: 12 }); await page.mouse.up();
        await page.evaluate(({ x, y }) => { const c = document.getElementById('cursor'); c.getAnimations().forEach(a => a.cancel()); c.style.left = x + 'px'; c.style.top = y + 'px'; c.dataset.x = x; c.dataset.y = y; }, { x: pos.x + d[0], y: pos.y + d[1] });
        break;
      }
      case 'shot': { const f = a[0] || `shot-${shots.length + 1}.png`; await page.screenshot({ path: f }); shots.push(f); break; }
      case 'mode': await page.evaluate((m) => window.__player.exec('mode ' + (m || 'next'), window.__player.ctx().scope), a[0]); break;
      default: console.error(`  ? commande de flow inconnue: ${st.line}`);
    }
  }
  await page.waitForTimeout(600);
  const elapsed = Date.now() - t0;
  const video = page.video();
  await context.close(); await browser.close();
  const webm = await video.path();
  const out = o.o || (animOnly ? 'out/anim.mp4' : 'out/demo.mp4');
  fs.mkdirSync(path.dirname(out) || '.', { recursive: true });
  // trim the blank lead-in before the stage was mounted (~ first 300ms)
  const ff = (argv) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...argv]);
  if (out.endsWith('.webm')) fs.copyFileSync(webm, out);
  else if (out.endsWith('.gif') || o.gif) {
    const gif = out.endsWith('.gif') ? out : out.replace(/\.\w+$/, '.gif');
    ff(['-ss', '0.35', '-i', webm, '-vf', `fps=20,scale=${Math.min(vw, 720)}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, gif]);
    console.log(`✓ ${gif}`);
    if (!out.endsWith('.gif')) ff(['-ss', '0.35', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', out]);
  } else ff(['-ss', '0.35', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', out]);
  if (!out.endsWith('.gif')) console.log(`✓ ${out} (${(elapsed / 1000).toFixed(1)} s, ${vw * scale}×${vh * scale})`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------- build/export

async function cmdBuild(o) {
  const files = o._.slice(1);
  const projects = files.length ? files.map((f) => ({ file: path.basename(f), source: fs.readFileSync(f, 'utf8') })) : readExamples();
  const html = await buildEditorHTML({ projects, open: projects[0] && projects[0].file, title: o.title || 'Maquette Studio', artifact: !!o.artifact });
  const out = o.o || 'dist/maquette.html';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`✓ ${out} (${(html.length / 1024).toFixed(0)} Ko, ${projects.length} projet(s))`);
}

async function cmdExport(o) {
  const src = readProject(o._[1]);
  const rt = await runtime();
  const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prototype</title>
<style>html,body{margin:0;height:100%;background:#0f1014;overflow:hidden}#stage{position:fixed;inset:0}</style></head>
<body><div id="stage"></div>
<script type="text/x-maquette" id="src">${esc(src)}</script>
<script>${esc(rt)}</script>
<script>
const p = MQ.loadProject(document.getElementById('src').textContent.replace(/<\\\/script/gi, '</script'));
const m = MQ.mountPrototype(p, document.getElementById('stage'), { pad: 16 });
addEventListener('keydown', (e) => { if (e.key === 'r') m.player.start(); if (e.key === 'Backspace') m.player.back(); });
</script></body></html>`;
  const out = o.o || 'out/prototype.html';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`✓ ${out}`);
}

async function cmdFmt(o) {
  const src = readProject(o._[1]);
  const { browser, page } = await browserPage();
  const res = await page.evaluate((s) => { try { return { ok: MQ.serialize(MQ.parse(s)) + '\n' }; } catch (e) { return { err: e.message }; } }, src);
  await browser.close();
  if (res.err) { console.error('✖ ' + res.err); process.exit(1); }
  if (o.write) { fs.writeFileSync(o._[1], res.ok); console.log('✓ reformaté'); } else process.stdout.write(res.ok);
}

async function cmdKit() {
  const { browser, page } = await browserPage();
  const txt = await page.evaluate(() => {
    const p = MQ.loadProject('');
    return Object.values(p.components).map((c) => `<${c.name} ${Object.entries(c.props).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : JSON.stringify(v)}`).join(' ')}/>\n    ${c.desc}`).join('\n');
  });
  console.log(txt);
  await browser.close();
}

async function cmdIcons(o) {
  const dir = path.join(ROOT, 'node_modules/lucide-static/icons');
  const q = (o._[1] || '').toLowerCase();
  const tags = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/lucide-static/tags.json'), 'utf8'));
  const names = fs.readdirSync(dir).map((f) => f.slice(0, -4)).filter((n) => !q || n.includes(q) || (tags[n] || []).some((t) => t.includes(q)));
  console.log(names.slice(0, 200).join('  ') + (names.length > 200 ? `\n… (${names.length} au total)` : ''));
}

async function cmdScenes() {
  const { browser, page } = await browserPage();
  console.log(await page.evaluate(() => MQ.SCENE_NAMES.map((s) => 'gen:' + s).join('  ') + '\navatar:<Nom>  initials:<Nom>   (ex: src="gen:mountains/3")'));
  await browser.close();
}

const o = args(process.argv.slice(2));
const cmd = o._[0];
const table = { motion: cmdMotion, render: cmdRender, board: cmdBoard, inspect: cmdInspect, lint: (x) => cmdLint(x), audit: (x) => cmdLint(x, true), video: (x) => cmdVideo(x), anim: (x) => cmdVideo(x, true), build: cmdBuild, export: cmdExport, fmt: cmdFmt, kit: cmdKit, icons: cmdIcons, scenes: cmdScenes };
if (!cmd || !table[cmd]) { console.log(HELP); process.exit(cmd ? 1 : 0); }
try { await table[cmd](o); } catch (e) { console.error('✖ ' + (e && e.message || e)); process.exit(1); }
