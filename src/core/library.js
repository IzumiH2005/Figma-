// Libraries: publish components (with their dependencies) and a design system into a library .mq, create one,
// link / unlink it from a project. Pure source → source transforms (editor and CLI share them).
import { parse, serializeNode } from './parse.js';
import { Project } from './project.js';

const TOKEN_RE = /\$([A-Za-z][\w-]*)/g;
const top = (p) => (p.rootNode ? p.rootNode.children : p.nodes);

// own (non-kit, non-system, non-library) token names referenced by a value, followed through token → token
function ownTokens(project, text, out = new Set()) {
  for (const m of String(text).matchAll(TOKEN_RE)) {
    const k = m[1]; const t = project.tokens[k];
    if (!t || t._kit || t._sys || t._lib || out.has(k)) continue;
    out.add(k);
    ownTokens(project, t.join(' '), out);
  }
  return out;
}

// everything a component needs from its project: sub-components (deps first), keyframes, own tokens
export function componentDeps(project, names) {
  const comps = [], keyframes = new Set(), tokens = new Set(), seen = new Set();
  const visit = (name) => {
    const c = project.components[name];
    if (!c || c.fromKit || c.fromLib || seen.has(name)) return; seen.add(name);
    const walk = (n) => {
      if (!n || n.tag === '#text') return;
      if (project.components[n.tag] && n.tag !== name) visit(n.tag);
      for (const [k, v] of Object.entries(n.attrs || {})) {
        if (v === true) continue;
        ownTokens(project, v, tokens);
        if (/^(anim|loop|motion)$|^(hover|press|in|out):anim$/.test(k)) for (const w of String(v).split(/[\s;]+/)) if (project.keyframes[w]) keyframes.add(w);
        if (/swap\(|^[A-Z]/.test(String(v))) for (const w of String(v).match(/[A-Z][\w]*/g) || []) if (project.components[w]) visit(w);
      }
      for (const ch of n.children || []) walk(ch);
    };
    walk(c.node);
    comps.push(name);
  };
  for (const n of names) visit(n);
  return { components: comps, keyframes: [...keyframes], tokens: [...tokens] };
}

// raw `name: value` lines of the project's own <tokens> for these names (keeps modes / comments-free form)
function tokenLines(project, names) {
  const want = new Set(names); const out = [];
  for (const n of top(project)) {
    if (n.tag !== 'tokens') continue;
    for (const line of (n.raw || '').split('\n')) { const m = /^\s*\$?([\w.\-]+)\s*[:=]/.exec(line); if (m && want.has(m[1])) out.push(line.trim()); }
  }
  return out;
}

const fresh = (text) => parse(text).filter((n) => n.tag !== '#text');

export function newLibrarySource(name, { system = null, tokens = [] } = {}) {
  return `<project name="${String(name).replace(/"/g, '&quot;')}" library desc="Bibliothèque partagée : un projet l'utilise avec &lt;use lib=&quot;${String(name).replace(/"/g, '')}&quot;/&gt; et ses composants restent liés">
${system ? '  ' + system + '\n' : ''}${tokens.length ? '  <tokens>\n' + tokens.map((l) => '    ' + l).join('\n') + '\n  </tokens>\n' : ''}</project>
`;
}

// merge `lines` into the library's <tokens> (same name → replaced)
function mergeTokens(lib, lines) {
  if (!lines.length) return;
  const t = top(lib); let blk = t.find((n) => n.tag === 'tokens');
  if (!blk) { blk = fresh('<tokens>\n</tokens>')[0]; const at = t.findIndex((n) => n.tag !== 'system' && n.tag !== '#text' && n.tag !== 'use'); t.splice(at < 0 ? t.length : at, 0, blk); }
  const cur = (blk.raw || '').split('\n').filter((l) => l.trim());
  for (const l of lines) { const k = /^\s*\$?([\w.\-]+)/.exec(l)[1]; const i = cur.findIndex((c) => new RegExp(`^\\s*\\$?${k.replace(/[.\-]/g, '\\$&')}\\s*[:=]`).test(c)); if (i >= 0) cur[i] = l; else cur.push(l); }
  blk.raw = '\n' + cur.map((l) => '    ' + l.trim()).join('\n') + '\n  ';
}

// publish components (+ deps) and/or the design system of `projectSrc` into `libSrc`; returns { source, published, deps }
export function publishToLibrary(libSrc, projectSrc, names = [], { system = false, group = null, kit = '' } = {}) {
  const project = new Project(projectSrc, { kit });
  const lib = new Project(libSrc, { kit });
  const t = top(lib);
  const deps = componentDeps(project, names);
  // keyframes
  for (const k of deps.keyframes) {
    const src = top(project).find((n) => n.tag === 'keyframes' && n.attrs.name === k); if (!src) continue;
    const i = t.findIndex((n) => n.tag === 'keyframes' && n.attrs.name === k);
    const node = fresh(serializeNode(src))[0];
    if (i >= 0) t[i] = node; else t.push(node);
  }
  // tokens (+ the design system)
  let lines = tokenLines(project, deps.tokens);
  if (system) {
    const sn = top(project).find((n) => n.tag === 'system');
    if (sn) { const i = t.findIndex((n) => n.tag === 'system'); const node = fresh(serializeNode(sn))[0]; delete node.before; if (i >= 0) t[i] = node; else t.splice(0, 0, node); }
    lines = [...lines, ...tokenLines(project, Object.keys(project.tokens).filter((k) => { const v = project.tokens[k]; return v && !v._kit && !v._sys && !v._lib; }))];
  }
  mergeTokens(lib, [...new Set(lines)]);
  // components, dependencies first; replaced in place when the library already has them
  for (const name of deps.components) {
    const c = project.components[name];
    const node = fresh(serializeNode(c.node))[0];
    if (group && names.includes(name)) node.attrs.group = group;
    const i = t.findIndex((n) => n.tag === 'component' && n.attrs.name === name);
    if (i >= 0) t[i] = node; else t.push(node);
  }
  lib.reindex();
  return { source: lib.toSource(), published: deps.components, deps };
}

// in the project: drop the local definitions now provided by the library and link it
export function linkLibrary(projectSrc, libName, removeComponents = [], { kit = '', removeSystem = false } = {}) {
  const p = new Project(projectSrc, { kit });
  const t = top(p);
  for (let i = t.length - 1; i >= 0; i--) {
    const n = t[i];
    if ((n.tag === 'component' && removeComponents.includes(n.attrs.name)) || (removeSystem && n.tag === 'system')) t.splice(i, 1);
  }
  if (!t.some((n) => n.tag === 'use' && n.attrs.lib === libName)) {
    const node = fresh(`<use lib="${String(libName).replace(/"/g, '&quot;')}"/>`)[0];
    const at = t.findIndex((n) => n.tag !== '#text' && n.tag !== 'use' && n.tag !== 'system'); t.splice(at < 0 ? 0 : at, 0, node);
  }
  p.reindex();
  return p.toSource();
}

export function unlinkLibrary(projectSrc, libName, { kit = '' } = {}) {
  const p = new Project(projectSrc, { kit });
  const t = top(p);
  for (let i = t.length - 1; i >= 0; i--) if (t[i].tag === 'use' && t[i].attrs.lib === libName) t.splice(i, 1);
  p.reindex();
  return p.toSource();
}

// "detach": copy a linked library component into the project so it can diverge
export function detachComponent(projectSrc, name, { kit = '' } = {}) {
  const p = new Project(projectSrc, { kit });
  const c = p.components[name]; if (!c || !c.fromLib) return projectSrc;
  const node = fresh(serializeNode(c.node))[0]; delete node.attrs.group;
  top(p).push(node); p.reindex();
  return p.toSource();
}
