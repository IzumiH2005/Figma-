// Left panel: pages, layers tree, assets (components / icons / images / devices), tokens & variables
import { MQ, h, icon, clear, debounce, menu, ask, toast, modal, download } from './dom.js';
import { importShadcn } from '../core/shadcn-import.js';
import { isContainer, uniqueName } from './state.js';

const TAG_ICON = { screen: 'smartphone', frame: 'square-dashed', row: 'columns-3', col: 'rows-3', grid: 'grid-3x3', stack: 'layers', text: 'type', icon: 'smile', image: 'image', rect: 'square', ellipse: 'circle', note: 'sticky-note', input: 'text-cursor-input', divider: 'minus', spacer: 'move-horizontal', vector: 'pen-tool', box: 'square', card: 'credit-card', button: 'mouse-pointer-click' };

export class LeftPanel {
  constructor(app, root, hooks) {
    this.app = app; this.root = root; this.hooks = hooks;
    this.tab = 'layers'; this.collapsed = new Set(); this.iconQuery = '';
  }

  render() {
    const app = this.app;
    clear(this.root);
    const tabs = h('div.ptabs', null, [['layers', 'Calques'], ['assets', 'Assets'], ['tokens', 'Tokens']].map(([k, l]) => h('button.ptab' + (this.tab === k ? '.on' : ''), { onclick: () => { this.tab = k; this.render(); } }, l)));
    this.root.appendChild(tabs);
    if (this.tab === 'layers') { this.root.appendChild(this.pages()); this.root.appendChild(this.layers()); }
    if (this.tab === 'assets') this.root.appendChild(this.assets());
    if (this.tab === 'tokens') this.root.appendChild(this.tokens());
  }

  // ------------------------------------------------------------ pages
  pages() {
    const app = this.app; const p = app.project;
    const wrap = h('div.pages');
    wrap.appendChild(h('div.phead', null, h('span', null, 'Pages'), h('button.mini', { title: 'Nouvelle page', onclick: () => this.addPage() }, icon('plus', 14))));
    p.pages.forEach((pg, i) => wrap.appendChild(h('div.page' + (i === app.pageIndex ? '.on' : ''), { onclick: () => { app.pageIndex = i; app.selection = []; app.emit('page'); }, ondblclick: (e) => this.renamePage(pg, e.currentTarget) }, icon(i === app.pageIndex ? 'check' : 'file', 13), h('span', null, pg.attrs.name || `Page ${i + 1}`))));
    return wrap;
  }
  addPage() {
    const app = this.app;
    app.change(() => {
      const root = app.project.rootNode;
      const list = root ? root.children : app.project.nodes;
      // move loose screens into a real page first
      const loose = app.project.pages.find((pg) => pg.virtual);
      if (loose) { const pg = { id: MQ.newId(), tag: 'page', attrs: { name: 'Page 1' }, children: [] }; for (const c of [...loose.children]) { list.splice(list.indexOf(c), 1); pg.children.push(c); } list.push(pg); }
      list.push({ id: MQ.newId(), tag: 'page', attrs: { name: `Page ${app.project.pages.length + 1}` }, children: [] });
    });
    app.pageIndex = app.project.pages.length - 1; app.emit('page');
  }
  async renamePage(pg, el) {
    if (pg.virtual) return;
    const v = await ask('Nom de la page', pg.attrs.name || '');
    if (v) this.app.change(() => { pg.attrs.name = v; });
  }

  // ------------------------------------------------------------ layers
  layers() {
    const app = this.app;
    const wrap = h('div.layers');
    wrap.appendChild(h('div.phead', null, h('span', null, 'Calques')));
    const list = h('div.ltree');
    const page = app.page;
    if (page) for (const n of page.children) this.layerRow(n, 0, list);
    wrap.appendChild(list);
    return wrap;
  }

