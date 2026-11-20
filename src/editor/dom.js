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

export function download(name, text, type = 'text/plain') {
  const b = new Blob([text], { type });
  const a = h('a', { href: URL.createObjectURL(b), download: name });
  document.body.appendChild(a); a.click(); a.remove();
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
