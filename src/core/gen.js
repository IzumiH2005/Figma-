// Procedural placeholder imagery: "gen:<scene>[/seed]", "avatar:<name>", "initials:<name>", "photo:<scene>"
// Everything is an inline SVG data URI, so it works offline and inside sandboxed artifacts.

const cache = new Map();

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hsl = (h, s, l, a = 1) => `hsla(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%,${a})`;
const uri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const svgWrap = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;

function ridge(r, w, base, amp, steps, smooth = 0.5) {
  let d = `M0 ${base}`; let y = base;
  for (let i = 1; i <= steps; i++) { const x = (w / steps) * i; y = base - (r() * amp) * (i % 2 ? 1 : smooth); d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; }
  return d + ` L${w} 600 L0 600Z`;
}

const SCENES = {
  mountains(r) {
    const hue = 190 + r() * 60;
    const sky = `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(hue, 60, 78)}"/><stop offset="1" stop-color="${hsl(hue + 30, 70, 92)}"/></linearGradient>`;
    let b = `<rect width="800" height="600" fill="url(#s)"/><circle cx="${560 + r() * 120}" cy="${130 + r() * 60}" r="46" fill="${hsl(40, 100, 92)}"/>`;
    for (let k = 0; k < 4; k++) b += `<path d="${ridge(r, 800, 300 + k * 70, 170 - k * 25, 7 + k * 2, 0.35)}" fill="${hsl(hue + 10 + k * 8, 30 + k * 6, 62 - k * 13)}"/>`;
    return svgWrap(800, 600, b, sky);
  },
  sunset(r) {
    const h = r() * 40;
    const defs = `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(260 + h, 55, 30)}"/><stop offset=".55" stop-color="${hsl(340 + h, 75, 62)}"/><stop offset="1" stop-color="${hsl(30 + h, 95, 70)}"/></linearGradient>`;
    let b = `<rect width="800" height="600" fill="url(#s)"/><circle cx="400" cy="380" r="110" fill="${hsl(45, 100, 80)}" opacity=".95"/>`;
    b += `<rect y="400" width="800" height="200" fill="${hsl(250 + h, 45, 22)}"/>`;
    for (let k = 0; k < 9; k++) b += `<rect x="${300 + r() * 40 - k * 6}" y="${410 + k * 16}" width="${200 - k * 14 + r() * 30}" height="4" rx="2" fill="${hsl(40, 100, 80)}" opacity="${0.7 - k * 0.07}"/>`;
    return svgWrap(800, 600, b, defs);
  },
  ocean(r) {
    const hue = 185 + r() * 25;
    let b = `<rect width="800" height="600" fill="${hsl(hue, 70, 86)}"/>`;
    for (let k = 0; k < 7; k++) {
      const y = 220 + k * 55; let d = `M0 ${y}`;
      for (let x = 0; x <= 800; x += 80) d += ` Q${x + 40} ${y - 18 - r() * 14} ${x + 80} ${y}`;
      b += `<path d="${d} L800 600 L0 600Z" fill="${hsl(hue + k * 3, 60, 70 - k * 7)}"/>`;
    }
    return svgWrap(800, 600, b);
  },
  city(r) {
    const hue = 220 + r() * 40;
    let b = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(hue, 50, 16)}"/><stop offset="1" stop-color="${hsl(hue + 40, 60, 40)}"/></linearGradient></defs><rect width="800" height="600" fill="url(#s)"/>`;
    for (let layer = 0; layer < 3; layer++) {
      let x = -20;
      while (x < 820) {
        const w = 40 + r() * 70, h = 120 + r() * 260 - layer * 50;
        const col = hsl(hue, 30, 10 + layer * 6);
        b += `<rect x="${x}" y="${600 - h}" width="${w}" height="${h}" fill="${col}"/>`;
        for (let wy = 600 - h + 12; wy < 590; wy += 18) for (let wx = x + 8; wx < x + w - 8; wx += 14) if (r() > 0.55) b += `<rect x="${wx}" y="${wy}" width="6" height="8" fill="${hsl(45, 100, 70, 0.5 + r() * 0.5)}"/>`;
        x += w + 4;
      }
    }
    return svgWrap(800, 600, b);
  },
  blobs(r) {
    const hue = r() * 360;
    let b = `<rect width="800" height="600" fill="${hsl(hue, 60, 95)}"/>`;
    const defs = '<filter id="b"><feGaussianBlur stdDeviation="60"/></filter>';
    for (let k = 0; k < 6; k++) b += `<circle cx="${r() * 800}" cy="${r() * 600}" r="${120 + r() * 180}" fill="${hsl(hue + k * 40, 80, 65)}" opacity=".85" filter="url(#b)"/>`;
    return svgWrap(800, 600, b, defs);
  },
  mesh(r) {
    const hue = r() * 360;
    let b = `<rect width="800" height="600" fill="${hsl(hue, 70, 20)}"/>`;
    const defs = '<filter id="b"><feGaussianBlur stdDeviation="90"/></filter>';
    for (let k = 0; k < 5; k++) b += `<ellipse cx="${r() * 800}" cy="${r() * 600}" rx="${200 + r() * 200}" ry="${150 + r() * 150}" fill="${hsl(hue + k * 55, 90, 55)}" filter="url(#b)"/>`;
    return svgWrap(800, 600, b, defs);
  },
  abstract(r) {
    const hue = r() * 360;
    let b = `<rect width="800" height="600" fill="${hsl(hue, 35, 92)}"/>`;
    for (let k = 0; k < 7; k++) {
      const t = r();
      const col = hsl(hue + k * 47, 65, 45 + r() * 30);
      if (t < 0.33) b += `<circle cx="${r() * 800}" cy="${r() * 600}" r="${40 + r() * 160}" fill="${col}"/>`;
      else if (t < 0.66) b += `<rect x="${r() * 700}" y="${r() * 500}" width="${80 + r() * 260}" height="${80 + r() * 200}" rx="${r() * 40}" fill="${col}" transform="rotate(${r() * 60 - 30} 400 300)"/>`;
      else b += `<path d="M${r() * 800} ${r() * 600} Q${r() * 800} ${r() * 600} ${r() * 800} ${r() * 600}" stroke="${col}" stroke-width="${18 + r() * 30}" fill="none" stroke-linecap="round"/>`;
    }
    return svgWrap(800, 600, b);
  },
  forest(r) {
    const hue = 100 + r() * 50;
    let b = `<rect width="800" height="600" fill="${hsl(hue + 60, 40, 88)}"/>`;
    for (let layer = 0; layer < 4; layer++) for (let k = 0; k < 16; k++) {
      const x = r() * 840 - 20, h = 140 + r() * 180 - layer * 20, y = 330 + layer * 70;
      b += `<path d="M${x} ${y - h} L${x + h * 0.28} ${y} L${x - h * 0.28} ${y}Z" fill="${hsl(hue + layer * 6, 35 + layer * 8, 50 - layer * 11)}"/>`;
    }
    b += `<rect y="560" width="800" height="40" fill="${hsl(hue, 40, 14)}"/>`;
    return svgWrap(800, 600, b);
  },
  desert(r) {
    const hue = 20 + r() * 20;
    let b = `<rect width="800" height="600" fill="${hsl(hue + 180, 50, 85)}"/><circle cx="${150 + r() * 500}" cy="140" r="60" fill="${hsl(45, 100, 88)}"/>`;
    for (let k = 0; k < 4; k++) {
      const y = 330 + k * 70; let d = `M0 ${y}`;
      for (let x = 0; x <= 800; x += 200) d += ` Q${x + 100} ${y - 50 - r() * 50} ${x + 200} ${y + r() * 20}`;
      b += `<path d="${d} L800 600 L0 600Z" fill="${hsl(hue + k * 4, 60, 70 - k * 9)}"/>`;
    }
    return svgWrap(800, 600, b);
  },
  aurora(r) {
    let b = `<rect width="800" height="600" fill="#050816"/>`;
    const defs = '<filter id="b"><feGaussianBlur stdDeviation="40"/></filter>';
    for (let k = 0; k < 5; k++) { let d = `M-50 ${200 + k * 30}`; for (let x = 0; x <= 900; x += 150) d += ` Q${x + 75} ${120 + r() * 200} ${x + 150} ${180 + r() * 120}`; b += `<path d="${d}" stroke="${hsl(140 + k * 30 + r() * 20, 90, 60)}" stroke-width="${60 + r() * 50}" fill="none" opacity=".65" filter="url(#b)"/>`; }
    for (let k = 0; k < 80; k++) b += `<circle cx="${r() * 800}" cy="${r() * 600}" r="${r() * 1.6}" fill="#fff" opacity="${r()}"/>`;
    return svgWrap(800, 600, b, defs);
  },
  space(r) {
    let b = `<rect width="800" height="600" fill="#05030f"/>`;
    for (let k = 0; k < 160; k++) b += `<circle cx="${r() * 800}" cy="${r() * 600}" r="${r() * 1.8}" fill="#fff" opacity="${0.3 + r() * 0.7}"/>`;
    const hue = r() * 360;
    b += `<circle cx="${250 + r() * 300}" cy="${200 + r() * 200}" r="120" fill="${hsl(hue, 60, 50)}"/><ellipse cx="0" cy="0" rx="190" ry="34" fill="none" stroke="${hsl(hue + 40, 70, 75)}" stroke-width="10" opacity=".8" transform="translate(${400} ${300}) rotate(-18)"/>`;
    return svgWrap(800, 600, b);
  },
  food(r) {
    const hue = r() * 50;
    let b = `<rect width="800" height="600" fill="${hsl(hue + 30, 40, 90)}"/>`;
    b += `<ellipse cx="400" cy="320" rx="250" ry="235" fill="#fff"/><ellipse cx="400" cy="320" rx="200" ry="188" fill="${hsl(hue + 30, 30, 96)}"/>`;
    for (let k = 0; k < 14; k++) { const a = r() * Math.PI * 2, d = r() * 130; b += `<circle cx="${400 + Math.cos(a) * d}" cy="${320 + Math.sin(a) * d}" r="${16 + r() * 34}" fill="${hsl([0, 30, 90, 120, 45][k % 5] + r() * 20, 70, 50 + r() * 15)}"/>`; }
    return svgWrap(800, 600, b);
  },
  product(r) {
    const hue = r() * 360;
    let b = `<rect width="800" height="600" fill="${hsl(hue, 30, 90)}"/><ellipse cx="400" cy="520" rx="170" ry="22" fill="#000" opacity=".12"/>`;
    b += `<rect x="320" y="150" width="160" height="370" rx="40" fill="${hsl(hue, 55, 45)}"/><rect x="355" y="100" width="90" height="70" rx="14" fill="${hsl(hue, 30, 20)}"/><rect x="335" y="240" width="130" height="120" rx="12" fill="#fff" opacity=".9"/><rect x="350" y="170" width="18" height="320" rx="9" fill="#fff" opacity=".18"/>`;
    return svgWrap(800, 600, b);
  },
  map(r) {
    let b = `<rect width="800" height="600" fill="#e8ecef"/>`;
    for (let k = 0; k < 6; k++) b += `<rect x="${r() * 760}" y="${r() * 560}" width="${80 + r() * 160}" height="${60 + r() * 120}" rx="10" fill="${k % 2 ? '#d5ecd4' : '#dfe3e8'}"/>`;
    b += `<path d="M-20 ${200 + r() * 200} C 200 ${r() * 600}, 500 ${r() * 600}, 820 ${200 + r() * 200}" stroke="#a9d3f5" stroke-width="40" fill="none"/>`;
    for (let k = 0; k < 9; k++) { const v = r() > 0.5; const p = r() * (v ? 800 : 600); b += v ? `<rect x="${p}" y="0" width="${k % 3 ? 8 : 16}" height="600" fill="#fff"/>` : `<rect x="0" y="${p}" width="800" height="${k % 3 ? 8 : 16}" fill="#fff"/>`; }
    b += `<path d="M120 480 C 260 380, 380 420, 520 260 S 700 160, 720 120" stroke="#5b6cff" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="1 0"/>`;
    return svgWrap(800, 600, b);
  },
  pattern(r) {
    const hue = r() * 360; let b = `<rect width="800" height="600" fill="${hsl(hue, 60, 94)}"/>`;
    for (let x = 0; x < 800; x += 50) for (let y = 0; y < 600; y += 50) { const t = r(); const c = hsl(hue + (t > 0.5 ? 30 : -30), 70, 60); b += t < 0.33 ? `<circle cx="${x + 25}" cy="${y + 25}" r="14" fill="${c}"/>` : t < 0.66 ? `<rect x="${x + 11}" y="${y + 11}" width="28" height="28" rx="6" fill="${c}"/>` : `<path d="M${x + 8} ${y + 42} L${x + 25} ${y + 8} L${x + 42} ${y + 42}Z" fill="${c}"/>`; }
    return svgWrap(800, 600, b);
  },
  chart(r) {
    let b = `<rect width="800" height="600" fill="#fff"/>`; let d = 'M40 460'; let y = 400;
    for (let x = 40; x <= 760; x += 40) { y = Math.max(80, Math.min(520, y + (r() - 0.45) * 90)); d += ` L${x} ${y.toFixed(0)}`; }
    b += `<path d="${d} L760 560 L40 560Z" fill="#6c5cff" opacity=".12"/><path d="${d}" stroke="#6c5cff" stroke-width="6" fill="none" stroke-linejoin="round"/>`;
    return svgWrap(800, 600, b);
  },
  room(r) {
    const hue = 20 + r() * 40;
    let b = `<rect width="800" height="600" fill="${hsl(hue, 25, 86)}"/><rect y="420" width="800" height="180" fill="${hsl(hue, 30, 62)}"/>`;
    b += `<rect x="470" y="110" width="200" height="230" rx="6" fill="${hsl(200, 40, 80)}" stroke="#fff" stroke-width="10"/>`;
    b += `<rect x="90" y="300" width="330" height="140" rx="30" fill="${hsl(hue + 180, 25, 45)}"/><rect x="110" y="250" width="290" height="90" rx="26" fill="${hsl(hue + 180, 25, 52)}"/>`;
    b += `<rect x="610" y="330" width="12" height="100" fill="#3b2b20"/><circle cx="616" cy="300" r="50" fill="${hsl(120, 35, 40)}"/>`;
    return svgWrap(800, 600, b);
  },
};
SCENES.landscape = SCENES.mountains; SCENES.nature = SCENES.forest; SCENES.gradient = SCENES.mesh; SCENES.beach = SCENES.ocean; SCENES.travel = SCENES.desert; SCENES.interior = SCENES.room;

