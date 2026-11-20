// Figma Draw-style effects and modifiers:
//   fill=pattern(shape, size, gap, color, tile, rotate)  — pattern fill from any parametric shape or icon (grid | brick | brick-v | half-drop)
//   clone="radial 12 r=80" | "linear 6 dx=24 rotate=8 scale=0.92 opacity=0.85" | "grid 4 3 gap=12" — repeat modifiers
//   grain=0.15 (noise effect) · texture=3 (rough, hand-made edges) · glass / glass="frost=14 refraction=12 tint=…"
//   pblur="20 bottom" (progressive background blur) · mask=first mask-type=alpha|vector|luminance (Figma mask groups)
import { shapePath, serializePath, translatePath, rotatePath } from './pathkit.js';

const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
const opts = (parts) => { const o = {}; const pos = []; for (const p of parts) { const m = /^([\w-]+)=(.+)$/.exec(p); if (m) o[m[1]] = m[2]; else pos.push(p); } return { o, pos }; };
const enc = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// ------------------------------------------------------------------ pattern fill
export function patternFill(args, iconSvgFn) {
  const kind = (args[0] || 'circle').replace(/^["']|["']$/g, '');
  const size = num(args[1], 12), gap = num(args[2], size), color = args[3] || 'rgba(127,127,127,.35)';
  const tile = args[4] || 'grid', rot = num(args[5], 0);
  const cell = size + gap; let W = cell, H = cell; const spots = [[gap / 2, gap / 2]];
  if (tile === 'brick') { H = cell * 2; spots.push([gap / 2 + cell / 2, gap / 2 + cell]); spots.push([gap / 2 - cell / 2, gap / 2 + cell]); }
  if (tile === 'brick-v' || tile === 'half-drop') { W = cell * 2; spots.push([gap / 2 + cell, gap / 2 + cell / 2]); spots.push([gap / 2 + cell, gap / 2 - cell / 2]); }
  let body;
  if (kind.startsWith('icon:') && iconSvgFn) {
    const inner = iconSvgFn(kind.slice(5), size, color) || '';
    body = spots.map(([x, y]) => `<g transform="translate(${x} ${y}) rotate(${rot} ${size / 2} ${size / 2})" color="${color}">${inner}</g>`).join('');
  } else {
    const [k, ...pp] = kind.split(/\s+/); const { o } = opts(pp);
    const d = serializePath(shapePath(k === 'circle' ? 'ellipse' : k, size, size, o));
    body = spots.map(([x, y]) => `<path d="${d}" transform="translate(${x} ${y}) rotate(${rot} ${size / 2} ${size / 2})" fill="${color}"/>`).join('');
  }
  return { image: enc(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>${body}</svg>`), size: `${W}px ${H}px` };
}

// ------------------------------------------------------------------ repeat modifiers
// The element keeps its place in the layout (a wrapper takes its box); copies are drawn around it.
export function wrapClone(el, spec) {
  const parts = String(spec).trim().split(/\s+/); const mode = parts[0];
  const { o, pos } = opts(parts.slice(1));
  const n = Math.max(1, Math.min(200, Math.round(num(pos[0], mode === 'grid' ? 3 : 6))));
  const wrap = document.createElement('div');
  const cs = el.style;
  // move layout/positioning to the wrapper, the visual becomes position:absolute inside it
  for (const k of ['position', 'left', 'top', 'right', 'bottom', 'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom', 'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'justifySelf', 'gridColumn', 'gridRow', 'gridColumnStart', 'gridRowStart', 'zIndex', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight']) if (cs[k]) { wrap.style[k] = cs[k]; if (!['width', 'height'].includes(k)) cs[k] = ''; }
  if (!wrap.style.position || wrap.style.position === 'static') wrap.style.position = 'relative';
  for (const k of ['id', 'tag', 'key', 'proto', 'd', 'vw', 'vh']) if (el.dataset[k] !== undefined) { wrap.dataset[k] = el.dataset[k]; if (k === 'id' || k === 'key') delete el.dataset[k]; }
  wrap._path = el._path; wrap._box = el._box; wrap._mq = el._mq; wrap._props = el._props; wrap._morphTargets = el._morphTargets;
  wrap.className = 'mq-clone';
  wrap.style.overflow = 'visible';
  el.style.position = 'absolute'; el.style.left = '0'; el.style.top = '0'; el.style.margin = '0';
  if (!wrap.style.width) wrap.style.width = el.style.width || 'auto';
  if (!wrap.style.height) wrap.style.height = el.style.height || 'auto';
  const baseT = el.style.transform || '';
  const copies = [];
  const scaleStep = num(o.scale, 1), opStep = num(o.opacity, 1), rotStep = num(o.rotate, 0);
  if (mode === 'radial') {
    const r = num(o.r ?? o.radius, 60), sweep = num(o.angle, 360), start = num(o.start, 0);
    const step = sweep >= 360 ? 360 / n : sweep / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) copies.push({ t: `rotate(${start + i * step}deg)`, origin: `50% calc(50% + ${r}px)`, i });
  } else if (mode === 'grid') {
    const cols = n, rows = Math.max(1, Math.round(num(pos[1], cols))); const gap = num(o.gap, 12);
    const w = parseFloat(el.style.width) || 0, h = parseFloat(el.style.height) || 0;
    const dx = num(o.dx, w + gap), dy = num(o.dy, h + gap);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) copies.push({ t: `translate(${c * dx + (o.stagger && r % 2 ? dx / 2 : 0)}px, ${r * dy}px)`, i: r * cols + c });
  } else { // linear
    const dx = num(o.dx, 24), dy = num(o.dy, 0);
    for (let i = 0; i < n; i++) copies.push({ t: `translate(${i * dx}px, ${i * dy}px) rotate(${i * rotStep}deg)`, i });
  }
  copies.forEach(({ t, origin, i }, k) => {
    const c = k === 0 ? el : el.cloneNode(true);
    if (k > 0) { c.removeAttribute('data-id'); c.removeAttribute('data-key'); c.querySelectorAll('[data-id]').forEach((x) => x.removeAttribute('data-id')); c.setAttribute('aria-hidden', 'true'); c.style.pointerEvents = 'none'; }
    const sc = Math.pow(scaleStep, i), op = Math.pow(opStep, i);
    c.style.transform = `${t}${sc !== 1 ? ` scale(${sc})` : ''} ${baseT}`.trim();
    if (origin) c.style.transformOrigin = origin;
    if (op !== 1) c.style.opacity = String(op * (parseFloat(el.style.opacity) || 1));
    wrap.appendChild(c);
  });
  return wrap;
}

// ------------------------------------------------------------------ effects
export function applyEffects(el, a, ctx) {
  const defs = () => (ctx.defs = ctx.defs || new Map());
  // grain / noise effect: overlay layer, clipped to the element's radius
  if (a.grain) {
    const g = document.createElement('div'); const o = Math.min(0.6, num(a.grain, 0.15));
    g.className = 'mq-grain';
    g.style.cssText = `position:absolute;inset:0;border-radius:inherit;pointer-events:none;mix-blend-mode:overlay;opacity:${Math.min(1, o * 4)};background-image:url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${num(a['grain-size'], 0.85)}' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}");background-size:180px 180px`;
    if (getComputedStyle && !el.style.position) el.style.position = 'relative';
    el.appendChild(g);
  }
  // texture: rough, hand-cut edges (turbulence displacement)
  if (a.texture) {
    const s = Math.max(0.5, num(a.texture, 3)); const seed = Math.round(num(a.seed, 3));
    const id = `mq-tex-${String(s).replace('.', '_')}-${seed}`;
    defs().set(id, `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="${(0.9 / Math.sqrt(s)).toFixed(3)}" numOctaves="3" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${s * 2}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
    el.style.filter = `url(#${id})` + (el.style.filter ? ' ' + el.style.filter : '');
  }
  // glass: frosted backdrop + refraction + specular rim
  if (a.glass) {
    const { o } = opts(String(a.glass === true ? '' : a.glass).split(/\s+/).filter(Boolean));
    const frost = num(o.frost, 14), refr = num(o.refraction, 0), tint = o.tint || 'rgba(255,255,255,.14)', light = num(o.light, -45);
    let bf = `blur(${frost}px) saturate(${num(o.saturate, 160)}%)`;
    if (refr) {
      const id = `mq-glass-${refr}`;
      defs().set(id, `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${refr * 4}" xChannelSelector="R" yChannelSelector="B"/></filter>`);
      bf = `url(#${id}) ${bf}`;
    }
    el.style.backdropFilter = bf; el.style.webkitBackdropFilter = bf;
    if (!el.style.backgroundColor && !el.style.backgroundImage) el.style.backgroundColor = tint;
    const rad = (light * Math.PI) / 180; const lx = 50 + Math.cos(rad) * 50, ly = 50 + Math.sin(rad) * 50;
    const rim = document.createElement('div'); rim.className = 'mq-glass-rim';
    rim.style.cssText = `position:absolute;inset:0;border-radius:inherit;pointer-events:none;padding:1px;background:linear-gradient(${light + 90}deg, rgba(255,255,255,.7), rgba(255,255,255,.08) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,.35));-webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude`;
    const shine = document.createElement('div'); shine.className = 'mq-glass-shine';
    shine.style.cssText = `position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(120% 80% at ${lx}% ${ly}%, rgba(255,255,255,.28), rgba(255,255,255,0) 55%)`;
    if (!el.style.position) el.style.position = 'relative';
    el.append(shine, rim);
  }
  // progressive background blur: strongest on one side, fading out
  if (a.pblur) {
    const [r, side = 'bottom'] = String(a.pblur).split(/\s+/); const rad = num(r, 16);
    const bf = `blur(${rad}px)`;
    const dir0 = { top: 'to top', bottom: 'to bottom', left: 'to left', right: 'to right' }[side] || 'to bottom';
    if (!el.children.length) { // empty region: blur directly on the element (no nested backdrop root)
      el.style.backdropFilter = bf; el.style.webkitBackdropFilter = bf;
      el.style.webkitMaskImage = el.style.maskImage = `linear-gradient(${dir0}, transparent, #000 70%)`;
      el.classList.add('mq-pblur'); return;
    }
    const layer = document.createElement('div'); layer.className = 'mq-pblur';
    const dir = { top: 'to top', bottom: 'to bottom', left: 'to left', right: 'to right' }[side] || 'to bottom';
    layer.style.cssText = `position:absolute;inset:0;border-radius:inherit;pointer-events:none;backdrop-filter:${bf};-webkit-backdrop-filter:${bf};-webkit-mask-image:linear-gradient(${dir}, transparent, #000 85%);mask-image:linear-gradient(${dir}, transparent, #000 85%)`;
    if (!el.style.position) el.style.position = 'relative';
    el.insertBefore(layer, el.firstChild);
  }
}

// ------------------------------------------------------------------ mask groups (Figma "Use as mask")
// <stack mask=first mask-type=alpha|vector|luminance> : the first child masks every following sibling.
export function applyMaskGroup(el, a) {
  const kids = [...el.children].filter((c) => !c.classList.contains('mq-grain') && c.tagName !== 'svg' || c.dataset.id);
  const m = kids[0]; if (!m) return;
  const type = a['mask-type'] || 'alpha';
  const W = m.offsetWidth || parseFloat(m.style.width) || 0, H = m.offsetHeight || parseFloat(m.style.height) || 0;
  const x = parseFloat(m.style.left) || m.offsetLeft || 0, y = parseFloat(m.style.top) || m.offsetTop || 0;
  let img = null; let composite = false; const mode = type === 'luminance' ? 'luminance' : 'alpha';
  const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  if (m._path) {
    const vw = +m.dataset.vw || W, vh = +m.dataset.vh || H; const fl = m.querySelector('.mq-vec-fill');
    const solid = fl && fl.style.backgroundColor && type !== 'vector' ? fl.style.backgroundColor : '#fff';
    img = svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${vw} ${vh}' preserveAspectRatio='none'><path d='${serializePath(m._path)}' fill='${solid}' fill-rule='evenodd'/></svg>`);
    // alpha / luminance masks honour a gradient fill of the mask shape (soft fades)
    if (type !== 'vector' && fl && fl.style.backgroundImage) { img = `${img}, ${fl.style.backgroundImage}`; composite = true; }
  } else if (m.classList.contains('mq-image') && m.style.backgroundImage) {
    img = m.style.backgroundImage;
  } else if (m.tagName === 'IMG' || m.querySelector('img')) {
    img = `url("${(m.tagName === 'IMG' ? m : m.querySelector('img')).src}")`;
  } else {
    const cs = m.style; const r = parseFloat(cs.borderRadius) || 0;
    const shape = svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><rect width='${W}' height='${H}' rx='${r}' fill='#fff'/></svg>`);
    if (type !== 'vector' && cs.backgroundImage) { img = `${shape}, ${cs.backgroundImage}`; composite = true; }
    else img = type !== 'vector' && cs.backgroundColor ? svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><rect width='${W}' height='${H}' rx='${r}' fill='${cs.backgroundColor}'/></svg>`) : shape;
  }
  if (!img) return;
  m.style.visibility = 'hidden';
  const st = el.style;
  st.webkitMaskImage = img; st.maskImage = img;
  st.webkitMaskSize = `${W}px ${H}px`; st.maskSize = `${W}px ${H}px`;
  st.webkitMaskPosition = `${x}px ${y}px`; st.maskPosition = `${x}px ${y}px`;
  st.webkitMaskRepeat = 'no-repeat'; st.maskRepeat = 'no-repeat';
  st.maskMode = mode;
  if (composite) { st.webkitMaskComposite = 'source-in'; st.maskComposite = 'intersect'; st.webkitMaskSize = st.maskSize = `${W}px ${H}px, ${W}px ${H}px`; st.webkitMaskPosition = st.maskPosition = `${x}px ${y}px, ${x}px ${y}px`; st.webkitMaskRepeat = st.maskRepeat = 'no-repeat, no-repeat'; }
}
export { translatePath, rotatePath };