  layerRow(n, depth, list) {
    const app = this.app;
    if (n.tag === '#text') return;
    const kids = (n.children || []).filter((c) => c.tag !== '#text' && !(n.tag === 'text'));
    const hasKids = kids.length > 0 && n.tag !== 'text';
    const open = !this.collapsed.has(n.id) && (depth < 1 || this.isOnSelectedPath(n.id) || this.expanded?.has(n.id));
    const sel = app.selection.includes(n.id);
    const comp = /^(\w+\.)?[A-Z]/.test(n.tag);
    const hidden = n.attrs.hidden === true || n.attrs.hidden === 'true';
    const row = h('div.lrow' + (sel ? '.sel' : '') + (comp ? '.comp' : '') + (hidden ? '.hid' : ''), {
      style: { paddingLeft: 8 + depth * 14 + 'px' }, draggable: 'true', dataset: { id: n.id },
      onclick: (e) => { app.select(n.id, e.shiftKey || e.metaKey); },
      onpointerenter: () => { app.hover = n.id; this.hooks.onHover && this.hooks.onHover(); },
      ondblclick: () => this.rename(n),
      oncontextmenu: (e) => { e.preventDefault(); if (!app.selection.includes(n.id)) app.select(n.id); this.hooks.onContext && this.hooks.onContext(e.clientX, e.clientY); },
      ondragstart: (e) => { e.dataTransfer.setData('text/mq-layer', n.id); e.dataTransfer.effectAllowed = 'move'; },
      ondragover: (e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const y = e.clientY - r.top; e.currentTarget.dataset.drop = y < r.height * 0.3 ? 'before' : y > r.height * 0.7 ? 'after' : (isContainer(n) ? 'inside' : 'after'); },
      ondragleave: (e) => { delete e.currentTarget.dataset.drop; },
      ondrop: (e) => { e.preventDefault(); const pos = e.currentTarget.dataset.drop; delete e.currentTarget.dataset.drop; this.dropLayer(e.dataTransfer.getData('text/mq-layer'), n, pos); },
    },
    h('span.twist', { onclick: (e) => { e.stopPropagation(); if (open) this.collapsed.add(n.id); else { this.collapsed.delete(n.id); (this.expanded = this.expanded || new Set()).add(n.id); } this.render(); } }, hasKids ? icon(open ? 'chevron-down' : 'chevron-right', 12) : ''),
    icon(comp ? 'component' : TAG_ICON[n.tag] || 'square', 13),
    h('span.lname', null, app.label(n)),
    h('span.lact', null,
      h('button.mini', { title: hidden ? 'Afficher' : 'Masquer', onclick: (e) => { e.stopPropagation(); app.change(() => app.setAttr(n.id, 'hidden', hidden ? null : true)); } }, icon(hidden ? 'eye-off' : 'eye', 13))));
    list.appendChild(row);
    if (hasKids && open) for (const c of kids) this.layerRow(c, depth + 1, list);
  }

  isOnSelectedPath(id) { return this.app.selection.some((s) => s !== id && this.app.isAncestor(id, s)); }

  dropLayer(dragId, target, pos) {
    const app = this.app;
    if (!dragId || dragId === target.id || app.isAncestor(dragId, target.id)) return;
    app.change(() => {
      if (pos === 'inside') { app.move(dragId, target.id, target.children.length); return; }
      const parent = app.parent(target.id);
      const sib = app.siblings(target.id);
      const idx = sib.indexOf(target) + (pos === 'after' ? 1 : 0);
      const pageChild = app.page && app.page.children.includes(target);
      app.move(dragId, parent && !pageChild ? parent.id : (parent && parent.tag !== 'project' && parent.tag !== 'page' ? parent.id : null), idx);
    });
  }

  async rename(n) {
    const v = await ask('Nom du calque', n.attrs.name || '', 'Sert aussi de clé pour le smart animate entre écrans et états.');
    if (v === null) return;
    const app = this.app;
    if (n.tag === 'screen') { import('./canvas.js').then(({ renameScreenEverywhere }) => app.change(() => renameScreenEverywhere(app, n.attrs.name, v, n))); return; }
    app.change(() => app.setAttr(n.id, 'name', v.trim() || null));
  }

