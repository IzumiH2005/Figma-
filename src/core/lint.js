// Design hygiene linter — rules distilled from UI design references (8-pt grid, WCAG, HIG/Material,
// "How to Design Better UI Components"). Every issue may carry a `fix` the editor/CLI can apply.
import { parseColor } from './project.js';
import { TYPESCALES } from './project.js';
import { contrast, deltaE, toOklch, hueDistance, mix, toHex } from './color.js';
import { patchSource, patchStyle } from './parse.js';
import { parseSpec } from './anim.js';

export const CATEGORIES = { a11y: 'Accessibilité', spacing: 'Espacement & grille', type: 'Typographie', color: 'Couleur', ux: 'Composants & UX', motion: 'Motion', proto: 'Prototype' };
const CAT = {
  contrast: 'a11y', 'contrast-ui': 'a11y', 'tap-target': 'a11y', 'tiny-text': 'a11y', 'body-size': 'a11y', 'input-label': 'a11y', 'link-style': 'a11y',
  'icon-gap': 'spacing', 'button-padding': 'spacing', misaligned: 'spacing', 'off-center': 'spacing', inset: 'spacing', escape: 'spacing', 'nested-radius': 'spacing', 'icon-size': 'ux', 'no-feedback': 'motion', 'edge-stroke': 'color',
  'off-grid': 'spacing', 'edge-margin': 'spacing', crowded: 'spacing', bounds: 'spacing', overflow: 'spacing',
  'type-scale': 'type', 'type-count': 'type', 'line-length': 'type', 'caps-long': 'type',
  hardcoded: 'color', 'pure-color': 'color', 'gradient-muddy': 'color', 'color-count': 'color', 'shadow-light': 'color',
  'multi-primary': 'ux', 'vague-label': 'ux', destructive: 'ux', asterisk: 'ux', 'thumb-zone': 'ux', 'card-height': 'ux', placeholder: 'ux',
  'broken-link': 'proto', unreachable: 'proto', 'overlay-escape': 'proto', 'smart-keys': 'motion', render: 'proto',
  'motion-linear': 'motion', 'motion-duration': 'motion', 'motion-settle': 'motion', 'motion-sync': 'motion', 'motion-loops': 'motion', 'motion-tempo': 'motion', 'motion-step': 'motion', 'transition-duration': 'motion',
};

