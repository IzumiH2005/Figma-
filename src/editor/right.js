// Right panel: Design / Prototype / Motion / Code / Lint inspectors
import { MQ, h, icon, clear, toast, ask } from './dom.js';
import { isContainer } from './state.js';
import { highlight } from './code.js';

const FONTS = ['Inter', 'Manrope', 'DM Sans', 'Plus Jakarta Sans', 'Space Grotesk', 'Sora', 'Outfit', 'Poppins', 'Figtree', 'Geist', 'Instrument Serif', 'Playfair Display', 'Fraunces', 'JetBrains Mono', 'Bricolage Grotesque', 'Unbounded'];
const WEIGHTS = [['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extrabold'], ['900', 'Black']];
const TRIGGERS = [['on:click', 'Au clic'], ['on:enter', 'Survol (entrée)'], ['on:leave', 'Survol (sortie)'], ['on:press', 'Appui'], ['on:longpress', 'Appui long'], ['on:swipe-left', 'Swipe ←'], ['on:swipe-right', 'Swipe →'], ['on:swipe-up', 'Swipe ↑'], ['on:swipe-down', 'Swipe ↓'], ['on:load', 'Au chargement'], ['on:after-2000', 'Après délai'], ['on:key-Enter', 'Touche clavier'], ['on:change', 'Saisie (input)']];
const TRANS = ['instant', 'dissolve', 'smart', 'ios', 'push', 'push-right', 'push-up', 'push-down', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale', 'flip'];
const EASES = ['smooth', 'expo', 'cushion', 'snap', 'spring', 'bouncy', 'snappy', 'gentle', 'back', 'in-out', 'out', 'in', 'linear', 'bounce'];

export class RightPanel {
  constructor(app, root, hooks) {
    this.app = app; this.root = root; this.hooks = hooks;
    this.tab = 'design';
  }

  render() {
    const app = this.app;
    const focus = document.activeElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.f : null;
    const scroll = this.body ? this.body.scrollTop : 0;
    clear(this.root);
    const tabs = [['design', 'Design'], ['proto', 'Prototype'], ['motion', 'Motion'], ['code', 'Code'], ['lint', 'Lint']];
    this.root.appendChild(h('div.ptabs', null, tabs.map(([k, l]) => h('button.ptab' + (this.tab === k ? '.on' : ''), { onclick: () => { this.tab = k; this.render(); } }, l, k === 'lint' && this.lintCount ? h('span.badge', null, this.lintCount) : null))));
    this.body = h('div.pbody');
    this.root.appendChild(this.body);
    const nodes = app.selNodes;
    if (this.tab !== 'lint' && this.hooks.setMarkers) this.hooks.setMarkers([]);
    if (this.tab === 'lint') this.lint();
    else if (!nodes.length) this.empty();
    else if (this.tab === 'design') this.design(nodes);
    else if (this.tab === 'proto') this.proto(nodes);
    else if (this.tab === 'motion') this.motion(nodes);
    else if (this.tab === 'code') this.code(nodes);
    this.body.scrollTop = scroll;
    if (focus) { const f = this.root.querySelector(`[data-f="${focus}"]`); if (f) f.focus(); }
  }

  empty() {
    const app = this.app; const p = app.project;
    const b = this.body;
    b.appendChild(sec('Projet', h('div.kv', null, h('span', null, 'Nom'), h('b', null, p.name)), h('div.kv', null, h('span', null, 'Écrans'), h('b', null, p.screens().length)), h('div.kv', null, h('span', null, 'Composants'), h('b', null, Object.values(p.components).filter((c) => !c.fromKit).length + ' (+ kit)')), h('div.kv', null, h('span', null, 'Modes'), h('b', null, p.modes.join(' · ')))));
    b.appendChild(sec('Raccourcis', ...[
      ['V / H', 'Déplacer / Main'], ['F R O T', 'Frame, Rect, Ellipse, Texte'], ['I N', 'Image, Note'], ['Ctrl+G', 'Grouper (stack)'], ['Maj+A', 'Auto layout (col)'], ['Ctrl+Alt+K', 'Créer un composant'],
      ['Ctrl+D', 'Dupliquer'], ['Alt+glisser', 'Dupliquer en déplaçant'], ['Alt+survol', 'Mesurer les distances'], ['Entrée / Maj+Entrée', 'Enfant / parent'], ['Maj+1 / Maj+2', 'Tout voir / sélection'], ['Maj+E', 'Mode prototype'], ['P / Maj+P', 'Plume / crayon'], ['S', 'Formes'], ['Entrée', 'Éditer les points'], ['Ctrl+E', 'Aplatir'], ['Ctrl+Entrée', 'Présenter'], ['Ctrl+/', 'Code complet'],
    ].map(([k, v]) => h('div.kv', null, h('kbd', null, k), h('span', null, v)))));
  }

  // ------------------------------------------------------------ design
  design(nodes) {
    const app = this.app; const b = this.body;
    const n = nodes[0]; const ids = nodes.map((x) => x.id);
    const multi = nodes.length > 1;
    const a = n.attrs;
    const set = (k, v) => app.change(() => app.setAttr(ids, k, v));
    const setMany = (obj) => app.change(() => { for (const [k, v] of Object.entries(obj)) app.setAttr(ids, k, v); });
    const comp = /^[A-Z]/.test(n.tag) ? app.project.components[n.tag] : null;
    const el = this.hooks.elOf(n.id);
    const cs = el ? getComputedStyle(el) : null;
    const parentEl = el && el.parentElement;
    const pcs = parentEl ? getComputedStyle(parentEl) : null;
    const inFlow = cs && cs.position !== 'absolute' && pcs && (pcs.display === 'flex' || (pcs.display === 'grid' && pcs.gridTemplateColumns.split(' ').length > 1));
    const topLevel = app.page && app.page.children.includes(n);

    // header
    b.appendChild(h('div.selhead', null,
      h('span.tagpill' + (comp ? '.comp' : ''), null, comp ? '◆ ' + n.tag : n.tag),
      multi ? h('span.muted', null, `${nodes.length} éléments`) : input('name', a.name || '', (v) => set('name', v || null), { placeholder: n.tag === 'screen' ? 'Nom de l\'écran' : 'Nom / clé smart-animate' })));

    if (comp && !multi) {
      const rows = Object.entries(comp.props).map(([k, def]) => {
        const cur = a[k];
        const isBool = typeof def === 'boolean';
        if (isBool) return h('div.prow', null, h('label', null, k), toggle(cur === true || cur === 'true' || (cur === undefined && def), (v) => set(k, v ? true : (def ? 'false' : null))));
        const opts = /:\s*([\w-]+(\|[\w-]+)+)/.exec((comp.desc.match(new RegExp(`${k}\\s*:\\s*[\\w|-]+`)) || [''])[0]);
        if (opts) return h('div.prow', null, h('label', null, k), select(opts[1].split('|').map((o) => [o, o]), cur ?? def, (v) => set(k, v === def ? null : v)));
        return h('div.prow', null, h('label', null, k), input('p-' + k, cur !== undefined && cur !== true ? cur : '', (v) => set(k, v === '' ? null : v), { placeholder: typeof def === 'object' ? JSON.stringify(def) : String(def) }));
      });
      b.appendChild(sec('Propriétés du composant', ...rows, comp.desc ? h('div.hint', null, comp.desc) : null, h('button.btn.ghost', { onclick: () => this.hooks.onEditComponent(n.tag) }, icon('pencil', 13), 'Éditer le composant')));
    }

    if (n.tag === 'screen' && !multi) {
      const size = app.project.sizeOf(n);
      b.appendChild(sec('Écran',
        h('div.prow', null, h('label', null, 'Appareil'), select([['', 'Personnalisé'], ...Object.keys(MQ.DEVICES).map((d) => [d, `${d} (${MQ.DEVICES[d].w}×${MQ.DEVICES[d].h})`])], a.device || '', (v) => setMany({ device: v || null, w: v ? null : size.w, h: v ? null : size.h }))),
        h('div.grid2', null, num('W', size.w, (v) => set('w', v)), num('H', size.h, (v) => set('h', v))),
        h('div.grid2', null, num('X', a.x ?? n._autoX ?? 0, (v) => set('x', v)), num('Y', a.y ?? 0, (v) => set('y', v))),
        h('div.prow', null, h('label', null, 'Écran de départ'), toggle(!!a.start, (v) => app.change(() => { for (const s of app.project.screens()) delete s.attrs.start; if (v) n.attrs.start = true; }))),
        h('div.prow', null, h('label', null, 'Barre d\'état'), select([['', 'Aucune'], ['true', 'Auto'], ['dark', 'Sombre'], ['light', 'Claire']], a.statusbar === true ? 'true' : a.statusbar || '', (v) => set('statusbar', v === 'true' ? true : v || null))),
        h('div.prow', null, h('label', null, 'Indicateur home'), toggle(!!a.homebar, (v) => set('homebar', v ? true : null)))));
    }

    // position & size
    if (n.tag !== 'screen') {
      const r = el ? { w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) } : { w: 0, h: 0 };
      const rows = [];
      if (!inFlow || topLevel) rows.push(h('div.grid2', null, num('X', a.x ?? (el ? el.offsetLeft : 0), (v) => set('x', v)), num('Y', a.y ?? (el ? el.offsetTop : 0), (v) => set('y', v))));
      else rows.push(h('div.hint', null, icon('move', 12), ' Dans un auto layout · ', h('a', { onclick: () => setMany({ absolute: true, x: el ? el.offsetLeft : 0, y: el ? el.offsetTop : 0 }) }, 'rendre absolu')));
      rows.push(h('div.grid2', null, sizeField('W', a.w, r.w, (v) => set('w', v)), sizeField('H', a.h, r.h, (v) => set('h', v))));
      rows.push(h('div.grid3', null, num('↻', a.rotate || 0, (v) => set('rotate', v || null), '°'), numOpt('min W', a.minw, (v) => set('minw', v)), numOpt('max W', a.maxw, (v) => set('maxw', v))));
      if (inFlow) rows.push(h('div.prow', null, h('label', null, 'Remplir l\'espace'), toggle(a.grow !== undefined, (v) => set('grow', v ? true : null))));
      b.appendChild(sec('Position & taille', ...rows));
    }

    // auto layout
    if (isContainer(n) || comp) {
      const lay = MQ.layoutOf(n.tag, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v])));
      const setLayout = (v) => app.change(() => { for (const id of ids) { const nn = app.node(id); for (const k of ['row', 'col', 'grid', 'stack', 'layout']) delete nn.attrs[k]; if (MQ.layoutOf(nn.tag, {}) !== v) nn.attrs[v] = true; } });
      const al = seg([['stack', 'layers', 'Libre (superposé)'], ['row', 'arrow-right', 'Ligne'], ['col', 'arrow-down', 'Colonne'], ['grid', 'grid-3x3', 'Grille']], lay, setLayout);
      const rows = [al];
      rows.push(h('div.grid2', null, numOpt('Gap', a.gap, (v) => set('gap', v), null, 'gap'), padField(a, set)));
      rows.push(alignMatrix(lay, a, setMany));
      if (lay === 'row' || lay === 'col') rows.push(h('div.prow', null, h('label', null, 'Répartir (space-between)'), toggle(a.justify === 'between' || a.gap === 'auto', (v) => setMany({ justify: v ? 'between' : null, gap: a.gap === 'auto' ? null : a.gap }))));
      if (lay === 'row') rows.push(h('div.prow', null, h('label', null, 'Retour à la ligne'), toggle(!!a.wrap, (v) => set('wrap', v ? true : null))));
      if (lay === 'grid') rows.push(h('div.prow', null, h('label', null, 'Colonnes'), input('cols', a.cols || '2', (v) => set('cols', v), { placeholder: '3 ou "1fr 2fr"' })));
      rows.push(h('div.grid2', null, h('div.prow', null, h('label', null, 'Rogner'), toggle(!!a.clip, (v) => set('clip', v ? true : null))), h('div.prow', null, h('label', null, 'Défilement'), select([['', '—'], ['y', 'Vertical'], ['x', 'Horizontal']], a.scroll || '', (v) => set('scroll', v || null)))));
      if (!comp) b.appendChild(sec('Auto layout', ...rows));
    }

    // appearance
    const app_rows = [h('div.grid2', null, num('Opacité', a.opacity !== undefined ? Math.round(+a.opacity * (+a.opacity <= 1 ? 100 : 1)) : 100, (v) => set('opacity', v >= 100 ? null : (v / 100).toFixed(2)), '%'), numOpt('Rayon', a.radius, (v) => set('radius', v), null, 'radius'))];
    b.appendChild(sec('Apparence', ...app_rows));
    if (n.tag !== 'text' && n.tag !== 'icon') b.appendChild(sec('Remplissage', colorField(app, a.fill ?? a.bg, (v) => set('fill', v), 'fill')));
    if (n.tag !== 'text' && n.tag !== 'icon') b.appendChild(sec('Contour', input('stroke', a.stroke || '', (v) => set('stroke', v || null), { placeholder: '1 $border inside', mono: true }), h('div.chips', null, ['1 $border', '1.5 $primary', '2 #000 dashed', '1 rgba(255,255,255,.12)'].map((v) => h('button.chip', { onclick: () => set('stroke', v) }, v)))));
    // ---- vector: shape parameters (rig), path, booleans, stroke details
    if (!multi && n.tag === 'shape') {
      const S = MQ.Path.SHAPES; const kind = a.kind || 'rect'; const def = (S[kind] || S.rect).params;
      const rows = [h('div.prow', null, h('label', null, 'Type'), select(MQ.Path.SHAPE_KINDS.map((k) => [k, k]), kind, (v) => { const keep = {}; for (const k of Object.keys(S[kind].params)) keep[k] = null; setMany({ ...keep, kind: v }); }))];
      const ks = Object.keys(def);
      for (let i = 0; i < ks.length; i += 2) rows.push(h('div.grid2', null, ...ks.slice(i, i + 2).map((k) => num(k, a[k] ?? def[k], (v) => set(k, v === def[k] ? null : v)))));
      if (kind === 'blob') rows.push(h('button.btn.ghost', { onclick: () => set('seed', Math.floor(Math.random() * 999)) }, icon('dices', 13), 'Nouvelle forme aléatoire'));
      rows.push(h('div.hint', null, 'Les losanges orange sur le canvas sont des poignées de rig : glisse-les. Double-clic ou Entrée : éditer les points.'));
      b.appendChild(sec('Forme', ...rows));
    }
    if (!multi && ['vector', 'shape', 'boolean', 'path'].includes(n.tag)) {
      const rows = [h('div.chips', null,
        h('button.chip', { onclick: () => this.hooks.editPoints(n.id) }, icon('spline', 12), ' Éditer les points'),
        n.tag !== 'vector' ? h('button.chip', { onclick: () => this.hooks.flatten(n.id) }, icon('layers-2', 12), ' Aplatir') : null,
        n.tag === 'vector' ? h('button.chip', { onclick: () => this.hooks.pathOp(n.id, 'smooth') }, icon('spline', 12), ' Lisser') : null,
        n.tag === 'vector' ? h('button.chip', { onclick: () => this.hooks.pathOp(n.id, 'simplify') }, icon('minimize-2', 12), ' Simplifier') : null,
        n.tag === 'vector' ? h('button.chip', { onclick: () => this.hooks.pathOp(n.id, 'flipx') }, icon('flip-horizontal-2', 12), ' Miroir H') : null,
        n.tag === 'vector' ? h('button.chip', { onclick: () => this.hooks.pathOp(n.id, 'flipy') }, icon('flip-vertical-2', 12), ' Miroir V') : null)];
      if (n.tag === 'boolean') rows.unshift(seg([['union', 'squares-unite', 'Union'], ['subtract', 'squares-subtract', 'Soustraire'], ['intersect', 'squares-intersect', 'Intersection'], ['exclude', 'squares-exclude', 'Exclure']], a.op || 'union', (v) => set('op', v)));
      rows.push(h('div.prow', null, h('label', null, 'Règle de remplissage'), select([['', 'nonzero'], ['evenodd', 'evenodd (contre-formes)']], a['fill-rule'] || '', (v) => set('fill-rule', v || null))));
      rows.push(h('div.grid2', null,
        h('div.prow', null, select([['', 'Extrémité'], ['round', 'Ronde'], ['square', 'Carrée'], ['butt', 'Plate']], a.cap || '', (v) => set('cap', v || null))),
        h('div.prow', null, select([['', 'Jointure'], ['round', 'Ronde'], ['bevel', 'Biseau'], ['miter', 'Angle']], a.join || '', (v) => set('join', v || null)))));
      rows.push(h('div.grid2', null,
        h('div.prow', null, select([['', 'Début'], ['arrow', 'Flèche'], ['triangle', 'Triangle'], ['circle', 'Cercle'], ['square', 'Carré'], ['bar', 'Barre']], a.start && a.start !== true ? a.start : '', (v) => set('start', v || null))),
        h('div.prow', null, select([['', 'Fin'], ['arrow', 'Flèche'], ['triangle', 'Triangle'], ['circle', 'Cercle'], ['square', 'Carré'], ['bar', 'Barre']], a.end || '', (v) => set('end', v || null)))));
      rows.push(h('div.prow', null, h('label', null, 'Pointillés'), input('dash', a.dash || '', (v) => set('dash', v || null), { placeholder: '6 4' })));
      rows.push(h('div.prow', null, h('label', null, 'Morph vers'), input('morph', a.morph || '', (v) => set('morph', v || null), { placeholder: 'blob seed=9 | heart', mono: true })));
      b.appendChild(sec(n.tag === 'boolean' ? 'Booléen & tracé' : 'Tracé', ...rows));
    }
    if (multi && nodes.every((x) => ['vector', 'shape', 'boolean', 'rect', 'ellipse', 'path'].includes(x.tag))) {
      b.appendChild(sec('Booléens', seg([['union', 'squares-unite', 'Union'], ['subtract', 'squares-subtract', 'Soustraire'], ['intersect', 'squares-intersect', 'Intersection'], ['exclude', 'squares-exclude', 'Exclure']], '', (v) => this.hooks.booleanOp(v)), h('div.hint', null, 'Le résultat reste un groupe <boolean> éditable ; « Aplatir » (Ctrl+E) le fige en vecteur.')));
    }
    // ---- pseudo-3D, masks, fusion
    if (!multi && n.tag !== 'screen') {
      const [rx = 0, ry = 0] = a.tilt && a.tilt !== 'pointer' && a.tilt !== true ? String(a.tilt).split(/\s+/).map(Number) : [];
      const [kx = 0, ky = 0] = a.skew ? String(a.skew).split(/\s+/).map(Number) : [];
      const rows = [
        h('div.grid2', null, num('Incl. X', rx, (v) => set('tilt', v || ry ? `${v} ${ry}` : null), '°'), num('Incl. Y', ry, (v) => set('tilt', v || rx ? `${rx} ${v}` : null), '°')),
        h('div.grid2', null, num('Biais X', kx, (v) => set('skew', v || ky ? `${v} ${ky}` : null), '°'), num('Biais Y', ky, (v) => set('skew', v || kx ? `${kx} ${v}` : null), '°')),
        h('div.grid2', null, numOpt('Profondeur', a.depth, (v) => set('depth', v)), numOpt('Perspective', a.perspective, (v) => set('perspective', v))),
        h('div.prow', null, h('label', null, 'Couleur de tranche'), colorField(app, a['depth-color'], (v) => set('depth-color', v), 'depth-color', true)),
        h('div.prow', null, h('label', null, 'Suit le pointeur'), toggle(a.tilt === 'pointer', (v) => set('tilt', v ? 'pointer' : null))),
        h('div.chips', null, [['Carte posée', { tilt: '24 0', depth: null }], ['Isométrique', { tilt: '55 0 -45', depth: '8' }], ['Relief', { depth: '6', 'depth-color': null }], ['Aucun', { tilt: null, skew: null, depth: null, perspective: null, 'depth-color': null }]].map(([l, v]) => h('button.chip', { onclick: () => setMany(v) }, l))),
      ];
      b.appendChild(sec('3D', ...rows));
      const mrows = [h('div.prow', null, h('label', null, 'Masque'), input('mask', a.mask || '', (v) => set('mask', v || null), { placeholder: 'star points=6 · fade bottom', mono: true })),
        h('div.chips', null, ['circle', 'squircle', 'blob seed=4', 'star points=8 inner=0.7', 'fade bottom', 'fade edges'].map((v) => h('button.chip', { onclick: () => set('mask', v) }, v)))];
      if (isContainer(n)) mrows.push(h('div.prow', null, h('label', null, 'Fusion goo (métaballes)'), numOpt('force', a.goo === true ? 10 : a.goo, (v) => set('goo', v))));
      b.appendChild(sec('Masque & fusion', ...mrows));
    }
    b.appendChild(sec('Effets',
      h('div.prow', null, h('label', null, 'Ombre'), select([['', 'Aucune'], ['xs', 'XS'], ['sm', 'S'], ['md', 'M'], ['lg', 'L'], ['xl', 'XL'], ['2xl', '2XL'], ['inner', 'Intérieure'], ['custom', 'Personnalisée…']], ['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'inner'].includes(a.shadow) || !a.shadow ? a.shadow || '' : 'custom', async (v) => { if (v === 'custom') { const c = await ask('Ombre personnalisée', a.shadow || '0 8 24 rgba(0,0,0,.2)', 'x y flou [étendue] couleur ; plusieurs ombres séparées par +'); if (c) set('shadow', c); } else set('shadow', v || null); })),
      h('div.grid2', null, numOpt('Flou', a.blur, (v) => set('blur', v)), numOpt('Flou fond', a.bgblur, (v) => set('bgblur', v))),
      h('div.prow', null, h('label', null, 'Fusion'), select([['', 'Normal'], ['multiply', 'Produit'], ['screen', 'Superposition'], ['overlay', 'Incrustation'], ['soft-light', 'Lumière douce'], ['difference', 'Différence'], ['color-dodge', 'Densité -']], a.blend || '', (v) => set('blend', v || null)))));

    // typography
    if (n.tag === 'text' || isContainer(n) || comp) {
      const fs = cs ? Math.round(parseFloat(cs.fontSize)) : 15;
      const projFonts = app.project.fonts.map((f) => f.split(':')[0]);
      const rows = [
        h('div.prow', null, h('label', null, 'Police'), select([['', '— hérité —'], ...[...new Set([...projFonts, ...FONTS])].map((f) => [f, f])], a.font || '', (v) => { set('font', v || null); if (v) this.hooks.ensureFont(v); })),
        h('div.grid2', null, num('Taille', a.size ?? fs, (v) => set('size', v)), h('div.prow', null, select([['', 'Graisse'], ...WEIGHTS], a.weight || '', (v) => set('weight', v || null)))),
        h('div.grid2', null, numOpt('Interligne', a.lh, (v) => set('lh', v)), numOpt('Interlettre', a.ls, (v) => set('ls', v))),
        h('div.prow', null, h('label', null, 'Couleur'), colorField(app, a.color, (v) => set('color', v), 'color', true)),
      ];
      if (n.tag === 'text') {
        rows.push(seg([['left', 'text-align-start', 'Gauche'], ['center', 'text-align-center', 'Centre'], ['right', 'text-align-end', 'Droite'], ['justify', 'text-align-justify', 'Justifié']], a.align || 'left', (v) => set('align', v === 'left' ? null : v)));
        rows.push(h('div.chips', null, [['upper', 'AA'], ['italic', 'I'], ['underline', 'U'], ['strike', 'S'], ['truncate', '…'], ['nowrap', '↔'], ['tabular', '123'], ['balance', '⚖']].map(([k, l]) => h('button.chip' + (a[k] ? '.on' : ''), { title: k, onclick: () => set(k, a[k] ? null : true) }, l))));
        rows.push(h('div.grid2', null, numOpt('Lignes max', a.lines, (v) => set('lines', v)), h('span')));
        rows.push(h('div.prow', null, h('label', null, 'Dégradé de texte'), input('tfill', a.fill || '', (v) => set('fill', v || null), { placeholder: 'linear(90, #f0f, #0ff)', mono: true })));
      }
      b.appendChild(sec('Texte', ...rows));
    }
    if (n.tag === 'icon') b.appendChild(sec('Icône', h('div.prow', null, h('label', null, 'Nom'), iconPicker(a.name || '', (v) => set('name', v))), h('div.grid2', null, num('Taille', a.size || 20, (v) => set('size', v)), num('Trait', a.stroke || 2, (v) => set('stroke', v === 2 ? null : v))), h('div.prow', null, h('label', null, 'Couleur'), colorField(app, a.color, (v) => set('color', v), 'color', true)), h('div.prow', null, h('label', null, 'Remplie'), toggle(!!a.fill, (v) => set('fill', v ? 'currentColor' : null)))));
    if (n.tag === 'image') b.appendChild(sec('Image', h('div.prow', null, h('label', null, 'Source'), input('src', a.src || '', (v) => set('src', v), { placeholder: 'gen:mountains/3, avatar:Nom, url, data:', mono: true })), h('div.chips', null, MQ.SCENE_NAMES.slice(0, 12).map((s) => h('button.chip', { onclick: () => set('src', `gen:${s}/${Math.floor(Math.random() * 99)}`) }, s))), h('div.prow', null, h('label', null, 'Ajustement'), select([['', 'Couvrir'], ['contain', 'Contenir'], ['fill', 'Étirer']], a.fit || '', (v) => set('fit', v || null)))));

    const alignSec = this.alignSection(nodes);
    if (alignSec) b.insertBefore(alignSec, b.children[1] || null);
    if (!multi && (isContainer(n) || n.tag === 'screen')) { b.appendChild(this.colorsSection(n)); b.appendChild(this.typeSection(n)); }
    // raw attributes
    if (!multi) b.appendChild(this.attrTable(n));
  }

  // ------------------------------------------------------------ align / distribute (absolute & top-level items)
  alignSection(nodes) {
    const app = this.app;
    const items = nodes.map((n) => {
      const top = app.page && app.page.children.includes(n);
      const el = top ? this.hooks.itemEl(n.id) : this.hooks.elOf(n.id);
      if (!el) return null;
      const abs = top || getComputedStyle(el).position === 'absolute';
      if (!abs) return null;
      const z = app.zoom; const r = el.getBoundingClientRect();
      return { n, el, top, x: top ? parseFloat(el.style.left) || 0 : (+n.attrs.x || el.offsetLeft), y: top ? parseFloat(el.style.top) || 0 : (+n.attrs.y || el.offsetTop), w: r.width / z, h: r.height / z, pw: top ? 0 : (el.offsetParent || el.parentElement).clientWidth, ph: top ? 0 : (el.offsetParent || el.parentElement).clientHeight };
    }).filter(Boolean);
    if (!items.length || (nodes.length === 1 && items[0].top)) return null;
    const single = items.length === 1;
    const apply = (fn) => app.change(() => { for (const it of items) { const p = fn(it); for (const k of ['right', 'bottom', 'place', 'inset']) delete it.n.attrs[k]; if (p.x !== undefined) it.n.attrs.x = String(Math.round(p.x)); if (p.y !== undefined) it.n.attrs.y = String(Math.round(p.y)); } });
    const minX = single ? 0 : Math.min(...items.map((i) => i.x)), maxX = single ? items[0].pw : Math.max(...items.map((i) => i.x + i.w));
    const minY = single ? 0 : Math.min(...items.map((i) => i.y)), maxY = single ? items[0].ph : Math.max(...items.map((i) => i.y + i.h));
    const btn = (ic, title, fn) => h('button', { title, onclick: fn }, icon(ic, 15));
    const distribute = (axis) => {
      const s = [...items].sort((a, b) => a[axis] - b[axis]); const size = axis === 'x' ? 'w' : 'h';
      const total = s.reduce((t, i) => t + i[size], 0); const span = (axis === 'x' ? maxX - minX : maxY - minY) - total; const gap = span / Math.max(1, s.length - 1);
      let cur = axis === 'x' ? minX : minY; const pos = new Map(); for (const i of s) { pos.set(i, cur); cur += i[size] + gap; }
      apply((i) => (axis === 'x' ? { x: pos.get(i) } : { y: pos.get(i) }));
    };
    const tidy = () => {
      const s = [...items].sort((a, b) => a.y - b.y || a.x - b.x); const cols = Math.ceil(Math.sqrt(s.length)); const gap = 24; const cw = Math.max(...s.map((i) => i.w)), ch = Math.max(...s.map((i) => i.h));
      const pos = new Map(); s.forEach((i, k) => pos.set(i, { x: minX + (k % cols) * (cw + gap), y: minY + Math.floor(k / cols) * (ch + gap) })); apply((i) => pos.get(i));
    };
    return sec(single ? 'Aligner dans le parent' : `Aligner ${items.length} éléments`, h('div.alignbar', null,
      btn('align-start-vertical', 'Aligner à gauche', () => apply(() => ({ x: minX }))),
      btn('align-center-vertical', 'Centrer horizontalement', () => apply((i) => ({ x: (minX + maxX) / 2 - i.w / 2 }))),
      btn('align-end-vertical', 'Aligner à droite', () => apply((i) => ({ x: maxX - i.w }))),
      btn('align-start-horizontal', 'Aligner en haut', () => apply(() => ({ y: minY }))),
      btn('align-center-horizontal', 'Centrer verticalement', () => apply((i) => ({ y: (minY + maxY) / 2 - i.h / 2 }))),
      btn('align-end-horizontal', 'Aligner en bas', () => apply((i) => ({ y: maxY - i.h }))),
      !single ? btn('align-horizontal-distribute-center', 'Répartir horizontalement', () => distribute('x')) : null,
      !single ? btn('align-vertical-distribute-center', 'Répartir verticalement', () => distribute('y')) : null,
      !single ? btn('layout-grid', 'Ranger en grille (tidy up)', tidy) : null));
  }

  // ------------------------------------------------------------ selection colors (Figma « Selection colors » + tokens)
  colorsSection(n) {
    const app = this.app; const p = app.project;
    const KEYS = ['fill', 'bg', 'color', 'stroke', 'hover:fill', 'press:fill', 'highlight'];
    const uses = new Map();
    const walk = (x) => { for (const k of KEYS) { const v = x.attrs && x.attrs[k]; if (typeof v !== 'string' || v.includes('{')) continue; const m = v.match(/\$[\w\-.]+(\/\d+)?|#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || []; for (const c of m) { if (!uses.has(c)) uses.set(c, []); uses.get(c).push([x, k]); } } (x.children || []).forEach(walk); };
    walk(n);
    if (!uses.size) return sec('Couleurs de la sélection', h('div.hint', null, 'Aucune couleur définie directement ici.'));
    const tokenColors = Object.keys(p.tokens).map((k) => [k, MQ.parseColor(String(p.token(k, app.mode)))]).filter(([, c]) => c && c[3] >= 0.99);
    const replaceAll = (from, to) => app.change(() => { for (const [x, k] of uses.get(from)) x.attrs[k] = x.attrs[k].split(from).join(to); });
    const rows = [...uses.entries()].sort((a, b) => b[1].length - a[1].length).map(([c, list]) => {
      const isTok = c.startsWith('$');
      const resolved = isTok ? p.token(c.slice(1).split('/')[0], app.mode) : c;
      const rc = MQ.parseColor(String(resolved || ''));
      let near = null;
      if (!isTok && rc) for (const [k, tc] of tokenColors) { const d = MQ.Color.deltaE(rc, tc); if (d < 3 && (!near || d < near.d)) near = { k, d }; }
      const pick = h('input', { type: 'color', class: 'hiddenpick' });
      if (rc) pick.value = MQ.Color.toHex(rc).slice(0, 7).toLowerCase();
      pick.addEventListener('change', () => replaceAll(c, pick.value.toUpperCase()));
      return h('div.selcolor', null,
        h('span.swatch', { style: { background: rc ? MQ.Color.toCss(rc) : '#ccc' }, title: 'Remplacer partout', onclick: () => pick.click() }), pick,
        h('span.scval' + (isTok ? '.tok' : ''), null, c), h('span.sccount', null, '×' + list.length),
        !isTok && near ? h('button.chip', { title: `Remplacer par $${near.k}`, onclick: () => replaceAll(c, '$' + near.k) }, '→ $' + near.k) : null,
        !isTok && !near ? h('button.chip', { title: 'Créer un token et l\'utiliser', onclick: async () => { const name = await ask('Nom du nouveau token', 'accent', `Remplacera ${c} (${list.length} usage(s)) par $nom`); if (!name) return; app.change(() => { const top = p.rootNode ? p.rootNode.children : p.nodes; let tok = top.find((t) => t.tag === 'tokens'); if (!tok) { tok = { id: MQ.newId(), tag: 'tokens', attrs: {}, children: [], raw: '' }; top.unshift(tok); } tok.raw = (tok.raw || '').replace(/\s*$/, '') + `\n${name}: ${c}\n`; for (const [x, k] of list) x.attrs[k] = x.attrs[k].split(c).join('$' + name); }); } }, '+ token') : null);
    });
    return sec('Couleurs de la sélection', ...rows, h('div.hint', null, 'Clique une pastille pour remplacer la couleur partout dans la sélection. Les couleurs codées en dur proches d\'un token peuvent y être rattachées.'));
  }

  typeSection(n) {
    const app = this.app;
    const uses = new Map();
    const walk = (x) => { const v = x.attrs && x.attrs.size; if (x.tag !== 'icon' && x.tag !== 'ellipse' && x.tag !== 'rect' && typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) && !/^[A-Z]/.test(x.tag)) { if (!uses.has(v)) uses.set(v, []); uses.get(v).push(x); } (x.children || []).forEach(walk); };
    walk(n);
    if (!uses.size) return h('span');
    const scale = MQ.TYPESCALES[app.project.typescale] || MQ.TYPESCALES.ui;
    const inScale = new Set(Object.values(scale).map((x) => String(x[0])));
    const rows = [...uses.entries()].sort((a, b) => +b[0] - +a[0]).map(([v, list]) => h('div.selcolor', null,
      h('span.tsize' + (inScale.has(v) ? '' : '.off'), { title: inScale.has(v) ? 'Dans l\'échelle' : 'Hors échelle' }, v), h('span.scval', null, Object.entries(scale).filter(([, s]) => String(s[0]) === v).map(([k]) => 't-' + k).join(', ') || 'hors échelle'), h('span.sccount', null, '×' + list.length),
      h('button.chip', { onclick: async () => { const nv = await ask(`Remplacer la taille ${v}`, v, `Échelle « ${app.project.typescale} » : ${[...inScale].sort((a, b) => a - b).join(', ')}`); if (nv && nv !== v) app.change(() => { for (const x of list) x.attrs.size = nv; }); } }, 'Remplacer')));
    return sec(`Typographie de la sélection (${uses.size} tailles)`, ...rows);
  }

  attrTable(n) {
    const app = this.app;
    const rows = Object.entries(n.attrs).map(([k, v]) => h('div.arow', null,
      h('input.ak', { value: k, onchange: (e) => app.change(() => { const nv = e.target.value.trim(); const val = n.attrs[k]; delete n.attrs[k]; if (nv) n.attrs[nv] = val; }) }),
      h('input.av', { value: v === true ? '' : v, placeholder: v === true ? '(drapeau)' : '', onchange: (e) => app.change(() => { n.attrs[k] = e.target.value === '' ? true : e.target.value; }) }),
      h('button.mini', { title: 'Supprimer', onclick: () => app.change(() => { delete n.attrs[k]; }) }, icon('x', 12))));
    const add = h('div.arow.add', null,
      h('input.ak', { placeholder: 'attribut', dataset: { f: 'newk' } }),
      h('input.av', { placeholder: 'valeur', onkeydown: (e) => { if (e.key === 'Enter') { const k = e.target.previousSibling.value.trim(); if (k) app.change(() => { n.attrs[k] = e.target.value === '' ? true : e.target.value; }); } } }),
      h('span'));
    return sec('Tous les attributs', h('div.atable', null, rows, add), h('div.hint', null, 'Tout est éditable ici : n\'importe quel attribut du langage (hover:fill, anim, on:click, css…).'));
  }

  // ------------------------------------------------------------ prototype
  proto(nodes) {
    const app = this.app; const b = this.body; const n = nodes[0];
    const screens = app.project.screens().map((s) => s.attrs.name);
    const comps = Object.keys(app.project.components);
    const evs = Object.entries(n.attrs).filter(([k]) => k.startsWith('on:') || k.startsWith('@'));
    const rows = evs.map(([k, v]) => this.interactionRow(n, k, String(v), screens, comps));
    b.appendChild(sec('Interactions', ...rows, h('button.btn', { onclick: () => app.change(() => { const free = TRIGGERS.find(([t]) => !n.attrs[t]); n.attrs[free ? free[0] : 'on:click'] = screens[0] ? `go ${q(screens.find((s) => s !== (app.project.screenOf(n.id) || {}).attrs?.name) || screens[0])} smart` : 'back'; }) }, icon('plus', 13), 'Ajouter une interaction'),
      h('div.hint', null, 'Astuce : en mode Prototype (Maj+E), tire la pastille bleue d\'un élément vers un écran pour créer un lien.')));
    if (n.tag === 'screen') b.appendChild(sec('Écran', h('div.prow', null, h('label', null, 'Écran de départ'), toggle(!!n.attrs.start, (v) => app.change(() => { for (const s of app.project.screens()) delete s.attrs.start; if (v) n.attrs.start = true; }))), h('button.btn', { onclick: () => this.hooks.play(n.attrs.name) }, icon('play', 13), 'Présenter depuis cet écran')));
    b.appendChild(sec('Référence actions', h('pre.ref', null, `go Écran [transition] [ms] [easing]
back | close | restart
overlay Nom [center|bottom|top|left|right] [dim=.5]
set $var = expr     toggle $var     inc $var
if $x > 2 then go A else go B
scroll clé | play clé shake | mode dark | wait 300
→ plusieurs actions : séparer par ;
transitions : ${TRANS.join(' ')}
easings : ${EASES.join(' ')}`)));
  }

  interactionRow(n, key, action, screens, comps) {
    const app = this.app;
    const set = (k, v) => app.change(() => { if (k !== key) delete n.attrs[key]; n.attrs[k] = v; });
    const m = /^(go|overlay)\s+("[^"]+"|\S+)\s*(.*)$/.exec(action.trim());
    const trig = TRIGGERS.find(([t]) => t === key) ? key : key;
    const trigSel = select(TRIGGERS.some(([t]) => t === key) ? TRIGGERS : [...TRIGGERS, [key, key]], trig, async (v) => { if (v === 'on:after-2000') { const ms = await ask('Délai (ms)', '2000'); v = 'on:after-' + (ms || 2000); } if (v === 'on:key-Enter') { const kk = await ask('Touche', 'Enter', 'Enter, ArrowRight, Escape, a…'); v = 'on:key-' + (kk || 'Enter'); } set(v, action); });
    const del = h('button.mini', { title: 'Supprimer', onclick: () => app.change(() => { delete n.attrs[key]; }) }, icon('trash-2', 13));
    let body;
    if (m || /^(back|close)(\s|$)/.test(action.trim())) {
      const kind = m ? m[1] : action.trim().split(/\s/)[0];
      const target = m ? m[2].replace(/"/g, '') : '';
      const rest = m ? m[3].split(/\s+/).filter(Boolean) : action.trim().split(/\s+/).slice(1);
      const tr = MQ.parseTransition(rest.filter((w) => !/=/.test(w) && !['center', 'bottom', 'top', 'left', 'right'].includes(w)));
      const pos = rest.find((w) => ['center', 'bottom', 'top', 'left', 'right'].includes(w)) || 'center';
      const flags0 = ['arc', 'overlap', 'smear'].filter((f) => tr[f]);
      const compose = (o) => {
        const k2 = o.kind ?? kind, t2 = o.target ?? target, tt = o.type ?? tr.type, d2 = o.dur ?? tr.duration, e2 = o.ease ?? tr.easing, p2 = o.pos ?? pos, fl = o.flags ?? flags0;
        if (k2 === 'back' || k2 === 'close') return k2 + (tt !== 'instant' && k2 === 'back' && o.type ? ' ' + tt : '');
        let s = `${k2} ${q(t2 || screens[0] || '')}`;
        if (k2 === 'overlay') s += ` ${p2}`;
        if (tt !== 'instant' || k2 === 'go') s += ` ${tt}`;
        if (d2 && d2 !== 300 && d2 !== 420 && d2 !== 380) s += ` ${d2}`;
        if (e2 && e2 !== 'smooth') s += ` ${e2}`;
        if (tt === 'smart' && fl.length) s += ' ' + fl.join(' ');
        return s;
      };
      body = h('div.ibody', null,
        h('div.grid2', null, select([['go', 'Naviguer vers'], ['overlay', 'Ouvrir overlay'], ['back', 'Retour'], ['close', 'Fermer overlay']], kind, (v) => set(key, compose({ kind: v }))),
          kind === 'go' || kind === 'overlay' ? select([...screens.map((s) => [s, s]), ...(kind === 'overlay' ? comps.map((c) => [c, '◆ ' + c]) : [])], target, (v) => set(key, compose({ target: v }))) : h('span')),
        kind === 'go' || kind === 'overlay' ? h('div.grid3', null, select(TRANS.map((t) => [t, t]), tr.type, (v) => set(key, compose({ type: v }))), num('ms', tr.duration, (v) => set(key, compose({ dur: v }))), select(EASES.map((e) => [e, e]), tr.easing, (v) => set(key, compose({ ease: v })))) : null,
        (kind === 'go') && tr.type === 'smart' ? h('div.chips', null, [['arc', 'Arc', 'Trajectoires courbes'], ['overlap', 'Overlap', 'Les éléments partent en léger décalé'], ['smear', 'Smear', 'Étirement + flou au milieu des grands déplacements']].map(([f, l, t]) => h('button.chip' + (flags0.includes(f) ? '.on' : ''), { title: t, onclick: () => set(key, compose({ flags: flags0.includes(f) ? flags0.filter((x) => x !== f) : [...flags0, f] })) }, l))) : null,
        kind === 'overlay' ? h('div.prow', null, h('label', null, 'Position'), select([['center', 'Centre'], ['bottom', 'Bas (sheet)'], ['top', 'Haut'], ['left', 'Gauche'], ['right', 'Droite']], pos, (v) => set(key, compose({ pos: v })))) : null);
    }
    const raw = input('act-' + key, action, (v) => set(key, v), { mono: true });
    return h('div.inter', null, h('div.ihead', null, icon('zap', 13), trigSel, del), body, h('div.iraw', null, raw));
  }

  // ------------------------------------------------------------ motion
  motion(nodes) {
    const app = this.app; const b = this.body; const n = nodes[0]; const ids = nodes.map((x) => x.id);
    const set = (k, v) => app.change(() => app.setAttr(ids, k, v));
    const sp = n.attrs.anim ? MQ.parseSpec(n.attrs.anim, 'in') : null;
    // timing (durée, délai) et spacing (courbe) sont deux décisions distinctes
    const compose = (o) => {
      const c = { name: sp?.name ?? 'fade-up', dur: sp?.duration ?? 450, delay: sp?.delay ?? 0, ease: sp?.easing ?? 'smooth', antic: !!sp?.antic && !sp?.snap, snap: !!sp?.snap, over: !!sp?.overshoot && !sp?.accent, arc: !!sp?.arc, accent: sp?.accent || '', ...o };
      const parts = [c.name, c.dur]; if (c.delay) parts.push('delay=' + c.delay);
      if (c.ease && c.ease !== 'smooth') parts.push(c.ease);
      if (c.antic) parts.push('anticipate'); if (c.snap) parts.push('snap'); if (c.over) parts.push('overshoot'); if (c.arc) parts.push('arc'); if (c.accent) parts.push(c.accent);
      return parts.join(' ');
    };
    const rows = [h('div.prow', null, h('label', null, 'Animation'), select([['', 'Aucune'], ...MQ.ENTRANCE.map((x) => [x, x]), ...Object.keys(app.project.keyframes).map((k) => [k, '★ ' + k])], sp ? sp.name : '', (v) => set('anim', v ? compose({ name: v }) : null)))];
    if (sp) {
      rows.push(h('div.mlabel', null, 'Timing', h('span', null, 'combien de temps')));
      rows.push(h('div.grid2', null, num('Durée', sp.duration, (v) => set('anim', compose({ dur: v })), 'ms'), num('Délai', sp.delay, (v) => set('anim', compose({ delay: v })), 'ms')));
      rows.push(h('div.mlabel', null, 'Spacing', h('span', null, 'comment le mouvement se répartit')));
      rows.push(h('div.chips', null, ['smooth', 'expo', 'cushion', 'snap', 'back', 'spring', 'bouncy', 'gentle', 'in-out', 'linear'].map((e) => h('button.chip' + (sp.easing === e ? '.on' : ''), { title: EASE_HELP[e] || e, onclick: () => set('anim', compose({ ease: e })) }, e))));
      rows.push(bezierEditor(sp.easing, (v) => set('anim', compose({ ease: v }))));
      rows.push(h('div.mlabel', null, 'Principes', h('span', null, 'Disney · Williams')));
      const flag = (label, key, on, help) => h('div.prow', { title: help }, h('label', null, label), toggle(on, (v) => set('anim', compose({ [key]: v, ...(key === 'snap' && v ? { antic: false } : {}), ...(key === 'antic' && v ? { snap: false } : {}) }))));
      rows.push(flag('Anticipation', 'antic', !!sp.antic && !sp.snap, 'Petit mouvement opposé, lent, avant l\'action (Williams : grammaire universelle)'));
      rows.push(flag('Anticipation invisible (snap)', 'snap', !!sp.snap, '1–2 images opposées sous le seuil de perception : donne du claquant'));
      rows.push(flag('Follow-through (dépassement)', 'over', !!sp.overshoot && !sp.accent, 'Dépasse légèrement la position finale puis revient'));
      rows.push(flag('Trajectoire en arc', 'arc', !!sp.arc, 'Les choses vivantes se déplacent en arcs, pas en lignes droites'));
      rows.push(h('div.prow', { title: 'Dur : rebond après contact (assertif). Doux : arrivée amortie sans rebond (posé).' }, h('label', null, 'Accent'), seg([['', 'circle-off', 'Aucun'], ['hard', 'zap', 'Dur (rebond)'], ['soft', 'feather', 'Doux (amorti)']], sp.accent || '', (v) => set('anim', compose({ accent: v, ease: v === 'hard' ? 'expo' : v === 'soft' ? 'cushion' : sp.easing })))));
    }
    b.appendChild(sec('Entrée (à l\'apparition)', ...rows));
    const lp = n.attrs.loop ? MQ.parseSpec(n.attrs.loop, 'loop') : null;
    b.appendChild(sec('Boucle', h('div.prow', null, h('label', null, 'Animation'), select([['', 'Aucune'], ...MQ.LOOPS.map((x) => [x, x === 'moving-hold' ? 'moving-hold (pose vivante)' : x])], lp ? lp.name : '', (v) => set('loop', v ? `${v}${lp ? ' ' + lp.duration : ''}` : null))), lp ? num('Durée', lp.duration, (v) => set('loop', `${lp.name} ${v}`), 'ms') : null, h('div.hint', null, 'Une seule boucle visible à la fois : une action secondaire ne doit jamais voler la vedette à l\'action principale.')));
    if (isContainer(n)) {
      const raw = n.attrs.stagger ? String(n.attrs.stagger).split(/\s+/) : null;
      const opt = (k, d) => { const m = raw && raw.find((x) => x.startsWith(k + '=')); return m ? m.split('=')[1] : d; };
      const plain = raw ? raw.filter((x) => !/^(from|drag)=/.test(x)) : [];
      const build = (o) => { const step = o.step ?? plain[0] ?? 60; const preset = o.preset ?? (plain.slice(1).join(' ') || 'fade-up 450'); const from = o.from ?? opt('from', 'start'); const drag = o.drag ?? opt('drag', '1'); return [step, preset, from !== 'start' ? 'from=' + from : '', +drag !== 1 ? 'drag=' + drag : ''].filter(Boolean).join(' '); };
      b.appendChild(sec('Cascade des enfants (overlapping action)', h('div.prow', null, h('label', null, 'Activer'), toggle(!!raw, (v) => set('stagger', v ? '60 fade-up 450' : null))),
        raw ? h('div.grid2', null, num('Pas', plain[0], (v) => set('stagger', build({ step: v })), 'ms'), select(MQ.ENTRANCE.map((x) => [x + ' 450', x]), (plain[1] || 'fade-up') + ' 450', (v) => set('stagger', build({ preset: v })))) : null,
        raw ? h('div.prow', null, h('label', null, 'Départ'), select([['start', 'Du premier'], ['end', 'Du dernier'], ['center', 'Du centre'], ['edges', 'Des bords'], ['random', 'Aléatoire']], opt('from', 'start'), (v) => set('stagger', build({ from: v })))) : null,
        raw ? num('Traîne (drag)', opt('drag', '1'), (v) => set('stagger', build({ drag: v })), '×') : null,
        h('div.hint', null, 'Pas de 30–90 ms. Traîne > 1 : chaque élément suivant dure un peu plus, comme une masse qui suit.')));
    }
    b.appendChild(sec('Survol / appui', h('div.grid2', null, numOpt('Échelle survol', n.attrs['hover:scale'], (v) => set('hover:scale', v)), numOpt('Échelle appui', n.attrs['press:scale'], (v) => set('press:scale', v))), h('div.prow', null, h('label', null, 'Remplissage survol'), colorField(app, n.attrs['hover:fill'], (v) => set('hover:fill', v), 'hfill'))));
    b.appendChild(h('div.pad', null, h('button.btn.primary', { onclick: () => this.hooks.previewMotion() }, icon('play', 13), 'Prévisualiser'), h('button.btn', { onclick: () => this.hooks.toggleTimeline() }, icon('gantt-chart', 13), 'Timeline & trajectoires')));
  }

  // ------------------------------------------------------------ code
  code(nodes) {
    const app = this.app; const n = nodes[0];
    const src = MQ.serializeNode(n);
    const ta = h('textarea.codearea', { spellcheck: 'false', value: src });
    const pre = h('pre.codehl'); pre.innerHTML = highlight(src) + '\n';
    const sync = () => { pre.innerHTML = highlight(ta.value) + '\n'; pre.scrollTop = ta.scrollTop; };
    ta.addEventListener('input', sync); ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
    const err = h('div.err');
    const apply = () => {
      try {
        const parsed = MQ.parse(ta.value).filter((x) => x.tag !== '#text');
        if (parsed.length !== 1) throw new Error('Un seul élément racine attendu');
        app.change(() => { const sib = app.siblings(n.id); const i = sib.indexOf(n); parsed[0].id = n.id; sib.splice(i, 1, parsed[0]); });
        toast('Code appliqué');
      } catch (e) { err.textContent = e.message; }
    };
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); apply(); } if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } });
    this.body.appendChild(h('div.codewrap', null, pre, ta));
    this.body.appendChild(err);
    this.body.appendChild(h('div.pad', null, h('button.btn.primary', { onclick: apply }, icon('check', 13), 'Appliquer (Ctrl+Entrée)'), h('button.btn', { onclick: () => { navigator.clipboard && navigator.clipboard.writeText(ta.value); toast('Copié'); } }, icon('copy', 13), 'Copier')));
    const el = this.hooks.elOf(n.id);
    if (el) {
      const css = [...el.style].map((p) => `  ${p}: ${el.style.getPropertyValue(p)};`).join('\n');
      this.body.appendChild(sec('CSS généré (handoff)', h('pre.ref', null, `.${(n.attrs.name || n.tag).replace(/\W+/g, '-')} {\n${css}\n}`)));
    }
  }

  // ------------------------------------------------------------ lint
  lint() {
    const app = this.app; const b = this.body;
    const all = this.hooks.runLint();
    this.lintCount = all.filter((i) => i.level !== 'info').length;
    this.hooks.setMarkers(all);
    const sc = MQ.scoreIssues(all);
    const ring = (v) => { const c = v >= 90 ? 'var(--ui-ok)' : v >= 75 ? 'var(--ui-warn)' : 'var(--ui-danger)'; return h('div.scorering', { style: { background: `conic-gradient(${c} ${v * 3.6}deg, var(--ui-line) 0)` } }, h('span', null, v)); };
    const cats = Object.entries(sc.categories);
    b.appendChild(h('div.scorebox', null, ring(sc.score), h('div.scoreinfo', null, h('b', null, 'Hygiène de la page'), h('span.muted', null, `${all.filter((i) => i.level === 'error').length} erreur(s) · ${all.filter((i) => i.level === 'warn').length} avertissement(s) · ${all.filter((i) => i.level === 'info').length} suggestion(s)`))));
    b.appendChild(h('div.catbars', null, cats.map(([k, c]) => h('button.catbar' + (this.lintCat === k ? '.on' : ''), { onclick: () => { this.lintCat = this.lintCat === k ? null : k; this.render(); } }, h('span.cname', null, c.name), h('span.cbar', null, h('i', { style: { width: c.score + '%', background: c.score >= 90 ? 'var(--ui-ok)' : c.score >= 75 ? 'var(--ui-warn)' : 'var(--ui-danger)' } })), h('span.cval', null, c.count ? String(c.count) : '✓')))));
    const issues = this.lintCat ? all.filter((i) => (i.cat || 'ux') === this.lintCat) : all;
    const fixable = issues.filter((i) => i.fix);
    b.appendChild(h('div.pad', null,
      h('button.btn', { onclick: () => this.render() }, icon('refresh-cw', 13), 'Relancer'),
      fixable.length ? h('button.btn.primary', { onclick: () => { app.change(() => MQ.applyFixes(app.project, fixable)); toast(`${fixable.length} correction(s) appliquée(s)`); } }, icon('wand-sparkles', 13), `Tout corriger (${fixable.length})`) : null,
      h('button.btn', { onclick: () => { this.showInfo = !this.showInfo; this.render(); } }, icon(this.showInfo ? 'eye-off' : 'eye', 13), this.showInfo ? 'Masquer les suggestions' : 'Voir les suggestions')));
    const shown = this.showInfo ? issues : issues.filter((i) => i.level !== 'info');
    if (!shown.length) { b.appendChild(h('div.okmsg', null, icon('check-circle-2', 16), issues.length ? `Aucune erreur. ${issues.length} suggestion(s) mineure(s) masquée(s).` : 'Aucun problème détecté.')); return; }
    const ic = { error: 'circle-x', warn: 'triangle-alert', info: 'info' };
    const order = { error: 0, warn: 1, info: 2 };
    for (const i of [...shown].sort((x, y) => order[x.level] - order[y.level])) b.appendChild(h('div.issue.' + i.level, { onclick: () => { if (i.id && app.node(i.id)) { app.select(i.id); this.hooks.focus(i.id); } } }, icon(ic[i.level], 14),
      h('div.ibody2', null, h('div.imsg', null, i.msg), h('div.imeta', null, `${MQ.CATEGORIES[i.cat] || ''} · ${i.code}${i.screen ? ' · ' + i.screen : ''}`)),
      i.fix ? h('button.btn.fixbtn', { title: 'Appliquer la correction', onclick: (e) => { e.stopPropagation(); app.change(() => MQ.applyFixes(app.project, [i])); } }, icon('wand-sparkles', 12), 'Corriger') : null,
      i.screen && app.project.screen(i.screen) ? h('button.mini', { title: `Ignorer « ${i.code} » sur cet écran (lint-ignore)`, onclick: (e) => { e.stopPropagation(); const s = app.project.screen(i.screen); app.change(() => { const cur = String(s.attrs['lint-ignore'] || '').split(/[\s,]+/).filter(Boolean); if (!cur.includes(i.code)) cur.push(i.code); s.attrs['lint-ignore'] = cur.join(','); }); } }, icon('eye-off', 12)) : null));
  }
}

