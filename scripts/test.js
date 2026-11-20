#!/usr/bin/env node
// Smoke tests: parse/serialize round-trip, render + lint every example, editor boots without errors.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildRuntime, buildEditorHTML, readExamples } from './build.js';
import { convertRegistryItem } from '../src/core/shadcn-import.js';
import { twToAttrs } from '../src/core/tailwind.js';
import { drive } from '../cli/drive.js';
import { generateSystem, toDTCG, fromDTCG } from '../src/core/system.js';

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

// library files among the examples are registered first: projects link them with <use lib="…"/>
await page.evaluate((list) => { for (const s of list) { const n = MQ.libraryName(s); if (n) MQ.registerLibrary(n, s); } }, examples.map((e) => e.source));
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

// gestures: real pointer drags through the Player (drag + snap + binding, flick projection, scrub, lint gesture-alt)
await page.evaluate(() => {
  const p = MQ.loadProject(`<vars>s: 0
v: 0.5
page: 0</vars><screen name=G start w=400 h=800>
  <col name=sheet absolute x=0 y=700 w=400 h=300 fill=#eee drag=y snap="0, -300" drag-progress=$s/>
  <stack name=sl absolute x=50 y=50 w=300 h=44 on:scrub="set $v = {px}"/>
  <stack name=clip absolute x=0 y=200 w=400 h=100 clip><row name=track w=1200 h=100 drag=x snap=page drag-index=$page><frame w=400 h=100/><frame w=400 h=100/><frame w=400 h=100/></row></stack>
  <frame name=lone absolute x=0 y=400 w=100 h=100 drag=xy/>
</screen>`);
  const host = document.createElement('div'); document.body.innerHTML = ''; document.body.appendChild(host);
  window.__gp = new MQ.Player(p, host, {}); window.__gp.start();
});
const box = async (k) => page.evaluate((k) => { const r = document.querySelector('[data-key="' + k + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, w: r.width }; }, k);
const gesture = async (x, y, dx, dy, ms) => { await page.mouse.move(x, y); await page.mouse.down(); const n = Math.max(2, Math.round(ms / 16)); for (let i = 1; i <= n; i++) { const t = i / n, e = 2 * t * t - t * t * t; await page.mouse.move(x + dx * e, y + dy * e); await page.waitForTimeout(16); } await page.mouse.up(); };
let b = await box('sheet'); await gesture(b.x, b.y - 140, 0, -120, 160); await page.waitForTimeout(900);
const g1 = await page.evaluate(() => ({ s: window.__gp.vars.s, y: document.querySelector('[data-key=sheet]').getBoundingClientRect().top - window.__gp.host.getBoundingClientRect().top }));
ok(Math.abs(g1.s - 1) < 0.02 && Math.abs(g1.y - 400) < 2, `geste : un flick court ouvre le tiroir jusqu'à l'aimant (élan projeté) et lie $s=1 ${JSON.stringify(g1)}`);
b = await box('sl'); await gesture(b.l + b.w * 0.8, b.y, 0, 0, 40); await page.waitForTimeout(150);
const g2 = await page.evaluate(() => window.__gp.vars.v);
ok(Math.abs(g2 - 0.8) < 0.03, `geste : on:scrub donne la position sous le doigt (px=${g2.toFixed(2)})`);
b = await box('clip'); await gesture(b.x + 100, b.y, -150, 0, 140); await page.waitForTimeout(900);
const g3 = await page.evaluate(() => ({ page: window.__gp.vars.page, x: document.querySelector('[data-key=track]').getBoundingClientRect().left - document.querySelector('[data-key=clip]').getBoundingClientRect().left }));
ok(g3.page === 1 && Math.abs(g3.x + 400) < 2, `geste : carrousel snap=page, drag-index écrit la page ${JSON.stringify(g3)}`);
await page.evaluate(() => { window.__gp.vars.page = 2; window.__gp.scheduleRerender(); });
await page.waitForTimeout(1000);
const g4 = await page.evaluate(() => document.querySelector('[data-key=track]').getBoundingClientRect().left - document.querySelector('[data-key=clip]').getBoundingClientRect().left);
ok(Math.abs(g4 + 800) < 2, `geste : changer la variable liée anime la piste (x=${g4.toFixed(0)})`);
const gl = await page.evaluate(() => {
  const lintOf = (src) => { const p = MQ.loadProject(src); document.body.innerHTML = ''; const el = MQ.screenElement(p, 'G'); document.body.appendChild(el); return MQ.lintScreen(el, p, p.screen('G')).map((x) => x.code); };
  return { bare: lintOf(`<screen name=G start device=iphone-16><frame name=lone w=100 h=100 fill=#ccc drag=xy/></screen>`), kit: lintOf(`<screen name=G start device=iphone-16><Carousel count=2><frame w=fill h=80/><frame w=fill h=80/></Carousel><SwipeRow title=A action=B/></screen>`) };
});
ok(gl.bare.includes('gesture-alt') && !gl.kit.includes('gesture-alt'), `lint gesture-alt : drag sans alternative signalé, Carousel/SwipeRow (points, appui long) acceptés ${JSON.stringify(gl)}`);

