// Maquette editor bootstrap
import { MQ, h, icon, clear, toast, store, download, menu } from './dom.js';
import { App, isContainer, hashStr } from './state.js';
import { Canvas } from './canvas.js';
import { LeftPanel } from './left.js';
import { RightPanel } from './right.js';
import { CodeDrawer } from './code.js';
import { PlayMode } from './play.js';
import { Timeline } from './timeline.js';

const NEW_PROJECT = `<project name="Nouveau projet" fonts="Inter:400;500;600;700;800" modes="light dark">
  <tokens>
    bg: #FFFFFF | #0E0E12
    surface: #F4F4F7 | #1A1A21
    text: #14141A | #F4F4F6
    muted: #6B6B78 | #9A9AA8
    primary: #5B5BF7
  </tokens>
  <page name="Écrans">
    <screen name="Accueil" device=iphone-16 start statusbar homebar fill=$bg pt=safe px=20 gap=16>
      <text size=32 weight=800 ls=-0.8 pt=24>Bonjour 👋</text>
      <text color=$muted>Commence à dessiner ou écris du code (Ctrl+/).</text>
      <Button label="Commencer" full/>
    </screen>
  </page>
</project>
`;

function boot() {
  MQ.ensureStyles();
  const app = new App();
  window.app = app;
  // files: embedded projects (+ local drafts)
  const embeds = [...document.querySelectorAll('script[type="text/x-maquette"]')];
  app.files = embeds.map((s) => {
    const source = s.textContent.replace(/<\\\/script/gi, '</script').replace(/^\n/, '');
    return { file: s.dataset.file || 'projet.mq', source, baseHash: hashStr(source), embedded: true, open: s.hasAttribute('data-open') };
  });
  for (const f of app.files) {
    const d = store('draft:' + f.file);
    if (d && d.base === f.baseHash && d.source && d.source !== f.source) { f.source = d.source; f.draft = true; }
  }
  const locals = store('localfiles') || [];
  for (const name of locals) { const d = store('draft:' + name); if (d && !app.files.some((f) => f.file === name)) app.files.push({ file: name, source: d.source, baseHash: d.base, local: true }); }
  if (!app.files.length) app.files.push({ file: 'nouveau.mq', source: NEW_PROJECT, baseHash: hashStr(NEW_PROJECT), local: true });

  // ---------------- layout
  const topbar = h('div.topbar');
  const leftEl = h('div.left.panel');
  const rightEl = h('div.right.panel');
  const canvasEl = h('div.canvas');
  const codeEl = h('div.codedrawer');
  const tlEl = h('div.timeline');
  const center = h('div.center', null, canvasEl, tlEl, codeEl);
  const main = h('div.main', null, leftEl, center, rightEl);
  document.body.append(topbar, main);

  const play = new PlayMode(app);
  let canvas, left, right, code, timeline;
  const hooks = {
    elOf: (id) => canvas.elOf(id),
    screenEl: (id) => canvas.screenEl(id),
    focus: (id) => canvas.zoomToFit([id]),
    onFocus: (id) => requestAnimationFrame(() => canvas.zoomToFit([id])),
    onHover: () => canvas.drawOverlay(),
    onContext: (x, y) => contextMenu(x, y),
    onEditComponent: (name) => editComponent(name),
    onEditCode: () => { right.tab = 'code'; right.render(); },
    play: (name) => play.open(name),
    ensureFont: (f) => { app.project.fonts.push(f + ':400;500;600;700'); MQ.ensureFonts(app.project); },
    previewMotion: () => previewMotion(),
    toggleTimeline: () => timeline.toggle(),
    runLint: () => runLint(),
    onZoom: () => { zoomLabel.textContent = Math.round(app.zoom * 100) + '%'; },
  };
  canvas = new Canvas(app, canvasEl, hooks);
  left = new LeftPanel(app, leftEl, hooks);
  right = new RightPanel(app, rightEl, hooks);
  code = new CodeDrawer(app, codeEl);
  timeline = new Timeline(app, tlEl, hooks);

  // ---------------- topbar
  const TOOLS = [['move', 'mouse-pointer-2', 'Déplacer (V)'], ['hand', 'hand', 'Main (H)'], ['frame', 'frame', 'Frame / écran (F)'], ['rect', 'square', 'Rectangle (R)'], ['ellipse', 'circle', 'Ellipse (O)'], ['text', 'type', 'Texte (T)'], ['image', 'image', 'Image (I)'], ['note', 'sticky-note', 'Note (N)']];
  const toolBtns = {};
  const zoomLabel = h('button.zoom', { onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); menu(r.left, r.bottom + 4, [{ label: 'Tout voir', key: 'Maj+1', run: () => canvas.zoomToFit() }, { label: 'Zoom sélection', key: 'Maj+2', run: () => canvas.zoomToFit(app.selection) }, { label: '50 %', run: () => canvas.zoomTo(0.5) }, { label: '100 %', key: 'Maj+0', run: () => canvas.zoomTo(1) }, { label: '200 %', run: () => canvas.zoomTo(2) }]); } }, '50%');
  const fileBtn = h('button.filebtn', { onclick: (e) => fileMenu(e) });
  const modeBtns = h('div.modes');
  const protoBtn = h('button.tb', { title: 'Mode prototype (P)', onclick: () => { app.protoView = !app.protoView; app.emit('proto'); } }, icon('workflow', 16));
  function renderTop() {
    clear(topbar);
    topbar.append(
      h('div.brand', null, h('span.logo', { html: '<svg width="22" height="22" viewBox="0 0 24 24"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B7BFF"/><stop offset="1" stop-color="#FF6BB5"/></linearGradient></defs><rect x="2" y="2" width="9" height="9" rx="3" fill="url(#lg)"/><rect x="13" y="2" width="9" height="9" rx="4.5" fill="#fff" opacity=".9"/><rect x="2" y="13" width="9" height="9" rx="2" fill="#fff" opacity=".55"/><path d="M13 13h9v9h-5a4 4 0 0 1-4-4z" fill="url(#lg)"/></svg>' }), h('b', null, 'Maquette')),
      fileBtn,
      h('div.tools', null, TOOLS.map(([t, ic, title]) => (toolBtns[t] = h('button.tb' + (app.tool === t ? '.on' : ''), { title, onclick: () => { app.tool = t; app.emit('tool'); } }, icon(ic, 16))))),
      h('span.grow'),
      h('div.pagename', null, h('span.muted', null, app.project.name), ' / ', app.page ? app.page.attrs.name || 'Page' : ''),
      h('span.grow'),
      modeBtns,
      protoBtn,
      h('button.tb', { title: 'Timeline Motion', onclick: () => timeline.toggle() }, icon('gantt-chart', 16)),
      h('button.tb', { title: 'Code source (Ctrl+/)', onclick: () => code.toggle() }, icon('code-xml', 16)),
      zoomLabel,
      h('button.playbtn', { title: 'Présenter (Ctrl+Entrée)', onclick: () => play.open(selectedScreenName()) }, icon('play', 14), 'Présenter'),
      h('button.tb', { title: 'Exporter', onclick: (e) => exportMenu(e) }, icon('share', 16)));
    renderFileBtn(); renderModes(); hooks.onZoom();
    protoBtn.classList.toggle('on', app.protoView);
  }
  function renderFileBtn() { clear(fileBtn).append(...[icon('file-code-2', 14), h('span', null, app.files[app.fileIndex].file), app.files[app.fileIndex].draft ? h('em', { title: 'Modifié localement' }, '•') : null, icon('chevron-down', 12)].filter(Boolean)); }
  function renderModes() {
    clear(modeBtns);
    if (app.project.modes.length > 1) modeBtns.append(...app.project.modes.map((m, i) => h('button.chip' + (i === app.mode ? '.on' : ''), { onclick: () => { app.mode = i; app.emit('mode'); } }, m)));
  }
  function selectedScreenName() { const n = app.selNodes[0]; const s = n && app.project.screenOf(n.id); return s ? s.attrs.name : null; }

  function fileMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    menu(r.left, r.bottom + 4, [
      ...app.files.map((f, i) => ({ label: f.file + (f.draft ? ' •' : ''), icon: i === app.fileIndex ? 'check' : 'file', run: () => openFile(i) })),
      '-',
      { label: 'Nouveau projet', icon: 'file-plus', run: () => { const name = `projet-${app.files.length + 1}.mq`; app.files.push({ file: name, source: NEW_PROJECT, baseHash: hashStr(NEW_PROJECT), local: true }); store('localfiles', app.files.filter((f) => f.local).map((f) => f.file)); openFile(app.files.length - 1); } },
      { label: 'Importer un .mq…', icon: 'upload', run: () => importFile() },
      { label: 'Télécharger le .mq', icon: 'download', run: () => download(app.files[app.fileIndex].file, app.source) },
      app.files[app.fileIndex].draft ? { label: 'Annuler mes modifications locales', icon: 'undo-2', run: () => { const f = app.files[app.fileIndex]; const orig = document.querySelector(`script[data-file="${CSS.escape(f.file)}"]`); if (orig) { f.source = orig.textContent.replace(/<\\\/script/gi, '</script'); f.draft = false; store('draft:' + f.file, null); openFile(app.fileIndex); } } } : null,
    ]);
  }
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.mq,.txt,.html' });
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const src = await f.text(); app.files.push({ file: f.name, source: src, baseHash: hashStr(src), local: true }); store('localfiles', app.files.filter((x) => x.local).map((x) => x.file)); openFile(app.files.length - 1); };
    inp.click();
  }
  function exportMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    menu(r.right - 240, r.bottom + 4, [
      { label: 'Prototype HTML autonome', icon: 'globe', run: () => exportPrototype() },
      { label: 'Télécharger le source .mq', icon: 'file-code-2', run: () => download(app.files[app.fileIndex].file, app.source) },
      { label: 'Copier le source', icon: 'copy', run: () => { navigator.clipboard && navigator.clipboard.writeText(app.source); toast('Source copiée'); } },
      { label: 'HTML statique de la sélection', icon: 'code', disabled: !app.selection.length, run: () => { const el = canvas.elOf(app.selection[0]); if (el) { navigator.clipboard && navigator.clipboard.writeText(MQ.toStaticHTML(el)); toast('HTML copié'); } } },
      { label: 'PNG de l\'écran sélectionné', icon: 'image', disabled: !selectedScreenName(), run: () => exportPNG(selectedScreenName()) },
    ]);
  }
  function exportPrototype() {
    const rt = document.getElementById('mq-runtime').textContent;
    const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${app.project.name}</title><style>html,body{margin:0;height:100%;background:#0f1014;overflow:hidden}#fit{position:fixed;inset:0;display:grid;place-items:center}</style></head><body><div id="fit"></div><script type="text/x-maquette" id="src">${esc(app.source)}</script><script>${esc(rt)}</script><script>const p=MQ.loadProject(document.getElementById('src').textContent.replace(/<\\\\\\/script/gi,'</script'));MQ.ensureStyles();MQ.ensureFonts(p);const s=p.startScreen(),z=p.sizeOf(s),host=document.createElement('div'),fr=MQ.deviceFrame(z.device,host,z);document.getElementById('fit').appendChild(fr);const fit=()=>{fr.style.transform='scale('+Math.min(1,(innerWidth-32)/fr.offsetWidth,(innerHeight-32)/fr.offsetHeight)+')'};addEventListener('resize',fit);const pl=new MQ.Player(p,host,{});pl.start();fit();addEventListener('keydown',e=>{if(e.key==='r')pl.start();if(e.key==='Backspace')pl.back()});</script></body></html>`;
    download(app.files[app.fileIndex].file.replace(/\.mq$/, '') + '-prototype.html', html, 'text/html');
  }
  async function exportPNG(name) {
    // rasterize via SVG foreignObject (fonts may fall back if not embedded)
    const el = canvas.screenEl(app.project.screen(name).id); if (!el) return;
    const w = el.offsetWidth, hh = el.offsetHeight;
    const clone = el.cloneNode(true);
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).filter((t) => t.includes('mq-')).join('\n');
    const xml = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${hh * 2}"><foreignObject width="${w}" height="${hh}" transform="scale(2)"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${xml}</div></foreignObject></svg>`;
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = w * 2; c.height = hh * 2; c.getContext('2d').drawImage(img, 0, 0); c.toBlob((b) => { const a = h('a', { href: URL.createObjectURL(b), download: name + '.png' }); document.body.appendChild(a); a.click(); a.remove(); }); };
    img.onerror = () => toast('Export PNG impossible dans ce navigateur', 'error');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function openFile(i) {
    app.loadFile(i);
    store('lastfile', app.files[i].file);
    if (app.error) toast('Erreur de parsing : ' + app.error.message, 'error');
    renderTop(); left.render(); right.render(); canvas.render(); code.refresh(true);
    requestAnimationFrame(() => canvas.zoomToFit());
  }

  // ---------------- actions
  function contextMenu(x, y) {
    const sel = app.selNodes; const n = sel[0];
    const isComp = n && /^[A-Z]/.test(n.tag) && app.project.components[n.tag];
    menu(x, y, [
      { label: 'Copier', key: 'Ctrl+C', icon: 'copy', disabled: !n, run: () => copy() },
      { label: 'Coller', key: 'Ctrl+V', icon: 'clipboard', disabled: !app.clipboard, run: () => paste() },
      { label: 'Dupliquer', key: 'Ctrl+D', icon: 'copy-plus', disabled: !n, run: () => duplicate() },
      { label: 'Supprimer', key: 'Suppr', icon: 'trash-2', disabled: !n, run: () => del() },
      '-',
      { label: 'Grouper (stack)', key: 'Ctrl+G', icon: 'group', disabled: !n || n.tag === 'screen', run: () => wrap('stack') },
      { label: 'Envelopper en ligne', icon: 'columns-3', disabled: !n || n.tag === 'screen', run: () => wrap('row', { gap: '8' }) },
      { label: 'Envelopper en colonne', key: 'Maj+A', icon: 'rows-3', disabled: !n || n.tag === 'screen', run: () => wrap('col', { gap: '8' }) },
      { label: 'Dégrouper', key: 'Ctrl+Maj+G', icon: 'ungroup', disabled: !n || !isContainer(n) || n.tag === 'screen', run: () => unwrap() },
      '-',
      { label: 'Créer un composant', key: 'Ctrl+Alt+K', icon: 'component', disabled: !n || n.tag === 'screen' || isComp, run: () => makeComponent() },
      isComp && !isComp.fromKit ? { label: `Éditer ${n.tag}`, icon: 'pencil', run: () => editComponent(n.tag) } : null,
      isComp ? { label: 'Détacher l\'instance', icon: 'unlink', run: () => detach() } : null,
      '-',
      { label: 'Premier plan', key: 'Ctrl+]', icon: 'bring-to-front', disabled: !n, run: () => reorder(1) },
      { label: 'Arrière-plan', key: 'Ctrl+[', icon: 'send-to-back', disabled: !n, run: () => reorder(-1) },
      '-',
      n && n.tag === 'screen' ? { label: 'Présenter depuis cet écran', icon: 'play', run: () => play.open(n.attrs.name) } : null,
      { label: 'Voir le code', icon: 'code-xml', disabled: !n, run: () => { right.tab = 'code'; right.render(); } },
    ]);
  }
  function copy() { if (!app.selection.length) return; app.clipboard = app.selNodes.map((n) => MQ.serializeNode(n)).join('\n'); try { navigator.clipboard.writeText(app.clipboard); } catch (e) { /* */ } toast('Copié'); }
  function paste(text) {
    const src = text || app.clipboard; if (!src) return;
    let nodes; try { nodes = MQ.parse(src).filter((x) => x.tag !== '#text'); } catch (e) { toast('Collage : ' + e.message, 'error'); return; }
    MQ.bumpIds(app.project.nodes); nodes = nodes.map((n) => MQ.clone(n, true));
    const sel = app.selNodes[0];
    let target = sel && (isContainer(sel) && sel.tag !== 'screen' || sel.tag === 'screen') ? sel : sel ? app.parent(sel.id) : null;
    app.change(() => {
      for (const n of nodes) {
        if (n.tag === 'screen' || !target || target.tag === 'page' || target.tag === 'project') { if (n.tag === 'screen') { n.attrs.name = (n.attrs.name || 'Écran') + ' copie'; n.attrs.x = String((+n.attrs.x || 0) + 60); } app.insert(null, n); }
        else { const idx = sel && sel !== target ? target.children.indexOf(sel) + 1 : undefined; app.insert(target.id, n, idx); }
      }
      app.selection = nodes.map((n) => n.id);
    });
  }
  function duplicate() { if (!app.selection.length) return; app.change(() => { app.selection = app.duplicate(app.selection); }); }
  function del() { if (!app.selection.length) return; app.change(() => app.remove(app.selection.slice())); }
  function wrap(tag, attrs = {}) {
    const ids = app.selection.filter((id) => app.node(id).tag !== 'screen'); if (!ids.length) return;
    app.change(() => { const w = app.wrap(ids, tag, attrs); if (w) app.selection = [w.id]; });
  }
  function unwrap() { const n = app.selNodes[0]; if (!n || !isContainer(n) || n.tag === 'screen') return; app.change(() => { app.selection = app.unwrap(n.id); }); }
  function reorder(dir) {
    const n = app.selNodes[0]; if (!n) return;
    app.change(() => { const sib = app.siblings(n.id); const i = sib.indexOf(n); const j = Math.max(0, Math.min(sib.length - 1, i + dir)); sib.splice(i, 1); sib.splice(j, 0, n); });
  }
  function makeComponent() {
    const n = app.selNodes[0]; if (!n || n.tag === 'screen') return;
    let name = prompt('Nom du composant (Majuscule, ex: ProductCard)', (n.attrs.name || 'MonComposant').replace(/[^\w]/g, '').replace(/^./, (c) => c.toUpperCase()));
    if (!name) return; name = name.replace(/[^\w]/g, ''); if (!/^[A-Z]/.test(name)) name = name[0].toUpperCase() + name.slice(1);
    app.change(() => {
      const root = MQ.clone(n, true); const pos = {};
      for (const k of ['x', 'y', 'top', 'left', 'right', 'bottom', 'absolute', 'fixed', 'place', 'grow', 'self']) if (root.attrs[k] !== undefined) { pos[k] = root.attrs[k]; delete root.attrs[k]; }
      const comp = { id: MQ.newId(), tag: 'component', attrs: { name, props: '' }, children: [root] };
      const top = app.project.rootNode ? app.project.rootNode.children : app.project.nodes;
      const firstPage = top.findIndex((x) => x.tag === 'page' || x.tag === 'screen');
      top.splice(firstPage < 0 ? top.length : firstPage, 0, comp);
      const sib = app.siblings(n.id); const inst = { id: MQ.newId(), tag: name, attrs: pos, children: [] };
      sib.splice(sib.indexOf(n), 1, inst);
      app.selection = [inst.id];
    });
    toast(`Composant ${name} créé — ajoute des props dans le code (props="label='…'")`);
  }
  function detach() {
    const n = app.selNodes[0]; const c = app.project.components[n.tag]; if (!c || !c.root) return;
    app.change(() => { const r = MQ.clone(c.root, true); for (const [k, v] of Object.entries(n.attrs)) if (!(k in c.props)) r.attrs[k] = v; const sib = app.siblings(n.id); sib.splice(sib.indexOf(n), 1, r); app.selection = [r.id]; });
    toast('Instance détachée (les {props} restent à remplacer)');
  }
  function editComponent(name) {
    const c = app.project.components[name];
    if (!c) return;
    if (c.fromKit) { toast(`${name} vient du kit : copie sa définition dans ton projet pour le personnaliser (mq kit).`); return; }
    app.select(c.node.id);
    right.tab = 'code'; right.render();
  }
  function previewMotion() {
    const n = app.selNodes[0]; const s = n ? app.project.screenOf(n.id) : null;
    const target = s || (app.page && app.page.children.find((c) => c.tag === 'screen'));
    if (!target) return;
    const el = canvas.screenEl(target.id);
    if (el && el._mq) MQ.playAnims(el._mq.anims, { project: app.project });
  }
  function runLint() {
    let issues = MQ.lintProject(app.project);
    for (const s of app.page ? app.page.children.filter((c) => c.tag === 'screen') : []) {
      const el = canvas.screenEl(s.id); if (el) issues = issues.concat(MQ.lintScreen(el, app.project, s));
    }
    return issues;
  }

  // ---------------- keyboard
  addEventListener('keydown', (e) => {
    if (play.root) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
    if (k === ' ') { canvas.spaceDown = true; canvasEl.classList.add('grab'); e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); app.redo(); return; }
    if (mod && k === 'c') { copy(); return; }
    if (mod && k === 'x') { copy(); del(); return; }
    if (mod && k === 'v') { e.preventDefault(); if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t2) => paste(t2 && t2.trim().startsWith('<') ? t2 : null)).catch(() => paste()); else paste(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k === 'a') { e.preventDefault(); const n = app.selNodes[0]; const par = n ? app.parent(n.id) : null; app.select(par && par.children ? par.children.filter((c) => c.tag !== '#text').map((c) => c.id) : (app.page ? app.page.children.map((c) => c.id) : [])); return; }
    if (mod && e.altKey && k === 'k') { e.preventDefault(); makeComponent(); return; }
    if (mod && e.shiftKey && k === 'g') { e.preventDefault(); unwrap(); return; }
    if (mod && k === 'g') { e.preventDefault(); wrap('stack'); return; }
    if (mod && k === ']') { reorder(1); return; }
    if (mod && k === '[') { reorder(-1); return; }
    if (mod && k === '/') { e.preventDefault(); code.toggle(); return; }
    if (mod && k === 'enter') { e.preventDefault(); play.open(selectedScreenName()); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); canvas.zoomBy(1.25); return; }
    if (mod && k === '-') { e.preventDefault(); canvas.zoomBy(0.8); return; }
    if (e.shiftKey && (e.code === 'Digit1')) { canvas.zoomToFit(); return; }
    if (e.shiftKey && (e.code === 'Digit2')) { canvas.zoomToFit(app.selection); return; }
    if (e.shiftKey && (e.code === 'Digit0')) { canvas.zoomTo(1); return; }
    if (e.shiftKey && k === 'a') { wrap('col', { gap: '8' }); return; }
    if (k === 'delete' || k === 'backspace') { del(); return; }
    if (k === 'escape') { if (app.tool !== 'move') { app.tool = 'move'; app.emit('tool'); } else { const n = app.selNodes[0]; const p = n && app.parent(n.id); app.select(p && p.tag !== 'page' && p.tag !== 'project' ? p.id : []); } return; }
    if (k === 'enter') { const n = app.selNodes[0]; if (!n) return; if (e.shiftKey) { const p = app.parent(n.id); if (p && p.tag !== 'page' && p.tag !== 'project') app.select(p.id); } else if (n.tag === 'text' || n.tag === 'note') canvas.editText(n.id); else { const c = (n.children || []).filter((x) => x.tag !== '#text'); if (c.length) app.select(c.map((x) => x.id)); } return; }
    if (k === 'tab') { e.preventDefault(); const n = app.selNodes[0]; if (!n) return; const sib = app.siblings(n.id).filter((x) => x.tag !== '#text'); const i = sib.indexOf(n); app.select(sib[(i + (e.shiftKey ? -1 : 1) + sib.length) % sib.length].id); return; }
    if (k.startsWith('arrow') && app.selection.length) {
      e.preventDefault(); const step = e.shiftKey ? 10 : 1;
      const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
      app.change(() => {
        for (const n of app.selNodes) {
          const el = canvas.elOf(n.id);
          const abs = n.tag === 'screen' || (app.page.children.includes(n)) || (el && getComputedStyle(el).position === 'absolute');
          if (abs) { n.attrs.x = String((+n.attrs.x || (n._autoX || 0)) + dx); n.attrs.y = String((+n.attrs.y || 0) + dy); }
          else { const sib = app.siblings(n.id); const i = sib.indexOf(n); const j = Math.max(0, Math.min(sib.length - 1, i + (dx + dy > 0 ? 1 : -1))); sib.splice(i, 1); sib.splice(j, 0, n); }
        }
      });
      return;
    }
    if (mod || e.altKey) return;
    const toolKeys = { v: 'move', h: 'hand', f: 'frame', r: 'rect', o: 'ellipse', t: 'text', i: 'image', n: 'note' };
    if (toolKeys[k]) { app.tool = toolKeys[k]; app.emit('tool'); return; }
    if (k === 'p') { app.protoView = !app.protoView; app.emit('proto'); return; }
  });
  addEventListener('keyup', (e) => { if (e.key === ' ') { canvas.spaceDown = false; canvasEl.classList.remove('grab'); } if (e.key === 'Alt') { canvas.measure = null; canvas.drawOverlay(); } });

  // canvas drop of assets
  canvasEl.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/mq-insert')) e.preventDefault(); });
  canvasEl.addEventListener('drop', (e) => {
    const name = e.dataTransfer.getData('text/mq-insert'); if (!name) return; e.preventDefault();
    const cont = canvas.containerAt(e.clientX, e.clientY, []); if (!cont) return;
    const node = { id: MQ.newId(), tag: name, attrs: {}, children: [] };
    const lel = canvas.layoutEl(cont.el, cont.node);
    if (canvas.layoutKind(lel) === 'stack') { const r = lel.getBoundingClientRect(); node.attrs.x = String(Math.round((e.clientX - r.left) / app.zoom)); node.attrs.y = String(Math.round((e.clientY - r.top) / app.zoom)); }
    app.change(() => { app.insert(cont.id, node); app.selection = [node.id]; });
  });

  // ---------------- reactivity
  let raf = null;
  app.on((what) => {
    if (what === 'tool') { for (const [t, b] of Object.entries(toolBtns)) b.classList.toggle('on', app.tool === t); canvasEl.dataset.tool = app.tool; return; }
    if (what === 'selection') { canvas.drawOverlay(); left.render(); right.render(); code.scrollToSelection(); if (timeline.open) timeline.render(); return; }
    if (what === 'proto') { protoBtn.classList.toggle('on', app.protoView); document.body.classList.toggle('proto', app.protoView); if (app.protoView && right.tab === 'design') right.tab = 'proto'; else if (!app.protoView && right.tab === 'proto') right.tab = 'design'; right.render(); canvas.drawOverlay(); return; }
    if (what === 'error') { code.setStatus(); return; }
    if (what === 'file') return;
    if (what === 'mode') renderModes();
    if (what === 'page') renderTop();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = null; canvas.render(); left.render(); right.render(); code.refresh(); if (timeline.open) timeline.render(); renderFileBtn(); if (what === 'page') requestAnimationFrame(() => canvas.zoomToFit()); });
    if (app.files[app.fileIndex]) app.files[app.fileIndex].draft = app.files[app.fileIndex].source !== (document.querySelector(`script[data-file="${CSS.escape(app.files[app.fileIndex].file)}"]`) || {}).textContent;
  });

  const last = store('lastfile');
  let idx = app.files.findIndex((f) => f.open);
  if (idx < 0) idx = Math.max(0, app.files.findIndex((f) => f.file === last));
  openFile(idx);
  document.fonts && document.fonts.ready.then(() => canvas.drawOverlay());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