// ------------------------------------------------------------ widgets
const q = (s) => (/\s/.test(s) ? JSON.stringify(s) : s);

export function sec(title, ...kids) { return h('div.sec', null, h('div.sectitle', null, title), h('div.secbody', null, kids)); }

function input(f, value, onCommit, opts = {}) {
  const el = h('input.inp' + (opts.mono ? '.mono' : ''), { value: value ?? '', placeholder: opts.placeholder || '', dataset: { f } });
  const commit = () => { if (el.value !== String(value ?? '')) onCommit(el.value.trim()); };
  el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { commit(); el.blur(); } if (e.key === 'Escape') { el.value = value ?? ''; el.blur(); } });
  el.addEventListener('blur', commit);
  return el;
}

function num(label, value, onCommit, unit) {
  const el = h('input.numinp', { value: value ?? '', dataset: { f: 'n-' + label } });
  const lab = h('span.nlabel', { title: 'Glisser pour ajuster' }, label);
  const wrap = h('label.num', null, lab, el, unit ? h('span.unit', null, unit) : null);
  const commit = () => { const v = el.value.trim(); if (v === String(value ?? '')) return; onCommit(/^-?\d+(\.\d+)?$/.test(v) ? +v : v); };
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { commit(); el.blur(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const n = parseFloat(el.value) || 0; el.value = String(+(n + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)).toFixed(2)); }
  });
  el.addEventListener('blur', commit);
  // scrubbing
  lab.addEventListener('pointerdown', (e) => {
    const start = e.clientX, v0 = parseFloat(el.value) || 0; lab.setPointerCapture(e.pointerId);
    const mv = (ev) => { el.value = String(Math.round(v0 + (ev.clientX - start) * (ev.shiftKey ? 10 : 1) / 2)); };
    const upf = () => { lab.removeEventListener('pointermove', mv); lab.removeEventListener('pointerup', upf); commit(); };
    lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', upf);
  });
  return wrap;
}
function numOpt(label, value, onCommit, unit, f) { return num(label, value ?? '', (v) => onCommit(v === '' ? null : v), unit); }

