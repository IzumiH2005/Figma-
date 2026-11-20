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

// foundations & hygiene: ramps, color fns, surgical fixes keep comments
const hyg = await page.evaluate(() => {
  const src = `<project typescale=ui>
  <tokens>
    brand: ramp(#0F7B6C)
    primary: $brand-700
    a: x
    b: y
  </tokens>
  <!-- commentaire conservé -->
  <screen name=S device=iphone-16 p=20 gap=10>
    <text size=13 color=#0B5C51>Bonjour</text>
    <Button label="Supprimer le compte"/>
  </screen>
</project>`;
  const p = MQ.loadProject(src);
  const r1 = p.token('brand-50') && p.token('brand-950') && p.token('primary') === p.token('brand-700');
  document.body.innerHTML = '';
  const el = MQ.screenElement(p, 'S'); document.body.appendChild(el);
  const issues = MQ.lintProject(p).concat(MQ.lintScreen(el, p, p.screen('S')));
  const codes = new Set(issues.map((i) => i.code));
  const out = MQ.fixSource(src, p, issues).source;
  return { r1, codes: [...codes], comment: out.includes('<!-- commentaire conservé -->'), gap: /gap=12/.test(out), size: /size=12|size=14/.test(out), danger: /kind=danger/.test(out), tint: MQ.Color.toHex(MQ.Color.parseColor(MQ.Color.resolveColorFns('tint(#000000, 50)'))) };
});
ok(hyg.r1, 'ramp() génère brand-50…950 et les références de tokens');
ok(['off-grid', 'type-scale', 'destructive'].every((c) => hyg.codes.includes(c)), 'lint détecte grille, échelle typo, action destructrice : ' + hyg.codes.join(','));
ok(hyg.comment && hyg.gap && hyg.size && hyg.danger, 'fix chirurgical : corrections appliquées, commentaires conservés');
ok(/^#[0-9A-F]{6}$/.test(hyg.tint) && hyg.tint !== '#000000', 'fonctions de couleur tint()/shade() ' + hyg.tint);

// motion: modifiers shape keyframes, lint motion rules, stagger options
const mot = await page.evaluate(() => {
  const sp = MQ.parseSpec('fade-up 500 anticipate overshoot', 'in');
  const r = MQ.shapeFrames(MQ.PRESETS['fade-up'](16), sp, 'ease');
  const pre = parseFloat(r.frames[1].translate.split(' ')[1]), over = parseFloat(r.frames[2].translate.split(' ')[1]);
  const arc = MQ.shapeFrames(MQ.PRESETS['fade-left'](40), MQ.parseSpec('fade-left 500 arc', 'in'), 'ease').frames;
  const bowed = arc.some((f) => Math.abs(parseFloat(String(f.translate).split(' ')[1])) > 1);
  const hard = MQ.parseSpec('pop 400 hard', 'in'), soft = MQ.parseSpec('pop 400 soft', 'in');
  const p = MQ.loadProject(`<screen name=S device=iphone-16><col stagger="50 fade-up 400 from=end drag=1.2"><text>a</text><text>b</text><text>c</text></col><text anim="fade-up 1500 linear">lent</text></screen>`);
  document.body.innerHTML = ''; const el = MQ.screenElement(p, 'S'); document.body.appendChild(el);
  const codes = MQ.lintScreen(el, p, p.screen('S')).map((i) => i.code);
  const st = el._mq.anims.filter((a) => a.delay !== undefined).map((a) => [a.delay, +(a.durScale || 1).toFixed(2)]);
  return { pre, over, bowed, hard: hard.overshoot > 0, soft: soft.overshoot === 0, codes, st };
});
ok(mot.pre > 16 && mot.over < 0, `anticipation (${mot.pre}) puis dépassement (${mot.over}) opposés au mouvement`);
ok(mot.bowed, 'arc : trajectoire courbée');
ok(mot.hard && mot.soft, 'accent dur = rebond, doux = amorti');
ok(mot.codes.includes('motion-linear') && mot.codes.includes('motion-duration'), 'lint motion : linéaire et durée excessive détectés');
ok(JSON.stringify(mot.st.slice(0, 3)) === JSON.stringify([[100, 1.44], [50, 1.2], [0, 1]]), 'cascade from=end avec traîne ' + JSON.stringify(mot.st));

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
// presentation: the scaled device must stay inside the stage, for every project and window size
for (const vp of [{ width: 1280, height: 720 }, { width: 700, height: 900 }]) {
  await ed.setViewportSize(vp);
  for (let i = 0; i < examples.length; i++) {
    const g = await ed.evaluate(async (i) => {
      if (app.fileIndex !== i) { document.querySelector('.filebtn').click(); [...document.querySelectorAll('.ctxmenu .item')][i].click(); await new Promise((r) => setTimeout(r, 600)); }
      document.querySelector('.playbtn').click(); await new Promise((r) => setTimeout(r, 700));
      const s = document.querySelector('.play-stage').getBoundingClientRect(), d = document.querySelector('.mq-device').getBoundingClientRect();
      document.querySelector('.play-bar .btn:last-child').click();
      return { inside: d.left >= s.left - 1 && d.right <= s.right + 1 && d.top >= s.top - 1 && d.bottom <= s.bottom + 1, d: [d.left, d.top, d.right, d.bottom].map(Math.round), s: [s.left, s.top, s.right, s.bottom].map(Math.round) };
    }, i);
    ok(g.inside, `Présentation ${examples[i].file} ${vp.width}×${vp.height} : appareil dans la zone (${g.d} ⊂ ${g.s})`);
  }
}
fs.rmSync(tmp);

ok(!errors.length, 'aucune exception de page ' + errors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} échec(s)` : '\nTous les tests passent');
process.exit(failed ? 1 : 0);
