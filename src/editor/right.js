// Right panel: Design / Prototype / Motion / Code / Lint inspectors
import { MQ, h, icon, clear, toast, ask } from './dom.js';
import { isContainer } from './state.js';
import { highlight } from './code.js';

const FONTS = ['Inter', 'Manrope', 'DM Sans', 'Plus Jakarta Sans', 'Space Grotesk', 'Sora', 'Outfit', 'Poppins', 'Figtree', 'Geist', 'Instrument Serif', 'Playfair Display', 'Fraunces', 'JetBrains Mono', 'Bricolage Grotesque', 'Unbounded'];
const WEIGHTS = [['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extrabold'], ['900', 'Black']];
const TRIGGERS = [['on:click', 'Au clic'], ['on:enter', 'Survol (entrée)'], ['on:leave', 'Survol (sortie)'], ['on:press', 'Appui'], ['on:longpress', 'Appui long'], ['on:swipe-left', 'Swipe ←'], ['on:swipe-right', 'Swipe →'], ['on:swipe-up', 'Swipe ↑'], ['on:swipe-down', 'Swipe ↓'], ['on:load', 'Au chargement'], ['on:after-2000', 'Après délai'], ['on:key-Enter', 'Touche clavier'], ['on:change', 'Saisie (input)']];
const TRANS = ['instant', 'dissolve', 'smart', 'ios', 'push', 'push-right', 'push-up', 'push-down', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale', 'flip'];
const EASES = ['smooth', 'spring', 'bouncy', 'snappy', 'gentle', 'expo', 'back', 'in-out', 'out', 'in', 'linear', 'bounce'];

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
      ['Ctrl+D', 'Dupliquer'], ['Alt+glisser', 'Dupliquer en déplaçant'], ['Alt+survol', 'Mesurer les distances'], ['Entrée / Maj+Entrée', 'Enfant / parent'], ['Maj+1 / Maj+2', 'Tout voir / sélection'], ['P', 'Mode prototype'], ['Ctrl+Entrée', 'Présenter'], ['Ctrl+/', 'Code complet'],
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

    // raw attributes
    if (!multi) b.appendChild(this.attrTable(n));
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
      h('div.hint', null, 'Astuce : en mode Prototype (touche P), tire la pastille bleue d\'un élément vers un écran pour créer un lien.')));
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
      const compose = (o) => {
        const k2 = o.kind ?? kind, t2 = o.target ?? target, tt = o.type ?? tr.type, d2 = o.dur ?? tr.duration, e2 = o.ease ?? tr.easing, p2 = o.pos ?? pos;
        if (k2 === 'back' || k2 === 'close') return k2 + (tt !== 'instant' && k2 === 'back' && o.type ? ' ' + tt : '');
        let s = `${k2} ${q(t2 || screens[0] || '')}`;
        if (k2 === 'overlay') s += ` ${p2}`;
        if (tt !== 'instant' || k2 === 'go') s += ` ${tt}`;
        if (d2 && d2 !== 300 && d2 !== 420 && d2 !== 380) s += ` ${d2}`;
        if (e2 && e2 !== 'smooth') s += ` ${e2}`;
        return s;
      };
      body = h('div.ibody', null,
        h('div.grid2', null, select([['go', 'Naviguer vers'], ['overlay', 'Ouvrir overlay'], ['back', 'Retour'], ['close', 'Fermer overlay']], kind, (v) => set(key, compose({ kind: v }))),
          kind === 'go' || kind === 'overlay' ? select([...screens.map((s) => [s, s]), ...(kind === 'overlay' ? comps.map((c) => [c, '◆ ' + c]) : [])], target, (v) => set(key, compose({ target: v }))) : h('span')),
        kind === 'go' || kind === 'overlay' ? h('div.grid3', null, select(TRANS.map((t) => [t, t]), tr.type, (v) => set(key, compose({ type: v }))), num('ms', tr.duration, (v) => set(key, compose({ dur: v }))), select(EASES.map((e) => [e, e]), tr.easing, (v) => set(key, compose({ ease: v })))) : null,
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
    const compose = (o) => { const name = o.name ?? sp?.name ?? 'fade-up'; if (!name) return null; const d = o.dur ?? sp?.duration ?? 500, dl = o.delay ?? sp?.delay ?? 0, e = o.ease ?? sp?.easing ?? 'smooth'; return `${name} ${d}${dl ? ' delay=' + dl : ''}${e !== 'smooth' ? ' ' + e : ''}`; };
    b.appendChild(sec('Entrée (à l\'apparition)',
      h('div.prow', null, h('label', null, 'Animation'), select([['', 'Aucune'], ...MQ.ENTRANCE.map((x) => [x, x]), ...Object.keys(app.project.keyframes).map((k) => [k, '★ ' + k])], sp ? sp.name : '', (v) => set('anim', v ? compose({ name: v }) : null))),
      sp ? h('div.grid3', null, num('Durée', sp.duration, (v) => set('anim', compose({ dur: v }))), num('Délai', sp.delay, (v) => set('anim', compose({ delay: v }))), select(EASES.map((e) => [e, e]), sp.easing, (v) => set('anim', compose({ ease: v })))) : null,
      sp ? easeCurve(sp.easing) : null));
    const lp = n.attrs.loop ? MQ.parseSpec(n.attrs.loop, 'loop') : null;
    b.appendChild(sec('Boucle', h('div.prow', null, h('label', null, 'Animation'), select([['', 'Aucune'], ...MQ.LOOPS.map((x) => [x, x])], lp ? lp.name : '', (v) => set('loop', v ? `${v}${lp ? ' ' + lp.duration : ''}` : null))), lp ? num('Durée', lp.duration, (v) => set('loop', `${lp.name} ${v}`)) : null));
    if (isContainer(n)) {
      const st = n.attrs.stagger ? String(n.attrs.stagger).split(/\s+/) : null;
      b.appendChild(sec('Cascade (enfants)', h('div.prow', null, h('label', null, 'Activer'), toggle(!!st, (v) => set('stagger', v ? '70 fade-up 450' : null))), st ? h('div.grid2', null, num('Pas (ms)', st[0], (v) => set('stagger', [v, ...st.slice(1)].join(' '))), select(MQ.ENTRANCE.map((x) => [x, x]), st[1] || 'fade-up', (v) => set('stagger', [st[0], v, ...st.slice(2)].join(' ')))) : null));
    }
    b.appendChild(sec('Survol / appui', h('div.grid2', null, numOpt('Échelle survol', n.attrs['hover:scale'], (v) => set('hover:scale', v)), numOpt('Échelle appui', n.attrs['press:scale'], (v) => set('press:scale', v))), h('div.prow', null, h('label', null, 'Remplissage survol'), colorField(app, n.attrs['hover:fill'], (v) => set('hover:fill', v), 'hfill'))));
    b.appendChild(h('div.pad', null, h('button.btn.primary', { onclick: () => this.hooks.previewMotion() }, icon('play', 13), 'Prévisualiser les animations'), h('button.btn', { onclick: () => this.hooks.toggleTimeline() }, icon('gantt-chart', 13), 'Timeline')));
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
    const issues = this.hooks.runLint();
    this.lintCount = issues.filter((i) => i.level !== 'info').length;
    b.appendChild(h('div.pad', null, h('button.btn', { onclick: () => this.render() }, icon('refresh-cw', 13), 'Relancer l\'analyse')));
    if (!issues.length) { b.appendChild(h('div.okmsg', null, icon('check-circle-2', 16), 'Aucun problème détecté sur cette page.')); return; }
    const ic = { error: 'circle-x', warn: 'triangle-alert', info: 'info' };
    for (const i of issues) b.appendChild(h('div.issue.' + i.level, { onclick: () => { if (i.id && app.node(i.id)) { app.select(i.id); this.hooks.focus(i.id); } } }, icon(ic[i.level], 14), h('div', null, h('div.imsg', null, i.msg), h('div.imeta', null, `${i.code}${i.screen ? ' · ' + i.screen : ''}`))));
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
