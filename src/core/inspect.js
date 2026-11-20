// Text inspection & design lint for rendered screens — lets an agent "see" layout without pixels.
import { parseColor } from './project.js';

function rel(el, root) {
  const r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
  const s = R.width / (root.offsetWidth || R.width) || 1;
  return { x: Math.round((r.left - R.left) / s), y: Math.round((r.top - R.top) / s), w: Math.round(r.width / s), h: Math.round(r.height / s) };
}

function label(el) {
  const tag = el.dataset.comp ? `<${el.dataset.comp}>` : el.dataset.tag || el.tagName.toLowerCase();
  const key = el.dataset.key ? ` #${el.dataset.key}` : '';
  let txt = '';
  if (el.dataset.tag === 'text') { const t = el.textContent.trim().replace(/\s+/g, ' '); txt = ` "${t.length > 40 ? t.slice(0, 38) + '…' : t}"`; }
  if (el.dataset.tag === 'icon') txt = ' ' + (el.querySelector('svg') ? '' : '?');
  return tag + key + txt;
}

export function inspectScreen(screenEl, { depth = 99, all = false } = {}) {
  const lines = [];
  const W = screenEl.offsetWidth, H = screenEl.offsetHeight;
  lines.push(`${screenEl.dataset.screen} ${W}×${H}`);
  const body = screenEl.querySelector('.mq-screen-body');
  if (body && body.scrollHeight > body.clientHeight + 1) lines.push(`  (contenu défilant: hauteur ${body.scrollHeight}px)`);
  const walk = (el, d, prefix) => {
    const kids = [...el.children].filter((c) => c.dataset && (c.dataset.tag || c.classList.contains('mq-fixed')) && c.tagName !== 'STYLE');
    kids.forEach((c, i) => {
      if (c.classList.contains('mq-fixed')) { if (c.children.length) { lines.push(`${prefix}[fixed]`); walk(c, d, prefix + '  '); } return; }
      const r = rel(c, screenEl);
      const flags = [];
      const cs = getComputedStyle(c);
      if (cs.display === 'none') { if (all) lines.push(`${prefix}${label(c)} (caché)`); return; }
      if (c.dataset.tag === 'text' && c.scrollWidth > c.clientWidth + 1 && cs.textOverflow !== 'ellipsis') flags.push('⚠ texte déborde');
      if (cs.textOverflow === 'ellipsis' && c.scrollWidth > c.clientWidth + 1) flags.push('… tronqué');
      if (r.x + r.w > W + 1 && !insideHScroll(c, screenEl)) flags.push('⚠ dépasse à droite');
      if (r.x < -1 && !insideHScroll(c, screenEl)) flags.push('⚠ dépasse à gauche');
      if (r.w === 0 || r.h === 0) flags.push('⚠ taille nulle');
      if (c.dataset.hot) flags.push('▶');
      if (cs.position === 'absolute') flags.push('abs');
      const lay = cs.display === 'flex' ? (cs.flexDirection.startsWith('row') ? 'row' : 'col') : cs.display === 'grid' && cs.gridTemplateColumns.split(' ').length > 1 ? 'grid' : '';
      lines.push(`${prefix}${label(c)}${lay ? ' ' + lay : ''} [${r.x},${r.y} ${r.w}×${r.h}]${flags.length ? '  ' + flags.join(' ') : ''}`);
      if (d < depth && c.dataset.tag !== 'text' && c.dataset.tag !== 'icon') walk(c, d + 1, prefix + '  ');
    });
  };
  walk(body || screenEl, 0, '  ');
  const fixed = screenEl.querySelector(':scope > .mq-fixed');
  if (fixed && fixed.children.length) { lines.push('  [fixed]'); walk(fixed, 0, '    '); }
  return lines.join('\n');
}

function insideHScroll(el, root) {
  let n = el.parentElement;
  while (n && n !== root) { const cs = getComputedStyle(n); if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden' && n !== root && n.scrollWidth > n.clientWidth) return true; n = n.parentElement; }
  return false;
}

// ---------------------------------------------------------------- lint

function lum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

function blend(top, bottom) { const a = top[3]; return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]; }

function effectiveBg(el, root) {
  const stack = [];
  let n = el;
  while (n) {
    const cs = getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradient/image: unknown
    const c = parseColor(cs.backgroundColor);
    if (c && c[3] > 0) { stack.push(c); if (c[3] >= 0.99) break; }
    if (n === root) break;
    n = n.parentElement;
  }
  let bg = [255, 255, 255, 1];
  if (stack.length && stack[stack.length - 1][3] >= 0.99) bg = stack.pop();
  while (stack.length) bg = blend(stack.pop(), bg);
  return bg;
}

