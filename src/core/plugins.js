// "Plugins" built into the runtime — the most used Figma community plugins, as language features:
//   fake(kind, seed)   — realistic content (Content Reel): deterministic, French by default
//   <connector from=a to=b …>  — arrows between layers (Autoflow): curve | elbow | straight, label, flow animation
//   <chart type=bar|line|area|donut|spark data={[…]} …> — vector charts (Chart), revealed with the motion engine
//   smoothShadow(elevation, color) — layered "smooth shadow" (Smooth Shadow plugin / Tobias Ahlin's technique)

// ------------------------------------------------------------------ content
const DATA = {
  first: ['Léa', 'Hugo', 'Inès', 'Malik', 'Zoé', 'Nathan', 'Chloé', 'Yanis', 'Camille', 'Lucas', 'Sarah', 'Adam', 'Jade', 'Louis', 'Emma', 'Noah', 'Lina', 'Gabriel', 'Manon', 'Rayan', 'Alice', 'Théo', 'Nora', 'Sacha'],
  last: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefèvre', 'Michel', 'Garcia', 'Benali', 'Nguyen', 'Diallo', 'Rousseau', 'Fontaine'],
  city: ['Paris', 'Lyon', 'Marseille', 'Nantes', 'Bordeaux', 'Lille', 'Toulouse', 'Rennes', 'Strasbourg', 'Montpellier', 'Nice', 'Grenoble', 'Bruxelles', 'Genève', 'Montréal', 'Dakar'],
  street: ['rue des Lilas', 'avenue Victor-Hugo', 'boulevard Voltaire', 'rue de la Paix', 'quai des Brumes', 'rue du Moulin', 'place des Vosges', 'allée des Tilleuls'],
  company: ['Nébula', 'Orbitale', 'Atelier Céleste', 'Prisme', 'Lumen', 'Boréal', 'Canopée', 'Graphite', 'Saphir & Co', 'Vélocité', 'Nord Studio', 'Mosaïque'],
  job: ['Product designer', 'Développeuse front-end', 'Chef de projet', 'UX researcher', 'Data analyst', 'Directrice artistique', 'Ingénieur DevOps', 'Responsable marketing', 'Rédactrice UX', 'Fondateur'],
  product: ['Casque sans fil', 'Lampe de bureau', 'Sac à dos urbain', 'Montre connectée', 'Enceinte portable', 'Carnet en lin', 'Mug isotherme', 'Clavier mécanique', 'Plaid en laine', 'Gourde inox'],
  word: ['lumière', 'élan', 'nuage', 'horizon', 'rythme', 'éclat', 'fil', 'sillage', 'écho', 'onde', 'sève', 'trame', 'pli', 'souffle', 'repère', 'cap'],
  title: ['Lancer une nouvelle offre', 'Repenser le parcours d’inscription', 'Préparer la rétrospective', 'Mettre à jour la charte', 'Analyser les retours clients', 'Organiser l’atelier d’idéation', 'Finaliser la maquette mobile', 'Planifier la mise en production'],
  tag: ['Design', 'Produit', 'Urgent', 'Recherche', 'Marketing', 'Dev', 'Idée', 'En cours', 'Terminé', 'À relire'],
  color: ['#7C5CFF', '#0E9F6E', '#E5484D', '#F59E0B', '#2F6FEB', '#D946EF', '#14B8A6', '#F97316'],
  scene: ['mountains', 'sunset', 'ocean', 'city', 'forest', 'desert', 'aurora', 'beach', 'interior', 'travel'],
};
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
// FNV-1a hash + mulberry32: close seeds ("7-0", "7-1") give unrelated sequences
function rng(seed) {
  let h = 2166136261; for (const c of String(seed ?? 1)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');

export function fake(kind = 'name', seed = 1) {
  const r = rng(String(kind) + ':' + seed); const k = String(kind);
  switch (k) {
    case 'first': return pick(r, DATA.first);
    case 'last': return pick(r, DATA.last);
    case 'name': return `${pick(r, DATA.first)} ${pick(r, DATA.last)}`;
    case 'initials': { const n = fake('name', seed).split(' '); return n[0][0] + n[1][0]; }
    case 'email': { const n = fake('name', seed).split(' '); return `${slug(n[0])}.${slug(n[1])}@${slug(pick(r, DATA.company)).replace(/\./g, '')}.fr`; }
    case 'username': return '@' + slug(fake('first', seed)) + Math.floor(r() * 90 + 10);
    case 'phone': return '06 ' + Array.from({ length: 4 }, () => String(Math.floor(r() * 100)).padStart(2, '0')).join(' ');
    case 'company': return pick(r, DATA.company);
    case 'job': return pick(r, DATA.job);
    case 'city': return pick(r, DATA.city);
    case 'address': return `${Math.floor(r() * 120 + 1)} ${pick(r, DATA.street)}, ${pick(r, DATA.city)}`;
    case 'product': return pick(r, DATA.product);
    case 'price': return (Math.round((r() * 180 + 9) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
    case 'amount': return Math.round(r() * 9000 + 100).toLocaleString('fr-FR') + ' €';
    case 'number': return Math.floor(r() * 1000);
    case 'percent': return Math.round(r() * 100) + ' %';
    case 'rating': return (Math.round((3.5 + r() * 1.5) * 10) / 10).toLocaleString('fr-FR');
    case 'date': return `${Math.floor(r() * 28 + 1)} ${pick(r, MONTHS)} 2026`;
    case 'time': return `${String(Math.floor(r() * 14 + 8)).padStart(2, '0')}:${pick(r, ['00', '15', '30', '45'])}`;
    case 'ago': return pick(r, ['à l’instant', 'il y a 2 min', 'il y a 12 min', 'il y a 1 h', 'il y a 3 h', 'hier', 'il y a 2 jours', 'lundi']);
    case 'word': return pick(r, DATA.word);
    case 'title': return pick(r, DATA.title);
    case 'tag': return pick(r, DATA.tag);
    case 'sentence': { const w = Array.from({ length: Math.floor(r() * 6 + 6) }, () => pick(r, DATA.word)); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(' ') + '.'; }
    case 'paragraph': return Array.from({ length: 3 }, (_, i) => fake('sentence', seed + ':' + i)).join(' ');
    case 'color': return pick(r, DATA.color);
    case 'avatar': return 'avatar:' + fake('name', seed);
    case 'image': return `gen:${pick(r, DATA.scene)}/${Math.floor(r() * 99)}`;
    default: return pick(r, DATA[k] || DATA.word);
  }
}
// list of records: fakeList(5, 'name,email,city') → [{name, email, city}, …]
export function fakeList(n = 5, fields = 'name', seed = 1) {
  const keys = String(fields).split(/[,\s]+/).filter(Boolean);
  return Array.from({ length: Math.max(0, Math.min(200, Number(n) || 0)) }, (_, i) => Object.fromEntries(keys.map((k) => [k, fake(k, `${seed}-${i}`)])));
}

// ------------------------------------------------------------------ smooth layered shadow
export function smoothShadow(elev = 12, color = 'rgba(0,0,0,1)', strength = 0.16) {
  const e = Math.max(1, Number(elev) || 12); const n = 5;
  const m = /rgba?\(([^)]+)\)/.exec(color); const rgb = m ? m[1].split(',').slice(0, 3).map((x) => x.trim()).join(',') : '0,0,0';
  const layers = [];
  for (let i = 0; i < n; i++) { const k = Math.pow(2, i) / Math.pow(2, n - 1); const y = +(e * k).toFixed(2); layers.push(`0 ${y}px ${+(y * 2).toFixed(2)}px rgba(${rgb},${+(strength / n * (1 + i * 0.25)).toFixed(3)})`); }
  return layers.join(', ');
}

// ------------------------------------------------------------------ connectors
const NS = 'http://www.w3.org/2000/svg';
export function buildConnector(el, a) {
  el.className = 'mq-connector';
  el.style.cssText += ';position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:5';
  const draw = (tries = 0) => {
    const host = el.parentElement; if (!host || !el.isConnected) { if (tries < 40 && typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => draw(tries + 1)); return; }
    const root = el.closest('.mq-screen') || host;
    const find = (n) => root.querySelector(`[data-key="${CSS.escape(String(n))}"]`) || [...root.querySelectorAll('[data-key]')].find((x) => x.dataset.key.split('#')[0] === String(n));
    const A = find(a.from), B = find(a.to);
    if (!A || !B || !host.offsetWidth) { if (tries < 40) requestAnimationFrame(() => draw(tries + 1)); return; }
    const hr = host.getBoundingClientRect(); const z = hr.width / (host.offsetWidth || hr.width) || 1;
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: (r.left - hr.left) / z, y: (r.top - hr.top) / z, w: r.width / z, h: r.height / z }; };
    const ra = box(A), rb = box(B);
    const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 }, cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
    const horiz = a.dir ? a.dir === 'h' : Math.abs(cb.x - ca.x) > Math.abs(cb.y - ca.y);
    const gap = Number(a.gap ?? 6);
    const p1 = horiz ? { x: cb.x > ca.x ? ra.x + ra.w + gap : ra.x - gap, y: ca.y } : { x: ca.x, y: cb.y > ca.y ? ra.y + ra.h + gap : ra.y - gap };
    const p2 = horiz ? { x: cb.x > ca.x ? rb.x - gap : rb.x + rb.w + gap, y: cb.y } : { x: cb.x, y: cb.y > ca.y ? rb.y - gap : rb.y + rb.h + gap };
    const curve = a.curve || 'curve'; let d;
    if (curve === 'straight') d = `M${p1.x} ${p1.y}L${p2.x} ${p2.y}`;
    else if (curve === 'elbow') {
      const r = Number(a.radius ?? 12);
      if (horiz) { const mx = (p1.x + p2.x) / 2; const s = Math.sign(p2.y - p1.y) || 1, sx = Math.sign(p2.x - p1.x) || 1; const rr = Math.min(r, Math.abs(p2.y - p1.y) / 2, Math.abs(mx - p1.x));
        d = Math.abs(p2.y - p1.y) < 1 ? `M${p1.x} ${p1.y}L${p2.x} ${p2.y}` : `M${p1.x} ${p1.y}L${mx - sx * rr} ${p1.y}Q${mx} ${p1.y} ${mx} ${p1.y + s * rr}L${mx} ${p2.y - s * rr}Q${mx} ${p2.y} ${mx + sx * rr} ${p2.y}L${p2.x} ${p2.y}`; }
      else { const my = (p1.y + p2.y) / 2; const s = Math.sign(p2.x - p1.x) || 1, sy = Math.sign(p2.y - p1.y) || 1; const rr = Math.min(r, Math.abs(p2.x - p1.x) / 2, Math.abs(my - p1.y));
        d = Math.abs(p2.x - p1.x) < 1 ? `M${p1.x} ${p1.y}L${p2.x} ${p2.y}` : `M${p1.x} ${p1.y}L${p1.x} ${my - sy * rr}Q${p1.x} ${my} ${p1.x + s * rr} ${my}L${p2.x - s * rr} ${my}Q${p2.x} ${my} ${p2.x} ${my + sy * rr}L${p2.x} ${p2.y}`; }
    } else {
      const k = Math.max(30, (horiz ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y)) * 0.5);
      d = horiz ? `M${p1.x} ${p1.y}C${p1.x + Math.sign(p2.x - p1.x) * k} ${p1.y} ${p2.x - Math.sign(p2.x - p1.x) * k} ${p2.y} ${p2.x} ${p2.y}` : `M${p1.x} ${p1.y}C${p1.x} ${p1.y + Math.sign(p2.y - p1.y) * k} ${p2.x} ${p2.y - Math.sign(p2.y - p1.y) * k} ${p2.x} ${p2.y}`;
    }
    const color = a.color || 'currentColor', w = Number(a.width ?? 2); const id = 'mqc' + Math.random().toString(36).slice(2, 8);
    const end = a.end ?? 'arrow', start = a.start ?? 'none';
    const marker = (kind, pos) => kind === 'none' || !kind ? '' : `<marker id="${id}${pos}" viewBox="0 0 10 10" refX="${kind === 'dot' ? 5 : 8}" refY="5" markerWidth="${4 + w}" markerHeight="${4 + w}" orient="auto-start-reverse"><path d="${kind === 'dot' ? 'M5 1a4 4 0 1 1 0 8a4 4 0 1 1 0-8' : 'M1 1L9 5L1 9'}" fill="${kind === 'dot' ? color : 'none'}" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`;
    const dash = a.dash ? ` stroke-dasharray="${String(a.dash).replace(/,/g, ' ')}"` : a.flow ? ' stroke-dasharray="6 6"' : '';
    let svg = `<svg xmlns="${NS}" style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1"><defs>${marker(end, 'e')}${marker(start, 's')}</defs><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash} class="mq-connector-path${a.flow ? ' mq-flow' : ''}"${end !== 'none' ? ` marker-end="url(#${id}e)"` : ''}${start !== 'none' ? ` marker-start="url(#${id}s)"` : ''}/></svg>`;
    el.innerHTML = svg;
    if (a.label) {
      const path = el.querySelector('.mq-connector-path'); const L = path.getTotalLength(); const mid = path.getPointAtLength(L / 2);
      const lab = document.createElement('div'); lab.className = 'mq-connector-label'; lab.textContent = a.label;
      lab.style.cssText = `position:absolute;left:${mid.x}px;top:${mid.y}px;transform:translate(-50%,-50%);padding:2px 8px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap;background:${a['label-bg'] || 'var(--mq-connector-bg, #fff)'};color:${a['label-color'] || color === 'currentColor' ? 'inherit' : color}`;
      el.appendChild(lab);
    }
    if (a.reveal) { const path = el.querySelector('.mq-connector-path'); const L = path.getTotalLength(); path.animate([{ strokeDasharray: `${L} ${L}`, strokeDashoffset: L }, { strokeDasharray: `${L} ${L}`, strokeDashoffset: 0 }], { duration: Number(a.reveal) > 50 ? Number(a.reveal) : 700, easing: 'cubic-bezier(.2,.8,.2,1)', delay: Number(a.delay || 0), fill: 'backwards' }); }
  };
  draw();
}