// platforms: Android devices drive the chrome, $platform and the kit
const plat = await page.evaluate(() => {
  const at = (dev, extra = '') => {
    const p = MQ.loadProject(`<screen name=P start device=${dev} statusbar ${extra}><NavBar title=T/><text name=pf>{$platform}</text><frame name=pad w=fill h=10/><IconButton name=ib icon=x/><col name=low w=fill fixed place=bottom pb=safe/></screen>`);
    document.body.innerHTML = ''; const el = MQ.screenElement(p, 'P'); document.body.appendChild(el);
    const r = (k) => el.querySelector('[data-key="' + k + '"]').getBoundingClientRect(); const top = el.getBoundingClientRect();
    return { pf: el.querySelector('[data-key=pf]').textContent, back: !!el.querySelector('[data-icon="arrow-left"], .lucide-arrow-left'), ib: Math.round(r('ib').width), low: Math.round(r('low').height), sb: !!el.querySelector('.mq-statusbar'), nav: !!el.querySelector('.mq-homebar') };
  };
  const tap = (dev) => { const p = MQ.loadProject(`<screen name=Q start device=${dev}><frame w=42 h=42 fill=#ccc on:click="back"/></screen>`); document.body.innerHTML = ''; const el = MQ.screenElement(p, 'Q'); document.body.appendChild(el); return MQ.lintScreen(el, p, p.screen('Q')).some((x) => x.code === 'tap-target'); };
  return { g: at('galaxy-s25', 'homebar'), b: at('galaxy-s25-ultra', 'homebar=buttons'), i: at('iphone-16', 'homebar'), f: at('iphone-16', 'platform=android'), tapA: tap('galaxy-s25'), tapI: tap('iphone-16') };
});
ok(plat.g.pf === 'android' && plat.i.pf === 'ios' && plat.f.pf === 'android', `$platform déduit de l'appareil, forcé par platform= ${JSON.stringify([plat.g.pf, plat.i.pf, plat.f.pf])}`);
ok(plat.g.sb && plat.g.nav && plat.g.ib === 48 && plat.i.ib === 44, `Android : barre d'état, navigation, IconButton 48 dp (iOS 44) ${JSON.stringify(plat.g)}`);
ok(plat.b.low === 48 && plat.g.low === 24 && plat.i.low === 34, `homebar=buttons : zone sûre du bas à 48 (gestes 24, iPhone 34) ${[plat.b.low, plat.g.low, plat.i.low]}`);
ok(plat.tapA && !plat.tapI, 'lint tap-target : 42 px refusé sur Android (48 dp), toléré sur iOS (44 pt)');