function sizeField(label, attr, computed, onCommit) {
  const mode = attr === 'fill' ? 'fill' : attr === 'hug' ? 'hug' : attr === undefined ? 'auto' : 'fixed';
  const n = num(label, mode === 'fixed' ? attr : computed, (v) => onCommit(v));
  if (mode !== 'fixed') n.querySelector('input').classList.add('dim');
  const sel = select([['fixed', 'Fixe'], ['fill', 'Remplir'], ['hug', 'Ajusté'], ['auto', 'Auto']], mode, (v) => onCommit(v === 'fixed' ? computed : v === 'auto' ? null : v));
  sel.classList.add('sizemode');
  return h('div.sizef', null, n, sel);
}

function padField(a, set) {
  const v = a.p ?? (a.px || a.py ? `${a.py || 0} ${a.px || 0}` : '');
  return h('label.num', null, h('span.nlabel', null, 'Pad'), h('input.numinp', { value: v, dataset: { f: 'pad' }, title: '16 · "12 20" · "safe 20 20"', onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); }, onchange: (e) => { const x = e.target.value.trim(); set('p', x || null); } }));
}

function select(opts, value, onChange) {
  const s = h('select.sel', { onchange: (e) => onChange(e.target.value), onkeydown: (e) => e.stopPropagation() }, opts.map(([v, l]) => h('option', { value: v }, l)));
  s.value = value ?? '';
  if (s.value !== String(value ?? '') && value) { s.appendChild(h('option', { value }, value)); s.value = value; }
  return s;
}

