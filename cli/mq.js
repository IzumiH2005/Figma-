#!/usr/bin/env node
// Maquette CLI — the agent-side interface: render PNGs, record prototype videos, inspect & lint layouts, build the editor.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildRuntime, buildEditorHTML, readExamples, iconSubset } from '../scripts/build.js';
import { importShadcnTheme } from '../src/core/themes.js';
import { importShadcn, SHADCN_REGISTRY } from '../src/core/shadcn-import.js';
import { drive, send as driveSend } from './drive.js';
import { generateSystem, toDTCG, toCSS, toTailwind, fromDTCG, tokenLines } from '../src/core/system.js';
import { styleGuideSource } from '../src/core/styleguide.js';
import { libraryName } from '../src/core/project.js';
import { newLibrarySource, publishToLibrary, linkLibrary, unlinkLibrary, componentDeps } from '../src/core/library.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `Maquette CLI

  mq render  <file.mq> [-s Écran,Écran] [-o dossier] [--scale 2] [--mode dark] [--frame] [--full] [--guides]
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
  mq kit     [préfixe]                                               liste les composants du kit + props (mq kit ui. : pack shadcn)
  mq lib     new "Nom" -o lib.mq · publish f.mq A,B --to lib.mq [--group G] [--system] · link · unlink · list · deps   bibliothèques
  mq image   add <file.mq> img.jpg [--name n] [--max 2048] [--quality 0.86] · list · rm   images intégrées (WebP)
  mq ds      <file.mq> [--init "brand=#hex"] [--export dtcg|css|tailwind] [--import t.json] [--guide -o g.png]   design system
  mq spec    <file.mq> <Composant> [--props "k=v"] [-o spec.png]   fiche technique : paddings, écarts, tailles, typo, tokens
  mq drive   <file.mq> <gestes.txt> [--write] [--video s.mp4]       pilote souris : gestes continus dans l'éditeur (points, plume, rigs, menus…)
  mq drive   <file.mq> --serve [port]  ·  mq drive send "cmd; cmd"   session persistante (navigateur gardé ouvert)
  mq shadcn  add <noms…|all> [--into f.mq] [--theme neutral|zinc|slate|stone|gray]   importe les composants du registre shadcn/ui (ui.*)
  mq shadcn  list | theme <globals.css> [--into f.mq]                  liste le registre · importe un thème (:root/.dark) en tokens sh-*
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
  page.on('console', (m) => { if ((m.type() === 'warning' || m.type() === 'error') && !/GL Driver Message|GPU stall/.test(m.text())) console.error('  [console]', m.text()); });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body></body></html>`);
  await page.addScriptTag({ content: await runtime() });
  return { browser, context, page };
}

// libraries: <use lib="Nom"/> is resolved next to the file (its folder, ./libs, ../libs), by file name or by the
// library's <project name="…" library>; resolved sources are registered in the page before the project loads
let LIBS_CTX = {};
function findLib(dir, name) {
  const dirs = [dir, path.join(dir, 'libs'), path.join(dir, '..', 'libs'), path.join(ROOT, 'examples')];
  for (const d of dirs) for (const c of [name, name + '.mq', slug(name) + '.mq']) { const f = path.isAbsolute(c) ? c : path.join(d, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) return { file: f, source: fs.readFileSync(f, 'utf8') }; }
  for (const d of dirs) { if (!fs.existsSync(d)) continue; for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.mq'))) { const src = fs.readFileSync(path.join(d, f), 'utf8'); if (libraryName(src) === name) return { file: path.join(d, f), source: src }; } }
  return null;
}
function resolveLibs(file, src, acc = {}) {
  const dir = path.dirname(path.resolve(file));
  for (const m of src.matchAll(/<use\s+lib=(?:"([^"]+)"|'([^']+)'|([^\s/>]+))/g)) {
    const name = m[1] ?? m[2] ?? m[3]; if (acc[name] !== undefined) continue;
    const found = findLib(dir, name);
    if (!found) { console.error(`  ⚠ bibliothèque introuvable : « ${name} » (cherchée dans ${path.relative(process.cwd(), dir) || '.'}, ./libs, ../libs)`); continue; }
    acc[libraryName(found.source) || name] = found.source; acc[name] = found.source; resolveLibs(found.file, found.source, acc);
  }
  return acc;
}

function readProject(file) {
  if (!file) { console.error('Fichier .mq requis'); process.exit(1); }
  const src = fs.readFileSync(file, 'utf8');
  LIBS_CTX = resolveLibs(file, src);
  return src;
}

async function loadInPage(page, source, mode) {
  await page.evaluate((packs) => MQ.registerPacks(packs), iconSubset([source, ...Object.values(LIBS_CTX)]));
  await page.evaluate((libs) => MQ.registerLibraries(libs), LIBS_CTX);
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
    const ok = await page.evaluate(({ name, frame, full, guides }) => {
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
      if (guides) { const z = p.sizeOf(s); const spec = s.attrs.guides || s.attrs.grid || MQ.Guides.autoGuides(z.w); el.appendChild(MQ.Guides.guidesOverlay(MQ.Guides.parseGuides(spec, z.w, el.offsetHeight || z.h))); }
      return true;
    }, { name, frame: !!o.frame, full: !!o.full, guides: !!o.guides });
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
  // HiDPI video: the viewport is scale× larger and the stage is zoomed (Playwright records at viewport size)
  col.style.zoom = window.__zoom || 1;
  document.body.appendChild(col);
  const player = new MQ.Player(p, host, { mode: window.__mode, headless: true });
  window.__player = player;
  player.start(s.attrs.name);
  const cur = document.createElement('div'); cur.id = 'cursor';
  const Z = window.__zoom || 1; cur.style.cssText = 'position:fixed;left:0;top:0;width:' + 34 * Z + 'px;height:' + 34 * Z + 'px;margin:' + (-17 * Z) + 'px 0 0 ' + (-17 * Z) + 'px;' + 'border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.9);box-shadow:0 4px 14px rgba(0,0,0,.35);pointer-events:none;z-index:99999;opacity:0;transition:opacity .25s;backdrop-filter:blur(2px)';
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
  const { browser, context, page } = await browserPage({ scale: 1, viewport: { width: vw * scale, height: vh * scale }, video: { dir: tmpDir, size: { width: vw * scale, height: vh * scale } } });
  await loadInPage(page, src, o.mode);
  await page.addScriptTag({ content: STAGE_JS });
  await page.evaluate((z) => { window.__zoom = z; }, +scale);
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
  // linked libraries travel with the projects (the editor registers every library file it holds)
  for (const f of files) for (const [name, src] of Object.entries(resolveLibs(f, fs.readFileSync(f, 'utf8')))) if (!projects.some((x) => x.source === src)) projects.push({ file: slug(name) + '.mq', source: src });
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

async function cmdKit(o) {
  const { browser, page } = await browserPage();
  const filter = o._[1] || '';
  const txt = await page.evaluate((filter) => {
    const p = MQ.loadProject('');
    return Object.values(p.components).filter((c) => !filter || c.name.toLowerCase().startsWith(filter.toLowerCase())).map((c) => `<${c.name} ${Object.entries(c.props).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : JSON.stringify(v)}`).join(' ')}/>\n    ${c.desc}`).join('\n');
  }, filter);
  console.log(txt);
  await browser.close();
}

