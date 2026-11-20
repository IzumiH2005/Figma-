// Mesh gradient — a grid of colour points that bends like a membrane (Figma's "Mesh gradient", 4×4 points).
//   fill="meshgrid(#f0abfc #818cf8 #22d3ee, #fb7185@45:52 #fde68a #34d399, …)"
// rows are separated by commas, points by spaces; `colour@x:y` moves a point (in % of the layer),
// otherwise it sits on the regular grid. An optional first row of options:
//   meshgrid(elastic=0.6 radius=140 tess=10, …)  → elastic: the membrane follows the pointer in the prototype.
// The surface is a Catmull-Rom patch over positions and OKLab colours, tessellated into Gouraud triangles.
import { splitTop } from './project.js';
import { parseColor, toOklab, fromOklab } from './color.js';

const OPT_RE = /^(elastic|smooth|[a-z-]+=[-\d.]+)$/;
const r1 = (v) => Math.round(v * 1000) / 10; // 0..1 → % with 1 decimal

export function isMesh(layer) { return /^\s*meshgrid\s*\(/.test(String(layer)); }

export function parseMesh(src) {
  const s = String(src).trim();
  const inner = /^meshgrid\s*\(([\s\S]*)\)\s*$/.exec(s); if (!inner) return null;
  const args = splitTop(inner[1], ',').map((x) => x.trim()).filter(Boolean);
  const opts = {};
  if (args.length && splitTop(args[0], ' ').filter(Boolean).every((t) => OPT_RE.test(t))) {
    for (const t of splitTop(args.shift(), ' ').filter(Boolean)) { const [k, v] = t.split('='); opts[k] = v === undefined ? true : +v; }
  }
  const rows = args.map((row) => splitTop(row, ' ').filter(Boolean).map((tok) => {
    const at = /^(.*?)@(-?[\d.]+):(-?[\d.]+)$/.exec(tok);
    return at ? { c: at[1], x: +at[2] / 100, y: +at[3] / 100, set: true } : { c: tok };
  }));
  if (!rows.length) return null;
  if (rows.length === 1) rows.push(rows[0].map((p) => ({ c: p.c })));
  rows.forEach((r) => { if (r.length === 1) r.push({ c: r[0].c }); });
  const C = Math.max(...rows.map((r) => r.length));
  rows.forEach((r) => { while (r.length < C) r.push({ c: r[r.length - 1]?.c || '#888' }); });
  const R = rows.length;
  rows.forEach((row, i) => row.forEach((p, j) => { const dx = C > 1 ? j / (C - 1) : 0.5, dy = R > 1 ? i / (R - 1) : 0.5; p.dx = dx; p.dy = dy; if (!p.set) { p.x = dx; p.y = dy; } }));
  return { opts, rows, R, C };
}

export function serializeMesh(m) {
  const o = Object.entries(m.opts || {}).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(' ');
  const rows = m.rows.map((row) => row.map((p) => (Math.abs(p.x - p.dx) > 0.0005 || Math.abs(p.y - p.dy) > 0.0005 ? `${p.c}@${r1(p.x)}:${r1(p.y)}` : p.c)).join(' '));
  return `meshgrid(${[o, ...rows].filter(Boolean).join(', ')})`;
}

// locate the meshgrid layer inside a fill (layers joined by "+")
export function meshLayer(fill) {
  const layers = splitTop(String(fill || ''), '+'); const i = layers.findIndex((l) => isMesh(l));
  if (i < 0) return null;
  return { mesh: parseMesh(layers[i].trim()), put: (m) => layers.map((l, k) => (k === i ? serializeMesh(m) : l.trim())).join(' + ') };
}

// ------------------------------------------------------------------ surface
const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };

// grid of vectors [x, y, L, a, b, alpha] with one ghost ring: positions extrapolated, colours clamped
function ghostGrid(m, colorOf, off) {
  const { R, C } = m; const G = [];
  for (let i = -1; i <= R; i++) {
    const row = [];
    for (let j = -1; j <= C; j++) {
      const ci = Math.max(0, Math.min(R - 1, i)), cj = Math.max(0, Math.min(C - 1, j));
      const p = m.rows[ci][cj]; const o = off ? off[ci * C + cj] : null;
      let x = p.x + (o ? o[0] : 0), y = p.y + (o ? o[1] : 0);
      if (i !== ci || j !== cj) { // extrapolate the position: mirror the inner neighbour across the edge
        const mi = Math.max(0, Math.min(R - 1, 2 * ci - i)), mj = Math.max(0, Math.min(C - 1, 2 * cj - j));
        const q = m.rows[mi][mj], qo = off ? off[mi * C + mj] : null;
        x = 2 * x - (q.x + (qo ? qo[0] : 0)); y = 2 * y - (q.y + (qo ? qo[1] : 0));
      }
      row.push([x, y, ...colorOf(p.c)]);
    }
    G.push(row);
  }
  return G;
}

