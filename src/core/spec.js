// Component spec sheet (redlines), like the "spec" plugins designers use for hand-off:
// paddings (pink bands), gaps between children (blue), child boxes with sizes, typography of texts,
// corner radius and the tokens used. specOverlay(el) returns an absolutely positioned layer over el.
const r1 = (v) => Math.round(v * 10) / 10;

export function specOverlay(el, { tokens = [] } = {}) {
  const host = document.createElement('div');
  host.className = 'mq-spec';
  host.style.cssText = 'position:absolute;inset:0;pointer-events:none;font:600 10px/1 Inter,system-ui,sans-serif;z-index:50';
  const R = el.getBoundingClientRect(); const k = R.width / (el.offsetWidth || R.width) || 1; // zoom-safe
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: (r.left - R.left) / k, y: (r.top - R.top) / k, w: r.width / k, h: r.height / k }; };
  const tag = (x, y, text, bg, fg = '#fff') => { const t = document.createElement('div'); t.textContent = text; t.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);padding:2px 4px;border-radius:4px;background:${bg};color:${fg};white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.2)`; host.appendChild(t); return t; };
  const band = (x, y, w, h, color) => { const b = document.createElement('div'); b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px;background:${color}`; host.appendChild(b); };
  const outline = (b, color) => { const o = document.createElement('div'); o.style.cssText = `position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;outline:1px dashed ${color};outline-offset:-0.5px`; host.appendChild(o); };
  const PINK = 'rgba(236,72,153,.22)', PINKT = '#DB2777', BLUE = 'rgba(59,130,246,.25)', BLUET = '#2563EB', GRAY = '#475569';
  const cs = getComputedStyle(el); const W = el.offsetWidth, H = el.offsetHeight;
  // paddings
  const pt = parseFloat(cs.paddingTop), pr = parseFloat(cs.paddingRight), pb = parseFloat(cs.paddingBottom), pl = parseFloat(cs.paddingLeft);
  if (pt) { band(0, 0, W, pt, PINK); tag(W / 2, pt / 2, r1(pt), PINKT); }
  if (pb) { band(0, H - pb, W, pb, PINK); tag(W / 2, H - pb / 2, r1(pb), PINKT); }
  if (pl) { band(0, pt, pl, H - pt - pb, PINK); tag(pl / 2, H / 2, r1(pl), PINKT); }
  if (pr) { band(W - pr, pt, pr, H - pt - pb, PINK); tag(W - pr / 2, H / 2, r1(pr), PINKT); }
  // children: boxes and gaps
  const kids = [...el.children].filter((c) => c.offsetWidth || c.offsetHeight).filter((c) => !c.classList.contains('mq-spec') && getComputedStyle(c).position !== 'absolute');
  const rowDir = cs.display.includes('flex') && cs.flexDirection.startsWith('row');
  const boxes = kids.map(box);
  boxes.forEach((b) => outline(b, 'rgba(59,130,246,.65)'));
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1], b = boxes[i];
    if (rowDir) { const g = b.x - (a.x + a.w); if (g > 0.5) { const y0 = Math.max(a.y, b.y), y1 = Math.min(a.y + a.h, b.y + b.h); band(a.x + a.w, y0, g, Math.max(6, y1 - y0), BLUE); tag(a.x + a.w + g / 2, (y0 + y1) / 2, r1(g), BLUET); } }
    else { const g = b.y - (a.y + a.h); if (g > 0.5) { const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w); band(x0, a.y + a.h, Math.max(6, x1 - x0), g, BLUE); tag((x0 + x1) / 2, a.y + a.h + g / 2, r1(g), BLUET); } }
  }
  // overall size + radius
  tag(W / 2, -12, `${r1(W)} × ${r1(H)}`, GRAY);
  const rad = parseFloat(cs.borderTopLeftRadius); if (rad) tag(Math.min(rad, 14), -12, `r ${r1(rad)}`, GRAY);
  // typography and icons, numbered like an anatomy diagram
  const parts = [];
  el.querySelectorAll('[data-tag="text"], [data-tag="icon"], .mq-icon').forEach((t) => {
    if (!t.offsetWidth || parts.some((p) => p.el.contains(t) || t.contains(p.el))) return;
    const b = box(t); const tcs = getComputedStyle(t); const n = parts.length + 1;
    const desc = t.dataset.tag === 'text' ? `Texte · ${r1(parseFloat(tcs.fontSize))}/${tcs.lineHeight === 'normal' ? 'auto' : r1(parseFloat(tcs.lineHeight))} · ${tcs.fontWeight}` : `Icône · ${r1(b.w)}px`;
    parts.push({ el: t, n, desc });
    const dot = tag(b.x + b.w, b.y, String(n), '#0F172A'); dot.style.borderRadius = '999px'; dot.style.minWidth = '14px'; dot.style.textAlign = 'center';
  });
  host._parts = parts;
  host._legend = [...parts.map((p) => `${p.n}. ${p.desc}`), ...(tokens.length ? ['Tokens : ' + tokens.join(' ')] : [])];
  return host;
}