// spec sheet (redlines) of a component: paddings, gaps, sizes, typography, tokens — mq spec f.mq Button --props "kind=ghost icon=plus"
async function cmdSpec(o) {
  const src = readProject(o._[1]); const name = o._[2]; if (!name) throw new Error('usage : mq spec f.mq <Composant> [--props "k=v k2=v2"] [-o spec.png] [--mode dark]');
  const out = o.o || `spec-${name.replace(/[^\w]+/g, '-')}.png`;
  const { browser, page } = await browserPage({ scale: o.scale || 2 });
  await loadInPage(page, src, o.mode);
  const res = await page.evaluate(({ name, props }) => {
    const p = window.__p; const c = p.components[name]; if (!c) return { error: 'composant introuvable : ' + name };
    const attrs = {}; for (const m of String(props || '').matchAll(/(\w+)=("[^"]*"|\S+)/g)) attrs[m[1]] = m[2].replace(/^"|"$/g, '');
    document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#F8FAFC;font-family:Inter,system-ui';
    const wrap = document.createElement('div'); wrap.id = 'shot'; wrap.style.cssText = 'display:inline-flex;flex-direction:column;gap:28px;padding:56px 64px 40px;background:#F8FAFC';
    const title = document.createElement('div'); title.innerHTML = `<div style="font:700 20px Inter">${name}</div><div style="font:400 12px Inter;color:#64748B;margin-top:4px;max-width:520px">${(c.desc || '').replace(/</g, '&lt;')}</div>`;
    const ctx = MQ.makeCtx(p, { mode: window.__mode });
    const el = MQ.renderStandalone({ id: 'spec', tag: name, attrs, children: [] }, ctx);
    const stage = document.createElement('div'); stage.style.cssText = 'position:relative;display:inline-block;padding:28px;background:' + (p.token('bg', window.__mode) || '#fff') + ';border-radius:12px';
    stage.appendChild(el); wrap.append(title, stage); document.body.appendChild(wrap);
    const root = el.matches('[data-comp]') ? el : el.querySelector('[data-comp]') || el;
    const tokens = [...new Set(JSON.stringify(c.node).match(/\$[\w.-]+/g) || [])].filter((t) => p.tokens[t.slice(1)]).slice(0, 14);
    const sp = MQ.specOverlay(root, { tokens });
    const sr = stage.getBoundingClientRect(), rr = root.getBoundingClientRect(); const holder = document.createElement('div'); holder.style.cssText = `position:absolute;left:${rr.left - sr.left}px;top:${rr.top - sr.top}px;width:${rr.width}px;height:${rr.height}px`; holder.appendChild(sp); stage.appendChild(holder);
    const legend = document.createElement('div'); legend.style.cssText = 'font:500 12px/1.7 Inter;color:#334155;columns:2;column-gap:32px;max-width:640px';
    legend.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Anatomie</div>' + sp._legend.map((l) => `<div>${l.replace(/</g, '&lt;')}</div>`).join('') + '<div style="margin-top:6px;color:#DB2777">■ padding</div><div style="color:#2563EB">■ écart entre éléments</div>';
    wrap.appendChild(legend);
    return { ok: true, legend: sp._legend };
  }, { name, props: o.props });
  if (res.error) { await browser.close(); throw new Error(res.error); }
  await waitFonts(page);
  await page.locator('#shot').screenshot({ path: out });
  await browser.close();
  console.log(`✓ ${out}\n  ` + res.legend.join('\n  '));
}

// design system engine: mq ds f.mq [--export dtcg|css|tailwind] [-o out] [--import tokens.json] [--guide -o guide.png]
async function cmdDs(o) {
  const file = o._[1]; if (!file) throw new Error('usage : mq ds f.mq [--export dtcg|css|tailwind -o fichier] [--import tokens.json] [--guide [-o guide.png] [--mode dark]] [--init "brand=#5B5BF7 radius=soft"]');
  let src = fs.readFileSync(file, 'utf8');
  if (o.init) {
    if (/<system\b/.test(src.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('ce projet a déjà un <system>');
    src = src.replace(/(<project[^>]*>)/, `$1\n  <system ${String(o.init === true ? 'brand=#5B5BF7' : o.init)}/>`);
    fs.writeFileSync(file, src); console.log(`✓ <system ${o.init === true ? 'brand=#5B5BF7' : o.init}/> ajouté à ${file}`);
  }
  if (o.import) {
    const map = fromDTCG(JSON.parse(fs.readFileSync(o.import, 'utf8')));
    const lines = tokenLines(map);
    const m = /<tokens>([\s\S]*?)<\/tokens>/.exec(src);
    const block = lines.map((l) => '    ' + l).join('\n');
    src = m ? src.slice(0, m.index) + '<tokens>' + m[1].replace(/\s*$/, '\n') + block + '\n  </tokens>' + src.slice(m.index + m[0].length) : src.replace(/(<project[^>]*>)/, `$1\n  <tokens>\n${block}\n  </tokens>`);
    fs.writeFileSync(file, src); console.log(`✓ ${lines.length} tokens DTCG importés dans ${file}`); return;
  }
  const m = /<system\b([^>]*)\/?>/.exec(src.replace(/<!--[\s\S]*?-->/g, ''));
  if (!m) throw new Error('aucun <system …/> dans ce projet (mq ds f.mq --init "brand=#hex radius=soft density=comfortable")');
  const { parseAttrString } = await import('../src/core/project.js');
  const attrs = parseAttrString(m[1].replace(/\/\s*$/, ''));
  const sys = generateSystem(attrs);
  const name = (/<project[^>]*name="([^"]+)"/.exec(src) || [])[1] || 'Design system';
  if (o.export) {
    const kind = String(o.export);
    const out = kind === 'css' ? toCSS(sys) : kind === 'tailwind' ? toTailwind(sys) : JSON.stringify(toDTCG(sys, name), null, 2) + '\n';
    const dest = o.o || (kind === 'css' ? 'tokens.css' : kind === 'tailwind' ? 'tailwind.config.js' : 'tokens.json');
    fs.writeFileSync(dest, out); console.log(`✓ ${dest} (${kind === 'css' ? 'variables CSS, thème sombre [data-theme=dark]' : kind === 'tailwind' ? 'config Tailwind' : 'W3C DTCG 2025.10'})`);
    return;
  }
  if (o.guide) {
    const guideSrc = src.replace(/<\/project>\s*$/, styleGuideSource(sys, name) + '\n</project>\n');
    const tmp = path.join(process.env.TMPDIR || '/tmp', `mq-guide-${process.pid}.mq`); fs.writeFileSync(tmp, guideSrc);
    const outDir = path.dirname(o.o || 'out/guide.png'); fs.mkdirSync(outDir, { recursive: true });
    await cmdRender({ _: ['render', tmp], s: name, o: outDir, scale: o.scale || 1, mode: o.mode, full: true });
    const produced = path.join(outDir, `${slug(name)}.png`);
    if (o.o && produced !== o.o) fs.renameSync(produced, o.o);
    fs.unlinkSync(tmp);
    if (o.write) { fs.writeFileSync(file, guideSrc); console.log(`✓ page de style ajoutée à ${file}`); }
    return;
  }
  // summary
  const ok = sys.checks.filter((c) => c.ok).length;
  console.log(`Design system « ${name} » — ${attrs.brand || '#5B5BF7'} · neutres ${attrs.neutral || 'tinted'} · rayons ${attrs.radius || 'soft'} · densité ${attrs.density || 'comfortable'} · élévation ${attrs.elevation || 'soft'} · motion ${attrs.motion || 'calm'}`);
  console.log(`  primitives : ${Object.keys(sys.primitives).length} (${sys.ramps.join(', ')} × 11 pas)`);
  console.log(`  sémantiques : ${Object.keys(sys.light).length} par mode (clair / sombre)`);
  console.log(`  échelles : ${Object.keys(sys.scales).length} · composant : ${Object.keys(sys.components).length} · alias shadcn : ${Object.keys(sys.shadcn).length}`);
  console.log(`  contrastes : ${ok}/${sys.checks.length} conformes`);
  for (const c of sys.checks.filter((x) => !x.ok)) console.log(`    ✖ ${c.mode} ${c.fg} sur ${c.bg} : ${c.ratio}:1 < ${c.min}`);
  for (const role of ['primary', 'accent', 'danger']) if (sys.light[role]) console.log(`  ${role.padEnd(8)} clair ${sys.light[role]} / ${sys.light['on-' + role]} · sombre ${sys.dark[role]} / ${sys.dark['on-' + role]}`);
}

// images embedded in the project: mq image add f.mq photo.jpg [--name n] [--max 2048] [--quality 0.86] [--format webp|png]
//                                    mq image list f.mq · mq image rm f.mq nom
function setAssetLine(src, name, value) {
  const m = /<assets>([\s\S]*?)<\/assets>/.exec(src);
  if (!m) {
    if (value === null) return src;
    const block = `  <assets>\n    ${name}: ${value}\n  </assets>\n`;
    return /<\/project>\s*$/.test(src) ? src.replace(/<\/project>\s*$/, block + '</project>\n') : src + '\n<assets>\n  ' + name + ': ' + value + '\n</assets>\n';
  }
  const lines = m[1].split('\n').filter((l) => l.trim());
  const re = new RegExp(`^\\s*${name.replace(/[.\-]/g, '\\$&')}\\s*:`);
  const i = lines.findIndex((l) => re.test(l));
  if (value === null) { if (i >= 0) lines.splice(i, 1); } else if (i >= 0) lines[i] = `    ${name}: ${value}`; else lines.push(`    ${name}: ${value}`);
  const body = lines.length ? '<assets>\n' + lines.map((l) => '    ' + l.trim()).join('\n') + '\n  </assets>' : '';
  return src.slice(0, m.index) + body + src.slice(m.index + m[0].length);
}
async function cmdImage(o) {
  const [, sub, file, ...rest] = o._;
  if (!sub || !file) throw new Error('usage : mq image add f.mq image.jpg [--name nom] [--max 2048] [--quality 0.86] [--format webp|png] · mq image list f.mq · mq image rm f.mq nom');
  let src = fs.readFileSync(file, 'utf8');
  const fmt = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' ko');
  if (sub === 'list') {
    const m = /<assets>([\s\S]*?)<\/assets>/.exec(src);
    const lines = m ? m[1].split('\n').map((l) => /^\s*([\w.\-]+)\s*:\s*(\S+)/.exec(l)).filter(Boolean) : [];
    if (!lines.length) { console.log('Aucune image intégrée.'); return; }
    let tot = 0;
    for (const [, n, v] of lines) { const b = v.startsWith('data:') ? Math.round((v.length - v.indexOf(',') - 1) * 0.75) : 0; tot += b; console.log(`  ${n.padEnd(24)} ${v.startsWith('data:') ? v.slice(11, v.indexOf(';')).padEnd(6) + ' ' + fmt(b) : v}`); }
    console.log(`  ${lines.length} image(s), ${fmt(tot)} intégrés`);
    return;
  }
  if (sub === 'rm') { const name = rest[0]; if (!name) throw new Error('nom requis'); fs.writeFileSync(file, setAssetLine(src, name, null)); console.log(`✓ « ${name} » retirée de ${file}`); return; }
  if (sub !== 'add') throw new Error(`sous-commande inconnue : ${sub}`);
  const imgs = rest; if (!imgs.length) throw new Error('image requise');
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp' };
  const { browser, page } = await browserPage();
  try {
    const taken = {};
    { const m = /<assets>([\s\S]*?)<\/assets>/.exec(src); if (m) for (const l of m[1].split('\n')) { const k = /^\s*([\w.\-]+)\s*:/.exec(l); if (k) taken[k[1]] = 1; } }
    for (const img of imgs) {
      const ext = path.extname(img).slice(1).toLowerCase();
      const mime = MIME[ext]; if (!mime) throw new Error(`format non reconnu : ${img}`);
      const buf = fs.readFileSync(img);
      const raw = `data:${mime};base64,${buf.toString('base64')}`;
      const out = await page.evaluate(({ raw, opt }) => MQ.Images.importImage(raw, opt), { raw, opt: { max: +(o.max || 2048), quality: +(o.quality || 0.86), format: o.format || 'webp' } });
      const name = imgs.length === 1 && o.name ? String(o.name) : await page.evaluate(({ f, t }) => MQ.Images.assetName(f, t), { f: path.basename(img), t: o.replace ? {} : taken });
      taken[name] = 1;
      src = setAssetLine(src, name, out.dataUrl);
      const dims = out.w ? `${out.w}×${out.h}` : 'vectoriel';
      console.log(`✓ ${name} : ${path.basename(img)} ${fmt(buf.length)} → ${out.format.toUpperCase()} ${fmt(out.bytes)} (${dims}${out.original && (out.original.w !== out.w) ? `, réduit de ${out.original.w}×${out.original.h}` : ''})`);
      if (out.w) { const s = Math.min(1, 360 / out.w); console.log(`    <image src=${name} w=${Math.round(out.w * s)} h=${Math.round(out.h * s)}/>`); }
    }
    fs.writeFileSync(file, src);
  } finally { await browser.close(); }
}

// libraries: mq lib new "Nom" -o lib.mq [--from f.mq --system] · mq lib publish f.mq A,B --to lib.mq [--group G] [--system]
//            mq lib link f.mq lib.mq · mq lib unlink f.mq "Nom" · mq lib list lib.mq · mq lib deps f.mq Comp
async function cmdLib(o) {
  const [, sub, a1, a2] = o._;
  const kit = fs.readFileSync(path.join(ROOT, 'src/core/kit.mq'), 'utf8');
  const usage = 'usage : mq lib new "Nom" -o lib.mq [--from f.mq --system] · publish f.mq A,B --to lib.mq [--group G] [--system] [--no-link] · link f.mq lib.mq · unlink f.mq "Nom" · list lib.mq · deps f.mq Comp';
  if (!sub) throw new Error(usage);
  if (sub === 'new') {
    const name = a1; if (!name) throw new Error(usage);
    let opts = {};
    if (o.from && o.system) { const src = fs.readFileSync(o.from, 'utf8'); const m = /<system\b[^>]*\/>/.exec(src.replace(/<!--[\s\S]*?-->/g, '')); if (m) opts.system = m[0]; }
    const out = o.o || slug(name) + '.mq';
    if (fs.existsSync(out)) throw new Error(`${out} existe déjà`);
    fs.writeFileSync(out, newLibrarySource(name, opts)); console.log(`✓ 📚 ${name} → ${out}${opts.system ? ' (avec le design system de ' + o.from + ')' : ''}`); return;
  }
  if (sub === 'publish') {
    const file = a1, names = String(a2 || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!file || !o.to) throw new Error(usage);
    const libSrc = fs.readFileSync(o.to, 'utf8'); const libName = libraryName(libSrc);
    if (!libName) throw new Error(`${o.to} n'est pas une bibliothèque (<project name="…" library>)`);
    const src = fs.readFileSync(file, 'utf8');
    const r = publishToLibrary(libSrc, src, names, { system: !!o.system, group: o.group || null, kit });
    fs.writeFileSync(o.to, r.source);
    console.log(`✓ ${r.published.join(', ') || '—'}${o.system ? ' + design system' : ''} → 📚 ${libName} (${o.to})`);
    if (r.deps.keyframes.length || r.deps.tokens.length) console.log(`    dépendances : ${[...r.deps.keyframes.map((k) => 'keyframes ' + k), ...r.deps.tokens.map((t) => '$' + t)].join(', ')}`);
    if (o.link !== false && !o['no-link']) { fs.writeFileSync(file, linkLibrary(src, libName, r.published, { kit, removeSystem: !!o.system })); console.log(`✓ ${file} : <use lib="${libName}"/>, définitions locales retirées (elles viennent de la bibliothèque)`); }
    return;
  }
  if (sub === 'link') { const libName = libraryName(fs.readFileSync(a2, 'utf8')); if (!libName) throw new Error(`${a2} n'est pas une bibliothèque`); fs.writeFileSync(a1, linkLibrary(fs.readFileSync(a1, 'utf8'), libName, [], { kit })); console.log(`✓ ${a1} utilise 📚 ${libName}`); return; }
  if (sub === 'unlink') { fs.writeFileSync(a1, unlinkLibrary(fs.readFileSync(a1, 'utf8'), a2, { kit })); console.log(`✓ ${a1} n'utilise plus ${a2}`); return; }
  if (sub === 'deps') { const { Project } = await import('../src/core/project.js'); const p = new Project(fs.readFileSync(a1, 'utf8'), { kit }); const d = componentDeps(p, String(a2).split(',')); console.log(`composants : ${d.components.join(', ')}\nkeyframes : ${d.keyframes.join(', ') || '—'}\ntokens : ${d.tokens.map((t) => '$' + t).join(', ') || '—'}`); return; }
  if (sub === 'list') {
    const src = fs.readFileSync(a1, 'utf8'); const name = libraryName(src);
    const { Project } = await import('../src/core/project.js'); const p = new Project(src, { kit });
    console.log(`📚 ${name || '(pas une bibliothèque)'}${p.systemNode ? ' · design system ' + Object.entries(p.systemNode.attrs).map(([k, v]) => `${k}=${v}`).join(' ') : ''}`);
    const own = Object.values(p.components).filter((c) => !c.fromKit && !c.fromLib);
    const groups = new Map(); for (const c of own) { const g = c.group || '—'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
    for (const [g, list] of groups) { console.log(`  ${g}`); for (const c of list) console.log(`    ${c.name.padEnd(18)} ${c.desc || ''}`); }
    const toks = Object.entries(p.tokens).filter(([, v]) => !v._kit && !v._sys).length; if (toks) console.log(`  tokens propres : ${toks}`);
    return;
  }
  throw new Error(usage);
}

// agent pointer: drive the real editor with continuous mouse gestures (see cli/drive.js)
async function cmdDrive(o) {
  if (o._[1] === 'send') { // client of a persistent session (mq drive f.mq --serve)
    const script = o.e ? String(o.e) : o._.slice(2).join(' ');
    process.stdout.write(await driveSend(script, +o.port || 7788)); return;
  }
  const file = o._[1]; if (!file) throw new Error('usage : mq drive projet.mq gestes.txt [--write] [--video s.mp4] [--shots dossier] [--speed 2]  |  -e "select x; rigs"  |  --serve [port] puis mq drive send "…"');
  const script = o.e ? String(o.e) : o._[2] ? fs.readFileSync(o._[2], 'utf8') : '';
  if (!script && !o.serve) throw new Error('mq drive : donne un fichier de gestes, -e "…" ou --serve');
  const { chromium } = require('playwright');
  const libs = resolveLibs(file, fs.readFileSync(file, 'utf8'));
  const r = await drive({ file, libs, script, write: !!o.write, video: o.video, shots: o.shots, scale: o.scale || 1, speed: o.speed || 1, serve: o.serve ? (o.serve === true ? 7788 : +o.serve) : 0, buildEditorHTML, chromium });
  if (o.video && r.video) { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', r.video, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', o.video]); console.log(`✓ vidéo de la session : ${o.video}`); }
  if (r.failures) process.exitCode = 1;
}

// merge sh-* token lines into a project's <tokens> block (created if missing)
function mergeTokens(src, lines) {
  const m = /<tokens>([\s\S]*?)<\/tokens>/.exec(src);
  if (!m) return src.replace(/(<project[^>]*>)/, `$1\n  <tokens>\n${lines.map((l) => '    ' + l).join('\n')}\n  </tokens>`);
  let body = m[1];
  for (const l of lines) { const k = l.trim().split(':')[0]; const re = new RegExp(`^[ \\t]*${k.replace(/[-]/g, '\\-')}\\s*:.*$`, 'm'); body = re.test(body) ? body.replace(re, '    ' + l) : body.replace(/\s*$/, '\n    ' + l + '\n  '); }
  return src.slice(0, m.index) + '<tokens>' + body + '</tokens>' + src.slice(m.index + m[0].length);
}

// mq shadcn add <names…|all> [--into f.mq] [-o f.mq] [--style new-york-v4] [--theme neutral]
// mq shadcn list | mq shadcn theme <globals.css> [--into f.mq]
async function cmdShadcn(o) {
  const sub = o._[1];
  const base = o.style ? SHADCN_REGISTRY.replace(/new-york-v4$/, o.style) : SHADCN_REGISTRY;
  const get = async (name) => { const r = await fetch(`${base}/${name}.json`); if (!r.ok) throw new Error(`${name} : HTTP ${r.status} (${base})`); return r.json(); };
  if (sub === 'theme') return cmdShadcnTheme({ ...o, _: ['shadcn-theme', o._[2]] });
  const index = await get('registry'); const uiNames = index.items.filter((i) => i.type === 'registry:ui').map((i) => i.name);
  if (sub === 'list' || !sub) { console.log(`${uiNames.length} composants (${base}) :\n` + uiNames.join(' ')); return; }
  if (sub !== 'add') throw new Error('usage : mq shadcn add <noms…|all> [--into f.mq] | mq shadcn list | mq shadcn theme globals.css');
  const want = o._.slice(2).length ? o._.slice(2) : ['all'];
  const r = await importShadcn({ names: want, theme: o.theme || 'neutral', style: o.style || 'new-york-v4', fetchJson: async (u) => { const res = await fetch(u); if (!res.ok) throw new Error(`HTTP ${res.status} ${u}`); return res.json(); } });
  for (const c of r.converted) console.log(`  ✓ ${c.item.padEnd(16)} ${c.names.join(', ')}`);
  const known = r.names.map((x) => x.slice(3)); const total = r.names.length; const items = r.converted; const warns = r.warnings; const theme = r.themeLines || [];
  const block = r.mq;
  if (o.into) {
    let src = fs.readFileSync(o.into, 'utf8');
    for (const name of known) src = src.replace(new RegExp(`(<!-- [\\w-]+ -->\\s*)?<component name="ui\\.${name}"[\\s\\S]*?</component>\\s*`, 'g'), '');
    src = src.replace(/<!-- shadcn\/ui — MIT[^>]*-->\s*/g, '');
    if (!/^\s*sh-background\s*:/m.test(src) || o.theme) src = mergeTokens(src, theme);
    src = src.replace(/<\/project>\s*$/, `${block.replace(/^/gm, '  ').replace(/^\s+$/gm, '')}\n</project>\n`);
    fs.writeFileSync(o.into, src);
    console.log(`✓ ${total} composants ui.* (${items.length} entrées du registre) et le thème ${o.theme || 'neutral'} ajoutés à ${o.into}`);
  } else {
    const out = `<!-- tokens du thème ${o.theme || 'neutral'} : colle-les dans <tokens> -->\n<tokens>\n${theme.map((l) => '  ' + l).join('\n')}\n</tokens>\n\n${block}\n`;
    if (o.o) { fs.writeFileSync(o.o, out); console.log(`✓ ${total} composants écrits dans ${o.o}`); } else console.log(out);
  }
  if (warns.length) console.warn(`  ${warns.length} avertissement(s) : ` + [...new Set(warns)].slice(0, 6).join(' · '));
}

// shadcn/ui globals.css → <tokens> (sh-*), printed or merged into a .mq file (--into)
async function cmdShadcnTheme(o) {
  const f = o._[1]; if (!f) throw new Error('usage : mq shadcn-theme globals.css [--into projet.mq]');
  const r = importShadcnTheme(fs.readFileSync(f, 'utf8'));
  if (!r.count) throw new Error('aucune variable --x trouvée dans :root / .dark');
  if (!o.into) { console.log(r.tokens); return; }
  const src = mergeTokens(fs.readFileSync(o.into, 'utf8'), r.tokens.split('\n').slice(1, -1).map((l) => l.trim()));
  fs.writeFileSync(o.into, src);
  console.log(`✓ ${r.count} tokens shadcn fusionnés dans ${o.into}${r.skipped.length ? ` (ignorés : ${r.skipped.join(', ')})` : ''}`);
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
const table = { motion: cmdMotion, render: cmdRender, board: cmdBoard, inspect: cmdInspect, lint: (x) => cmdLint(x), audit: (x) => cmdLint(x, true), video: (x) => cmdVideo(x), anim: (x) => cmdVideo(x, true), build: cmdBuild, export: cmdExport, fmt: cmdFmt, kit: cmdKit, 'shadcn-theme': cmdShadcnTheme, shadcn: cmdShadcn, drive: cmdDrive, spec: cmdSpec, ds: cmdDs, image: cmdImage, lib: cmdLib, icons: cmdIcons, scenes: cmdScenes };
if (!cmd || !table[cmd]) { console.log(HELP); process.exit(cmd ? 1 : 0); }
try { await table[cmd](o); } catch (e) { console.error('✖ ' + (e && e.message || e)); process.exit(1); }