function colorCache(resolve) {
  const memo = new Map();
  return (c) => {
    let v = memo.get(c); if (v) return v;
    const rgba = parseColor(resolve ? resolve(c) : c) || [128, 128, 128, 1];
    const lab = toOklab(rgba); v = [lab[0], lab[1], lab[2], rgba[3] ?? 1]; memo.set(c, v); return v;
  };
}

// sample the surface on a (R-1)·S × (C-1)·S lattice → { n, m, pts:[[x,y,L,a,b,al]] }
export function sampleMesh(m, { tess, resolve, off } = {}) {
  const S = Math.max(2, Math.min(24, tess || m.opts?.tess || 10));
  const G = ghostGrid(m, colorCache(resolve), off);
  const { R, C } = m; const NR = (R - 1) * S + 1, NC = (C - 1) * S + 1; const pts = new Array(NR * NC);
  for (let a = 0; a < NR; a++) {
    const i = Math.min(R - 2, Math.floor(a / S)), v = a / S - i;
    for (let b = 0; b < NC; b++) {
      const j = Math.min(C - 2, Math.floor(b / S)), u = b / S - j;
      const out = [0, 0, 0, 0, 0, 0];
      for (let k = 0; k < 6; k++) {
        const col = [0, 1, 2, 3].map((r) => cr(G[i + r][j][k], G[i + r][j + 1][k], G[i + r][j + 2][k], G[i + r][j + 3][k], u));
        // colours: interpolate in OKLab but keep the Catmull-Rom overshoot in check
        out[k] = cr(col[0], col[1], col[2], col[3], v);
      }
      pts[a * NC + b] = out;
    }
  }
  return { NR, NC, pts };
}

// iso-curves of the membrane, for the editor overlay (local pixels)
export function meshCurves(m, w, h, off) {
  if (!m || m.R < 2 || m.C < 2) return [];
  const S = 8; const { NR, NC, pts } = sampleMesh(m, { tess: S, off, resolve: () => '#000' });
  const P = (a, b) => { const p = pts[a * NC + b]; return `${(p[0] * w).toFixed(1)} ${(p[1] * h).toFixed(1)}`; };
  const out = [];
  for (let a = 0; a < NR; a += S) { let d = 'M' + P(a, 0); for (let b = 1; b < NC; b++) d += 'L' + P(a, b); out.push(d); }
  for (let b = 0; b < NC; b += S) { let d = 'M' + P(0, b); for (let a = 1; a < NR; a++) d += 'L' + P(a, b); out.push(d); }
  return out;
}

// evaluate one point of the surface (u along columns, v along rows, in cell units)
export function meshAt(m, u, v, resolve) {
  const { NR, NC, pts } = sampleMesh(m, { tess: 8, resolve });
  const b = Math.round(u * 8), a = Math.round(v * 8); const p = pts[Math.max(0, Math.min(NR - 1, a)) * NC + Math.max(0, Math.min(NC - 1, b))];
  const rgb = fromOklab([p[2], p[3], p[4]]).map((x) => Math.max(0, Math.min(255, Math.round(x))));
  const hex = '#' + rgb.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('');
  return { x: p[0], y: p[1], hex };
}

