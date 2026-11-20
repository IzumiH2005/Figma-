// Tiny DOM helpers for the editor UI
export const MQ = window.MQ;

export function h(tag, props, ...kids) {
  const [t0, ...cls] = tag.split('.');
  const [t, id] = t0.split('#');
  const el = document.createElement(t || 'div');
  if (id) el.id = id;
  if (cls.length) el.className = cls.join(' ');
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function icon(name, size = 16, sw = 1.75) {
  const inner = MQ.ICONS[name] || MQ.ICONS['circle'];
  const s = document.createElement('span');
  s.className = 'ic';
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return s;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function toast(msg, kind = 'info') {
  let host = document.getElementById('toasts');
  if (!host) { host = h('div#toasts'); host.id = 'toasts'; document.body.appendChild(host); }
  const t = h('div.toast.' + kind, null, msg);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
}

export function store(key, val) {
  try {
    if (val === undefined) { const v = localStorage.getItem('mq:' + key); return v ? JSON.parse(v) : null; }
    if (val === null) localStorage.removeItem('mq:' + key); else localStorage.setItem('mq:' + key, JSON.stringify(val));
  } catch (e) { return null; }
  return null;
}

function modal(title, body, actions) {
  document.querySelectorAll('.mq-modal').forEach((m) => m.remove());
  const close = () => wrap.remove();
  const wrap = h('div.mq-modal', { onpointerdown: (e) => { if (e.target === wrap) close(); }, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); } },
    h('div.mq-dialog', null, h('div.mq-dtitle', null, title), body, h('div.mq-dactions', null, actions(close))));
  document.body.appendChild(wrap);
  return wrap;
}

// in-page replacement for prompt() (blocked inside artifacts)
export function ask(title, value = '', hint = '') {
  return new Promise((resolve) => {
    const inp = h('input.inp', { value, id: 'mq-ask' });
    let done = false;
    let m;
    const finish = (v) => { if (done) return; done = true; m.remove(); resolve(v); };
    m = modal(title, h('div.mq-dbody', null, inp, hint ? h('div.hint', null, hint) : null), () => [
      h('button.btn', { onclick: () => finish(null) }, 'Annuler'),
      h('button.btn.primary', { onclick: () => finish(inp.value) }, 'Valider'),
    ]);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(inp.value); });
    new MutationObserver((_, obs) => { if (!m.isConnected) { obs.disconnect(); if (!done) { done = true; resolve(null); } } }).observe(document.body, { childList: true });
    setTimeout(() => { inp.focus(); inp.select(); });
  });
}

// downloads are inert inside artifacts: try, and always offer copy as a fallback
export function download(name, text, type = 'text/plain') {
  try { const b = new Blob([text], { type }); const a = h('a', { href: URL.createObjectURL(b), download: name }); document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* */ }
  const ta = h('textarea.mq-dtext', { readonly: true, spellcheck: 'false', id: 'mq-export' }, text);
  modal(name, h('div.mq-dbody', null, h('div.hint', null, `${(text.length / 1024).toFixed(0)} Ko. Si le téléchargement ne démarre pas (c'est le cas dans un artifact), copie le contenu dans un fichier ${name}.`), ta), (close) => [
    h('button.btn', { onclick: close }, 'Fermer'),
    h('button.btn.primary', { onclick: (e) => { const b = e.currentTarget; const fallback = () => { ta.focus(); ta.select(); b.textContent = 'Sélectionné : Ctrl+C'; }; try { navigator.clipboard.writeText(text).then(() => { b.textContent = 'Copié'; }, fallback); } catch (er) { fallback(); } } }, 'Copier tout'),
  ]);
}

export function menu(x, y, items, onClose) {
  document.querySelectorAll('.ctxmenu').forEach((m) => m.remove());
  const m = h('div.ctxmenu');
  for (const it of items) {
    if (it === '-') { m.appendChild(h('div.sep')); continue; }
    if (!it) continue;
    m.appendChild(h('div.item' + (it.disabled ? '.disabled' : ''), { onclick: (e) => { e.stopPropagation(); m.remove(); if (!it.disabled) it.run(); } }, it.icon ? icon(it.icon, 14) : h('span.ic'), h('span.lbl', null, it.label), it.key ? h('span.key', null, it.key) : null));
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  const close = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', close, true); onClose && onClose(); } };
  setTimeout(() => document.addEventListener('pointerdown', close, true));
  return m;
}