function toggle(on, onChange) { return h('button.tgl' + (on ? '.on' : ''), { onclick: () => onChange(!on) }, h('i')); }

function seg(items, value, onChange) {
  return h('div.seg', null, items.map(([v, ic, title]) => h('button' + (v === value ? '.on' : ''), { title, onclick: () => onChange(v) }, icon(ic, 14))));
}

function alignMatrix(lay, a, setMany) {
  const H = ['start', 'center', 'end'], V = ['start', 'center', 'end'];
  const norm = (v) => ({ top: 'start', left: 'start', bottom: 'end', right: 'end', middle: 'center' }[v] || v);
  let ch, cv;
  if (lay === 'col') { ch = norm(a.align || 'stretch'); cv = norm(a.justify || 'start'); }
  else if (lay === 'row') { ch = norm(a.justify || 'start'); cv = norm(a.align || 'center'); }
  else { ch = norm(a.justify || 'start'); cv = norm(a.align || 'start'); }
  if (a.center) { ch = cv = 'center'; }
  const grid = h('div.amatrix');
  for (const v of V) for (const hz of H) {
    const on = (ch === hz || (ch === 'stretch' && hz === 'start')) && cv === v;
    grid.appendChild(h('button' + (on ? '.on' : ''), { title: `${v} / ${hz}`, onclick: () => {
      if (lay === 'col') setMany({ align: hz === 'start' && a.align === undefined ? 'start' : hz, justify: v === 'start' ? null : v, center: null });
      else if (lay === 'row') setMany({ justify: hz === 'start' ? null : hz, align: v === 'center' ? null : v, center: null });
      else setMany({ justify: hz === 'start' ? null : hz, align: v === 'start' ? null : v, center: null });
    } }, h('i')));
  }
  const stretch = lay === 'col' ? h('button.chip' + (ch === 'stretch' ? '.on' : ''), { onclick: () => setMany({ align: ch === 'stretch' ? 'start' : null }) }, 'Étirer les enfants') : lay === 'row' ? h('button.chip' + (a.align === 'stretch' ? '.on' : ''), { onclick: () => setMany({ align: a.align === 'stretch' ? null : 'stretch' }) }, 'Étirer en hauteur') : null;
  return h('div.alignrow', null, grid, h('div.alignside', null, h('span.muted', null, 'Alignement'), stretch));
}