// Tailwind → attributes, and TSX (shadcn conventions) → .mq components, offline
{
  const t = twToAttrs('inline-flex items-center gap-2 px-4 h-9 rounded-md text-sm font-medium bg-primary/90 hover:bg-accent border dark:bg-input', { radius: 10 });
  ok(t.layout === 'row' && t.attrs.gap === 8 && t.attrs.px === 16 && t.attrs.h === 36 && t.attrs.radius === 8 && t.attrs.size === 14 && t.attrs.weight === 500 && t.attrs.stroke === '1 $sh-border' && t.prefixed['hover:fill'] === '$sh-accent' && t.prefixed['dark:fill'] === '$sh-input', 'Tailwind → attributs (layout, espacements, rayon dérivé du thème, états, dark:)');
  const tsx = `import { cva } from "class-variance-authority"
import { CheckIcon } from "lucide-react"
const pillVariants = cva("inline-flex items-center gap-1 rounded-full px-2 text-xs", { variants: { tone: { solid: "bg-primary text-primary-foreground", soft: "bg-muted" } }, defaultVariants: { tone: "solid" } })
export function Pill({ className, tone, done = false, ...props }: Props) {
  return <span className={cn(pillVariants({ tone }), "data-[state=on]:ring-2", className)} {...props}>{done && <CheckIcon className="size-3" />}{props.children}</span>
}
export function PillRow({ className, ...props }) { return <div className={cn("flex gap-2", className)}><Pill tone="soft">A</Pill>{props.children}</div> }`;
  const r = convertRegistryItem({ name: 'pill', files: [{ path: 'pill.tsx', content: tsx }] });
  ok(r.names.join() === 'ui.Pill,ui.PillRow' && r.mq.includes(`props="tone='solid' done=false state='' className=''"`) && r.mq.includes('if={done}') && r.mq.includes('name=check size=12') && r.mq.includes('<ui.Pill tone=soft>') && r.mq.includes('<slot/>'), 'TSX → composants .mq (cva → props, data-[state] → state, icône lucide, composition, slot) ' + r.warnings.join(' | '));
  const out = await page.evaluate((mq) => {
    const p = MQ.loadProject(`<project><tokens>\n sh-primary: #171717\n sh-primary-foreground: #FAFAFA\n sh-muted: #F5F5F5\n sh-radius: 10\n</tokens>${mq}<screen name="S" w=300 h=100><ui.PillRow><ui.Pill done>Fait</ui.Pill></ui.PillRow></screen></project>`);
    MQ.ensureStyles(); document.body.innerHTML = '';
    const el = MQ.screenElement(p, 'S'); document.body.appendChild(el);
    const pills = [...el.querySelectorAll('[data-comp="ui.Pill"], [data-tag="ui.Pill"]')];
    const cs = pills.map((x) => getComputedStyle(x));
    return { n: pills.length, errs: el._mq.errors, bg: cs.map((c) => c.backgroundColor), radius: cs[0] && cs[0].borderTopLeftRadius, text: el.textContent.replace(/\s+/g, ' ').trim() };
  }, r.mq);
  ok(out.n === 2 && !out.errs.length && out.bg[0] === 'rgb(245, 245, 245)' && out.bg[1] === 'rgb(23, 23, 23)' && out.radius === '9999px' && out.text.replace(/ /g, '') === 'AFait', `Composants importés rendus (variantes, slot, texte) ${JSON.stringify(out)}`);
}

// agent pointer: a continuous drag on a boolean operand's anchor edits the path (live boolean)
{
  const tmpMq = path.join(ROOT, 'out', '_drive.mq');
  fs.mkdirSync(path.dirname(tmpMq), { recursive: true });
  fs.writeFileSync(tmpMq, examples.find((e) => e.file === 'notch-menu.mq').source);
  const before = /name=notch[^>]*d="([^"]+)"/.exec(fs.readFileSync(tmpMq, 'utf8'))[1];
  const log = console.log; console.log = () => {};
  await drive({ file: tmpMq, script: 'zoom tabbar; edit notch; drag anchor 4 by 0 -6 ms=300; key Escape', write: true, buildEditorHTML, chromium });
  console.log = log;
  const after = /name=notch[^>]*d="([^"]+)"/.exec(fs.readFileSync(tmpMq, 'utf8'))[1];
  ok(before !== after && /62 50/.test(after), `mq drive : glisser une ancre d'opérande de booléen modifie le tracé (${after.slice(0, 60)}…)`);
  fs.rmSync(tmpMq);
}

// saving keeps the author's source: comments, blank lines, multi-line tags and one-line rows
// survive; only what changed is rewritten (attribute patch, insertion, deletion, move)
{
  const sv = await page.evaluate((srcs) => {
    const src = `<!-- tête -->
<project name="T">
  <screen name=A device=iphone-16>
    <!-- en-tête -->
    <row gap=8><text>Un</text><text>Deux</text></row> <!-- fin de ligne -->

    <col gap=12 p=16
         fill=$bg>
      <text>Bonjour <!-- inline --> monde</text>
      <rect name=a w=10 h=10/>
      <rect name=b w=10 h=10/>
    </col>
    <!-- avant fermeture -->
  </screen>
</project>
<!-- fin -->
`;
    const a = MQ.serialize(MQ.parse(src)); const stable = a === MQ.serialize(MQ.parse(a));
    const keepsAll = ['<!-- tête -->', '<!-- en-tête -->', '<!-- fin de ligne -->', '<!-- inline -->', '<!-- avant fermeture -->', '<!-- fin -->'].every((c) => a.includes(c));
    const p = MQ.loadProject(src); const same = p.toSource() === src;
    const all = []; const walk = (n) => { all.push(n); (n.children || []).forEach(walk); }; p.nodes.forEach(walk);
    const col = all.find((n) => n.tag === 'col'); col.attrs.gap = 16;
    const b = col.children.find((n) => n.attrs && n.attrs.name === 'b'); col.children.splice(col.children.indexOf(b), 1);
    col.children.splice(1, 0, { id: 'new', tag: 'ellipse', attrs: { size: 8 }, children: [] });
    const out = p.toSource();
    const exp = src.replace('<col gap=12', '<col gap=16').replace('      <rect name=b w=10 h=10/>\n', '').replace('monde</text>\n', 'monde</text>\n      <ellipse size=8/>\n');
    const ex = srcs.map((s) => MQ.loadProject(s).toSource() === s);
    return { stable, keepsAll, same, minimal: out === exp, out, ex };
  }, examples.map((e) => e.source));
  ok(sv.stable && sv.keepsAll, 'commentaires <!-- --> conservés par parse/serialize (tête, ligne, inline, fermeture, fin)');
  ok(sv.same && sv.ex.every(Boolean), 'enregistrement sans modification = source identique (tous les exemples)');
  ok(sv.minimal, 'enregistrement chirurgical : attribut, insertion et suppression sans toucher au reste\n' + (sv.minimal ? '' : sv.out));
}