function rel(el, root) {
  const r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
  const s = R.width / (root.offsetWidth || R.width) || 1;
  return { x: (r.left - R.left) / s, y: (r.top - R.top) / s, w: r.width / s, h: r.height / s };
}
function insideHScroll(el, root) {
  let n = el.parentElement;
  while (n && n !== root) { const cs = getComputedStyle(n); if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true; n = n.parentElement; }
  return false;
}
function blend(top, bottom) { const a = top[3]; return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]; }
export function effectiveBg(el, root, skipSelf = false) {
  const stack = [];
  let n = skipSelf ? el.parentElement : el;
  while (n) {
    const cs = getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'220\'')) return null;
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
const ownerNode = (el, project) => { let n = el; while (n && !(n.dataset && n.dataset.id)) n = n.parentElement; return n ? project.byId.get(n.dataset.id) : null; };
const label = (el) => el.dataset.key || el.dataset.comp || el.dataset.tag || 'élément';
const short = (t, n = 32) => { t = (t || '').trim().replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

const VAGUE = /^(cliquez ici|clique ici|click here|ici|here|ok|oui|non|yes|no|submit|go|lien|link|plus|more)$/i;
const DESTRUCTIVE = /\b(supprimer|effacer|delete|remove|retirer|désactiver|deactivate|résilier|annuler mon abonnement|vider)\b/i;

// ------------------------------------------------------------------ per-screen (needs DOM)
export function lintScreen(screenEl, project, screenNode) {
  const issues = [];
  const name = screenEl.dataset.screen;
  const ignored = String(screenNode.attrs['lint-ignore'] || '').split(/[\s,]+/).filter(Boolean);
  const layerIgnores = (el, code) => { for (let n = el && el.closest ? el.closest('[data-lint-ignore]') : null; n; n = n.parentElement && n.parentElement.closest('[data-lint-ignore]')) { const l = n.dataset.lintIgnore.split(/[\s,]+/); if (l.includes('*') || l.includes(code) || l.includes(CAT[code])) return true; } return false; };
  const push = (level, code, msg, el, fix) => ignored.includes(code) || ignored.includes(CAT[code]) || layerIgnores(el, code) ? null : issues.push({ level, code, cat: CAT[code] || 'ux', screen: name, msg, id: el && el.dataset ? (el.dataset.id || (ownerNode(el, project) || {}).id) : el && el.id, key: el && el.dataset ? el.dataset.key : undefined, fix });
  const W = screenEl.offsetWidth, H = screenEl.offsetHeight;
  const dev = project.sizeOf(screenNode).device;
  const kind = dev ? dev.kind : 'phone';
  const touch = kind === 'phone' || kind === 'watch' || kind === 'tablet';
  const minTap = !dev ? 44 : dev.punch ? 48 : kind === 'desktop' ? 32 : 44;
  const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0; };

  // --- text
  const sizes = new Map();
  screenEl.querySelectorAll('[data-tag="text"]').forEach((el) => {
    if (!visible(el) || !el.textContent.trim() || el.closest('.mq-statusbar')) return;
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === 'none' && el.closest('[data-comp]')) return; // composant désactivé : exempté (WCAG 1.4.3)
    const fs = parseFloat(cs.fontSize);
    const txt = el.textContent.trim();
    const t = short(txt);
    sizes.set(Math.round(fs * 2) / 2, (sizes.get(Math.round(fs * 2) / 2) || 0) + 1);
    if (fs < 11) push('warn', 'tiny-text', `Texte trop petit (${fs}px < 11) : « ${t} »`, el);
    else if (touch && fs < 14 && txt.length > 80) push('info', 'body-size', `Texte courant à ${fs}px : vise 14–17px pour un paragraphe (« ${t} »)`, el);
    const fg = parseColor(cs.color);
    if (fg && fg[3] > 0.05 && cs.webkitTextFillColor !== 'rgba(0, 0, 0, 0)' && cs.color !== 'rgba(0, 0, 0, 0)') {
      const bg = effectiveBg(el, screenEl);
      if (bg) {
        let op = 1; let n = el; while (n && n !== screenEl) { op *= parseFloat(getComputedStyle(n).opacity) || 1; n = n.parentElement; }
        const fgc = blend([fg[0], fg[1], fg[2], fg[3] * op], bg);
        const ratio = contrast(fgc, bg);
        const large = fs >= 24 || (fs >= 18.6 && +cs.fontWeight >= 700);
        const min = large ? 3 : 4.5;
        if (ratio < min) push(ratio < min - 1.3 ? 'error' : 'warn', 'contrast', `Contraste ${ratio.toFixed(2)}:1 < ${min}:1 (${large ? 'grand texte' : 'texte'}) pour « ${t} »`, el);
      }
    }
    if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.whiteSpace === 'nowrap') push('warn', 'overflow', `Texte coupé : « ${t} » (truncate, w=fill ou texte plus court)`, el);
    // line length: chars per line ≈ width / (0.5 · font-size)
    const lines = Math.max(1, Math.round(el.offsetHeight / (parseFloat(cs.lineHeight) || fs * 1.4)));
    const cpl = txt.length / lines;
    if (txt.length > 120 && cpl > 85) {
      const node = ownerNode(el, project);
      push('warn', 'line-length', `Lignes trop longues (~${Math.round(cpl)} caractères) : vise 45–75 pour « ${t} »`, el, node && node.tag === 'text' ? { id: node.id, attrs: { maxw: String(Math.round(fs * 34 / 4) * 4) } } : undefined);
    }
    if (cs.textTransform === 'uppercase' && txt.length > 40) push('info', 'caps-long', `Texte long en capitales : difficile à lire (« ${t} »)`, el);
    if (/\*\s*$/.test(txt) && txt.length < 40) push('info', 'asterisk', `« ${t} » : plutôt que l'astérisque, marque les champs facultatifs « (optionnel) »`, el);
    if (/lorem ipsum/i.test(txt)) push('info', 'placeholder', `Faux texte « ${t} » : utilise du contenu réel`, el);
  });
  // type scale on this screen
  const distinct = [...sizes.keys()].sort((a, b) => a - b);
  const maxSizes = kind === 'desktop' || W >= 1024 ? 9 : 7;
  if (distinct.length > maxSizes) push('warn', 'type-count', `${distinct.length} tailles de texte différentes (${distinct.join(', ')}) : vise ${maxSizes - 2}–${maxSizes} tailles issues d'une échelle`);
  const near = [];
  for (let i = 1; i < distinct.length; i++) if (distinct[i] - distinct[i - 1] <= 1 && distinct[i] < 30) near.push(`${distinct[i - 1]}/${distinct[i]}`);
  if (near.length) push('info', 'type-scale', `Tailles presque identiques (${near.join(', ')}) : la hiérarchie devient floue, fusionne-les`);

  // --- interactive elements
  const hots = [...screenEl.querySelectorAll('[data-hot]')].filter(visible);
  for (const el of hots) {
    if (el.closest('.mq-statusbar')) continue;
    const r = rel(el, screenEl);
    if (r.w > 0 && (r.w < minTap - 4 || r.h < minTap - 4)) push('warn', 'tap-target', `Zone tactile ${Math.round(r.w)}×${Math.round(r.h)} < ${minTap}×${minTap} (${label(el)})`, el);
    const cs = getComputedStyle(el);
    const bgc = parseColor(cs.backgroundColor);
    if (bgc && bgc[3] > 0.9 && cs.outlineStyle === 'none' && (cs.boxShadow === 'none' || !cs.boxShadow) && (el.dataset.comp === 'Button' || el.dataset.comp === 'IconButton')) {
      const pbg = effectiveBg(el, screenEl, true);
      if (pbg) { const ratio = contrast(bgc, pbg); if (ratio < 1.25 && el.dataset.kind !== 'secondary' && el.dataset.kind !== 'tonal') push('warn', 'contrast-ui', `Bouton qui se confond avec le fond (${ratio.toFixed(2)}:1) : contour, ombre ou fond plus contrasté (${label(el)})`, el); }
    }
  }
  // buttons: count primaries, vague & destructive labels
  const buttons = [...screenEl.querySelectorAll('[data-comp="Button"]')].filter(visible);
  const primaries = buttons.filter((b) => !b.dataset.kind || b.dataset.kind === 'primary');
  const repeated = new Set(primaries.map((b) => b.parentElement));
  if (primaries.length > 2 && !(repeated.size === 1)) push('info', 'multi-primary', `${primaries.length} boutons primaires sur l'écran : un seul CTA principal, les autres en secondary / ghost / link`);
  for (const b of buttons) {
    const txt = short(b.textContent, 40);
    if (VAGUE.test(txt.trim())) push('warn', 'vague-label', `Libellé vague « ${txt} » : utilise un verbe + résultat (« Supprimer le fichier », « Voir la démo »)`, b);
    const node = ownerNode(b, project);
    if (DESTRUCTIVE.test(txt) && b.dataset.kind !== 'danger' && b.dataset.kind !== 'link' && b.dataset.kind !== 'ghost' && b.dataset.kind !== 'secondary') push('warn', 'destructive', `Action destructrice « ${txt} » : style danger (rouge) et confirmation`, b, node && node.tag === 'Button' ? { id: node.id, attrs: { kind: 'danger' } } : undefined);
  }
  // inputs without label
  screenEl.querySelectorAll('[data-comp="Field"]').forEach((f) => { if (visible(f) && f._props && !f._props.label) push('warn', 'input-label', `Champ sans label visible (placeholder « ${short(f._props.placeholder || '', 24)} » seul) : ajoute label=`, f); });
  screenEl.querySelectorAll('input.mq-input, textarea.mq-input').forEach((inp) => {
    if (!visible(inp) || inp.closest('[data-comp="Field"],[data-comp="SearchBar"]')) return;
    let n = inp.parentElement, found = false;
    for (let k = 0; k < 3 && n && !found; k++, n = n.parentElement) if ([...n.querySelectorAll('.mq-text')].some((t) => t.compareDocumentPosition(inp) & Node.DOCUMENT_POSITION_FOLLOWING)) found = true;
    if (!found) push('warn', 'input-label', `Champ de saisie sans label (${inp.placeholder ? '« ' + short(inp.placeholder, 24) + ' »' : 'sans placeholder'})`, inp);
  });
  // thumb zone: forms on phones should keep the main CTA low
  if (kind === 'phone' && screenEl.querySelector('input.mq-input') && primaries.length) {
    const main = primaries[primaries.length - 1]; const r = rel(main, screenEl);
    if (r.y + r.h / 2 < H * 0.45) push('info', 'thumb-zone', `CTA « ${short(main.textContent, 24)} » dans le haut de l'écran : place-le dans la zone du pouce (bas)`, main);
  }

  // --- spacing / bounds
  screenEl.querySelectorAll('[data-id]').forEach((el) => {
    if (el.closest('.mq-overlay') || !visible(el)) return;
    const r = rel(el, screenEl);
    if (r.w > 0 && r.x + r.w > W + 1 && !insideHScroll(el, screenEl)) push('warn', 'bounds', `Dépasse l'écran à droite de ${Math.round(r.x + r.w - W)}px (${label(el)})`, el);
  });
  if (kind === 'phone') {
    const offenders = [...screenEl.querySelectorAll('[data-tag="text"]')].filter((el) => visible(el) && !insideHScroll(el, screenEl) && !el.closest('.mq-fixed') && !el.closest('.mq-statusbar')).filter((el) => { const r = rel(el, screenEl); return r.w > 0 && (r.x < 12 || r.x + r.w > W - 12) && el.textContent.trim().length > 2; });
    if (offenders.length) push('warn', 'edge-margin', `${offenders.length} texte(s) à moins de 12px du bord (ex. « ${short(offenders[0].textContent, 24)} ») : marge latérale ≥ 16px`, offenders[0]);
  }
  // crowded interactive siblings
  for (const el of hots) {
    const nx = el.nextElementSibling;
    if (!nx || !nx.dataset || !nx.dataset.hot || !visible(nx)) continue;
    const a = rel(el, screenEl), b = rel(nx, screenEl);
    const gap = Math.max(b.x - (a.x + a.w), b.y - (a.y + a.h));
    if (gap >= 0 && gap < 8 && touch) push('info', 'crowded', `Éléments cliquables collés (${Math.round(gap)}px) : ≥ 8px pour éviter les erreurs de tap (${label(el)})`, el);
  }
  // repeated cards with unequal heights in a row/grid
  const groups = new Map();
  screenEl.querySelectorAll('[data-comp], [data-id]').forEach((el) => {
    const p = el.parentElement; if (!p || !visible(el)) return;
    const pcs = getComputedStyle(p);
    const horiz = (pcs.display === 'flex' && pcs.flexDirection.startsWith('row')) || (pcs.display === 'grid' && pcs.gridTemplateColumns.split(' ').length > 1);
    if (!horiz) return;
    const k = (el.dataset.comp || el.dataset.id) + '@' + (p.dataset.id || '');
    if (!groups.has(k)) groups.set(k, { p, els: [] });
    groups.get(k).els.push(el);
  });
  for (const { p, els } of groups.values()) {
    if (els.length < 2) continue;
    const rows = new Map();
    for (const e of els) { const r = rel(e, screenEl); const key = Math.round(r.y / 4); if (!rows.has(key)) rows.set(key, []); rows.get(key).push(r.h); }
    for (const hs of rows.values()) {
      if (hs.length < 2) continue;
      const mn = Math.min(...hs), mx = Math.max(...hs);
      if (mx - mn > 6 && mn > 60 && getComputedStyle(p).alignItems !== 'stretch' && getComputedStyle(p).alignItems !== 'normal') {
        const pn = ownerNode(p, project);
        push('info', 'card-height', `Cartes voisines de hauteurs inégales (${Math.round(mn)}–${Math.round(mx)}px) : aligne-les (align=stretch) ou limite le texte (lines=2)`, p, pn && pn.children ? { id: pn.id, attrs: { align: 'stretch' } } : undefined);
        break;
      }
    }
  }

  // --- component anatomy (icon ↔ label, padding, nested radii, interactive feedback)
  const px = (v) => parseFloat(v) || 0;
  screenEl.querySelectorAll('.mq-icon, [data-tag="icon"]').forEach((ic) => {
    if (!visible(ic)) return;
    const row = ic.parentElement; if (!row) return;
    const rcs = getComputedStyle(row); if (!(rcs.display.includes('flex') && rcs.flexDirection.startsWith('row'))) return;
    const rr = rel(row, screenEl); if (rr.h > 72) return;
    const sib = [ic.previousElementSibling, ic.nextElementSibling].find((x) => x && x.dataset && x.dataset.tag === 'text' && visible(x) && x.textContent.trim());
    if (!sib) return;
    // a text that stretches (w=fill / grow) pushes a trailing icon to the far end: not an icon + label pair
    const scs = getComputedStyle(sib); if (parseFloat(scs.flexGrow) > 0 || rcs.justifyContent === 'space-between') return;
    const a = rel(ic, screenEl), t = rel(sib, screenEl); const fs = px(getComputedStyle(sib).fontSize) || 14;
    const gap = a.x < t.x ? t.x - (a.x + a.w) : a.x - (t.x + t.w);
    const ideal = Math.max(4, Math.min(12, Math.round((fs * 0.5) / 2) * 2));
    const node = row.dataset && row.dataset.id ? project.byId.get(row.dataset.id) : null;
    const fix = node && node.attrs.gap !== undefined && !/[{$]/.test(String(node.attrs.gap)) ? { id: node.id, attrs: { gap: String(ideal) } } : undefined;
    if (gap < 3.5) push('warn', 'icon-gap', `Icône collée au libellé (${Math.round(gap)}px) dans « ${short(sib.textContent, 24)} » : écart ≈ ${ideal}px (la moitié de la taille du texte)`, row, fix);
    else if (gap > Math.max(14, fs * 0.95)) push('info', 'icon-gap', `Icône éloignée du libellé (${Math.round(gap)}px) dans « ${short(sib.textContent, 24)} » : ≈ ${ideal}px les lit comme un tout (loi de proximité)`, row, fix);
    const ratio = a.h / fs;
    if (ratio < 0.85 || ratio > 1.8) push('info', 'icon-size', `Icône de ${Math.round(a.h)}px pour un texte de ${fs}px (« ${short(sib.textContent, 20)} ») : vise 1–1,5× la taille du texte`, ic);
  });
  for (const el of hots) {
    const cs = getComputedStyle(el); const r = rel(el, screenEl);
    const filled = (parseColor(cs.backgroundColor) || [0, 0, 0, 0])[3] > 0.05 || (cs.borderTopStyle !== 'none' && px(cs.borderTopWidth) > 0);
    const hasText = !!el.querySelector('[data-tag="text"]');
    if (filled && hasText && r.h <= 64 && cs.display.includes('flex') && cs.flexDirection.startsWith('row')) {
      const pl = px(cs.paddingLeft), pr = px(cs.paddingRight);
      if (Math.min(pl, pr) < 10 && r.w > r.h * 1.4) push('warn', 'button-padding', `Padding horizontal ${Math.round(Math.min(pl, pr))}px sur « ${short(el.textContent, 24)} » : ≥ 12–16px (≈ 2× le padding vertical) pour que le libellé respire`, el);
    }
    // feedback: an interactive surface with no hover/press state and no transition feels dead
    const hasStates = [...el.classList].some((c) => c.startsWith('mqs')) || el.querySelector('[class*="mqs"]');
    if (filled && !hasStates && !el.dataset.proto && el.dataset.comp !== undefined) push('info', 'no-feedback', `« ${label(el)} » ne réagit ni au survol ni à l'appui : ajoute motion=press (ou press:scale=0.97, hover:fill=…)`, el);
  }
  // nested radii: inner radius ≈ outer radius − padding (otherwise the corners look uneven)
  screenEl.querySelectorAll('[data-id], [data-comp]').forEach((el) => {
    if (!visible(el)) return;
    const cs = getComputedStyle(el); const R = px(cs.borderTopLeftRadius); const P = Math.min(px(cs.paddingTop), px(cs.paddingLeft));
    if (R < 8 || P <= 0 || P >= R) return; // corners only nest visibly when the padding is smaller than the radius
    const ch = [...el.children].find((c) => c.dataset && (c.dataset.id || c.dataset.comp) && visible(c));
    if (!ch) return; const ccs = getComputedStyle(ch); const r = px(ccs.borderTopLeftRadius);
    const a = rel(el, screenEl), b = rel(ch, screenEl);
    if (Math.abs(b.x - a.x - P) > 2 || Math.abs(b.y - a.y - P) > 2 || r < 2 || (parseColor(ccs.backgroundColor) || [0, 0, 0, 0])[3] < 0.05) return;
    const ideal = Math.max(0, R - P);
    if (r > ideal + 4) push('info', 'nested-radius', `Rayons imbriqués : le parent a ${Math.round(R)}px et ${Math.round(P)}px de padding, l'enfant devrait avoir ≈ ${Math.round(ideal)}px (il a ${Math.round(r)}px)`, ch);
  });

  // --- near misses: an overlay (selection indicator, highlight, badge) almost — but not exactly — on the box it tracks.
  // A 1–6px offset is never intentional: it reads as amateur (typical cause: an absolute layer ignores the parent's padding,
  // or a % width computed on the padding box). Geometry first; optical nudges (play glyph…) are opted out with lint-ignore.
  const isOverlay = (el) => { const cs = getComputedStyle(el); return cs.position === 'absolute' || (el.parentElement && el.parentElement.dataset && el.parentElement.dataset.tag === 'stack'); };
  const filledEl = (el) => (parseColor(getComputedStyle(el).backgroundColor) || [0, 0, 0, 0])[3] > 0.05;
  screenEl.querySelectorAll('[data-id], [data-tag]').forEach((el) => {
    if (!visible(el) || !filledEl(el) || !isOverlay(el) || el.closest('.mq-statusbar, .mq-clone')) return;
    const host = el.parentElement; if (!host) return;
    const a = rel(el, screenEl); if (a.w < 8 || a.h < 8) return;
    let best = null;
    host.querySelectorAll('[data-id], [data-tag]').forEach((c) => {
      if (c === el || el.contains(c) || c.contains(el) || !visible(c)) return;
      const b = rel(c, screenEl); if (b.w < 8 || b.h < 8) return;
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const inter = ix * iy, iou = inter / (a.w * a.h + b.w * b.h - inter);
      if (iou > 0.55 && (!best || iou > best.iou)) best = { c, b, iou };
    });
    if (!best) return;
    const { b } = best;
    const d = { x: a.x - b.x, y: a.y - b.y, r: a.x + a.w - (b.x + b.w), btm: a.y + a.h - (b.y + b.h) };
    const worst = Math.max(...Object.values(d).map(Math.abs));
    if (worst < 0.75 || worst > 6) return;
    // an even ring around the target (all four sides offset alike) is a halo / focus ring, not a miss
    if (Math.abs(d.x + d.r) < 0.75 && Math.abs(d.y + d.btm) < 0.75 && Math.abs(Math.abs(d.x) - Math.abs(d.y)) < 0.75) return;
    const f = (v) => (v > 0 ? '+' : '') + Math.round(v * 10) / 10;
    const pcs = getComputedStyle(host); const pad = Math.max(px(pcs.paddingTop), px(pcs.paddingLeft));
    const hint = getComputedStyle(el).position === 'absolute' && pad > 0 ? ` — un calque absolu se place sur la boîte du parent, padding (${Math.round(pad)}px) ignoré : place-le dans un conteneur interne ou ajoute l'inset` : '';
    push('warn', 'misaligned', `« ${label(el)} » est presque calé sur « ${label(best.c)} » mais décalé (gauche ${f(d.x)}, haut ${f(d.y)}, droite ${f(d.r)}, bas ${f(d.btm)} px)${hint}`, el);
  });
  // knob / thumb / handle hugging one side of its track: the inset along the track must equal the inset across it
  // (a switch thumb 4px from the top must sit 4px from the end too — absolute layers ignore the track's padding)
  screenEl.querySelectorAll('[data-id], [data-tag]').forEach((el) => {
    if (!visible(el) || !filledEl(el) || getComputedStyle(el).position !== 'absolute' || el.closest('.mq-clone')) return;
    const host = el.offsetParent || el.parentElement; if (!host || !host.dataset || !filledEl(host)) return;
    const a = rel(el, screenEl), h = rel(host, screenEl);
    if (a.w > h.w * 0.75 && a.h > h.h * 0.75) return;
    const t = a.y - h.y, b = h.y + h.h - (a.y + a.h), l = a.x - h.x, r = h.x + h.w - (a.x + a.w);
    if (Math.min(t, b, l, r) < -0.5) return; // badges / bursts deliberately overflow
    const f = (v) => Math.round(v * 10) / 10;
    // centred across the track (equal insets) → expect the same inset at the nearer end
    for (const [across1, across2, along1, along2, axis] of [[t, b, l, r, 'horizontal'], [l, r, t, b, 'vertical']]) {
      if (Math.abs(across1 - across2) > 0.75 || across1 < 1) continue;
      const near = Math.min(along1, along2);
      if (near > (axis === 'horizontal' ? a.w : a.h)) continue; // not hugging an end
      const diff = near - across1;
      if (Math.abs(diff) >= 0.75 && Math.abs(diff) <= 10) push('warn', 'inset', `« ${label(el)} » : ${f(across1)}px de marge sur un axe mais ${f(near)}px côté ${axis === 'horizontal' ? (l < r ? 'gauche' : 'droit') : (t < b ? 'haut' : 'bas')} dans « ${label(host)} » — un curseur garde le même inset partout (calque absolu : le padding du parent ne s'applique pas)`, el);
      break;
    }
  });
  // a layer that sticks out of the card / surface holding it (a long label pushing a switch out of its card…)
  const surfaceOf = (el) => { let n = el.parentElement; while (n && n !== screenEl) { const cs = getComputedStyle(n); if (/auto|scroll/.test(cs.overflowX + cs.overflowY) || n.classList.contains('mq-screen-body')) return null; if (filledEl(n) || cs.overflow !== 'visible') return n; n = n.parentElement; } return null; };
  const escapes = new Set();
  screenEl.querySelectorAll('[data-id], [data-tag]').forEach((el) => {
    if (!visible(el) || el.closest('.mq-statusbar, .mq-clone') || insideHScroll(el, screenEl)) return;
    const cs = getComputedStyle(el); if (cs.position === 'absolute' || cs.position === 'fixed') return;
    const host = surfaceOf(el); if (!host || host === screenEl) return;
    const a = rel(el, screenEl), h = rel(host, screenEl);
    const out = Math.max(h.x - a.x, a.x + a.w - (h.x + h.w), h.y - a.y, a.y + a.h - (h.y + h.h));
    if (out <= 1.5) return;
    for (let n = el.parentElement; n && n !== host; n = n.parentElement) if (escapes.has(n)) { escapes.add(el); return; } // report the outermost only
    escapes.add(el);
    push('warn', 'escape', `« ${short(label(el) === 'text' ? el.textContent : label(el), 28)} » sort de « ${label(host)} » de ${Math.round(out)}px : un texte en ligne doit pouvoir passer à la ligne (w=fill) et l'élément fixe garder sa taille`, el);
  });
  // single glyph / child almost centred in a small control (icon button, avatar, badge): 1–4px off reads as a bug
  screenEl.querySelectorAll('[data-id], [data-tag], [data-comp]').forEach((el) => {
    if (!visible(el) || el.closest('.mq-statusbar')) return;
    const a = rel(el, screenEl); if (a.w > 96 || a.h > 96 || a.w < 16 || a.h < 16) return;
    const kids = [...el.children].filter((c) => c.dataset && (c.dataset.id || c.dataset.tag) && visible(c) && getComputedStyle(c).position !== 'absolute');
    if (kids.length !== 1) return;
    const b = rel(kids[0], screenEl); if (b.w > a.w - 4 || b.h > a.h - 4) return;
    const ox = b.x + b.w / 2 - (a.x + a.w / 2), oy = b.y + b.h / 2 - (a.y + a.h / 2);
    const off = Math.max(Math.abs(ox), Math.abs(oy));
    if (off < 0.75 || off > 4) return;
    push('info', 'off-center', `« ${short(label(kids[0]), 20)} » est décentré de ${Math.round(ox * 10) / 10}, ${Math.round(oy * 10) / 10} px dans « ${label(el)} » (${Math.round(a.w)}×${Math.round(a.h)}) : centre-le (center) ou, si c'est une correction optique voulue, ignore la règle`, kids[0]);
  });

  // --- decorative hairlines: a border doubled by a shadow, or a light border on a surface whose fill already separates it
  // (Refactoring UI: use fewer borders — background contrast, shadow or space separate better; avoid double edges)
  const redundant = [];
  screenEl.querySelectorAll('[data-id], [data-comp]').forEach((el) => {
    if (!visible(el) || el.closest('.mq-statusbar')) return;
    // Maquette draws stroke= as a CSS outline (inside/center/outside), stroke-t/b/l/r as borders
    const cs = getComputedStyle(el); const useOutline = cs.outlineStyle === 'solid' && px(cs.outlineWidth) > 0;
    const bw = useOutline ? px(cs.outlineWidth) : (cs.borderTopStyle === 'solid' && px(cs.borderLeftWidth) === px(cs.borderTopWidth) ? px(cs.borderTopWidth) : 0);
    if (!bw || bw > 1.5) return;
    const comp = el.dataset.comp || '';
    if (/Field|Select|SearchBar|Input|Checkbox|Radio|Toggle|Textarea/i.test(comp) || el.querySelector('input,textarea') || el.offsetHeight <= 2 || el.offsetWidth <= 2) return; // functional strokes
    const bc = parseColor(useOutline ? cs.outlineColor : cs.borderTopColor); const bg = parseColor(cs.backgroundColor); if (!bc || !bg || bg[3] < 0.5) return; // outline-only (ghost/outline button): the stroke IS the shape
    const pbg = effectiveBg(el, screenEl, true); if (!pbg) return;
    const node = el.dataset.id ? project.byId.get(el.dataset.id) : null;
    const fix = node && node.attrs.stroke !== undefined && !/[{]/.test(String(node.attrs.stroke)) ? { id: node.id, attrs: { stroke: null } } : undefined;
    const sh = cs.boxShadow && cs.boxShadow !== 'none' ? [...cs.boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g)].some((m) => +m[3] >= 6) && !/inset/.test(cs.boxShadow) : false;
    // a 'hairline' = a border whose perceived difference with the surface is small (blended if translucent)
    const bcb = [bg[0] + (bc[0] - bg[0]) * bc[3], bg[1] + (bc[1] - bg[1]) * bc[3], bg[2] + (bc[2] - bg[2]) * bc[3], 1];
    const subtle = deltaE(bcb, bg) < 16;
    if (!subtle) return; // a strong, deliberate border (accent, selected state) is not decoration
    if (sh) { push('info', 'edge-stroke', `Contour + ombre sur « ${label(el)} » : le bord est dessiné deux fois (aspect délavé). Garde l'ombre, retire le liseré`, el, fix); return; }
    if (deltaE(bg, pbg) > 3) redundant.push({ el, fix });
  });
  if (redundant.length >= 3) push('warn', 'edge-stroke', `${redundant.length} surfaces ont un liseré clair alors que leur fond les détache déjà : retire-les (moins de bordures = interface plus calme ; garde-les pour un état, un champ ou une surface sans contraste)`, redundant[0].el, redundant[0].fix);
  for (const r of redundant.slice(redundant.length >= 3 ? 1 : 0)) push('info', 'edge-stroke', `Liseré superflu sur « ${label(r.el)} » : le fond suffit à séparer la surface`, r.el, r.fix);

  // --- colors & shadows
  const colors = new Set(); const shadowX = new Set();
  screenEl.querySelectorAll('[data-tag]').forEach((el) => {
    if (!visible(el)) return;
    const cs = getComputedStyle(el);
    for (const c of [cs.color, cs.backgroundColor]) { const p = parseColor(c); if (p && p[3] > 0.5) colors.add(toHex(p).slice(0, 7)); }
    if (cs.boxShadow && cs.boxShadow !== 'none' && !cs.boxShadow.includes('inset')) {
      for (const m of cs.boxShadow.matchAll(/\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g)) if (+m[3] > 0 && (Math.abs(+m[1]) > 0.5 || Math.abs(+m[2]) > 0.5)) shadowX.add(Math.sign(+m[1]) + ',' + Math.sign(+m[2]));
    }
  });
  if (colors.size > 14) push('info', 'color-count', `${colors.size} couleurs distinctes à l'écran : règle 60-30-10 (une primaire, des neutres, un accent)`);
  if (shadowX.size > 1) push('info', 'shadow-light', `Ombres orientées dans des directions différentes (${[...shadowX].join(' · ')}) : une seule source de lumière`);

  // --- motion (Illusion of Life / Animator's Survival Kit appliqués à l'interface)
  const anims = ((screenEl._mq && screenEl._mq.anims) || []).filter((x) => x.el && x.el.isConnected && visible(x.el));
  const entr = anims.filter((x) => x.kind === 'in').map((x) => { const sp = parseSpec(x.spec, 'in'); return { x, sp, start: (sp.delay || 0) + (x.delay || 0), dur: sp.duration * (x.durScale || 1) }; });
  const loops = anims.filter((x) => x.kind === 'loop').map((x) => ({ x, sp: parseSpec(x.spec, 'loop') }));
  const MOVING = new Set(['fade-up', 'fade-down', 'fade-left', 'fade-right', 'scale-in', 'zoom-in', 'pop', 'land', 'stretch-in', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'rotate-in', 'drop', 'grow', 'grow-up']);
  const srcFix = (x, mut) => { const node = ownerNode(x.el, project); return node && node.attrs && node.attrs.anim ? { id: node.id, attrs: { anim: mut(String(node.attrs.anim)) } } : undefined; };
  for (const e of entr) {
    const nm = label(e.x.el);
    if (e.sp.easing === 'linear' && MOVING.has(e.sp.name)) push('warn', 'motion-linear', `« ${e.sp.name} » en linéaire sur ${nm} : mouvement mécanique, utilise un slow in/out (smooth, expo, cushion)`, e.x.el, srcFix(e.x, (s) => s.replace(/\blinear\b/, 'smooth')));
    if (e.dur > 900 && e.sp.name !== 'count' && e.sp.name !== 'typewriter' && !(e.sp.name === 'reveal' && e.sp.easing === 'linear') /* a linear wipe tracks time: a progress bar, not an entrance */) push('warn', 'motion-duration', `Entrée de ${Math.round(e.dur)} ms sur ${nm} : en interface, vise 200–600 ms (le contenu doit se poser vite)`, e.x.el, srcFix(e.x, (s) => s.replace(/(^\S+\s+)(\d+)/, (m, a) => a + '600')));
    else if (e.dur < 120) push('info', 'motion-duration', `Entrée de ${Math.round(e.dur)} ms sur ${nm} : trop courte pour être lue (≥ 150 ms)`, e.x.el);
  }
  if (entr.length) {
    const end = Math.max(...entr.map((e) => e.start + e.dur));
    if (end > 1600) push('warn', 'motion-settle', `L'écran met ${Math.round(end)} ms à se poser : l'utilisateur attend. Réduis les délais ou le pas de cascade (vise < 1 200 ms)`);
    const groups = new Map();
    // copies of one clone (radial burst, repeated pattern) are one gesture: they count once
    const seenClone = new Set();
    for (const e of entr) {
      const wrap = e.x.el && e.x.el.parentElement && e.x.el.parentElement.classList.contains('mq-clone') ? e.x.el.parentElement : null;
      if (wrap) { if (seenClone.has(wrap)) continue; seenClone.add(wrap); }
      const k = `${e.sp.name}|${Math.round(e.start)}|${Math.round(e.dur)}`; groups.set(k, (groups.get(k) || 0) + 1);
    }
    const maxSame = Math.max(...groups.values());
    if (maxSame >= 5) push('info', 'motion-sync', `${maxSame} éléments partent exactement en même temps avec la même animation : décale-les (overlapping action, stagger) pour une entrée vivante`);
    const durs = new Set(entr.filter((e) => MOVING.has(e.sp.name)).map((e) => Math.round(e.dur / 50)));
    if (entr.length >= 6 && durs.size === 1) push('info', 'motion-tempo', `Toutes les entrées ont la même durée : joue avec le tempo (principal plus ample, détails plus vifs)`);
    const delays = entr.map((e) => e.start).sort((a, b) => a - b);
    let maxStep = 0; for (let i = 1; i < delays.length; i++) maxStep = Math.max(maxStep, delays[i] - delays[i - 1]);
    if (maxStep > 250 && delays.length > 2) push('info', 'motion-step', `Écart de ${Math.round(maxStep)} ms entre deux entrées : la cascade semble hachée (pas de 30–90 ms)`);
  }
  const visibleLoops = loops.filter((l) => l.sp.name !== 'spin' && l.sp.name !== 'shimmer' && l.sp.name !== 'moving-hold');
  if (visibleLoops.length > 2) push('warn', 'motion-loops', `${visibleLoops.length} animations en boucle visibles (${[...new Set(visibleLoops.map((l) => l.sp.name))].join(', ')}) : les actions secondaires se concurrencent, garde-en une (staging)`);

  const errs = (screenEl._mq && screenEl._mq.errors) || [];
  [...new Set(errs)].forEach((e) => push('error', 'render', e));
  return issues;
}