export function lintScreen(screenEl, project, screenNode) {
  const issues = [];
  const name = screenEl.dataset.screen;
  const push = (level, code, msg, el) => issues.push({ level, code, screen: name, msg, id: el && el.dataset ? el.dataset.id : undefined, key: el && el.dataset ? el.dataset.key : undefined });
  const W = screenEl.offsetWidth;
  const dev = project.sizeOf(screenNode).device;
  const phone = !dev || dev.kind === 'phone' || dev.kind === 'watch';
  screenEl.querySelectorAll('[data-tag="text"]').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || !el.textContent.trim()) return;
    const fs = parseFloat(cs.fontSize);
    const t = el.textContent.trim().slice(0, 30);
    if (fs < 11) push('warn', 'tiny-text', `Texte trop petit (${fs}px) : « ${t} »`, el);
    const fg = parseColor(cs.color);
    if (fg && fg[3] > 0.05 && cs.webkitTextFillColor !== 'rgba(0, 0, 0, 0)') {
      const bg = effectiveBg(el, screenEl);
      if (bg) {
        const op = parseFloat(cs.opacity) || 1;
        const fgc = blend([fg[0], fg[1], fg[2], fg[3] * op], bg);
        const ratio = contrast(fgc, bg);
        const large = fs >= 24 || (fs >= 18.6 && +cs.fontWeight >= 700);
        const min = large ? 3 : 4.5;
        if (ratio < min) push(ratio < min - 1.3 ? 'error' : 'warn', 'contrast', `Contraste ${ratio.toFixed(2)}:1 < ${min}:1 pour « ${t} »`, el);
      }
    }
    if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.whiteSpace === 'nowrap') push('warn', 'overflow', `Texte coupé/débordant : « ${t} » (ajoute truncate ou w=fill)`, el);
  });
  screenEl.querySelectorAll('[data-hot]').forEach((el) => {
    const r = rel(el, screenEl);
    if (phone && (r.w < 40 || r.h < 40) && r.w > 0) push('warn', 'tap-target', `Zone tactile ${r.w}×${r.h} < 44×44 (${el.dataset.key || el.dataset.comp || el.dataset.tag})`, el);
  });
  screenEl.querySelectorAll('[data-id]').forEach((el) => {
    if (el.closest('.mq-overlay')) return;
    const r = rel(el, screenEl);
    if (r.w > 0 && r.x + r.w > W + 1 && !insideHScroll(el, screenEl)) push('warn', 'bounds', `Dépasse l'écran à droite de ${r.x + r.w - W}px (${el.dataset.key || el.dataset.comp || el.dataset.tag})`, el);
  });
  const errs = (screenEl._mq && screenEl._mq.errors) || [];
  [...new Set(errs)].forEach((e) => push('error', 'render', e));
  return issues;
}

export function lintProject(project) {
  const issues = [];
  const names = new Set(project.screens().map((s) => s.attrs.name));
  const comps = new Set(Object.keys(project.components));
  const compLinks = new Map(); // component -> Set(targets)
  const linkRe = /\b(go|overlay|swap|open)\s+("[^"]+"|[\w\-]+)/g;
  const collect = (n, out, used, owner) => {
    for (const [k, v] of Object.entries(n.attrs || {})) {
      const val = String(v);
      if (k.startsWith('on:') || k.startsWith('@')) {
        let m; linkRe.lastIndex = 0;
        while ((m = linkRe.exec(val))) {
          const target = m[2].replace(/"/g, '');
          if (target.includes('{')) continue;
          out.add(target);
          if (!names.has(target) && !(m[1] !== 'go' && comps.has(target))) issues.push({ level: 'error', code: 'broken-link', screen: owner, msg: `Lien cassé : ${m[1]} ${target} (écran introuvable)`, id: n.id });
        }
      } else {
        for (const nm of names) if (val.includes(`'${nm}'`) || val.includes(`"${nm}"`) || val.includes(`:${nm}`)) out.add(nm);
      }
    }
    if (/^[A-Z]/.test(n.tag)) used.add(n.tag);
    (n.children || []).forEach((c) => collect(c, out, used, owner));
  };
  for (const c of Object.values(project.components)) { if (c.fromKit) continue; const out = new Set(), used = new Set(); collect(c.node, out, used, '◆ ' + c.name); compLinks.set(c.name, { out, used }); }
  const graph = new Map();
  for (const s of project.screens()) { const out = new Set(), used = new Set(); collect(s, out, used, s.attrs.name); const seen = new Set();
    const addComp = (name) => { if (seen.has(name)) return; seen.add(name); const cl = compLinks.get(name); if (!cl) return; cl.out.forEach((t) => out.add(t)); cl.used.forEach(addComp); };
    used.forEach(addComp); graph.set(s.attrs.name, out); }
  const start = project.startScreen();
  if (start && [...graph.values()].some((x) => x.size)) {
    const seen = new Set([start.attrs.name]); const q = [start.attrs.name];
    while (q.length) { const s = q.shift(); for (const t of graph.get(s) || []) if (!seen.has(t) && names.has(t)) { seen.add(t); q.push(t); } }
    for (const n of names) if (!seen.has(n)) issues.push({ level: 'info', code: 'unreachable', screen: n, msg: `Écran « ${n} » inaccessible depuis « ${start.attrs.name} »` });
  }
  // spacing scale
  const off = new Map();
  const scan = (n) => {
    for (const k of ['gap', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr']) {
      const v = n.attrs && n.attrs[k];
      if (typeof v === 'string' && /^\d+$/.test(v) && +v % 2 !== 0 && +v > 2) off.set(v, (off.get(v) || 0) + 1);
    }
    (n.children || []).forEach(scan);
  };
  project.pages.forEach(scan);
  if (off.size) issues.push({ level: 'info', code: 'spacing', msg: `Espacements hors grille de 4/8 : ${[...off.keys()].join(', ')}` });
  return issues;
}

export function formatIssues(issues) {
  if (!issues.length) return '✓ Aucun problème détecté';
  const icon = { error: '✖', warn: '⚠', info: 'ℹ' };
  return issues.map((i) => `${icon[i.level] || '-'} [${i.code}]${i.screen ? ' ' + i.screen + ':' : ''} ${i.msg}`).join('\n');
}
