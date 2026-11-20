// Maquette editor bootstrap
import { MQ, h, icon, clear, toast, store, download, menu, ask, modal } from './dom.js';
import { App, isContainer, hashStr } from './state.js';
import { Canvas } from './canvas.js';
import { LeftPanel } from './left.js';
import { RightPanel } from './right.js';
import { CodeDrawer } from './code.js';
import { PlayMode } from './play.js';
import { Timeline } from './timeline.js';
import { Studio } from './studio.js';

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

// SVG color-vision filters (Machado et al. 2009, severity 1.0)
function ensureVisionFilters() {
  if (document.getElementById('mq-vision')) return;
  const M = { protanopia: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0', deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0', tritanopia: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0' };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'mq-vision'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
  svg.innerHTML = Object.entries(M).map(([k, v]) => `<filter id="mq-${k}"><feColorMatrix type="matrix" values="${v}"/></filter>`).join('');
  document.body.appendChild(svg);
}

function boot() {
  MQ.ensureStyles();
  try { const ic = document.getElementById('mq-icons'); if (ic) MQ.registerPacks(JSON.parse(ic.textContent.replace(/<\\\/script/gi, '</script'))); } catch (e) { /* */ }
  const app = new App();
  window.app = app;
  app.showGrid = !!store('grid'); app.view = 'normal';
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
  let tidyFn = null;
  let canvas, left, right, code, timeline;
  const hooks = {
    elOf: (id) => canvas.elOf(id),
    screenEl: (id) => canvas.screenEl(id),
    focus: (id) => canvas.zoomToFit([id]),
    onFocus: (id) => requestAnimationFrame(() => canvas.zoomToFit([id])),
    onHover: () => canvas.drawOverlay(),
    onContext: (x, y) => contextMenu(x, y),
    onEditComponent: (name) => editComponent(name),
    openStudio: (name) => studio.open(name),
    onEditCode: () => { right.tab = 'code'; right.render(); },
    play: (name) => play.open(name),
    ensureFont: (f) => { app.project.fonts.push(f + ':400;500;600;700'); MQ.ensureFonts(app.project); },
    previewMotion: () => previewMotion(),
    toggleTimeline: () => timeline.toggle(),
    runLint: () => runLint(),
    onZoom: () => { zoomLabel.textContent = Math.round(app.zoom * 100) + '%'; },
    itemEl: (id) => canvas.items.get(id),
    setTrails: (t) => { canvas.trails = t; canvas.drawOverlay(); },
    toWorld: (x, y) => canvas.toWorld(x, y),
    setMarkers: (issues) => { canvas.markers = issues.filter((i) => i.level !== 'info' && i.id); canvas.drawOverlay(); },    editPoints: (id) => canvas.vedit.enter(id),
    flatten: (id) => flatten(id),
    booleanOp: (op) => booleanOp(op),
    pathOp: (id, op) => pathOp(id, op),
    outlineStroke: (id) => outlineStroke(id),
    bakeMods: (id) => bakeMods(id),
    shapeBuilder: () => canvas.sbuild.start(app.selection),
    registerTidy: (fn) => { tidyFn = fn; },
    toast: (m) => toast(m),
    exportSelectionPNG: () => exportSelectionPNG(),
    exportSelectionSVG: () => exportSelectionSVG(),
  };
  canvas = new Canvas(app, canvasEl, hooks);
  window.__canvas = canvas; // used by `mq drive` (agent pointer)
  window.__play = play;
  left = new LeftPanel(app, leftEl, hooks);
  right = new RightPanel(app, rightEl, hooks);
  window.__right = right;
  const studio = new Studio(app, hooks);
  window.__studio = studio; // Component Studio (also driven by `mq drive … studio Name`)
  code = new CodeDrawer(app, codeEl);
  timeline = new Timeline(app, tlEl, hooks);

  // ---------------- topbar
  const TOOLS = [['move', 'mouse-pointer-2', 'Déplacer (V)'], ['hand', 'hand', 'Main (H)'], ['frame', 'frame', 'Frame / écran (F)'], ['rect', 'square', 'Rectangle (R)'], ['ellipse', 'circle', 'Ellipse (O)'], ['shapes', 'shapes', 'Formes (étoile, polygone, blob…) (S)'], ['pen', 'pen-tool', 'Plume (P)'], ['pencil', 'pencil', 'Crayon (Maj+P)'], ['text', 'type', 'Texte (T)'], ['image', 'image', 'Image (I)'], ['note', 'sticky-note', 'Note (N)']];
  const SHAPE_MENU = [['star', 'star', 'Étoile'], ['polygon', 'hexagon', 'Polygone'], ['triangle', 'triangle', 'Triangle'], ['squircle', 'squircle', 'Squircle'], ['blob', 'cloud', 'Blob organique'], ['heart', 'heart', 'Cœur'], ['burst', 'sun', 'Éclat / badge'], ['ring', 'circle-dot', 'Anneau'], ['arrow', 'arrow-right', 'Flèche'], ['chevron', 'chevron-right', 'Chevron'], ['cross', 'plus', 'Croix'], ['bubble', 'message-square', 'Bulle'], ['wave', 'waves', 'Vague'], ['gear', 'cog', 'Engrenage'], ['spiral', 'loader', 'Spirale']];
  const shapeMenu = (btn) => { const r = btn.getBoundingClientRect(); menu(r.left, r.bottom + 4, SHAPE_MENU.map(([k, ic, l]) => ({ label: l, icon: ic, run: () => { app.tool = 'shape:' + k; app.emit('tool'); } }))); };
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
      h('div.tools', null, TOOLS.map(([t, ic, title]) => (toolBtns[t] = h('button.tb' + (app.tool === t || (t === 'shapes' && app.tool.startsWith('shape:')) ? '.on' : ''), { title, onclick: (e) => { if (t === 'shapes') return shapeMenu(e.currentTarget); app.tool = t; app.emit('tool'); } }, icon(ic, 16))))),
      h('span.grow'),
      h('div.pagename', null, h('span.muted', null, app.project.name), ' / ', app.page ? app.page.attrs.name || 'Page' : ''),
      h('span.grow'),
      modeBtns,
      protoBtn,
      h('button.tb' + (app.showGrid ? '.on' : ''), { title: 'Grilles de mise en page (Maj+G)', onclick: () => toggleGrid() }, icon('layout-grid', 16)),
      h('button.tb' + (app.view !== 'normal' ? '.on' : ''), { title: 'Simulation de vision', onclick: (e) => viewMenu(e) }, icon('eye', 16)),
      h('button.tb', { title: 'Component Studio (Ctrl+Maj+K)', onclick: () => studio.open() }, icon('component', 16)),
      h('button.tb', { title: 'Timeline Motion', onclick: () => timeline.toggle() }, icon('gantt-chart', 16)),
      h('button.tb', { title: 'Code source (Ctrl+/)', onclick: () => code.toggle() }, icon('code-xml', 16)),
      zoomLabel,
      h('button.playbtn', { title: 'Présenter (Ctrl+Entrée)', onclick: () => play.open(selectedScreenName()) }, icon('play', 14), 'Présenter'),
      h('button.tb', { title: 'Exporter', onclick: (e) => exportMenu(e) }, icon('share', 16)));
    renderFileBtn(); renderModes(); hooks.onZoom();
    protoBtn.classList.toggle('on', app.protoView);
  }
  function toggleGrid() { app.showGrid = !app.showGrid; store('grid', app.showGrid); renderTop(); canvas.render(); }
  const VIEWS = [['normal', 'Normal'], ['grayscale', 'Niveaux de gris (hiérarchie)'], ['protanopia', 'Protanopie (rouge)'], ['deuteranopia', 'Deutéranopie (vert)'], ['tritanopia', 'Tritanopie (bleu)'], ['achromatopsia', 'Achromatopsie'], ['blur', 'Basse vision (flou)'], ['contrast-low', 'Faible contraste (soleil)']];
  function setView(v) { app.view = v; ensureVisionFilters(); document.body.dataset.view = v; renderTop(); toast(v === 'normal' ? 'Vue normale' : 'Simulation : ' + VIEWS.find((x) => x[0] === v)[1]); }
  function viewMenu(e) { const r = e.currentTarget.getBoundingClientRect(); menu(r.left - 120, r.bottom + 4, VIEWS.map(([k, l]) => ({ label: l, icon: app.view === k ? 'check' : 'circle', run: () => setView(k) }))); }
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
      { label: 'Historique des versions…', key: 'Ctrl+Alt+S', icon: 'history', run: () => versions() },
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
      { label: 'PNG de la sélection', icon: 'image', disabled: !app.selection.length, run: () => exportSelectionPNG() },
      { label: 'SVG du vecteur sélectionné', icon: 'pen-tool', disabled: !app.selection.length, run: () => exportSelectionSVG() },
    ]);
  }
  function exportPrototype() {
    const rt = document.getElementById('mq-runtime').textContent;
    const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${app.project.name}</title><style>html,body{margin:0;height:100%;background:#0f1014;overflow:hidden}#stage{position:fixed;inset:0}</style></head><body><div id="stage"></div><script type="text/x-maquette" id="src">${esc(app.source)}</script><script>${esc(rt)}</script><script>const p=MQ.loadProject(document.getElementById('src').textContent.replace(/<\\\/script/gi,'</script'));const m=MQ.mountPrototype(p,document.getElementById('stage'),{pad:16});addEventListener('keydown',e=>{if(e.key==='r')m.player.start();if(e.key==='Backspace')m.player.back()});</script></body></html>`;
    download(app.files[app.fileIndex].file.replace(/\.mq$/, '') + '-prototype.html', html, 'text/html');
  }
  // rasterize any element (screen or selection) via SVG foreignObject; shown in a dialog (downloads are blocked in artifacts)
  function rasterize(el, scale = 2) {
    return new Promise((res, rej) => {
      const w = el.offsetWidth, hh = el.offsetHeight; const clone = el.cloneNode(true); clone.style.transform = 'none'; clone.style.position = 'static'; clone.style.margin = '0';
      const css = [...document.querySelectorAll('style')].map((s) => s.textContent).filter((t) => t.includes('mq-')).join('\n');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${hh * scale}"><foreignObject width="${w}" height="${hh}" transform="scale(${scale})"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${new XMLSerializer().serializeToString(clone)}</div></foreignObject></svg>`;
      const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = w * scale; c.height = hh * scale; c.getContext('2d').drawImage(img, 0, 0); try { res(c.toDataURL('image/png')); } catch (e) { rej(e); } };
      img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  async function exportSelectionPNG() {
    const id = app.selection[0]; const el = id && canvas.elOf(id); if (!el) return;
    try { const url = await rasterize(el); showImage(url, (app.node(id).attrs.name || app.node(id).tag) + '.png'); } catch (e) { toast('Export PNG impossible dans ce navigateur', 'error'); }
  }
  function showImage(url, name) {
    modal('Export PNG', h('div.mq-dbody', null, h('img', { src: url, style: { maxWidth: 'min(520px, 80vw)', maxHeight: '50vh', display: 'block', margin: '0 auto', background: 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0/12px 12px' } }), h('div.hint', null, 'Clic droit › Enregistrer l’image, ou le bouton ci-dessous.')), (close) => [
      h('button.btn', { onclick: close }, 'Fermer'),
      h('a.btn.primary', { href: url, download: name }, 'Télécharger'),
    ]);
  }
  function exportSelectionSVG() {
    const id = app.selection[0]; const n = app.node(id); const el = id && canvas.elOf(id); if (!el || !el._path) { toast('Sélectionne un vecteur ou une forme'); return; }
    const vw = +el.dataset.vw || el.offsetWidth, vh = +el.dataset.vh || el.offsetHeight; const cs = getComputedStyle(el.querySelector('.mq-vec-fill') || el);
    const fill = n.attrs.fill && !/^\$|\(/.test(n.attrs.fill) ? n.attrs.fill : (el.querySelector('.mq-vec-fill') ? cs.backgroundColor : 'none');
    const st = el.querySelector('.mq-vec-stroke path'); const stroke = st ? ` stroke="${st.getAttribute('stroke')}" stroke-width="${st.getAttribute('stroke-width')}"` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}"><path d="${MQ.Path.serializePath(el._path)}" fill="${fill}" fill-rule="evenodd"${stroke}/></svg>`;
    download((n.attrs.name || 'forme') + '.svg', svg, 'image/svg+xml');
  }
  // version history (named snapshots per file, kept in this browser)
  function versions() {
    const key = 'versions:' + app.files[app.fileIndex].file; const list = store(key) || [];
    const render = () => h('div.mq-dbody', { style: { display: 'grid', gap: '6px', minWidth: 'min(460px, 86vw)' } },
      list.length ? list.slice().reverse().map((v, k) => h('div.trow', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('b', { style: { flex: 1 } }, v.name), h('span.muted', null, new Date(v.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })),
        h('button.btn', { onclick: () => { app.setSource(v.source); toast(`Version « ${v.name} » restaurée (Ctrl+Z pour annuler)`); document.querySelector('.mq-modal')?.remove(); } }, 'Restaurer'),
        h('button.mini', { title: 'Supprimer', onclick: () => { list.splice(list.length - 1 - k, 1); store(key, list); versions(); } }, icon('trash-2', 13)))) : h('div.empty', null, 'Aucune version enregistrée pour ce fichier.'));
    modal('Historique des versions', render(), (close) => [
      h('button.btn', { onclick: close }, 'Fermer'),
      h('button.btn.primary', { onclick: async () => { const name = await ask('Nom de la version', new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }), 'Ex : « avant refonte de la home »'); if (!name) return; list.push({ name, at: Date.now(), source: app.source }); store(key, list.slice(-40)); toast('Version enregistrée'); versions(); } }, icon('save', 13), 'Enregistrer cette version'),
    ]);
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
    const isComp = n && /^(\w+\.)?[A-Z]/.test(n.tag) && app.project.components[n.tag];
    menu(x, y, [
      { label: 'Copier', key: 'Ctrl+C', icon: 'copy', disabled: !n, run: () => copy() },
      { label: 'Coller', key: 'Ctrl+V', icon: 'clipboard', disabled: !app.clipboard, run: () => paste() },
      { label: 'Dupliquer', key: 'Ctrl+D', icon: 'copy-plus', disabled: !n, run: () => duplicate() },
      { label: 'Supprimer', key: 'Suppr', icon: 'trash-2', disabled: !n, run: () => del() },
      n && n.tag !== 'screen' ? { label: 'Sélectionner les calques correspondants', icon: 'scan-search', run: () => selectMatching(n) } : null,
      '-',
      { label: 'Grouper (stack)', key: 'Ctrl+G', icon: 'group', disabled: !n || n.tag === 'screen', run: () => wrap('stack') },
      { label: 'Envelopper en ligne', icon: 'columns-3', disabled: !n || n.tag === 'screen', run: () => wrap('row', { gap: '8' }) },
      { label: 'Envelopper en colonne', key: 'Maj+A', icon: 'rows-3', disabled: !n || n.tag === 'screen', run: () => wrap('col', { gap: '8' }) },
      { label: 'Dégrouper', key: 'Ctrl+Maj+G', icon: 'ungroup', disabled: !n || !isContainer(n) || n.tag === 'screen', run: () => unwrap() },
      '-',
      n && ['vector', 'shape', 'rect', 'ellipse', 'boolean'].includes(n.tag) ? { label: 'Éditer les points', key: 'Entrée', icon: 'spline', run: () => canvas.vedit.enter(n.id) } : null,
      sel.length > 1 ? { label: 'Utiliser comme masque', key: 'Ctrl+Alt+M', icon: 'venetian-mask', run: () => useAsMask() } : null,
      sel.length > 1 ? { label: 'Union', icon: 'squares-unite', run: () => booleanOp('union') } : null,
      sel.length > 1 ? { label: 'Soustraire', icon: 'squares-subtract', run: () => booleanOp('subtract') } : null,
      sel.length > 1 ? { label: 'Intersection', icon: 'squares-intersect', run: () => booleanOp('intersect') } : null,
      sel.length > 1 ? { label: 'Exclure', icon: 'squares-exclude', run: () => booleanOp('exclude') } : null,
      n && ['shape', 'boolean', 'rect', 'ellipse', 'textpath'].includes(n.tag) ? { label: 'Aplatir en vecteur', key: 'Ctrl+E', icon: 'layers-2', run: () => flatten(n.id) } : null,
      sel.length >= 1 && n && ['vector', 'shape', 'boolean', 'rect', 'ellipse'].includes(n.tag) ? { label: 'Shape Builder', key: 'Maj+M', icon: 'shapes', run: () => canvas.sbuild.start(app.selection) } : null,
      n && ['vector', 'shape', 'boolean', 'rect', 'ellipse', 'path'].includes(n.tag) && (n.attrs.stroke || n.attrs['width-profile'] || n.attrs.brush) ? { label: 'Vectoriser le contour', key: 'Ctrl+Alt+O', icon: 'pen-line', run: () => outlineStroke(n.id) } : null,
      n && (n.attrs.offset || n.attrs['width-profile'] || n.attrs.brush) ? { label: 'Figer les modificateurs', icon: 'stamp', run: () => bakeMods(n.id) } : null,
      '-',
      n && (/^(\w+\.)?[A-Z]/.test(n.tag) || n.tag === 'instance') ? { label: 'Remplacer l’instance…', icon: 'replace', run: () => swapInstance(n.id) } : null,
      { label: sel.length > 1 ? 'Renommer en lot…' : 'Renommer…', key: 'Ctrl+R', icon: 'pencil-line', run: () => renameLayers() },
      n ? { label: 'Contenu réaliste', icon: 'sparkles', submenu: true, run: (ev) => { const r = canvasEl.getBoundingClientRect(); menu(r.left + 260, r.top + 120, [['name', 'Nom'], ['first', 'Prénom'], ['email', 'E-mail'], ['phone', 'Téléphone'], ['job', 'Métier'], ['company', 'Entreprise'], ['city', 'Ville'], ['address', 'Adresse'], ['price', 'Prix'], ['amount', 'Montant'], ['date', 'Date'], ['ago', 'Il y a…'], ['title', 'Titre'], ['sentence', 'Phrase'], ['paragraph', 'Paragraphe'], ['tag', 'Étiquette'], ['rating', 'Note']].map(([k, l]) => ({ label: l, run: () => fillContent(k) }))); } } : null,
      { label: 'Créer un composant', key: 'Ctrl+Alt+K', icon: 'component', disabled: !n || n.tag === 'screen' || isComp, run: () => makeComponent() },
      isComp ? { label: `Ouvrir ${n.tag} dans le Studio`, icon: 'component', run: () => studio.open(n.tag) } : null,
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
  // boolean operations on the selection (Figma: Union / Subtract / Intersect / Exclude)
  function booleanOp(op) {
    const nodes = app.selNodes.filter((n) => n.tag !== 'screen'); if (nodes.length < 2) return;
    const parent = app.parent(nodes[0].id); if (!nodes.every((n) => app.parent(n.id) === parent)) { toast('Sélectionne des formes du même parent'); return; }
    const z = app.zoom; const pel = canvas.elOf(nodes[0].id).offsetParent || canvas.elOf(nodes[0].id).parentElement; const pr = pel.getBoundingClientRect();
    const boxes = nodes.map((n) => { const r = canvas.elOf(n.id).getBoundingClientRect(); return { n, x: (r.left - pr.left) / z, y: (r.top - pr.top) / z, w: r.width / z, h: r.height / z }; });
    const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y)), x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
    app.change(() => {
      const first = nodes[0];
      const b = { id: MQ.newId(), tag: 'boolean', attrs: { op, x: String(Math.round(x0)), y: String(Math.round(y0)), w: String(Math.round(x1 - x0)), h: String(Math.round(y1 - y0)), fill: first.attrs.fill || '#6E56F8' }, children: [] };
      if (first.attrs.stroke) b.attrs.stroke = first.attrs.stroke;
      const sib = app.siblings(first.id); const idx = sib.indexOf(first);
      for (const bx of boxes) { const c = bx.n; app.remove([c.id]); c.attrs.x = String(Math.round(bx.x - x0)); c.attrs.y = String(Math.round(bx.y - y0)); if (!/^\d/.test(String(c.attrs.w))) c.attrs.w = String(Math.round(bx.w)); if (!/^\d/.test(String(c.attrs.h))) c.attrs.h = String(Math.round(bx.h)); for (const k of ['absolute', 'place', 'top', 'left', 'right', 'bottom']) delete c.attrs[k]; b.children.push(c); }
      sib.splice(Math.min(idx, sib.length), 0, b); app.selection = [b.id];
    });
    toast(`Booléen « ${op} » créé (reste éditable ; « Aplatir » le fige)`);
  }
  function pathOp(id, op) {
    const n = app.node(id); if (!n || !n.attrs.d) return; const P = MQ.Path; let subs = P.parsePath(n.attrs.d);
    const w = +n.attrs.w || P.bbox(subs).w, hh = +n.attrs.h || P.bbox(subs).h;
    // Lisser: every anchor becomes a smooth (Catmull-Rom) node; Simplifier: resample + RDP + smooth (fewer points)
    if (op === 'smooth') subs = subs.flatMap((s) => P.smoothPath(s.nodes.map((q) => [q.x, q.y]), s.closed, 1));
    if (op === 'simplify') subs = P.flatten(subs, 0.5).flatMap((f) => { let pts = P.simplify(f.pts, Math.max(1.5, Math.max(w, hh) / 60)); if (f.closed && pts.length > 3) pts = pts.slice(0, -1); return P.smoothPath(pts, f.closed, 1); });
    if (op === 'flipx') subs = P.transformPath(subs, (q) => ({ x: w - q.x, y: q.y }));
    if (op === 'flipy') subs = P.transformPath(subs, (q) => ({ x: q.x, y: hh - q.y }));
    app.change(() => { n.attrs.d = P.serializePath(subs); });
  }
  // stroke → filled vector (center/inside/outside, caps & joins kept; width profiles and brushes included)
  function strokeGeometry(n, el) {
    const O = MQ.PathOps; const P = MQ.Path; const subs = el._path; if (!subs) return null;
    const st = String(n.attrs.stroke || '').split(/\s+/); const w = parseFloat(st.find((x) => /^\d/.test(x))) || 2;
    const align = st.find((x) => ['inside', 'outside', 'center'].includes(x)) || 'center';
    const color = st.find((x) => !/^\d/.test(x) && !['inside', 'outside', 'center', 'dashed', 'dotted'].includes(x)) || n.attrs.color || '#000000';
    const base = n.attrs.offset ? O.offsetPath(subs, parseFloat(n.attrs.offset)) : subs;
    let geo = n.attrs.brush ? O.scatterBrush(base, n.attrs.brush) : n.attrs['width-profile'] ? O.widthProfile(base, w, n.attrs['width-profile'], { seed: +n.attrs.seed || 3 }) : O.outlineStroke(base, w, { cap: n.attrs.cap === 'butt' ? 'butt' : n.attrs.cap === 'square' ? 'square' : 'round', join: 'round', align });
    return { geo, color, base };
  }
  function placeVector(geo, x0, y0, attrs) {
    const P = MQ.Path; const bb = P.bbox(geo);
    return { id: MQ.newId(), tag: 'vector', attrs: { x: String(Math.round((x0 + bb.x) * 10) / 10), y: String(Math.round((y0 + bb.y) * 10) / 10), w: String(Math.max(1, Math.round(bb.w * 10) / 10)), h: String(Math.max(1, Math.round(bb.h * 10) / 10)), ...attrs, d: P.serializePath(P.translatePath(geo, -bb.x, -bb.y)) }, children: [] };
  }
  // Figma "Use as mask": the bottom-most selected layer masks the others (mask group = <stack mask=first>)
  // Instance swap: replace a component instance by another component, keeping props they share
  function swapInstance(id) {
    const n = app.node(id); if (!n) return; const r = canvas.elOf(id)?.getBoundingClientRect() || { left: 200, bottom: 200 };
    const comps = Object.keys(app.project.components).filter((c) => !/Base$/.test(c) && c !== n.tag);
    const same = comps.filter((c) => c.split('.')[0] === n.tag.split('.')[0] && c.includes('.') === n.tag.includes('.'));
    menu(r.left, r.bottom + 4, [...same, ...comps.filter((c) => !same.includes(c))].slice(0, 60).map((c) => ({ label: c, icon: 'component', run: () => {
      const props = app.project.components[c].props;
      app.change(() => { const keep = {}; for (const [k, v] of Object.entries(n.attrs)) if (k in props || !(k in (app.project.components[n.tag]?.props || {}))) keep[k] = v; n.tag = c; n.attrs = keep; });
      toast(`Instance remplacée par ${c}`);
    } })));
  }
  // Figma "Select matching layers": same type + same look (fill, stroke, size, text style) in the same screen
  function selectMatching(n) {
    const key = (x) => [x.tag, x.attrs.fill ?? x.attrs.bg ?? '', x.attrs.stroke ?? '', x.attrs.class ?? '', x.attrs.size ?? '', x.attrs.radius ?? '', x.tag === 'boolean' ? x.attrs.op || 'union' : ''].join('|');
    let root = n; for (let p = app.parent(n.id); p && p.tag !== 'page' && p.tag !== 'project'; p = app.parent(p.id)) root = p;
    const k = key(n); const out = [];
    const walk = (x) => { if (!x || x.tag === '#text') return; if (x.attrs && key(x) === k) out.push(x.id); (x.children || []).forEach(walk); };
    walk(root); app.select(out); toast(`${out.length} calque${out.length > 1 ? 's' : ''} correspondant${out.length > 1 ? 's' : ''}`);
  }
  // Batch rename (Figma: Cmd+R on several layers / plugin Rename It): $n number, $nn padded, $name current name, $tag, $text
  async function renameLayers() {
    const nodes = app.selNodes; if (!nodes.length) return;
    const pat = await ask(nodes.length > 1 ? `Renommer ${nodes.length} calques` : 'Renommer le calque', nodes.length > 1 ? 'carte-$n' : (nodes[0].attrs.name || ''), '$n numéro (1, 2…), $nn (01, 02…), $name nom actuel, $tag type, $text texte. Vide = retirer le nom.');
    if (pat === null) return;
    app.change(() => nodes.forEach((n, i) => {
      const txt = (n.children || []).filter((c) => c.tag === '#text').map((c) => c.text).join(' ').trim().slice(0, 24);
      const v = pat.replace(/\$nn/g, String(i + 1).padStart(2, '0')).replace(/\$n/g, String(i + 1)).replace(/\$name/g, n.attrs.name || n.tag).replace(/\$tag/g, n.tag).replace(/\$text/g, txt.toLowerCase().replace(/[^\w-]+/g, '-'));
      if (v) n.attrs.name = v; else delete n.attrs.name;
    }));
    toast(`${nodes.length} calque(s) renommé(s)`);
  }
  // Find & replace in texts (and optionally layer names) of the current page — or the whole project
  async function findReplace() {
    const find = await ask('Rechercher', '', 'Texte à chercher dans les textes et les noms de calques de la page');
    if (!find) return;
    const nodes = []; const walk = (n) => { if (!n) return; nodes.push(n); (n.children || []).forEach(walk); };
    (app.page ? app.page.children : app.project.nodes).forEach(walk);
    const hits = nodes.filter((n) => (n.tag === '#text' && n.text.includes(find)) || (n.attrs && n.attrs.name && n.attrs.name.includes(find)));
    if (!hits.length) { toast(`« ${find} » introuvable sur cette page`); return; }
    const repl = await ask(`Remplacer « ${find} » (${hits.length} occurrence(s))`, find, 'Laisse tel quel pour seulement sélectionner les calques trouvés');
    if (repl === null) return;
    if (repl === find) { const ids = [...new Set(hits.map((n) => (n.tag === '#text' ? app.parent(n.id)?.id : n.id)).filter(Boolean))]; app.select(ids); toast(`${ids.length} calque(s) sélectionné(s)`); return; }
    app.change(() => hits.forEach((n) => { if (n.tag === '#text') n.text = n.text.split(find).join(repl); else n.attrs.name = n.attrs.name.split(find).join(repl); }));
    toast(`${hits.length} remplacement(s)`);
  }
  // Content fill (Content Reel): realistic, deterministic text for the selected text layers
  async function fillContent(kind) {
    const texts = []; const walk = (n) => { if (n.tag === 'text') texts.push(n); (n.children || []).forEach(walk); };
    app.selNodes.forEach(walk); if (!texts.length) { toast('Sélectionne des textes (ou leurs conteneurs)'); return; }
    const seed = Math.floor(Math.random() * 1000);
    app.change(() => texts.forEach((t, i) => { const v = String(MQ.fake(kind, seed + i)); const tn = (t.children || []).find((c) => c.tag === '#text'); if (tn) tn.text = v; else t.children = [{ id: MQ.newId(), tag: '#text', text: v }]; }));
    toast(`${texts.length} texte(s) remplis : ${kind}`);
  }
  function useAsMask() {
    const nodes = app.selNodes.filter((n) => n.tag !== 'screen'); if (nodes.length < 2) { toast('Sélectionne le masque et les calques à masquer'); return; }
    const parent = app.parent(nodes[0].id); if (!nodes.every((n) => app.parent(n.id) === parent)) { toast('Sélectionne des calques du même parent'); return; }
    const sib = app.siblings(nodes[0].id); nodes.sort((x, y) => sib.indexOf(x) - sib.indexOf(y));
    const z = app.zoom; const pel = canvas.elOf(nodes[0].id).parentElement; const pr = pel.getBoundingClientRect();
    const boxes = nodes.map((n) => { const r = canvas.elOf(n.id).getBoundingClientRect(); return { n, x: (r.left - pr.left) / z, y: (r.top - pr.top) / z, w: r.width / z, h: r.height / z }; });
    const m = boxes[0]; const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y)), x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
    app.change(() => {
      const idx = sib.indexOf(nodes[0]);
      const g = { id: MQ.newId(), tag: 'stack', attrs: { name: 'masque', mask: 'first', x: String(Math.round(x0)), y: String(Math.round(y0)), w: String(Math.round(x1 - x0)), h: String(Math.round(y1 - y0)) }, children: [] };
      for (const b of boxes) { app.remove([b.n.id]); b.n.attrs.x = String(Math.round(b.x - x0)); b.n.attrs.y = String(Math.round(b.y - y0)); if (!/^\d/.test(String(b.n.attrs.w))) b.n.attrs.w = String(Math.round(b.w)); if (!/^\d/.test(String(b.n.attrs.h))) b.n.attrs.h = String(Math.round(b.h)); for (const k of ['absolute', 'place', 'top', 'left', 'right', 'bottom']) delete b.n.attrs[k]; g.children.push(b.n); }
      sib.splice(Math.min(idx, sib.length), 0, g); app.selection = [g.id];
    });
    toast(`« ${m.n.attrs.name || m.n.tag} » sert de masque (alpha). Change le type dans Masque & fusion.`);
  }
  function outlineStroke(id) {
    const n = app.node(id); const el = canvas.elOf(id); if (!n || !el || !el._path) { toast('Sélectionne une forme vectorielle avec un contour'); return; }
    const g = strokeGeometry(n, el); if (!g || !g.geo.length) return;
    const vw = +el.dataset.vw || el.offsetWidth, vh = +el.dataset.vh || el.offsetHeight; const sx = el.offsetWidth / vw, sy = el.offsetHeight / vh;
    const x0 = parseFloat(n.attrs.x) || 0, y0 = parseFloat(n.attrs.y) || 0;
    const geo = MQ.Path.scalePath(g.geo, sx, sy);
    const keepFill = n.attrs.fill && n.attrs.fill !== 'none';
    const out = []; const common = n.attrs.absolute ? { absolute: true } : {};
    if (keepFill) out.push(placeVector(MQ.Path.scalePath(g.base, sx, sy), x0, y0, { ...common, fill: n.attrs.fill, ...(n.attrs.name ? { name: n.attrs.name } : {}) }));
    out.push(placeVector(geo, x0, y0, { ...common, fill: g.color, ...(n.attrs.name && !keepFill ? { name: n.attrs.name } : { name: (n.attrs.name || 'forme') + '-contour' }) }));
    app.change(() => { const sib = app.siblings(id); const i = sib.indexOf(n); sib.splice(i, 1, ...out); app.selection = out.map((o) => o.id); });
    toast('Contour vectorisé : c’est maintenant une forme pleine éditable');
  }
  // bake offset / width-profile / brush into plain vectors
  function bakeMods(id) {
    const n = app.node(id); const el = canvas.elOf(id); if (!n || !el || !el._path) return;
    const O = MQ.PathOps; const P = MQ.Path;
    const x0 = parseFloat(n.attrs.x) || 0, y0 = parseFloat(n.attrs.y) || 0; const common = n.attrs.absolute ? { absolute: true } : {};
    const base = n.attrs.offset ? O.offsetPath(el._path, parseFloat(n.attrs.offset)) : el._path;
    const out = [];
    if (n.attrs.fill && n.attrs.fill !== 'none') out.push(placeVector(base, x0, y0, { ...common, fill: n.attrs.fill, ...(n.attrs.stroke && !n.attrs['width-profile'] && !n.attrs.brush ? { stroke: n.attrs.stroke } : {}) }));
    if (n.attrs['width-profile'] || n.attrs.brush) { const g = strokeGeometry(n, el); out.push(placeVector(g.geo, x0, y0, { ...common, fill: g.color })); }
    if (!out.length) return;
    if (n.attrs.name) out[0].attrs.name = n.attrs.name;
    app.change(() => { const sib = app.siblings(id); sib.splice(sib.indexOf(n), 1, ...out); app.selection = out.map((o) => o.id); });
    toast('Modificateurs figés en vecteurs');
  }
  function flatten(id) {
    const n = app.node(id); const el = canvas.elOf(id); if (!n || !el || !el._path) return;
    app.change(() => canvas.vedit.toVector(n, el)); toast('Aplati en vecteur');
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
  async function makeComponent() {
    const n = app.selNodes[0]; if (!n || n.tag === 'screen') return;
    let name = await ask('Nom du composant', (n.attrs.name || 'MonComposant').replace(/[^\w]/g, '').replace(/^./, (c) => c.toUpperCase()), 'Commence par une majuscule, ex : ProductCard.');
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
    if (el && el._mq) MQ.playAnims(el._mq.anims, { project: app.project, ignoreReduced: true });
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
    if (play.root || studio.root) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (canvas.sbuild.key(e)) { e.preventDefault(); return; }
    if (canvas.vedit.key(e)) { e.preventDefault(); canvas.drawOverlay(); return; }
    const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
    if (k === ' ') { canvas.spaceDown = true; canvasEl.classList.add('grab'); e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); app.redo(); return; }
    if (mod && k === 'c') { copy(); return; }
    if (mod && k === 'x') { copy(); del(); return; }
    if (mod && k === 'v') { e.preventDefault(); if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t2) => paste(t2 && t2.trim().startsWith('<') ? t2 : null)).catch(() => paste()); else paste(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k === 'a') { e.preventDefault(); const n = app.selNodes[0]; const par = n ? app.parent(n.id) : null; app.select(par && par.children ? par.children.filter((c) => c.tag !== '#text').map((c) => c.id) : (app.page ? app.page.children.map((c) => c.id) : [])); return; }
    if (mod && e.shiftKey && k === 'k') { e.preventDefault(); studio.open(); return; }
    if (mod && e.altKey && k === 'k') { e.preventDefault(); makeComponent(); return; }
    if (mod && e.shiftKey && k === 'g') { e.preventDefault(); unwrap(); return; }
    if (mod && k === 'g') { e.preventDefault(); wrap('stack'); return; }
    if (mod && k === 'e') { e.preventDefault(); const n = app.selNodes[0]; if (n) flatten(n.id); return; }
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
    if (e.shiftKey && k === 'p') { app.tool = 'pencil'; app.emit('tool'); return; }
    if (e.shiftKey && k === 'm' && !mod) { canvas.sbuild.start(app.selection); return; }
    if (mod && e.altKey && k === 'm') { e.preventDefault(); useAsMask(); return; }
    if (mod && e.altKey && k === 's') { e.preventDefault(); versions(); return; }
    if (mod && !e.altKey && !e.shiftKey && k === 'r') { e.preventDefault(); renameLayers(); return; }
    if (mod && !e.altKey && !e.shiftKey && k === 'f') { e.preventDefault(); findReplace(); return; }
    if (mod && e.altKey && k === 't') { e.preventDefault(); if (tidyFn && app.selection.length > 1) tidyFn(); return; }
    if (mod && e.altKey && k === 'o') { e.preventDefault(); const n = app.selNodes[0]; if (n) outlineStroke(n.id); return; }
    if (e.shiftKey && k === 'e') { app.protoView = !app.protoView; app.emit('proto'); return; }
    if (e.shiftKey && k === 'g') { toggleGrid(); return; }
    if (k === 'delete' || k === 'backspace') { del(); return; }
    if (k === 'escape') { if (app.tool !== 'move') { app.tool = 'move'; app.emit('tool'); } else { const n = app.selNodes[0]; const p = n && app.parent(n.id); app.select(p && p.tag !== 'page' && p.tag !== 'project' ? p.id : []); } return; }
    if (k === 'enter') { const n = app.selNodes[0]; if (!n) return; if (['vector', 'shape', 'boolean'].includes(n.tag) && !e.shiftKey) { canvas.vedit.enter(n.id); return; } if (e.shiftKey) { const p = app.parent(n.id); if (p && p.tag !== 'page' && p.tag !== 'project') app.select(p.id); } else if (n.tag === 'text' || n.tag === 'note') canvas.editText(n.id); else { const c = (n.children || []).filter((x) => x.tag !== '#text'); if (c.length) app.select(c.map((x) => x.id)); } return; }
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
    const toolKeys = { v: 'move', h: 'hand', f: 'frame', r: 'rect', o: 'ellipse', t: 'text', i: 'image', n: 'note', p: 'pen', s: 'shape:star' };
    if (toolKeys[k]) { app.tool = toolKeys[k]; app.emit('tool'); return; }

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
    if (what === 'tool') { for (const [t, b] of Object.entries(toolBtns)) b.classList.toggle('on', app.tool === t || (t === 'shapes' && app.tool.startsWith('shape:'))); canvasEl.dataset.tool = app.tool; return; }
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