export const SCENE_NAMES = Object.keys(SCENES);

function avatar(name) {
  const r = rng(hash(name));
  const skins = ['#F6D3B3', '#EDB98A', '#D08B5B', '#AE5D29', '#8D5524', '#614335', '#F2C9A0'];
  const hairs = ['#2C1B18', '#4A312C', '#724133', '#A55728', '#B58143', '#D6B370', '#E8E1E1', '#C93305', '#1d1d1d'];
  const bgH = r() * 360;
  const skin = skins[Math.floor(r() * skins.length)], hair = hairs[Math.floor(r() * hairs.length)];
  const shirt = hsl(r() * 360, 55, 50);
  const style = Math.floor(r() * 4);
  let hairBack = '', hairFront = '';
  if (style === 0) hairFront = `<path d="M62 92 Q60 48 100 44 Q140 48 138 92 Q132 66 100 64 Q70 64 62 92Z" fill="${hair}"/>`;
  if (style === 1) { hairBack = `<path d="M56 100 Q50 40 100 38 Q150 40 144 100 L150 160 L50 160Z" fill="${hair}"/>`; hairFront = `<path d="M64 88 Q70 52 100 50 Q132 52 136 88 Q118 70 100 72 Q82 70 64 88Z" fill="${hair}"/>`; }
  if (style === 2) hairFront = `<circle cx="100" cy="58" r="30" fill="${hair}"/><path d="M64 92 Q62 56 100 54 Q138 56 136 92 Q120 74 100 74 Q80 74 64 92Z" fill="${hair}"/>`;
  if (style === 3) hairFront = `<path d="M66 82 Q72 54 100 54 Q128 54 134 82 Q100 68 66 82Z" fill="${hair}"/>`;
  const glasses = r() > 0.75 ? `<g fill="none" stroke="#222" stroke-width="3"><circle cx="86" cy="98" r="10"/><circle cx="114" cy="98" r="10"/><path d="M96 98 L104 98"/></g>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${hsl(bgH, 70, 85)}"/>${hairBack}<path d="M40 200 Q42 150 100 148 Q158 150 160 200Z" fill="${shirt}"/><rect x="88" y="124" width="24" height="30" rx="8" fill="${skin}"/><ellipse cx="100" cy="96" rx="36" ry="42" fill="${skin}"/>${hairFront}<circle cx="86" cy="98" r="3.2" fill="#2a1c18"/><circle cx="114" cy="98" r="3.2" fill="#2a1c18"/><path d="M90 116 Q100 123 110 116" stroke="#8a3d2c" stroke-width="3" fill="none" stroke-linecap="round"/>${glasses}</svg>`;
  return uri(svg);
}

function initials(name) {
  const r = rng(hash(name));
  const h = r() * 360;
  const ini = name.split(/\s+/).map((p) => p[0] || '').join('').slice(0, 2).toUpperCase();
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(h, 75, 62)}"/><stop offset="1" stop-color="${hsl(h + 40, 75, 48)}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="50" dy=".36em" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="600" font-size="38" fill="#fff">${ini}</text></svg>`);
}

export function genImage(src) {
  if (cache.has(src)) return cache.get(src);
  const [kind, rest = ''] = src.split(/:(.*)/s);
  let out;
  if (kind === 'avatar') out = avatar(rest || 'x');
  else if (kind === 'initials') out = initials(rest || '?');
  else {
    const [scene, seed = scene] = rest.split('/');
    const fn = SCENES[scene] || SCENES.abstract;
    out = uri(fn(rng(hash(seed + scene))));
  }
  cache.set(src, out);
  return out;
}