// insert a row (axis 'row') or a column in the widest cell, keeping every existing point in place
export function meshInsert(m, axis, resolve) {
  const { R, C } = m; let best = 0, bi = 0;
  if (axis === 'row') {
    if (R < 2) return m;
    for (let i = 0; i < R - 1; i++) { let s = 0; for (let j = 0; j < C; j++) s += Math.hypot(m.rows[i + 1][j].x - m.rows[i][j].x, m.rows[i + 1][j].y - m.rows[i][j].y); if (s > best) { best = s; bi = i; } }
    const row = []; for (let j = 0; j < C; j++) { const q = meshAt(m, j, bi + 0.5, resolve); row.push({ c: q.hex, x: q.x, y: q.y, set: true }); }
    m.rows.splice(bi + 1, 0, row);
  } else {
    if (C < 2) return m;
    for (let j = 0; j < C - 1; j++) { let s = 0; for (let i = 0; i < R; i++) s += Math.hypot(m.rows[i][j + 1].x - m.rows[i][j].x, m.rows[i][j + 1].y - m.rows[i][j].y); if (s > best) { best = s; bi = j; } }
    m.rows.forEach((row, i) => { const q = meshAt(m, bi + 0.5, i, resolve); row.splice(bi + 1, 0, { c: q.hex, x: q.x, y: q.y, set: true }); });
  }
  return parseMesh(serializeMesh(reflow(m)));
}
function reflow(m) { m.R = m.rows.length; m.C = m.rows[0].length; m.rows.forEach((row, i) => row.forEach((p, j) => { p.dx = m.C > 1 ? j / (m.C - 1) : 0.5; p.dy = m.R > 1 ? i / (m.R - 1) : 0.5; })); return m; }

export function meshReset(m) { m.rows.forEach((row) => row.forEach((p) => { p.x = p.dx; p.y = p.dy; p.set = false; })); return m; }

// ------------------------------------------------------------------ raster
// Gouraud triangles into an RGBA buffer; pixels the membrane leaves uncovered take the nearest edge colour.
export function rasterMesh(m, W, H, { resolve, off, tess, dither = true } = {}) {
  const smp = sampleMesh(m, { tess, resolve, off });
  // skirt: one extra ring pushed far outward of the frame, same colours as the edge → the area the membrane leaves
  // uncovered (an edge point pulled inward) continues the edge smoothly instead of smearing pixels
  const NR = smp.NR + 2, NC = smp.NC + 2; const pts = new Array(NR * NC);
  const at = (a, b) => smp.pts[Math.max(0, Math.min(smp.NR - 1, a)) * smp.NC + Math.max(0, Math.min(smp.NC - 1, b))];
  for (let a = 0; a < NR; a++) for (let b = 0; b < NC; b++) {
    const ia = a - 1, ib = b - 1; const p = at(ia, ib);
    if (ia >= 0 && ia < smp.NR && ib >= 0 && ib < smp.NC) { pts[a * NC + b] = p; continue; }
    const da = ia < 0 ? -1 : ia >= smp.NR ? 1 : 0, db = ib < 0 ? -1 : ib >= smp.NC ? 1 : 0;
    // extrude straight out of the frame edge: the columns never cross, even when an edge point is pulled deep inside
    pts[a * NC + b] = [p[0] + db * 3, p[1] + da * 3, p[2], p[3], p[4], p[5]];
  }
  const buf = new Float32Array(W * H * 4); const cov = new Uint8Array(W * H);
  const tri = (A, B, Cc) => {
    const ax = A[0] * W, ay = A[1] * H, bx = B[0] * W, by = B[1] * H, cx = Cc[0] * W, cy = Cc[1] * H;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const k = y * W + x, o = k * 4; cov[k] = 1;
      for (let c = 0; c < 4; c++) buf[o + c] = A[2 + c] * l1 + B[2 + c] * l2 + Cc[2 + c] * l3;
    }
  };
  for (let a = 0; a < NR - 1; a++) for (let b = 0; b < NC - 1; b++) {
    const p00 = pts[a * NC + b], p01 = pts[a * NC + b + 1], p10 = pts[(a + 1) * NC + b], p11 = pts[(a + 1) * NC + b + 1];
    tri(p00, p01, p11); tri(p00, p11, p10);
  }
  // multi-source flood: uncovered pixels copy their covered neighbour (the membrane's edge colour)
  const q = []; for (let k = 0; k < W * H; k++) if (cov[k]) q.push(k);
  if (!q.length) { const c = pts[0]; for (let k = 0; k < W * H; k++) { buf.set([c[2], c[3], c[4], c[5]], k * 4); } }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % W, y = (k / W) | 0;
    for (const n of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1]) {
      if (n < 0 || cov[n]) continue; cov[n] = 1; for (let c = 0; c < 4; c++) buf[n * 4 + c] = buf[k * 4 + c]; q.push(n);
    }
  }
  const out = new Uint8ClampedArray(W * H * 4);
  for (let k = 0; k < W * H; k++) {
    const o = k * 4; const rgb = fromOklab([buf[o], buf[o + 1], buf[o + 2]]);
    // ordered dither of ±½ level: no banding once the browser stretches the bitmap
    const d = dither ? ((((k * 2654435761) >>> 0) % 997) / 997 - 0.5) : 0;
    out[o] = rgb[0] + d; out[o + 1] = rgb[1] + d; out[o + 2] = rgb[2] + d; out[o + 3] = Math.max(0, Math.min(1, buf[o + 3])) * 255;
  }
  return out;
}