function colorField(app, value, onCommit, f, compact) {
  const p = app.project;
  const resolved = value ? (String(value).startsWith('$') ? p.token(String(value).slice(1).split('/')[0], app.mode) : value) : null;
  const sw = h('span.swatch', { style: { background: resolved && !/^(linear|radial|mesh|conic|noise|dots|grid|stripes|image|aurora)\(/.test(resolved) ? resolved : resolved ? 'linear-gradient(135deg,#7c5cff,#ff5ca8)' : 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/8px 8px' } });
  const picker = h('input', { type: 'color', class: 'hiddenpick' });
  const c = MQ.parseColor(resolved || '');
  if (c) picker.value = '#' + c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  picker.addEventListener('change', () => onCommit(picker.value.toUpperCase()));
  sw.addEventListener('click', () => picker.click());
  const inp = input(f, value || '', (v) => onCommit(v || null), { placeholder: '#hex, $token, linear(…)', mono: true });
  const colorTokens = Object.keys(p.tokens).filter((k) => MQ.parseColor(String(p.token(k, app.mode))));
  const tokBtn = h('button.mini', { title: 'Tokens', onclick: (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    import('./dom.js').then(({ menu }) => menu(r.left - 180, r.bottom + 4, colorTokens.slice(0, 40).map((k) => ({ label: '$' + k, icon: 'circle', run: () => onCommit('$' + k) }))));
  } }, icon('palette', 13));
  return h('div.colorf' + (compact ? '.compact' : ''), null, sw, picker, inp, tokBtn);
}

function iconPicker(value, onCommit) {
  const id = 'icons-dl';
  if (!document.getElementById(id)) { const dl = h('datalist', { id }); for (const n of Object.keys(MQ.ICONS)) dl.appendChild(h('option', { value: n })); document.body.appendChild(dl); }
  const el = input('icon', value, onCommit, { mono: true });
  el.setAttribute('list', id);
  return h('div.iconpick', null, icon(value, 16), el);
}

const EASE_HELP = {
  smooth: 'Slow out rapide, longue arrivée : défaut polyvalent', expo: 'Départ vif, arrivée très amortie : entrées assertives', cushion: 'Arrivée coussinée sans rebond (accent doux)',
  snap: 'Accélère puis claque : actions décidées', back: 'Léger dépassement en fin de course', spring: 'Ressort physique', bouncy: 'Ressort avec rebonds (accent dur)', gentle: 'Ressort lent et calme',
  'in-out': 'Symétrique : déplacements d\'un point à un autre', linear: 'Mécanique : réservé aux rotations continues et aux barres de progression',
};

// cubic-bezier evaluation (x → y) by bisection
function bez(x1, y1, x2, y2) {
  const c = (a, b2, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b2 * t * t * (1 - t) + t * t * t;
  return (x) => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (c(x1, x2, m) < x) lo = m; else hi = m; } return c(y1, y2, (lo + hi) / 2); };
}
const BEZ = { smooth: [0.2, 0.8, 0.2, 1], expo: [0.16, 1, 0.3, 1], cushion: [0.22, 1, 0.36, 1], snap: [0.7, 0, 0.2, 1], back: [0.34, 1.56, 0.64, 1], 'in-out': [0.4, 0, 0.2, 1], in: [0.4, 0, 1, 1], out: [0, 0, 0.2, 1], linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], standard: [0.2, 0, 0, 1], emphasized: [0.05, 0.7, 0.1, 1], anticipate: [0.68, -0.55, 0.27, 1.55], accelerate: [0.55, 0, 1, 0.45] };

// Editable cubic-bezier curve + Williams spacing chart (dots at equal time steps)
function bezierEditor(name, onCommit) {
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(name || '');
  let P = m ? m[1].split(',').map(Number) : BEZ[name] ? BEZ[name].slice() : null;
  const NS = 'http://www.w3.org/2000/svg';
  const W = 236, H = 150, x0 = 18, x1 = W - 18, y0 = H - 32, y1 = 30; // y in [-0.25, 1.25]
  const sx = (v) => x0 + v * (x1 - x0), sy = (v) => y0 - v * (y0 - y1);
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'bezier');
  const el = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.appendChild(e); return e; };
  el('rect', { x: x0, y: y1, width: x1 - x0, height: y0 - y1, class: 'bz-box' });
  const curve = el('path', { class: 'bz-curve' });
  const l1 = el('line', { class: 'bz-arm' }), l2 = el('line', { class: 'bz-arm' });
  const dots = el('g', {});
  const h1 = el('circle', { r: 6, class: 'bz-h' }), h2 = el('circle', { r: 6, class: 'bz-h' });
  const label = h('div.bz-label');
  const sampleNamed = () => { // non-bezier easings (springs, bounce): sample through WAAPI
    const d = document.createElement('div'); document.body.appendChild(d); const pts = [];
    try { const ez = MQ.resolveEasing(name, 500).easing; const a = d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000, easing: ez, fill: 'both' }); a.pause(); for (let i = 0; i <= 60; i++) { a.currentTime = i * (1000 / 60); pts.push(parseFloat(getComputedStyle(d).opacity)); } } catch (e) { /* */ }
    d.remove(); return pts;
  };
  const draw = () => {
    let f;
    if (P) { f = bez(...P); h1.setAttribute('cx', sx(P[0])); h1.setAttribute('cy', sy(P[1])); h2.setAttribute('cx', sx(P[2])); h2.setAttribute('cy', sy(P[3])); l1.setAttribute('x1', sx(0)); l1.setAttribute('y1', sy(0)); l1.setAttribute('x2', sx(P[0])); l1.setAttribute('y2', sy(P[1])); l2.setAttribute('x1', sx(1)); l2.setAttribute('y1', sy(1)); l2.setAttribute('x2', sx(P[2])); l2.setAttribute('y2', sy(P[3])); }
    else { const pts = sampleNamed(); f = (x) => pts[Math.round(x * 60)] ?? x; h1.style.display = h2.style.display = l1.style.display = l2.style.display = 'none'; }
    let d = ''; for (let i = 0; i <= 60; i++) { const x = i / 60; d += `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(f(x)).toFixed(1)}`; } curve.setAttribute('d', d);
    while (dots.firstChild) dots.removeChild(dots.firstChild);
    for (let i = 0; i <= 12; i++) { const v = f(i / 12); const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', sx(Math.max(-0.1, Math.min(1.1, v)))); c.setAttribute('cy', H - 12); c.setAttribute('r', i === 0 || i === 12 ? 3.5 : 2.5); c.setAttribute('class', 'bz-dot'); dots.appendChild(c); }
    label.textContent = P ? `cubic-bezier(${P.map((v) => +v.toFixed(2)).join(', ')})` : `${name} (ressort, non éditable : choisis une courbe pour la modifier)`;
  };
  const drag = (k) => (e) => {
    e.preventDefault(); const r = svg.getBoundingClientRect(); const scale = W / r.width;
    const mv = (ev) => { const x = ((ev.clientX - r.left) * scale - x0) / (x1 - x0), y = (y0 - (ev.clientY - r.top) * scale) / (y0 - y1); P[k] = Math.max(0, Math.min(1, x)); P[k + 1] = Math.max(-0.6, Math.min(1.6, y)); draw(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); onCommit(`cubic-bezier(${P.map((v) => +v.toFixed(2)).join(',')})`.replace(/0\./g, '.')); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  h1.addEventListener('pointerdown', drag(0)); h2.addEventListener('pointerdown', drag(2));
  draw();
  return h('div.bzbox', null, svg, label, h('div.hint', null, 'Points du bas = position à intervalles de temps égaux (spacing). Serrés = lent, espacés = rapide.'));
}

function easeCurve(name) {
  const r = MQ.springEasing ? null : null;
  const W = 220, H = 70;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'easecurve');
  const box = h('div.easebox', null, svg);
  // sample via WAAPI on a dummy element
  const dummy = document.createElement('div'); document.body.appendChild(dummy);
  let pts = [];
  try {
    const ez = name && /^(spring|bouncy|snappy|gentle|wobbly|stiff)/.test(name) ? null : null;
    const a = dummy.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000, easing: easingCss(name), fill: 'both' }); a.pause();
    for (let i = 0; i <= 50; i++) { a.currentTime = i * 20; pts.push(parseFloat(getComputedStyle(dummy).opacity)); }
  } catch (e) { pts = []; }
  dummy.remove();
  const minV = Math.min(0, ...pts), maxV = Math.max(1, ...pts);
  const y = (v) => H - 8 - ((v - minV) / (maxV - minV)) * (H - 16);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / 50) * (W - 8) + 4} ${y(v).toFixed(1)}`).join(' ');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p);
  box.appendChild(h('span.muted', null, name));
  return box;
}
function easingCss(name) {
  const SP = { spring: [170, 16], bouncy: [260, 12], snappy: [400, 30], gentle: [120, 20], wobbly: [180, 9], stiff: [500, 40] };
  if (SP[name]) return MQ.springEasing(...SP[name]).easing;
  return MQ.EASINGS[name] || (name === 'bounce' ? 'linear(0, 0.063, 0.25, 0.563, 1 36.4%, 0.812, 0.75, 0.813, 1 72.7%, 0.953, 0.938, 0.953, 1 90.9%, 0.984, 1)' : 'ease');
}