  // ------------------------------------------------------------ assets
  assets() {
    const app = this.app; const p = app.project;
    const wrap = h('div.assets');
    // components
    const comps = Object.values(p.components);
    const isUi = (c) => c.name.startsWith('ui.');
    const own = comps.filter((c) => !c.fromKit && !isUi(c)), kit = comps.filter((c) => c.fromKit);
    const ui = comps.filter((c) => !c.fromKit && isUi(c));
    const grid = (list, title) => {
      if (!list.length) return null;
      const g = h('div.agrid');
      const pending = [];
      // measure after layout, then scale & centre the real content box inside the thumbnail
      const measure = () => {
        for (const { prev, el } of pending) {
          if (!el.isConnected) continue;
          el.style.transform = 'none';
          const box = prev.getBoundingClientRect(); const W = box.width, H = box.height;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const er = el.getBoundingClientRect();
          for (const ch of el.children) { if (ch.tagName === 'STYLE') continue; const r = ch.getBoundingClientRect(); if (!r.width && !r.height) continue; minX = Math.min(minX, r.left - er.left); minY = Math.min(minY, r.top - er.top); maxX = Math.max(maxX, r.right - er.left); maxY = Math.max(maxY, r.bottom - er.top); }
          if (!isFinite(minX)) continue;
          const cw = maxX - minX, chh = maxY - minY;
          const k = Math.min(1, (W - 16) / cw, (H - 12) / chh);
          el.style.transform = `translate(${W / 2 - (minX + cw / 2) * k}px, ${H / 2 - (minY + chh / 2) * k}px) scale(${k})`;
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(measure));
      if (document.fonts) document.fonts.ready.then(() => requestAnimationFrame(measure));
      for (const c of list) {
        const card = h('div.acard', { title: c.desc || c.name, onclick: () => this.insertNode({ id: MQ.newId(), tag: c.name, attrs: {}, children: [] }), draggable: 'true', ondragstart: (e) => e.dataTransfer.setData('text/mq-insert', c.name) });
        const prev = h('div.aprev', { style: { background: p.token('bg', app.mode) || '#fff' } });
        try {
          const ctx = MQ.makeCtx(p, { mode: app.mode, editor: true });
          // components with a <slot/> get sample content so the preview is meaningful
          const hasSlot = JSON.stringify(c.node.children || []).includes('"tag":"slot"');
          const sample = c.name === 'Menu' ? ['Copier', 'Coller', 'Supprimer'].map((l) => ({ id: MQ.newId(), tag: 'MenuItem', attrs: { label: l }, children: [] }))
            : hasSlot ? [{ id: MQ.newId(), tag: 'text', attrs: {}, children: [{ id: MQ.newId(), tag: '#text', text: 'Contenu' }] }] : [];
          const SAMPLE_ATTRS = { TabBar: { items: "{[{icon:'house',label:'Accueil'},{icon:'search',label:'Explorer'},{icon:'user',label:'Profil'}]}" }, NavBar: { title: 'Titre', back: true } };
          const el = MQ.renderStandalone({ id: 'prev', tag: c.name, attrs: SAMPLE_ATTRS[c.name] || {}, children: sample }, ctx);
          // fixed reference width so w=fill components have a size; hug components are centred in it
          el.style.cssText += ';position:absolute;left:0;top:0;width:240px;justify-items:center;transform-origin:0 0;pointer-events:none';
          prev.appendChild(el);
          pending.push({ prev, el });
        } catch (e) { prev.textContent = '⚠'; }
        card.append(prev, h('div.aname', null, c.name));
        g.appendChild(card);
      }
      return [h('div.phead', null, h('span', null, title)), g];
    };
    wrap.append(...[].concat(grid(own, 'Composants du projet') || []));
    // shadcn/ui: imported from the official registry, grouped by registry item
    wrap.appendChild(h('div.phead', null, h('span', null, `shadcn/ui (${ui.length})`), h('button.mini', { title: 'Importer des composants shadcn/ui', onclick: () => this.shadcnDialog() }, icon('download', 14))));
    if (!ui.length) wrap.appendChild(h('div.empty', null, 'Aucun composant shadcn importé. ', h('a', { onclick: () => this.shadcnDialog() }, 'Importer depuis le registre…')));
    else {
      const groups = new Map(); for (const c of ui) { const g = (/shadcn\/ui · ([\w-]+)/.exec(c.desc) || [, 'autres'])[1]; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
      const chips = h('div.chips', { style: { padding: '0 12px 8px' } }, [...groups.keys()].map((g) => h('button.chip' + (this.uiGroup === g ? '.on' : ''), { onclick: () => { this.uiGroup = this.uiGroup === g ? null : g; this.render(); } }, g)));
      wrap.appendChild(chips);
      if (this.uiGroup && groups.has(this.uiGroup)) wrap.append(...(grid(groups.get(this.uiGroup), `ui · ${this.uiGroup}`) || []));
    }
    wrap.append(...[].concat(grid(kit, 'Kit Maquette') || []));
    // icons
    wrap.appendChild(h('div.phead', null, h('span', null, 'Icônes (Lucide)')));
    const q = h('input.search', { placeholder: 'Chercher une icône…', value: this.iconQuery });
    const ig = h('div.igrid');
    const fill = () => {
      clear(ig);
      const query = q.value.trim().toLowerCase(); this.iconQuery = query;
      const names = Object.keys(MQ.ICONS).filter((n) => !query || n.includes(query)).slice(0, 120);
      for (const n of names) ig.appendChild(h('button.ibtn', { title: n, onclick: () => this.insertNode({ id: MQ.newId(), tag: 'icon', attrs: { name: n, size: '24' }, children: [] }) }, icon(n, 18)));
    };
    q.addEventListener('input', debounce(fill, 120)); fill();
    wrap.append(q, ig);
    // project images (imported files, embedded in <assets> as WebP)
    const ownImgs = Object.entries(this.app.project.assets || {});
    const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' }, onchange: (e) => { this.importImageFiles([...e.target.files]); e.target.value = ''; } });
    wrap.appendChild(h('div.phead', null, h('span', null, 'Images du projet'), h('button.ibtn', { title: 'Importer des images (ou glisse-les sur le canevas, ou colle-les)', onclick: () => picker.click() }, icon('upload', 14))));
    wrap.appendChild(picker);
    if (ownImgs.length) {
      const og = h('div.imgrid');
      for (const [name, url] of ownImgs) og.appendChild(h('button.imbtn', { title: `${name} · ${String(url).startsWith('data:') ? MQ.Images.fmtBytes(MQ.Images.dataBytes(url)) + ' · ' + String(url).slice(11, String(url).indexOf(';')) : 'url'}`, style: { backgroundImage: `url("${url}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }, onclick: () => this.insertNode(this.imageNode(name, url)), oncontextmenu: (e) => { e.preventDefault(); menu(e.clientX, e.clientY, [{ label: 'Insérer', icon: 'plus', run: () => this.insertNode(this.imageNode(name, url)) }, { label: 'Copier le nom', icon: 'copy', run: () => { try { navigator.clipboard.writeText(name); } catch (err) { /* */ } toast(name); } }, { label: 'Retirer du projet', icon: 'trash-2', run: () => this.setAssetLines([[name, null]]) }]); } }));
      wrap.appendChild(og);
    } else wrap.appendChild(h('div.empty', { style: { padding: '4px 12px 10px', fontSize: '12px', opacity: 0.7 } }, 'Glisse, colle ou importe une image : elle est convertie en WebP et intégrée au fichier.'));
    // images
    wrap.appendChild(h('div.phead', null, h('span', null, 'Images générées')));
    const imgs = h('div.imgrid');
    for (const s of MQ.SCENE_NAMES.slice(0, 18)) imgs.appendChild(h('button.imbtn', { title: 'gen:' + s, style: { backgroundImage: `url("${MQ.genImage('gen:' + s)}")` }, onclick: () => this.insertNode({ id: MQ.newId(), tag: 'image', attrs: { src: 'gen:' + s, h: '180', radius: '16' }, children: [] }) }));
    imgs.appendChild(h('button.imbtn', { title: 'avatar', style: { backgroundImage: `url("${MQ.genImage('avatar:Alex')}")` }, onclick: () => this.insertNode({ id: MQ.newId(), tag: 'Avatar', attrs: { name: 'Alex Martin' }, children: [] }) }));
    wrap.appendChild(imgs);
    // devices
    wrap.appendChild(h('div.phead', null, h('span', null, 'Nouvel écran')));
    const dv = h('div.dlist');
    for (const [k, d] of Object.entries(MQ.DEVICES)) dv.appendChild(h('button.dbtn', { onclick: () => this.addScreen(k) }, icon(d.kind === 'desktop' ? 'monitor' : d.kind === 'tablet' ? 'tablet' : d.kind === 'watch' ? 'watch' : d.kind === 'social' ? 'image' : 'smartphone', 14), h('span', null, k), h('em', null, `${d.w}×${d.h}`)));
    wrap.appendChild(dv);
    return wrap;
  }

  insertNode(node) {
    const app = this.app;
    let target = app.selection[0] ? app.node(app.selection[0]) : null;
    while (target && !isContainer(target)) target = app.parent(target.id);
    if (!target) { const s = app.page && app.page.children.find((c) => c.tag === 'screen'); target = s || null; }
    if (!target) return;
    app.change(() => { app.insert(target.id, node); app.selection = [node.id]; });
  }

  addScreen(device) {
    const app = this.app; const d = MQ.DEVICES[device];
    let maxX = 0;
    for (const s of app.page ? app.page.children : []) { if (s.tag !== 'screen') continue; const x = s.attrs.x !== undefined ? +s.attrs.x : s._autoX || 0; maxX = Math.max(maxX, x + app.project.sizeOf(s).w + 100); }
    const node = { id: MQ.newId(), tag: 'screen', attrs: { name: uniqueName(app.project, 'Écran'), device, x: String(maxX), y: '0', fill: '$bg', ...(d.kind === 'phone' ? { statusbar: true, pt: 'safe', p: '20', gap: '16' } : { p: '40', gap: '24' }) }, children: [] };
    if (node.attrs.pt) { delete node.attrs.p; node.attrs.px = '20'; node.attrs.pt = 'safe'; }
    app.change(() => { app.insert(null, node); app.selection = [node.id]; });
    this.hooks.onFocus && this.hooks.onFocus(node.id);
  }

  // ------------------------------------------------------------ tokens
  tokens() {
    const app = this.app; const p = app.project;
    const wrap = h('div.tokens');
    wrap.appendChild(this.systemSection());
    wrap.appendChild(h('div.phead', null, h('span', null, 'Modes'), h('div.modes', null, p.modes.map((m, i) => h('button.chip' + (i === app.mode ? '.on' : ''), { onclick: () => { app.mode = i; app.emit('mode'); } }, m)))));
    const tokNode = (p.rootNode ? p.rootNode.children : p.nodes).find((n) => n.tag === 'tokens');
    const own = new Set();
    if (tokNode) for (const line of (tokNode.raw || '').split('\n')) { const m = /^\s*\$?([\w.\-]+)\s*:/.exec(line); if (m) own.add(m[1]); }
    wrap.appendChild(h('div.phead', null, h('span', null, 'Tokens'), h('button.mini', { title: 'Ajouter un token', onclick: () => this.editToken(null) }, icon('plus', 14))));
    const list = h('div.tlist');
    const allNames = Object.keys(p.tokens).sort((a, b) => (own.has(b) - own.has(a)) || 0);
    const names = allNames.filter((k) => own.has(k) || !k.startsWith('sh-'));
    const shNames = allNames.filter((k) => !own.has(k) && k.startsWith('sh-'));
    const row = (k) => {
      const vals = p.tokens[k]; const modeNames = vals._named ? Object.keys(vals._named) : p.modes;
      const isColor = vals.some((v) => MQ.parseColor(String(v)) || /^(linear|radial|mesh)\(/.test(v) || String(v).startsWith('$'));
      return h('div.trow' + (own.has(k) ? '' : '.kit'), { onclick: () => this.editToken(k), title: own.has(k) ? 'Cliquer pour modifier' : 'Token du kit (cliquer pour le redéfinir)' },
        h('span.tname', null, '$' + k),
        h('span.tvals', null, vals.map((v, i) => isColor ? h('span.sw', { title: `${modeNames[i] || ''}: ${v}`, style: { background: String(v).startsWith('$') ? (p.token(k, vals._named ? Math.max(0, p.modes.indexOf(modeNames[i])) : i) || v) : v } }) : h('span.tv', null, String(v)))));
    };
    for (const k of names) list.appendChild(row(k));

    wrap.appendChild(list);
    // shadcn/ui theme (components ui.*)
    const shOpen = this.shOpen;
    wrap.appendChild(h('div.phead', null, h('span', { style: { cursor: 'pointer' }, onclick: () => { this.shOpen = !this.shOpen; this.render(); } }, (shOpen ? '▾ ' : '▸ ') + `Thème shadcn/ui (${shNames.length})`),
      h('button.mini', { title: 'Importer un thème shadcn (globals.css : :root et .dark)', onclick: () => this.importShadcn() }, icon('download', 14))));
    if (shOpen) wrap.appendChild(h('div.tlist', null, shNames.map(row)));
    // vars
    const varsEntries = Object.entries(p.vars);
    wrap.appendChild(h('div.phead', null, h('span', null, 'Variables (état du prototype)')));
    const vl = h('div.tlist');
    for (const [k, v] of varsEntries) vl.appendChild(h('div.trow', null, h('span.tname', null, '$' + k), h('span.tv', null, v.length > 40 ? v.slice(0, 38) + '…' : v)));
    if (!varsEntries.length) vl.appendChild(h('div.empty', null, 'Aucune variable. Ajoute un bloc <vars> dans le code.'));
    wrap.appendChild(vl);
    // styles
    const st = Object.keys(p.styles);
    if (st.length) {
      wrap.appendChild(h('div.phead', null, h('span', null, 'Styles (classes)')));
      wrap.appendChild(h('div.tlist', null, st.map((s) => h('div.trow', null, h('span.tname', null, '.' + s), h('span.tv', null, Object.entries(p.styles[s]).map(([a, b]) => b === true ? a : `${a}=${b}`).join(' ').slice(0, 60))))));
    }
    return wrap;
  }

  // ---- Design system: <system> controls (perceptual choices), checks, style guide, exports
  systemSection() {
    const app = this.app; const p = app.project; const box = h('div.ds');
    const top = p.rootNode ? p.rootNode.children : p.nodes;
    const node = top.find((n) => n.tag === 'system');
    box.appendChild(h('div.phead', null, h('span', null, 'Design system')));
    if (!node) {
      box.appendChild(h('div.empty', null, 'Génère primitives, rôles (clair/sombre, contrastes AA), échelles et tokens de composant à partir de ta marque. ',
        h('a', { onclick: () => app.change(() => { top.unshift({ id: MQ.newId(), tag: 'system', attrs: { brand: '#5B5BF7', neutral: 'tinted', radius: 'soft', density: 'comfortable', elevation: 'soft', motion: 'calm' }, children: [] }); if (!/dark/.test(p.meta.modes || '')) p.rootNode && (p.rootNode.attrs.modes = 'light dark'); }) }, 'Créer un design system')));
      return box;
    }
    const a = node.attrs; const set = (k, v) => app.change(() => { const n = app.node(node.id); if (v === null || v === '') delete n.attrs[k]; else n.attrs[k] = v; });
    const color = (k, label) => { const inp = h('input', { type: 'color', value: String(a[k] || '#5B5BF7').slice(0, 7), style: { width: '28px', height: '22px', border: 'none', padding: '0', background: 'none' }, onchange: (e) => set(k, e.target.value.toUpperCase()) }); return h('div.trow', null, h('span.tname', null, label), inp, h('span.tv', null, a[k] || '—'), k === 'accent' && a[k] ? h('button.mini', { title: 'Retirer', onclick: () => set(k, null) }, icon('x', 12)) : null); };
    const pick = (k, label, opts) => h('div.trow', null, h('span.tname', null, label), h('select.sel', { onchange: (e) => set(k, e.target.value), onkeydown: (e) => e.stopPropagation() }, opts.map(([v, l]) => h('option', { value: v, selected: String(a[k] || opts[0][0]) === v }, l))));
    box.append(color('brand', 'Marque'), color('accent', 'Accent'),
      pick('neutral', 'Neutres', [['tinted', 'Teintés marque'], ['pure', 'Purs'], ['warm', 'Chauds'], ['cool', 'Froids'], ['olive', 'Olive']]),
      pick('radius', 'Formes', [['soft', 'Douces'], ['sharp', 'Nettes'], ['round', 'Rondes'], ['pill', 'Pilule']]),
      pick('density', 'Densité', [['comfortable', 'Confortable'], ['compact', 'Compacte'], ['spacious', 'Aérée']]),
      pick('elevation', 'Élévation', [['soft', 'Douce'], ['flat', 'Plate'], ['deep', 'Profonde']]),
      pick('motion', 'Motion', [['calm', 'Calme'], ['snappy', 'Vive'], ['playful', 'Joueuse']]),
      pick('scale', 'Échelle typo', [['major-third', 'Tierce majeure 1,25'], ['minor-third', 'Tierce mineure 1,2'], ['perfect-fourth', 'Quarte 1,333'], ['golden', 'Nombre d’or 1,618']]),
      h('div.trow', null, h('span.tname', null, 'Polices'), (() => { const i = h('input.inp', { value: a.type || 'Inter', placeholder: 'Texte/Titres', onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') set('type', i.value.trim()); }, onblur: () => i.value.trim() !== (a.type || 'Inter') && set('type', i.value.trim()) }); return i; })()));
    const sys = p.system;
    if (sys) {
      const fails = sys.checks.filter((c) => !c.ok);
      box.appendChild(h('div.hint', { style: { padding: '6px 12px' } }, fails.length ? `⚠ ${fails.length} contraste(s) insuffisant(s) : ${fails.slice(0, 3).map((c) => `${c.mode} ${c.fg}/${c.bg} ${c.ratio}:1`).join(' · ')}` : `✓ ${sys.checks.length}/${sys.checks.length} contrastes AA (clair + sombre) · ${Object.keys(sys.primitives).length} primitives · ${Object.keys(sys.light).length} rôles · ${Object.keys(sys.components).length} tokens de composant`));
      const dl = (name, text) => download(name, text);
      box.appendChild(h('div.chips', { style: { padding: '0 12px 10px' } },
        h('button.chip', { onclick: () => this.insertStyleGuide() }, 'Page de style'),
        h('button.chip', { onclick: () => dl('tokens.json', JSON.stringify(MQ.System.toDTCG(sys, p.name), null, 2)) }, 'DTCG'),
        h('button.chip', { onclick: () => dl('tokens.css', MQ.System.toCSS(sys)) }, 'CSS'),
        h('button.chip', { onclick: () => dl('tailwind.config.js', MQ.System.toTailwind(sys)) }, 'Tailwind')));
    }
    return box;
  }
  insertStyleGuide() {
    const app = this.app; const p = app.project; if (!p.system) return;
    const name = 'Système · ' + p.name;
    const parsed = MQ.parse(`<project>${MQ.styleGuideSource(p.system, name)}</project>`);
    const screenNode = (parsed.children || parsed)[0].children ? (parsed.children || parsed)[0].children.find((n) => n.tag === 'screen') : null;
    if (!screenNode) return;
    app.change(() => {
      const top = p.rootNode ? p.rootNode.children : p.nodes;
      for (let i = top.length - 1; i >= 0; i--) if (top[i].tag === 'page' && top[i].attrs.name === 'Système') top.splice(i, 1);
      top.push({ id: MQ.newId(), tag: 'page', attrs: { name: 'Système' }, children: [screenNode] });
    });
    app.pageIndex = app.project.pages.findIndex((pg) => pg.attrs && pg.attrs.name === 'Système'); app.emit('page');
    toast('Page « Système » générée : rampes, rôles, typo, espacements, rayons, élévation, motion, composants');
  }

  // merge token lines into the project's <tokens> block (replacing same names)
  setTokenLines(pairs) {
    const app = this.app; const p = app.project;
    app.change(() => {
      const top = p.rootNode ? p.rootNode.children : p.nodes;
      let tok = top.find((n) => n.tag === 'tokens');
      if (!tok) { tok = { id: MQ.newId(), tag: 'tokens', attrs: {}, children: [], raw: '' }; top.unshift(tok); }
      const lines = (tok.raw || '').split('\n').filter((l) => l.trim());
      for (const [key, v] of pairs) {
        const re = new RegExp(`^\\s*\\$?${key.replace(/[.\-]/g, '\\$&')}\\s*:`);
        const i = lines.findIndex((l) => re.test(l)); const line = `${key}: ${v}`;
        if (i >= 0) lines[i] = line; else lines.push(line);
      }
      tok.raw = '\n' + lines.map((l) => l.trim()).join('\n') + '\n';
    });
  }

  // merge `name: value` lines into the project's <assets> block, kept at the end of the file (base64 is long); null removes
  setAssetLines(pairs, mutateOnly = false) {
    const app = this.app; const p = app.project;
    const run = () => {
      const top = p.rootNode ? p.rootNode.children : p.nodes;
      let blk = top.find((n) => n.tag === 'assets');
      if (!blk) { blk = { id: MQ.newId(), tag: 'assets', attrs: {}, children: [], raw: '' }; top.push(blk); }
      const lines = (blk.raw || '').split('\n').filter((l) => l.trim());
      for (const [key, v] of pairs) {
        const re = new RegExp(`^\\s*${key.replace(/[.\-]/g, '\\$&')}\\s*:`);
        const i = lines.findIndex((l) => re.test(l));
        if (v === null) { if (i >= 0) lines.splice(i, 1); continue; }
        const line = `${key}: ${v}`; if (i >= 0) lines[i] = line; else lines.push(line);
      }
      if (!lines.length) top.splice(top.indexOf(blk), 1); else blk.raw = '\n' + lines.map((l) => l.trim()).join('\n') + '\n';
    };
    if (mutateOnly) run(); else app.change(run);
  }

  // an <image> sized to the asset (at most 360 wide, ratio kept)
  imageNode(name, url, dims) {
    const node = { id: MQ.newId(), tag: 'image', attrs: { src: name }, children: [] };
    let w = dims && dims.w, hh = dims && dims.h;
    if (!w && String(url).startsWith('data:')) { const img = new Image(); img.src = url; w = img.naturalWidth; hh = img.naturalHeight; }
    if (w && hh) { const s = Math.min(1, 360 / w); node.attrs.w = String(Math.round(w * s)); node.attrs.h = String(Math.round(hh * s)); }
    else { node.attrs.w = '240'; node.attrs.h = '160'; }
    return node;
  }

  // files (drop, paste, picker) → WebP embedded in <assets> + <image> layers; `drop` = { cont, x, y } from the canvas
  async importImageFiles(files, drop = null) {
    const app = this.app;
    const list = [...files].filter((f) => f && /^image\//.test(f.type));
    if (!list.length) return;
    const done = [];
    for (const f of list) {
      try {
        const raw = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
        const out = await MQ.Images.importImage(raw, { max: 2048, quality: 0.86 });
        done.push({ file: f, ...out });
      } catch (e) { toast(`${f.name} : ${e.message}`, 'error'); }
    }
    if (!done.length) return;
    const taken = { ...(app.project.assets || {}) };
    const nodes = [];
    app.change(() => {
      const pairs = [];
      for (const d of done) {
        const name = MQ.Images.assetName(d.file.name, taken); taken[name] = d.dataUrl;
        pairs.push([name, d.dataUrl]);
        const node = this.imageNode(name, d.dataUrl, d.w ? { w: d.w, h: d.h } : null);
        if (drop && drop.abs) { node.attrs.x = String(drop.x + nodes.length * 24); node.attrs.y = String(drop.y + nodes.length * 24); }
        nodes.push(node);
      }
      this.setAssetLines(pairs, true);
      let target = drop && drop.cont ? drop.cont : null;
      if (!target) { target = app.selection[0] ? app.node(app.selection[0]) : null; while (target && !isContainer(target)) target = app.parent(target.id); }
      if (!target) target = app.page && app.page.children.find((c) => c.tag === 'screen');
      if (target) for (const n of nodes) app.insert(target.id, n);
      app.selection = nodes.map((n) => n.id);
    });
    const saved = done.reduce((s, d) => s + (d.file.size - d.bytes), 0);
    toast(`${done.length} image${done.length > 1 ? 's' : ''} importée${done.length > 1 ? 's' : ''} en ${done[0].format.toUpperCase()} (${MQ.Images.fmtBytes(done.reduce((s, d) => s + d.bytes, 0))}${saved > 1024 ? `, −${MQ.Images.fmtBytes(saved)}` : ''})`);
  }

  shadcnDialog() {
    const names = h('input.inp', { value: this.lastShadcn || 'button card input label badge dialog tabs table', placeholder: 'button card dialog … ou all' });
    const theme = h('select.inp', null, ['neutral', 'zinc', 'slate', 'stone', 'gray'].map((t) => h('option', { value: t }, t)));
    const paste = h('textarea.inp.mono', { rows: 5, placeholder: 'Hors ligne : colle ici le JSON d’un élément du registre (ui.shadcn.com/r/…/button.json) ou un fichier .tsx shadcn', style: { width: '100%', fontSize: '11px' } });
    const status = h('div.hint', null, 'Les composants sont téléchargés depuis le registre officiel, convertis (Tailwind → tokens sh-*, variantes cva → props, états data-[state] → prop state) et ajoutés au projet sous ui.*. Licence MIT conservée.');
    const body = h('div.mq-dbody', { style: { display: 'grid', gap: '8px', minWidth: 'min(520px, 86vw)' } },
      h('label.hint', null, 'Composants (noms du registre, « all » pour les 61)'), names, h('label.hint', null, 'Thème de base'), theme, paste, status);
    modal('Importer shadcn/ui', body, (close) => [
      h('button.btn', { onclick: close }, 'Annuler'),
      h('button.btn.primary', { onclick: async (e) => {
        const btn = e.currentTarget; btn.disabled = true; status.textContent = 'Téléchargement…';
        const list = names.value.trim().split(/[\s,]+/).filter(Boolean); this.lastShadcn = names.value;
        try {
          const r = await importShadcn({ names: paste.value.trim() ? [] : list, theme: theme.value, paste: paste.value,
            fetchJson: async (u) => { const res = await fetch(u); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); },
            onItem: (it) => { status.textContent = `Converti : ${it.name}…`; } });
          if (!r.names.length) throw new Error(r.warnings[0] || 'rien à importer');
          this.mergeShadcn(r); close();
          toast(`${r.names.length} composants shadcn importés${r.warnings.length ? ` (${r.warnings.length} avertissement(s))` : ''}`);
        } catch (err) {
          btn.disabled = false;
          status.textContent = `Échec : ${err.message}. ${/fetch|network|HTTP|Failed/i.test(err.message) ? 'Le registre n’est pas joignable ici (artifact sans réseau) : colle le JSON ou le .tsx dans le champ ci-dessus, ou utilise « mq shadcn add » en ligne de commande.' : ''}`;
        }
      } }, icon('download', 13), 'Importer'),
    ]);
  }

  // add converted components (replacing same names) + theme tokens if the project has none
  mergeShadcn(r) {
    const app = this.app; const p = app.project;
    const parsed = MQ.parse(r.mq); const comps = (parsed.children || parsed).filter ? (parsed.children || parsed).filter((n) => n.tag === 'component') : [];
    const names = new Set(comps.map((c) => c.attrs.name));
    if (r.themeLines && !p.tokens['sh-background']) this.setTokenLines(r.themeLines.map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
    app.change(() => {
      const top = p.rootNode ? p.rootNode.children : p.nodes;
      for (let i = top.length - 1; i >= 0; i--) if (top[i].tag === 'component' && names.has(top[i].attrs.name)) top.splice(i, 1);
      top.push(...comps);
    });
    this.uiGroup = r.converted[0]?.item || null; this.tab = 'assets'; this.render();
  }

  async importShadcn() {
    const css = await ask('Importer un thème shadcn/ui', '', 'Colle le contenu de globals.css (blocs :root et .dark, oklch ou HSL). Ctrl+Entrée pour valider. Les composants ui.* suivent le thème.', { multiline: true });
    if (!css) return;
    const r = MQ.importShadcnTheme(css);
    if (!r.count) { toast('Aucune variable --x trouvée dans :root / .dark'); return; }
    const pairs = r.tokens.split('\n').slice(1, -1).map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
    if (!this.app.project.modes.includes('dark')) toast('Astuce : ajoute modes="light dark" au <project> pour basculer clair/sombre');
    this.setTokenLines(pairs); this.shOpen = true;
    toast(`${r.count} tokens shadcn importés${r.skipped.length ? ` (${r.skipped.length} ignorés)` : ''}`);
  }

  async editToken(name) {
    const app = this.app; const p = app.project;
    const cur = name ? p.tokens[name].join(' | ') : '';
    const key = name || await ask('Nom du token', '', 'Ex : accent, card-radius…');
    if (!key) return;
    const v = await ask(`Valeur de $${key}`, cur, p.modes.length > 1 ? `Une valeur par mode, séparées par | (${p.modes.join(' | ')})` : '');
    if (v === null) return;
    app.change(() => {
      const top = p.rootNode ? p.rootNode.children : p.nodes;
      let tok = top.find((n) => n.tag === 'tokens');
      if (!tok) { tok = { id: MQ.newId(), tag: 'tokens', attrs: {}, children: [], raw: '' }; top.unshift(tok); }
      const lines = (tok.raw || '').split('\n').filter((l) => l.trim());
      const re = new RegExp(`^\\s*\\$?${key.replace(/[.\-]/g, '\\$&')}\\s*:`);
      const i = lines.findIndex((l) => re.test(l));
      const line = `${key}: ${v}`;
      if (i >= 0) lines[i] = line; else lines.push(line);
      tok.raw = '\n' + lines.map((l) => l.trim()).join('\n') + '\n';
    });
  }
}
