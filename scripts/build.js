#!/usr/bin/env node
// Builds dist/runtime.js (window.MQ) and dist/maquette.html (single-file editor with embedded projects)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

export function ensureIcons() {
  const out = path.join(ROOT, 'src/core/icons.js');
  const dir = path.join(ROOT, 'node_modules/lucide-static/icons');
  if (fs.existsSync(out) && (!fs.existsSync(dir) || fs.statSync(out).mtimeMs > fs.statSync(dir).mtimeMs)) return;
  if (!fs.existsSync(dir)) throw new Error('lucide-static manquant : lance `npm install`');
  const icons = {};
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.svg')) continue;
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = s.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    icons[f.slice(0, -4)] = m[1].replace(/\s*\n\s*/g, ' ').trim().replace(/ \/>/g, '/>').replace(/> </g, '><');
  }
  fs.writeFileSync(out, `// généré depuis lucide-static (ISC) — ne pas éditer\nexport const ICONS = ${JSON.stringify(icons)};\n`);
}

// Icon packs -> dist/icons/<pack>.json  { vb, mode, sw?, icons: { name: innerSvg } }
const PACK_SRC = [
  ['material', '@material-symbols/svg-400/outlined', { vb: '0 -960 960 960', mode: 'fill' }],
  ['material-rounded', '@material-symbols/svg-400/rounded', { vb: '0 -960 960 960', mode: 'fill' }],
  ['tabler', '@tabler/icons/icons/outline', { vb: '0 0 24 24', mode: 'stroke', sw: 2 }],
  ['tabler-filled', '@tabler/icons/icons/filled', { vb: '0 0 24 24', mode: 'fill' }],
  ['ph', '@phosphor-icons/core/assets/regular', { vb: '0 0 256 256', mode: 'fill' }],
  ['ph-bold', '@phosphor-icons/core/assets/bold', { vb: '0 0 256 256', mode: 'fill' }, '-bold'],
  ['ph-fill', '@phosphor-icons/core/assets/fill', { vb: '0 0 256 256', mode: 'fill' }, '-fill'],
  ['ph-duotone', '@phosphor-icons/core/assets/duotone', { vb: '0 0 256 256', mode: 'fill' }, '-duotone'],
  ['hero', 'heroicons/24/outline', { vb: '0 0 24 24', mode: 'stroke', sw: 1.5 }],
  ['hero-solid', 'heroicons/24/solid', { vb: '0 0 24 24', mode: 'fill' }],
  ['hero-mini', 'heroicons/20/solid', { vb: '0 0 20 20', mode: 'fill' }],
  ['brand', 'simple-icons/icons', { vb: '0 0 24 24', mode: 'fill' }],
];
export function ensureIconPacks() {
  const outDir = path.join(DIST, 'icons');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, rel, meta, suffix] of PACK_SRC) {
    const out = path.join(outDir, name + '.json');
    const dir = path.join(ROOT, 'node_modules', rel);
    if (fs.existsSync(out) || !fs.existsSync(dir)) continue;
    const icons = {};
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.svg')) continue;
      const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      if (!m) continue;
      let body = m[1].replace(/<title>[\s\S]*?<\/title>/g, '').replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/g, '').replace(/\s*\n\s*/g, ' ').replace(/\s+\/>/g, '/>').replace(/>\s+</g, '><').trim();
      let key = f.slice(0, -4); if (suffix && key.endsWith(suffix)) key = key.slice(0, -suffix.length);
      icons[key] = body;
    }
    fs.writeFileSync(out, JSON.stringify({ ...meta, icons }));
  }
  return outDir;
}

// subset of pack icons used by some sources (embedded in builds so they work offline)
export function iconSubset(sources) {
  ensureIconPacks();
  const used = new Map();
  const re = /\b([a-z]+(?:-[a-z]+)?):([a-z0-9][a-z0-9-]*)/g;
  for (const src of sources) { let m; while ((m = re.exec(src))) { if (!PACK_SRC.some((p) => p[0] === m[1])) continue; if (!used.has(m[1])) used.set(m[1], new Set()); used.get(m[1]).add(m[2]); } }
  const out = {};
  for (const [pack, names] of used) {
    const file = path.join(DIST, 'icons', pack + '.json'); if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const icons = {}; for (const n of names) if (data.icons[n] !== undefined) icons[n] = data.icons[n];
    if (Object.keys(icons).length) out[pack] = { vb: data.vb, mode: data.mode, sw: data.sw, icons };
  }
  return out;
}

export async function buildRuntime() {
  ensureIcons();
  const r = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/core/index.js')], bundle: true, format: 'iife', globalName: 'MQ',
    loader: { '.mq': 'text' }, minify: true, write: false, target: 'chrome110', legalComments: 'none',
  });
  return r.outputFiles[0].text;
}

export async function buildEditorJS() {
  const r = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/editor/main.js')], bundle: true, format: 'iife', minify: !process.env.MQ_DEBUG, write: false, target: 'chrome110', legalComments: 'none',
    loader: { '.mq': 'text' },
  });
  return r.outputFiles[0].text;
}

const esc = (s) => s.replace(/<\/script/gi, '<\\/script');

export async function buildEditorHTML({ projects = [], title = 'Maquette Studio', open = null, artifact = false } = {}) {
  const [runtime, editor] = await Promise.all([buildRuntime(), buildEditorJS()]);
  const css = fs.readFileSync(path.join(ROOT, 'src/editor/editor.css'), 'utf8');
  const tpl = fs.readFileSync(path.join(ROOT, 'src/editor/index.html'), 'utf8');
  const iconData = `<script type="application/json" id="mq-icons">${esc(JSON.stringify(iconSubset(projects.map((p) => p.source))))}</script>`;
  const embeds = iconData + projects.map((p) => `<script type="text/x-maquette" data-file="${p.file}"${open === p.file ? ' data-open' : ''}>${esc(p.source)}</script>`).join('\n');
  if (artifact) {
    // the artifact host provides doctype/html/head/body: emit content only
    return `<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>${css}</style>
${embeds}
<script id="mq-runtime">${esc(runtime)}</script>
<script>${esc(editor)}</script>
`;
  }
  return tpl
    .replace('{{TITLE}}', title)
    .replace('/*{{CSS}}*/', css)
    .replace('{{PROJECTS}}', () => embeds)
    .replace('{{RUNTIME}}', () => esc(runtime))
    .replace('{{EDITOR}}', () => esc(editor));
}

export function readExamples() {
  const dir = path.join(ROOT, 'examples');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.mq')).sort().map((f) => ({ file: f, source: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(DIST, { recursive: true });
  const runtime = await buildRuntime();
  fs.writeFileSync(path.join(DIST, 'runtime.js'), runtime);
  const html = await buildEditorHTML({ projects: readExamples(), open: 'orbit-banking.mq' });
  fs.writeFileSync(path.join(DIST, 'maquette.html'), html);
  fs.writeFileSync(path.join(DIST, 'maquette-artifact.html'), await buildEditorHTML({ projects: readExamples(), open: 'orbit-banking.mq', artifact: true }));
  console.log(`dist/runtime.js ${(runtime.length / 1024).toFixed(0)} Ko · dist/maquette.html ${(html.length / 1024).toFixed(0)} Ko`);
}
