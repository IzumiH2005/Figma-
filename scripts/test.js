#!/usr/bin/env node
// Smoke tests: parse/serialize round-trip, render + lint every example, editor boots without errors.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildRuntime, buildEditorHTML, readExamples } from './build.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require('playwright');
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✖'} ${m}`); if (!c) failed++; };

const runtime = await buildRuntime();
const examples = readExamples();
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: runtime });

for (const ex of examples) {
  const r = await page.evaluate((src) => {
    const a = MQ.serialize(MQ.parse(src));
    const b = MQ.serialize(MQ.parse(a));
    const p = MQ.loadProject(src); MQ.ensureStyles();
    let issues = MQ.lintProject(p); const errs = [];
    for (const s of p.screens()) {
      document.body.innerHTML = '';
      const el = MQ.screenElement(p, s.attrs.name); document.body.appendChild(el);
      errs.push(...el._mq.errors);
      issues = issues.concat(MQ.lintScreen(el, p, s));
    }
    return { stable: a === b, screens: p.screens().length, errs, bad: issues.filter((i) => i.level === 'error').map((i) => i.msg) };
  }, ex.source);
  ok(r.stable, `${ex.file}: round-trip parse/serialize stable`);
  ok(r.screens > 0, `${ex.file}: ${r.screens} écran(s)`);
  ok(!r.errs.length, `${ex.file}: rendu sans erreur ${r.errs.slice(0, 3).join(' | ')}`);
  ok(!r.bad.length, `${ex.file}: lint sans erreur ${r.bad.slice(0, 3).join(' | ')}`);
}

// prototype runtime: navigation + variables
const proto = await page.evaluate(async () => {
  const p = MQ.loadProject(`<vars>n: 0</vars><screen name=A start><text name=t on:click="inc $n">{$n}</text><text name=go on:click="go B smart 50">go</text></screen><screen name=B><text name=t on:click="back">B</text></screen>`);
  const host = document.createElement('div'); document.body.innerHTML = ''; document.body.appendChild(host);
  const pl = new MQ.Player(p, host, {}); pl.start();
  host.querySelector('[data-key=t]').click(); await new Promise((r) => setTimeout(r, 400));
  const n = pl.vars.n; const txt = host.querySelector('[data-key=t]').textContent;
  host.querySelector('[data-key=go]').click(); await new Promise((r) => setTimeout(r, 300));
  return { n, txt, screen: pl.currentName };
});
ok(proto.n === 1 && proto.txt === '1', 'Player: inc $n re-rend le texte');
ok(proto.screen === 'B', 'Player: go B (smart)');

// editor boots
const html = await buildEditorHTML({ projects: examples });
const tmp = path.join(ROOT, 'out', '_test-editor.html');
fs.mkdirSync(path.dirname(tmp), { recursive: true }); fs.writeFileSync(tmp, html);
const ed = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const edErr = [];
ed.on('pageerror', (e) => edErr.push(e.message));
await ed.goto('file://' + tmp); await ed.waitForTimeout(1200);
const nScreens = await ed.evaluate(() => document.querySelectorAll('.cv-world .mq-screen').length);
ok(nScreens > 0 && !edErr.length, `Éditeur : ${nScreens} écrans rendus ${edErr.join(' | ')}`);
fs.rmSync(tmp);

ok(!errors.length, 'aucune exception de page ' + errors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} échec(s)` : '\nTous les tests passent');
process.exit(failed ? 1 : 0);
