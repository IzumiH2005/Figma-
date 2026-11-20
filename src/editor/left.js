// Left panel: pages, layers tree, assets (components / icons / images / devices), tokens & variables
import { MQ, h, icon, clear, debounce, menu, ask } from './dom.js';
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
    const comp = /^[A-Z]/.test(n.tag);
    const hidden = n.attrs.hidden === true || n.attrs.hidden === 'true';
    const row = h('div.lrow' + (sel ? '.sel' : '') + (comp ? '.comp' : '') + (hidden ? '.hid' : ''), {
      style: { paddingLeft: 8 + depth * 14 + 'px' }, draggable: 'true',
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
    const own = comps.filter((c) => !c.fromKit), kit = comps.filter((c) => c.fromKit);
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
    wrap.append(...[].concat(grid(own, 'Composants du projet') || [], grid(kit, 'Kit Maquette') || []));
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
    wrap.appendChild(h('div.phead', null, h('span', null, 'Modes'), h('div.modes', null, p.modes.map((m, i) => h('button.chip' + (i === app.mode ? '.on' : ''), { onclick: () => { app.mode = i; app.emit('mode'); } }, m)))));
    const tokNode = (p.rootNode ? p.rootNode.children : p.nodes).find((n) => n.tag === 'tokens');
    const own = new Set();
    if (tokNode) for (const line of (tokNode.raw || '').split('\n')) { const m = /^\s*\$?([\w.\-]+)\s*:/.exec(line); if (m) own.add(m[1]); }
    wrap.appendChild(h('div.phead', null, h('span', null, 'Tokens'), h('button.mini', { title: 'Ajouter un token', onclick: () => this.editToken(null) }, icon('plus', 14))));
    const list = h('div.tlist');
    const names = Object.keys(p.tokens).sort((a, b) => (own.has(b) - own.has(a)) || 0);
    for (const k of names) {
      const vals = p.tokens[k];
      const isColor = vals.some((v) => MQ.parseColor(String(v)) || /^(linear|radial|mesh)\(/.test(v));
      list.appendChild(h('div.trow' + (own.has(k) ? '' : '.kit'), { onclick: () => this.editToken(k), title: own.has(k) ? 'Cliquer pour modifier' : 'Token du kit (cliquer pour le redéfinir)' },
        h('span.tname', null, '$' + k),
        h('span.tvals', null, vals.map((v, i) => isColor ? h('span.sw', { title: `${p.modes[i] || ''}: ${v}`, style: { background: MQ.fillCss ? v : String(v).startsWith('$') ? (p.token(k, i) || v) : v } }) : h('span.tv', null, String(v))))));
    }
    wrap.appendChild(list);
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