const urls = new Map();
// → data: URL of the membrane (cached by source)
export function meshDataURL(src, resolve, res = 160) {
  if (typeof document === 'undefined') return null;
  const key = src + '|' + res; let u = urls.get(key); if (u) return u;
  const m = typeof src === 'string' ? parseMesh(src) : src; if (!m) return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = res; const g = cv.getContext('2d');
  const im = g.createImageData(res, res); im.data.set(rasterMesh(m, res, res, { resolve })); g.putImageData(im, 0, 0);
  u = cv.toDataURL('image/png'); if (urls.size > 200) urls.clear(); urls.set(key, u); return u;
}

// ------------------------------------------------------------------ elastic membrane (prototype)
// The points near the pointer are pulled toward it with a smooth falloff and spring back when it leaves.
// Press = a firmer grip. A live canvas behind the content redraws only while something moves.
export function bindElastic(el, src, reduced) {
  if (typeof document === 'undefined' || reduced) return;
  const m = parseMesh(src); if (!m) return;
  const strength = m.opts.elastic === true ? 0.5 : Math.max(0, Math.min(1, +m.opts.elastic || 0.5));
  const radius = +m.opts.radius || 160; const N = m.R * m.C;
  const off = Array.from({ length: N }, () => [0, 0]), vel = Array.from({ length: N }, () => [0, 0]);
  const cv = document.createElement('canvas'); cv.className = 'mq-mesh'; const RES = 72; cv.width = cv.height = RES;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;pointer-events:none;z-index:-1;display:block;opacity:0;transition:opacity .12s';
  if (!el.style.position) el.style.position = 'relative'; el.style.isolation = 'isolate'; el.insertBefore(cv, el.firstChild);
  const g = cv.getContext('2d'); const im = g.createImageData(RES, RES);
  let ptr = null, down = false, raf = 0, last = 0;
  const step = (t) => {
    const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016); last = t;
    const r = el.getBoundingClientRect(); let moving = false;
    for (let i = 0; i < m.R; i++) for (let j = 0; j < m.C; j++) {
      const k = i * m.C + j, p = m.rows[i][j]; let tx = 0, ty = 0;
      if (ptr) {
        const px = (ptr.x - r.left) / r.width, py = (ptr.y - r.top) / r.height;
        const dx = (px - p.x) * r.width, dy = (py - p.y) * r.height; const d = Math.hypot(dx, dy);
        const f = Math.exp(-(d * d) / (2 * radius * radius)) * (down ? Math.min(1, strength * 1.8) : strength);
        tx = (px - p.x) * f; ty = (py - p.y) * f;
        // the rim is held like a drum skin: edge points only slide along their edge
        if (i === 0 || i === m.R - 1) ty = 0; if (j === 0 || j === m.C - 1) tx = 0;
      }
      // underdamped spring (stiffness 170, damping 12): the membrane overshoots a little, then settles
      for (const [c, tgt] of [[0, tx], [1, ty]]) { const a = 170 * (tgt - off[k][c]) - 12 * vel[k][c]; vel[k][c] += a * dt; off[k][c] += vel[k][c] * dt; }
      if (Math.abs(vel[k][0]) + Math.abs(vel[k][1]) > 0.002 || Math.abs(off[k][0] - tx) + Math.abs(off[k][1] - ty) > 0.001) moving = true;
    }
    im.data.set(rasterMesh(m, RES, RES, { off, tess: 6, dither: false })); g.putImageData(im, 0, 0);
    const rest = !ptr && off.every((o) => Math.abs(o[0]) + Math.abs(o[1]) < 0.001);
    cv.style.opacity = rest ? '0' : '1';
    raf = moving || ptr ? requestAnimationFrame(step) : 0; if (!raf) last = 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
  el.addEventListener('pointermove', (e) => { ptr = { x: e.clientX, y: e.clientY }; kick(); });
  el.addEventListener('pointerdown', (e) => { down = true; ptr = { x: e.clientX, y: e.clientY }; kick(); });
  const release = () => { down = false; kick(); };
  el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', () => { ptr = null; down = false; kick(); });
  el._mesh = { m, off, poke: (x, y, press) => { ptr = x == null ? null : { x, y }; down = !!press; kick(); } };
}