// metaball booleans: radius rounds the result's corners (a square becomes a circle), operands driven by expressions
// become literals where the hand drops them, the inspector presets write radius
{
  const geo = await page.evaluate(() => {
    const P = MQ.Path; const sq = P.parsePath('M0 0H100V100H0Z');
    const r = P.flatten(MQ.Vector.booleanResult([sq], 'union', MQ.Vector.cornerOf({ radius: 'full' })), 1)[0].pts;
    const d = r.map(([x, y]) => Math.hypot(x - 50, y - 50)); return { min: Math.min(...d), max: Math.max(...d) };
  });
  ok(geo.min > 44 && geo.max < 56, `radius=full sur un carré ≈ cercle (rayon ${geo.min.toFixed(1)}…${geo.max.toFixed(1)})`);
  const tmpMq = path.join(ROOT, 'out', '_cluster.mq');
  fs.writeFileSync(tmpMq, examples.find((e) => e.file === 'cluster.mq').source.replace('fused: true', 'fused: false'));
  const log = console.log; console.log = () => {};
  await drive({ file: tmpMq, script: 'zoom cluster; drag node slab by -60 90 ms=300; key Escape; select cluster; click ui "Goutte 80"', write: true, buildEditorHTML, chromium });
  console.log = log;
  const src = fs.readFileSync(tmpMq, 'utf8');
  ok(/name=slab x=230 y=70/.test(src) && /name=sun x=\{\$fused/.test(src) && /name=cluster[^>]*radius=80/.test(src), 'mq drive : opérande piloté par expression glissé → littéral ; préréglage « Goutte 80 »');
  fs.rmSync(tmpMq);
}

// fx stack + shader fills: parse/serialize round-trip, every effect compiles to an SVG filter, mouse handles rewrite the stack
{
  const fx = await page.evaluate(() => {
    const F = MQ.Fx, S = MQ.Shader;
    const spec = 'halftone size=6 angle=30; gradmap colors=#102,#f06,#fe8; lens cx=0.4';
    const rt = F.serializeFx(F.parseFx(spec)) === spec;
    const ctx = { defs: new Map() }; const bad = F.FX_NAMES.filter((n) => !F.compileFx(n, ctx, { w: 200, h: 200 }).startsWith('url(#'));
    const svgOk = [...ctx.defs.values()].every((v) => { const d = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${v.replace(/<filter /, '<filter xmlns="http://www.w3.org/2000/svg" ')}</svg>`, 'image/svg+xml'); return !d.querySelector('parsererror'); });
    const hs = F.handles(spec, 200, 100).map((x) => x.name);
    const moved = F.handles(spec, 200, 100).find((x) => x.name === 'lens.center').map(150, 25);
    const sp = S.parseShader('voronoi scale=40 colors=#000,#fff');
    return { rt, bad, svgOk, hs, moved, sh: sp.type === 'noise' && sp.o.type === 'voronoi' && sp.o.scale === '40', names: S.SHADER_NAMES.length, def: S.shaderDefaults('grid').params.length };
  });
  ok(fx.rt, 'fx : parse/serialize stable');
  ok(!fx.bad.length && fx.svgOk, 'fx : chaque effet compile en filtre SVG valide' + (fx.bad.length ? ' — en échec : ' + fx.bad.join(', ') : ''));
  ok(fx.hs.includes('halftone.angle') && fx.hs.includes('lens.center') && /lens cx=0\.75 cy=0\.25/.test(fx.moved), 'fx : poignées (angle, centre) réécrivent la pile — ' + fx.moved);
  ok(fx.sh && fx.names >= 9 && fx.def === 6, 'shader : alias voronoi → noise type=voronoi, défauts par type');
  const tmpMq = path.join(ROOT, 'out', '_fx.mq');
  fs.writeFileSync(tmpMq, '<screen name=S w=400 h=400 p=40>\n  <image name=photo src="gen:landscape/3" w=320 h=320 fx="halftone size=8 angle=45"/>\n</screen>\n');
  const log = console.log; console.log = () => {};
  await drive({ file: tmpMq, script: 'select photo; drag rig halftone.angle by 0 60; click ui "Néon"', write: true, buildEditorHTML, chromium });
  console.log = log;
  const src = fs.readFileSync(tmpMq, 'utf8');
  ok(/fx="bloom threshold=0\.55 intensity=1\.6; rgb-split amount=3"/.test(src), 'mq drive : poignée fx glissée puis preset « Néon » de l\'inspecteur\n' + src);
  fs.rmSync(tmpMq);
}

// Component Studio: rename a prop (expressions + instances follow), add a rig, matrix with an instance-swap axis
{
  const tmpMq = path.join(ROOT, 'out', '_studio.mq');
  fs.writeFileSync(tmpMq, examples.find((e) => e.file === 'component-lab.mq').source);
  const log = console.log; console.log = () => {};
  await drive({ file: tmpMq, script: 'studio Stepper; dblclick css [data-f="pn-count"]; key Control+a; type "qty"; key Enter; wait 300; click ui "Ajouter un rig"; menu "qty"; wait 300; exit', write: true, buildEditorHTML, chromium });
  console.log = log;
  const src = fs.readFileSync(tmpMq, 'utf8');
  ok(/name=Stepper props="qty=1[^"]*"[^>]*rig:qty="x 0\.\.10 step=1"/.test(src) && /if \{qty < max\} inc qty/.test(src) && /<Stepper max=12 qty=7\/>/.test(src) && />\{qty\}<\/text>/.test(src) && !/\{count/.test(src),
    'Studio : renommer une prop réécrit expressions, interactions et instances ; « Ajouter un rig » écrit rig:qty');
  fs.rmSync(tmpMq);
}

// built-in plugins: fake content, charts, connectors, smooth shadows
{
  const r = await page.evaluate(async () => {
    const p = MQ.loadProject(`<project><screen name="S" w=600 h=300><stack w=fill h=fill>
      <text name=n x=0 y=0>{fake('name', 3)}</text>
      <chart name=c x=10 y=40 type=bar w=200 h=100 data={[1,3,2]} labels="a,b,c"/>
      <frame name=a x=300 y=20 w=60 h=40/><frame name=b x=480 y=200 w=60 h=40/>
      <connector from=a to=b curve=elbow label="go"/>
      <frame name=s x=10 y=200 w=40 h=40 shadow="smooth(12)"/>
    </stack></screen></project>`);
    MQ.ensureStyles(); document.body.innerHTML = ''; const el = MQ.screenElement(p, 'S'); document.body.appendChild(el);
    await new Promise((res) => setTimeout(res, 120));
    const k = (n) => el.querySelector(`[data-key="${n}"]`);
    return { name: k('n').textContent, bars: k('c').querySelectorAll('.mq-chart-bar').length, conn: !!el.querySelector('.mq-connector-path'), label: el.querySelector('.mq-connector-label')?.textContent, shadow: getComputedStyle(k('s')).boxShadow.split('rgba').length - 1, list: MQ.fakeList(3, 'name,email', 1).map((x) => x.name) };
  });
  ok(/^\S+ \S+$/.test(r.name) && r.bars === 3 && r.conn && r.label === 'go' && r.shadow === 5 && new Set(r.list).size === 3, `Plugins intégrés : fake, chart, connector, ombre douce ${JSON.stringify(r)}`);
}

// component anatomy rules + motion recipes
{
  const r = await page.evaluate(() => {
    const p = MQ.loadProject(`<project><component name="B" props="label='Envoyer'"><row h=40 px=6 gap=1 radius=10 fill=#5B5BF7 color=#fff on:click="go S"><icon name=send size=32/><text size=14>{label}</text></row></component>
      <component name="G" props="label='Ok'"><row h=44 px=16 gap=8 radius=12 fill=#5B5BF7 color=#fff motion="press appear" on:click="go S"><icon name=check size=18/><text size=16>{label}</text></row></component>
      <screen name="S" w=400 h=300><col p=24 gap=16><B/><G/></col></screen></project>`);
    MQ.ensureStyles(); document.body.innerHTML = ''; const el = MQ.screenElement(p, 'S'); document.body.appendChild(el);
    const iss = MQ.lintScreen(el, p, p.screen('S'));
    const g = el.querySelector('[data-comp="G"]');
    return { codes: [...new Set(iss.map((i) => i.code))], gStates: [...g.classList].some((c) => c.startsWith('mqs')), gAnim: el._mq.anims.some((a) => a.el === g) };
  });
  ok(['icon-gap', 'icon-size', 'button-padding', 'no-feedback'].every((c) => r.codes.includes(c)) && r.gStates && r.gAnim, `Anatomie des composants + recettes de motion ${JSON.stringify(r)}`);
}

// design system engine: contrast-safe roles for hard brand colors, DTCG round-trip, kit linked to the system
{
  const brands = ['#FACC15', '#22D3EE', '#0F766E', '#E11D48', '#111111', '#A3E635'];
  const fails = brands.flatMap((b) => generateSystem({ brand: b, accent: '#F97316' }).checks.filter((c) => !c.ok).map((c) => `${b} ${c.mode} ${c.fg}/${c.bg} ${c.ratio}`));
  ok(!fails.length, `Design system : tous les rôles passent AA pour des marques difficiles (${brands.join(' ')}) ${fails.slice(0, 4).join(' | ')}`);
  const sys = generateSystem({ brand: '#7C5CFF', radius: 'pill', density: 'compact' });
  const back = fromDTCG(toDTCG(sys, 't'));
  ok(back['brand-600'] === sys.primitives['brand-600'] && back.primary && back.primary.dark === sys.dark.primary && back['button-radius'] === '999' && back['space-3'] === sys.scales['space-3'], `DTCG aller-retour (primitives, alias, modes, composant) ${JSON.stringify({ p: back.primary, r: back['button-radius'] })}`);
  const r = await page.evaluate(() => {
    const p = MQ.loadProject(`<project modes="light dark"><system brand=#0F766E radius=pill density=compact/><screen name="S" w=400 h=200><Button label="Go"/></screen></project>`);
    MQ.ensureStyles(); document.body.innerHTML = ''; const el = MQ.screenElement(p, 'S'); document.body.appendChild(el);
    const b = el.querySelector('[data-comp="Button"]'); const cs = getComputedStyle(b.firstElementChild || b);
    return { bg: getComputedStyle(b).backgroundColor, radius: getComputedStyle(b).borderTopLeftRadius, h: b.offsetHeight, sh: p.token('sh-primary', 0) };
  });
  ok(r.bg === 'rgb(15, 118, 110)' && parseFloat(r.radius) > 100 && r.h === 36 && r.sh === '#0F766E', `Kit lié au système (couleur, pilule, densité compacte, alias shadcn) ${JSON.stringify(r)}`);
}

// prototype: action chains with wait see their own changes; overlapping re-renders never leave a stale screen
{
  const r = await page.evaluate(async () => {
    document.body.innerHTML = '<div id=st style="width:600px;height:400px"></div>';
    const p = MQ.loadProject(`<project><component name="Dl" props="phase=0"><row name=dl h=48 px=24 on:click="if {phase == 0} change phase=1 smart 200 bouncy; wait 300; if {phase == 1} change phase=2 smart 200 bouncy"><text>{phase == 0 ? 'A' : phase == 1 ? 'B' : 'C'}</text></row></component>
      <component name="Sw" props="on=false"><row name=sw h=48 w=80 on:click="change on={!on} smart 900 bouncy"><text>{on ? 'on' : 'off'}</text></row></component>
      <screen name="S" w=400 h=300><col p=24 gap=16><Sw/><Dl/></col></screen></project>`);
    const m = MQ.mountPrototype(p, document.getElementById('st'), { frame: false }); await new Promise((res) => setTimeout(res, 400));
    const q = (k) => document.querySelector(`[data-key="${k}"]`);
    q('sw').click(); await new Promise((res) => setTimeout(res, 120)); q('dl').click();
    await new Promise((res) => setTimeout(res, 120)); const mid = q('dl').textContent.trim();
    await new Promise((res) => setTimeout(res, 1400));
    const out = { mid, end: q('dl').textContent.trim(), sw: q('sw').textContent.trim(), screens: document.querySelectorAll('.mq-screen').length };
    m.destroy(); return out;
  });
  ok(r.mid === 'B' && r.end === 'C' && r.sw === 'on' && r.screens === 1, `Prototype : chaîne change/wait/if et re-rendus superposés ${JSON.stringify(r)}`);
}

// pixel precision: overlays almost on their target, thumbs with uneven insets, layers escaping their card, off-centre glyphs
{
  const r = await page.evaluate(() => {
    const src = (good) => `<project><screen name="S" w=480 h=420><col p=24 gap=16 fill=#fff>
      <stack w=300 h=48 p=4 radius=24 fill=#eef>${good ? '<stack w=fill h=40>' : ''}<frame name=ind x=0 y=0 w=33.333% h=40 radius=20 fill=#fff/><row w=fill h=40><stack w=fill h=40 center><text>A</text></stack><stack w=fill h=40 center><text>B</text></stack><stack w=fill h=40 center><text>C</text></stack></row>${good ? '</stack>' : ''}</stack>
      <stack w=52 h=32 radius=16 fill=#55f ${good ? '' : 'px=4 align=center'}><ellipse name=th w=24 h=24 x=${good ? 4 : 0} y=${good ? 4 : 4} fill=#fff/></stack>
      <col w=300 p=16 radius=16 fill=#f4f4f8><row w=fill gap=16><text ${good ? 'w=fill' : ''}>Un libellé vraiment très long qui ne tient pas sur une ligne</text><frame w=52 h=32 radius=16 fill=#55f/></row></col>
      <stack w=44 h=44 radius=22 fill=#eee ${good ? 'center' : 'pt=3 center'}><icon name=x size=16/></stack>
    </col></screen></project>`;
    const run = (good) => { const p = MQ.loadProject(src(good)); MQ.ensureStyles(); document.body.innerHTML = ''; const el = MQ.screenElement(p, 'S'); document.body.appendChild(el); return [...new Set(MQ.lintScreen(el, p, p.screen('S')).map((i) => i.code))].filter((c) => ['misaligned', 'inset', 'escape', 'off-center'].includes(c)).sort(); };
    return { bad: run(false), good: run(true) };
  });
  ok(r.bad.join() === 'escape,inset,misaligned,off-center' && !r.good.length, `Précision au pixel : indicateur décalé, curseur à inset inégal, débordement de carte, glyphe décentré ${JSON.stringify(r)}`);
}

// re-render: a layer that appears (if=…) plays its entrance once, per instance; a vanished burst stays gone afterwards
{
  const r = await page.evaluate(async () => {
    document.body.innerHTML = '<div id=st style="width:600px;height:400px"></div>';
    const p = MQ.loadProject(`<project><keyframes name="sp">0 { opacity=1 scale=0.5 } 100 { opacity=0 scale=1.4 }</keyframes>
      <component name="L" props="on=false"><row name=lk h=44 w=120 on:click="change on={!on} smart 200 snappy"><frame if={on} name=bu w=8 h=8 fill=#f80 opacity=0 anim="sp 300 out"/><text>{on ? 'oui' : 'non'}</text></row></component>
      <component name="T" props="v=false"><row name=tg h=44 w=120 on:click="change v={!v} smart 200 snappy"><text>{v ? 'v' : 'f'}</text></row></component>
      <screen name="S" w=400 h=300><col p=24 gap=16><L/><L on/><T/></col></screen></project>`);
    const m = MQ.mountPrototype(p, document.getElementById('st'), { frame: false }); await new Promise((res) => setTimeout(res, 500));
    const bursts = () => [...document.querySelectorAll('.mq-screen [data-key="bu"]')];
    document.querySelector('[data-key="lk"]').click(); await new Promise((res) => setTimeout(res, 60));
    const playing = bursts().map((b) => b.getAnimations().some((a) => a.playState === 'running'));
    await new Promise((res) => setTimeout(res, 700));
    document.querySelector('[data-key="tg"]').click(); await new Promise((res) => setTimeout(res, 400));
    const after = bursts().map((b) => +getComputedStyle(b).opacity);
    m.destroy(); return { playing, after, n: document.querySelectorAll('.mq-screen').length };
  });
  ok(r.playing.join() === 'true,false' && r.after.every((o) => o === 0), `Re-rendu : entrée jouée pour le calque apparu, par instance, éclat qui reste éteint ${JSON.stringify(r)}`);
}

// images: <assets> block resolves by name, import → WebP (smaller, resized), names are slugged and unique
{
  const r = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 3000; c.height = 1500; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 3000, 1500); gr.addColorStop(0, '#ff7a59'); gr.addColorStop(1, '#5b5bf7'); g.fillStyle = gr; g.fillRect(0, 0, 3000, 1500);
    const png = c.toDataURL('image/png');
    const out = await MQ.Images.importImage(png, { max: 2048 });
    const p = MQ.loadProject(`<project><screen name="S" w=400 h=300><image name=a src=hero w=200 h=100/><image name=b src=asset:hero w=200 h=100/></screen>\n<assets>\n  hero: ${out.dataUrl}\n</assets>\n</project>`);
    MQ.ensureStyles(); document.body.innerHTML = ''; const el = MQ.screenElement(p, 'S'); document.body.appendChild(el);
    const srcOf = (k) => { const e = el.querySelector(`[data-key="${k}"]`); const im = e.tagName === 'IMG' ? e : e.querySelector('img'); return im ? im.src : getComputedStyle(e).backgroundImage; };
    return { format: out.format, w: out.w, h: out.h, smaller: out.bytes < MQ.Images.dataBytes(png), a: srcOf('a').includes('image/webp'), b: srcOf('b').includes('image/webp'), name: MQ.Images.assetName('Photo Équipe 02.JPG', { 'photo-equipe-02': 1 }), back: MQ.parse(MQ.serialize(MQ.parse(`<assets>\n  x: data:image/webp;base64,AAAA\n</assets>`))).length };
  });
  ok(r.format === 'webp' && r.w === 2048 && r.h === 1024 && r.smaller && r.a && r.b && r.name === 'photo-equipe-02-2', `Images : <assets>, import WebP redimensionné, noms uniques ${JSON.stringify(r)}`);
}

