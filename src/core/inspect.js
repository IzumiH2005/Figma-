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

// lint lives in lint.js (kept here for backwards-compatible imports)
export { lintScreen, lintProject, formatIssues, scoreIssues, applyFixes, fixSource, CATEGORIES } from './lint.js';
export { contrast } from './color.js';