// ------------------------------------------------------------------ project-level (source only)
const SPACE_KEYS = ['gap', 'gapx', 'gapy', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr'];
const snap4 = (n) => (n <= 2 ? n : Math.round(n / 4) * 4);
const COLOR_KEYS = ['fill', 'bg', 'color', 'stroke', 'highlight', 'hover:fill', 'hover:color', 'press:fill'];

export function lintProject(project) {
  const issues = [];
  const push = (level, code, msg, extra = {}) => issues.push({ level, code, cat: CAT[code] || 'ux', msg, ...extra });
  const names = new Set(project.screens().map((s) => s.attrs.name));
  const comps = new Set(Object.keys(project.components));

  // links graph
  const compLinks = new Map();
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
          if (!names.has(target) && !(m[1] !== 'go' && comps.has(target))) push('error', 'broken-link', `Lien cassé : ${m[1]} ${target} (écran introuvable)`, { screen: owner, id: n.id });
          if (m[1] !== 'go' && /\bnoclose\b|\bmodal\b/.test(val) && comps.has(target)) {
            const src = JSON.stringify(project.components[target].node);
            if (!/\bclose\b|\bback\b/.test(src)) push('warn', 'overlay-escape', `Overlay « ${target} » ouvert sans fermeture possible (noclose et aucun bouton close)`, { screen: owner, id: n.id });
          }
        }
      } else for (const nm of names) if (val.includes(`'${nm}'`) || val.includes(`"${nm}"`) || val.includes(`:${nm}`)) out.add(nm);
    }
    if (/^(\w+\.)?[A-Z]/.test(n.tag)) used.add(n.tag);
    (n.children || []).forEach((c) => collect(c, out, used, owner));
  };
  for (const c of Object.values(project.components)) { if (c.fromKit || c.fromLib) continue; const out = new Set(), used = new Set(); collect(c.node, out, used, '◆ ' + c.name); compLinks.set(c.name, { out, used }); }
  const graph = new Map();
  for (const s of project.screens()) {
    const out = new Set(), used = new Set(); collect(s, out, used, s.attrs.name); const seen = new Set();
    const addComp = (nm) => { if (seen.has(nm)) return; seen.add(nm); const cl = compLinks.get(nm); if (!cl) return; cl.out.forEach((t) => out.add(t)); cl.used.forEach(addComp); };
    used.forEach(addComp); graph.set(s.attrs.name, out);
  }
  const start = project.startScreen();
  if (start && [...graph.values()].some((x) => x.size)) {
    const seen = new Set([start.attrs.name]); const q = [start.attrs.name];
    while (q.length) { const s = q.shift(); for (const t of graph.get(s) || []) if (!seen.has(t) && names.has(t)) { seen.add(t); q.push(t); } }
    for (const n of names) if (!seen.has(n)) push('info', 'unreachable', `Écran « ${n} » inaccessible depuis « ${start.attrs.name} »`, { screen: n });
  }

  // transitions between screens/states: durations & spacing
  const tVisit = (n, owner) => {
    for (const [k, v] of Object.entries(n.attrs || {})) {
      if (!k.startsWith('on:') && !k.startsWith('@')) continue;
      for (const step of String(v).split(';')) {
        const m = /\b(go|overlay|set|toggle|back)\b(.*)$/.exec(step); if (!m) continue;
        const ms = (m[2].match(/(?:^|\s)(\d+)(?:ms)?(?=\s|$)/) || [])[1];
        if (ms && m[1] !== 'set' && +ms > 800) push('warn', 'transition-duration', `Transition de ${ms} ms (${m[1]}) : au-delà de ~600 ms une navigation paraît lente`, { screen: owner, id: n.id, fix: { id: n.id, attrs: { [k]: String(v).replace(new RegExp('\\b' + ms + '\\b'), '500') } } });
        if (/\blinear\b/.test(m[2]) && /\b(smart|push|slide|ios|scale)/.test(m[2])) push('warn', 'motion-linear', `Transition linéaire (${m[1]}) : mouvement mécanique, utilise un easing`, { screen: owner, id: n.id, fix: { id: n.id, attrs: { [k]: String(v).replace(/\blinear\b/, 'smooth') } } });
      }
    }
    (n.children || []).forEach((c) => tVisit(c, owner));
  };
  for (const s of project.screens()) tVisit(s, s.attrs.name);
  Object.values(project.components).filter((c) => !c.fromKit && !c.fromLib).forEach((c) => tVisit(c.node, '◆ ' + c.name));

  // smart animate without shared layer names
  const keysOf = (n, acc = new Set()) => { if (n.attrs && (n.attrs.name || n.attrs.key) && n.tag !== 'screen' && n.tag !== 'icon') acc.add(String(n.attrs.name || n.attrs.key)); if (/^(\w+\.)?[A-Z]/.test(n.tag) && project.components[n.tag] && project.components[n.tag].root) keysOf(project.components[n.tag].root, acc); (n.children || []).forEach((c) => keysOf(c, acc)); return acc; };
  for (const s of project.screens()) {
    const walk = (n) => {
      for (const [k, v] of Object.entries(n.attrs || {})) {
        if (!k.startsWith('on:')) continue;
        const m = /\bgo\s+("[^"]+"|[\w\-]+)[^;]*\bsmart\b/.exec(String(v));
        if (!m) continue;
        const t = project.screen(m[1].replace(/"/g, ''));
        if (!t) continue;
        const a = keysOf(s), b = keysOf(t);
        if (![...a].some((x) => b.has(x))) push('warn', 'smart-keys', `Smart animate « ${s.attrs.name} → ${t.attrs.name} » sans calque commun : donne le même name= aux éléments à transformer`, { screen: s.attrs.name, id: n.id });
      }
      (n.children || []).forEach(walk);
    };
    walk(s);
  }

  // source-level hygiene: spacing grid, type scale, hardcoded colors, pure colors, muddy gradients
  const scale = TYPESCALES[project.typescale] || TYPESCALES.ui;
  const scaleSizes = [...new Set(Object.values(scale).map((x) => x[0]))].sort((a, b) => a - b);
  const ownTokens = Object.keys(project.tokens).filter((k) => !project.tokens[k]._kit);
  const tokenColors = [];
  for (const k of Object.keys(project.tokens)) { const v = project.token(k, 0); const c = parseColor(String(v)); if (c && c[3] >= 0.99) tokenColors.push([k, c]); }
  const nodeScreen = (id) => { const s = project.screenOf(id); return s ? s.attrs.name : undefined; };
  const isLiteral = (v) => typeof v === 'string' && !v.includes('$') && !v.includes('{');
  const visit = (n, inComp) => {
    const a = n.attrs || {};
    if (n.tag !== '#text' && n.tag !== 'tokens' && n.tag !== 'vars' && n.tag !== 'styles') {
      // spacing on the 4/8 grid
      for (const k of SPACE_KEYS) {
        const v = a[k]; if (!isLiteral(v)) continue;
        const parts = String(v).trim().split(/\s+/);
        if (!parts.every((p) => /^-?\d+(\.\d+)?$/.test(p) || p === 'auto' || p.startsWith('safe'))) continue;
        const bad = parts.filter((p) => /^\d/.test(p) && +p > 2 && +p % 4 !== 0);
        if (bad.length) { const fixed = parts.map((p) => (/^\d/.test(p) ? String(snap4(+p)) : p)).join(' '); push('info', 'off-grid', `${k}=${v} hors grille 4/8 → ${fixed}`, { id: n.id, screen: nodeScreen(n.id), fix: { id: n.id, attrs: { [k]: fixed } } }); }
      }
      for (const k of ['w', 'h', 'radius']) {
        const v = a[k]; if (!isLiteral(v) || !/^\d+$/.test(v)) continue;
        if (n.tag === 'screen' || n.tag === 'icon' || +v <= 2) continue;
        if (+v % 2 !== 0 && +v > 3) push('info', 'off-grid', `${k}=${v} impair : préfère un multiple de 4 → ${snap4(+v)}`, { id: n.id, screen: nodeScreen(n.id), fix: { id: n.id, attrs: { [k]: String(snap4(+v)) } } });
      }
      // font sizes off the type scale
      if (isLiteral(a.size) && /^\d+(\.\d+)?$/.test(a.size) && !['icon', 'ellipse', 'rect', 'box', 'spacer'].includes(n.tag) && !/^(\w+\.)?[A-Z]/.test(n.tag)) {
        const s = +a.size;
        if (!scaleSizes.includes(s)) {
          const nearest = scaleSizes.reduce((b, x) => (Math.abs(x - s) < Math.abs(b - s) ? x : b), scaleSizes[0]);
          if (Math.abs(nearest - s) <= 2) push('info', 'type-scale', `size=${s} hors échelle « ${project.typescale} » → ${nearest} (ou class=t-…)`, { id: n.id, screen: nodeScreen(n.id), fix: { id: n.id, attrs: { size: String(nearest) } } });
        }
      }
      // hard-coded colors
      for (const k of COLOR_KEYS) {
        const v = a[k]; if (!isLiteral(v)) continue;
        const str = String(v).trim();
        const c = parseColor(str.split(/\s+/).find((x) => parseColor(x)) || str);
        if (!c) {
          const stops = [...str.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => parseColor(m[0]));
          if (/^(linear|radial)\(/.test(str) && stops.length >= 2) {
            for (let i = 1; i < stops.length; i++) {
              const [, c1] = toOklch(stops[i - 1]), [, c2] = toOklch(stops[i]);
              if (c1 > 0.08 && c2 > 0.08 && hueDistance(stops[i - 1], stops[i]) > 110) { push('info', 'gradient-muddy', `Dégradé entre teintes éloignées (${toHex(stops[i - 1])} → ${toHex(stops[i])}) : choisis des teintes voisines ou ajoute un stop intermédiaire`, { id: n.id, screen: nodeScreen(n.id) }); break; }
            }
          }
          continue;
        }
        if (c[3] < 0.99) continue;
        const hex = toHex(c);
        if (ownTokens.length > 3) {
          let best = null;
          for (const [tk, tc] of tokenColors) { const d = deltaE(c, tc); if (!best || d < best.d) best = { k: tk, d }; }
          if (best && best.d < 2.5) { push('info', 'hardcoded', `${k}=${str} codé en dur : utilise $${best.k}`, { id: n.id, screen: nodeScreen(n.id), fix: { id: n.id, attrs: { [k]: str.replace(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i, '$' + best.k) } } }); continue; }
        }
        const [L, C] = toOklch(c);
        if ((hex === '#000000' || hex === '#000') && (k === 'fill' || k === 'bg' || k === 'color') && n.tag !== 'text' && project.token('primary')) {
          const pc = parseColor(project.token('primary'));
          if (pc) push('info', 'pure-color', `${k}=${str} noir pur : teinte-le avec la primaire (${toHex(mix(c, pc, 0.06))})`, { id: n.id, screen: nodeScreen(n.id), fix: { id: n.id, attrs: { [k]: toHex(mix(c, pc, 0.06)) } } });
        }
      }
    }
    (n.children || []).forEach((ch) => visit(ch, inComp || n.tag === 'component'));
  };
  project.pages.forEach((p) => visit(p, false));
  // classes in <styles>
  for (const [name, a] of Object.entries(project.styles)) {
    if (project.styleOrigin[name] !== 'project') continue;
    for (const k of SPACE_KEYS) {
      const v = a[k]; if (!isLiteral(v) || !/^\d+$/.test(String(v))) continue;
      if (+v > 2 && +v % 4 !== 0) push('info', 'off-grid', `.${name} { ${k}=${v} } hors grille 4/8 → ${snap4(+v)}`, { fix: { style: name, attrs: { [k]: String(snap4(+v)) } } });
    }
    if (isLiteral(a.size) && /^\d+(\.\d+)?$/.test(a.size) && !scaleSizes.includes(+a.size)) {
      const s = +a.size; const nearest = scaleSizes.reduce((b, x) => (Math.abs(x - s) < Math.abs(b - s) ? x : b), scaleSizes[0]);
      if (Math.abs(nearest - s) <= 2) push('info', 'type-scale', `.${name} { size=${s} } hors échelle « ${project.typescale} » → ${nearest}`, { fix: { style: name, attrs: { size: String(nearest) } } });
    }
  }
  Object.values(project.components).filter((c) => !c.fromKit && !c.fromLib).forEach((c) => visit(c.node, true));
  return issues;
}

// ------------------------------------------------------------------ score & fixes
const W = { error: 6, warn: 2.5, info: 0.6 };
export function scoreIssues(issues) {
  const byCode = new Map(); const cats = {};
  for (const k of Object.keys(CATEGORIES)) cats[k] = { name: CATEGORIES[k], penalty: 0, count: 0 };
  for (const i of issues) {
    const cat = i.cat || CAT[i.code] || 'ux';
    const p = W[i.level] || 0;
    const used = byCode.get(i.code) || 0;
    const add = Math.max(0, Math.min(p, 18 - used));
    byCode.set(i.code, used + add);
    cats[cat].penalty += add; cats[cat].count++;
  }
  const total = Object.values(cats).reduce((s, c) => s + c.penalty, 0);
  for (const c of Object.values(cats)) c.score = Math.max(0, Math.round(100 - c.penalty * 2.5));
  return { score: Math.max(0, Math.round(100 - total)), categories: cats };
}

// tree mode (editor): mutate nodes
export function applyFixes(project, issues) {
  let n = 0;
  for (const i of issues) {
    if (!i.fix) continue;
    if (i.fix.style) {
      const top = project.rootNode ? project.rootNode.children : project.nodes;
      for (const st of top.filter((x) => x.tag === 'styles')) { const before = st.raw; st.raw = patchStyle(st.raw, i.fix.style, i.fix.attrs); if (st.raw !== before) { n++; break; } }
      continue;
    }
    const node = project.byId.get(i.fix.id);
    if (!node) continue;
    for (const [k, v] of Object.entries(i.fix.attrs)) { if (v === null) delete node.attrs[k]; else node.attrs[k] = v; }
    n++;
  }
  return n;
}

// source mode (CLI): surgical text patches, keeps comments & formatting
export function fixSource(src, project, issues) {
  const edits = [];
  for (const i of issues) {
    if (!i.fix) continue;
    if (i.fix.style) { src = patchStyle(src, i.fix.style, i.fix.attrs); continue; }
    const node = project.byId.get(i.fix.id);
    if (node && node.pos !== undefined) edits.push({ pos: node.pos, attrs: i.fix.attrs });
  }
  // merge edits on the same element
  const byPos = new Map();
  for (const e of edits) byPos.set(e.pos, { pos: e.pos, attrs: { ...(byPos.get(e.pos) || { attrs: {} }).attrs, ...e.attrs } });
  return { source: patchSource(src, [...byPos.values()]), count: edits.length };
}

export function formatIssues(issues, withScore = false) {
  const icon = { error: '✖', warn: '⚠', info: 'ℹ' };
  let out = issues.length ? issues.map((i) => `${icon[i.level] || '-'} [${i.code}]${i.screen ? ' ' + i.screen + ':' : ''} ${i.msg}${i.fix ? '  ⚙ corrigeable' : ''}`).join('\n') : '✓ Aucun problème détecté';
  if (withScore) {
    const s = scoreIssues(issues);
    out += `\n\nScore d'hygiène : ${s.score}/100\n` + Object.values(s.categories).map((c) => `  ${c.name.padEnd(22)} ${String(c.score).padStart(3)}/100  (${c.count})`).join('\n');
  }
  return out;
}