// libraries: publish a component with its dependencies, link, render from the library, edits propagate, system inherited
{
  const r = await page.evaluate(() => {
    const proj = `<project name="App">
  <system brand=#0F766E radius=round/>
  <tokens>
    glow: $accent-soft
    pill-pad: 12
  </tokens>
  <keyframes name="wob">0 { rotate=-4 } 100 { rotate=0 }</keyframes>
  <component name="Dot" props="c=$primary"><frame w=8 h=8 radius=full fill={c}/></component>
  <component name="Tag" props="label='Nouveau'"><row h=32 px=$pill-pad gap=8 radius=full fill=$glow anim="wob 300"><Dot/><text>{label}</text></row></component>
  <screen name="S" w=300 h=200><Tag label="Lib"/></screen>
</project>`;
    let lib = MQ.Library.newLibrarySource('UI Test');
    const pub = MQ.Library.publishToLibrary(lib, proj, ['Tag'], { system: true, group: 'Badges', kit: MQ.KIT });
    lib = pub.source;
    MQ.registerLibrary(MQ.libraryName(lib), lib);
    const linked = MQ.Library.linkLibrary(proj, 'UI Test', pub.published, { kit: MQ.KIT, removeSystem: true });
    const p = MQ.loadProject(linked);
    MQ.ensureStyles(); document.body.innerHTML = ''; const el = MQ.screenElement(p, 'S'); document.body.appendChild(el);
    const tag = el.querySelector('[data-comp="Tag"]');
    const out = { name: MQ.libraryName(lib), published: pub.published, deps: pub.deps, fromLib: p.components.Tag.fromLib, group: p.components.Tag.group, local: /component name="Tag"/.test(linked), use: /<use lib="UI Test"\/>/.test(linked), sys: !!p.system, pad: getComputedStyle(tag).paddingLeft, txt: tag.textContent.trim(), dot: !!tag.querySelector('[data-comp="Dot"]') };
    // edit the library → the project follows
    MQ.registerLibrary('UI Test', lib.replace('px=$pill-pad', 'px=20'));
    const p2 = MQ.loadProject(linked); document.body.innerHTML = ''; const el2 = MQ.screenElement(p2, 'S'); document.body.appendChild(el2);
    out.pad2 = getComputedStyle(el2.querySelector('[data-comp="Tag"]')).paddingLeft;
    out.detached = MQ.loadProject(MQ.Library.detachComponent(linked, 'Tag', { kit: MQ.KIT })).components.Tag.fromLib;
    MQ.registerLibrary('UI Test', null);
    out.missing = MQ.loadProject(linked).libMissing;
    return out;
  });
  ok(r.name === 'UI Test' && r.published.join() === 'Dot,Tag' && r.deps.keyframes.join() === 'wob' && r.deps.tokens.sort().join() === 'glow,pill-pad' && r.fromLib === 'UI Test' && r.group === 'Badges' && !r.local && r.use && r.sys && r.pad === '12px' && r.txt === 'Lib' && r.dot && r.pad2 === '20px' && r.detached === null && r.missing.join() === 'UI Test',
    `Bibliothèques : publier avec dépendances, lier, rendre, propager, détacher, système hérité ${JSON.stringify(r)}`);
}

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
