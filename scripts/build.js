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
  const embeds = projects.map((p) => `<script type="text/x-maquette" data-file="${p.file}"${open === p.file ? ' data-open' : ''}>${esc(p.source)}</script>`).join('\n');
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