// ------------------------------------------------------------------ charts
const PALETTE = ['#7C5CFF', '#0E9F6E', '#F59E0B', '#E5484D', '#2F6FEB', '#D946EF'];
export function buildChart(el, a, w, h, resolve) {
  el.className = 'mq-chart';
  const type = a.type || 'bar';
  let data = a.data; if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = data.split(/[,\s]+/).map(Number); } }
  data = Array.isArray(data) ? data : [4, 7, 5, 9, 6, 8];
  const series = Array.isArray(data[0]) ? data : [data];
  const labels = Array.isArray(a.labels) ? a.labels : typeof a.labels === 'string' ? a.labels.split(',') : null;
  const colors = (a.colors ? (Array.isArray(a.colors) ? a.colors : String(a.colors).split(',')) : PALETTE).map((c) => resolve(String(c).trim()));
  const mt = resolve('$muted');
  const muted = a.muted ? resolve(a.muted) : mt && !String(mt).startsWith('$') ? mt : 'rgba(127,127,127,.55)';
  const showAxis = a.axis !== false && type !== 'spark' && type !== 'donut';
  const padL = showAxis ? 28 : 0, padB = showAxis && labels ? 20 : 0, padT = 6;
  const W = w - padL, H = h - padB - padT;
  const min = Number(a.min) || 0;
  // "nice" ticks: 4 steps of 1 / 2 / 2.5 / 5 × 10ⁿ, so the axis never reads 3, 3, 3
  const rawStep = ((Math.max(...series.flat(), 1e-9) - min) * 1.04) / 4 || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const tick = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= rawStep);
  const max = Number(a.max) || min + tick * 4;
  const tickDec = Number(a.max) ? (max - min < 8 ? 1 : 0) : Math.max(0, -Math.floor(Math.log10(tick) + 1e-9) + (tick / mag === 2.5 ? 1 : 0));
  const fmtTick = (v) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: tickDec, maximumFractionDigits: tickDec });
  const Y = (v) => padT + H - ((v - min) / (max - min)) * H;
  const reveal = a.reveal !== undefined && a.reveal !== false; const dur = Number(a.reveal) > 50 ? Number(a.reveal) : 700;
  let body = '';
  if (showAxis && a.grid !== false) for (let i = 0; i <= 4; i++) { const v = min + ((max - min) * i) / 4; const y = Y(v); body += `<line x1="${padL}" x2="${w}" y1="${y}" y2="${y}" stroke="${muted}" stroke-opacity=".25" stroke-dasharray="${i ? '3 4' : ''}"/>`; if (showAxis) body += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="11" fill="${muted}">${fmtTick(v)}</text>`; }
  const n = series[0].length; const step = W / n;
  if (type === 'bar') {
    const groupW = step * (1 - Number(a.gap ?? 0.35)); const bw = groupW / series.length; const r = Number(a.radius ?? 4);
    series.forEach((s, si) => s.forEach((v, i) => { const x = padL + i * step + (step - groupW) / 2 + si * bw; const y = Y(v); const hh = padT + H - y;
      body += `<path class="mq-chart-bar" style="--i:${i}" d="M${x} ${padT + H}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + bw - r - 1}Q${x + bw - 1} ${y} ${x + bw - 1} ${y + r}V${padT + H}Z" fill="${colors[si % colors.length]}"${hh <= r ? ' opacity=".9"' : ''}/>`; }));
  } else if (type === 'line' || type === 'area' || type === 'spark') {
    series.forEach((s, si) => {
      const pts = s.map((v, i) => [padL + (type === 'spark' ? (i * W) / Math.max(1, n - 1) : i * step + step / 2), Y(v)]);
      let d = `M${pts[0][0]} ${pts[0][1]}`; for (let i = 1; i < pts.length; i++) { const p0 = pts[Math.max(0, i - 2)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(pts.length - 1, i + 1)]; d += `C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`; }
      const col = colors[si % colors.length];
      if (type === 'area' || (type === 'spark' && a.fill !== false)) body += `<path d="${d}L${pts[pts.length - 1][0]} ${padT + H}L${pts[0][0]} ${padT + H}Z" fill="${col}" fill-opacity="${type === 'spark' ? 0.12 : 0.18}" class="mq-chart-area"/>`;
      body += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${a.stroke || 2.5}" stroke-linecap="round" stroke-linejoin="round" class="mq-chart-line" pathLength="1"/>`;
      if (a.dots && type !== 'spark') pts.forEach(([x, y], i) => { body += `<circle class="mq-chart-dot" style="--i:${i}" cx="${x}" cy="${y}" r="3.5" fill="${col}" stroke="${resolve(a.bg || '#fff')}" stroke-width="2"/>`; });
    });
  } else if (type === 'donut' || type === 'pie') {
    const vals = series[0]; const total = vals.reduce((x, y) => x + y, 0) || 1; const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 2; const r0 = type === 'pie' ? 0 : R * Number(a.hole ?? 0.62);
    let ang = -Math.PI / 2; const gapA = vals.length > 1 ? Number(a.gap ?? 0.02) : 0;
    vals.forEach((v, i) => { const sweep = (v / total) * Math.PI * 2; const a0 = ang + gapA / 2, a1 = ang + sweep - gapA / 2; ang += sweep; const large = a1 - a0 > Math.PI ? 1 : 0; const P = (rr, t) => `${cx + Math.cos(t) * rr} ${cy + Math.sin(t) * rr}`;
      body += `<path class="mq-chart-slice" style="--i:${i}" d="M${P(R, a0)}A${R} ${R} 0 ${large} 1 ${P(R, a1)}${r0 ? `L${P(r0, a1)}A${r0} ${r0} 0 ${large} 0 ${P(r0, a0)}` : `L${cx} ${cy}`}Z" fill="${colors[i % colors.length]}"/>`; });
    if (a.center) body += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="${Math.round(R * 0.32)}" font-weight="700" fill="currentColor">${a.center}</text>`;
  }
  if (labels && showAxis) labels.slice(0, n).forEach((l, i) => { body += `<text x="${padL + i * step + step / 2}" y="${h - 4}" text-anchor="middle" font-size="11" fill="${muted}">${String(l).replace(/</g, '&lt;')}</text>`; });
  el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;font-family:inherit">${body}</svg>`;
  if (reveal) {
    const ease = 'cubic-bezier(.2,.8,.2,1)'; const stag = Number(a.stagger || 45);
    el.querySelectorAll('.mq-chart-bar').forEach((b, i) => { b.style.transformOrigin = 'center bottom'; b.style.transformBox = 'fill-box'; b.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.04)', offset: 0.75 }, { transform: 'scaleY(1)' }], { duration: dur, delay: i * stag, easing: ease, fill: 'backwards' }); });
    el.querySelectorAll('.mq-chart-line').forEach((p) => p.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: dur * 1.4, easing: ease, fill: 'backwards' }));
    el.querySelectorAll('.mq-chart-area').forEach((p) => p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, delay: dur * 0.5, fill: 'backwards' }));
    el.querySelectorAll('.mq-chart-dot').forEach((p, i) => { p.style.transformOrigin = 'center'; p.style.transformBox = 'fill-box'; p.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 300, delay: dur * 0.6 + i * stag, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' }); });
    el.querySelectorAll('.mq-chart-slice').forEach((p, i) => { p.style.transformOrigin = 'center'; p.style.transformBox = 'view-box'; p.animate([{ opacity: 0, transform: 'rotate(-20deg) scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: dur, delay: i * stag * 1.5, easing: ease, fill: 'backwards' }); });
  }
}
