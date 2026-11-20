// Advanced path operations (all robust: built on polygon-clipping, no self-intersection surprises):
//   offsetPath   — grow / shrink a closed shape by d px (rounded joins). Figma has no native offset (plugin only).
//   outlineStroke— turn a stroke into a filled shape (center / inside / outside, round|butt|square caps).
//   widthProfile — variable-width stroke (taper, brush, ink, calligraphy, custom stops) as a filled shape.
//   scatterBrush — repeat a shape along a path (Figma Draw scatter brush), with spacing, size, jitter, rotation.
//   arrangeRegions — planar regions of overlapping shapes (Shape Builder), each with the set of shapes covering it.
import polygonClipping from 'polygon-clipping';
import { flatten, simplify, smoothPath, shapePath, translatePath, rotatePath, scalePath } from './pathkit.js';

const TAU = Math.PI * 2;
const close = (r) => { const a = r[0], b = r[r.length - 1]; return a[0] === b[0] && a[1] === b[1] ? r : [...r, [a[0], a[1]]]; };
function circle(cx, cy, r, n) { const pts = []; for (let i = 0; i < n; i++) { const t = (i / n) * TAU; pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } return [close(pts)]; }
const safe = (fn, ...a) => { try { return fn(...a); } catch (e) { return a[0] || []; } };
function unionAll(polys) {
  // union in chunks (polygon-clipping is fastest with moderate argument lists)
  let acc = []; const CH = 64;
  for (let i = 0; i < polys.length; i += CH) { const part = polys.slice(i, i + CH); acc = acc.length ? safe(polygonClipping.union, acc, ...part) : safe(polygonClipping.union, part[0], ...part.slice(1)); }
  return acc;
}

// closed sub-paths → multipolygon (even-odd), open ones ignored
export function toMultiPolygon(subs, tol = 0.4) {
  const rings = flatten(subs, tol).filter((p) => p.closed && p.pts.length > 2).map((p) => close(p.pts.slice()));
  let acc = [];
  for (const r of rings) acc = acc.length ? safe(polygonClipping.xor, acc, [[r]]) : [[r]];
  return acc;
}
// multipolygon → editable sub-paths (simplified; smooth=true fits curves through the points)
export function fromMultiPolygon(mp, { tol = 0.3, smooth = false } = {}) {
  const subs = [];
  for (const poly of mp || []) for (const ring of poly) {
    let pts = simplify(ring.slice(0, -1), tol);
    if (pts.length < 3) continue;
    if (smooth) subs.push(...smoothPath(pts, true, 1)); else subs.push({ closed: true, nodes: pts.map(([x, y]) => ({ x, y, in: null, out: null })) });
  }
  return subs;
}

// buffer around polylines: union of segment quads + round/square joins & caps
function buffer(polylines, r, { cap = 'round', join = 'round' } = {}) {
  const pieces = []; const n = Math.max(12, Math.min(48, Math.round(r * 1.5)));
  for (const { pts, closed } of polylines) {
    const P = closed ? [...pts, pts[0]] : pts;
    for (let i = 0; i < P.length - 1; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[i + 1]; const dx = x2 - x1, dy = y2 - y1; const L = Math.hypot(dx, dy); if (L < 1e-6) continue;
      const nx = (-dy / L) * r, ny = (dx / L) * r;
      let ex = 0, ey = 0;
      if (!closed && cap === 'square') { ex = (dx / L) * r; ey = (dy / L) * r; }
      const sx = i === 0 ? x1 - ex : x1, sy = i === 0 ? y1 - ey : y1, tx = i === P.length - 2 ? x2 + ex : x2, ty = i === P.length - 2 ? y2 + ey : y2;
      pieces.push([close([[sx + nx, sy + ny], [tx + nx, ty + ny], [tx - nx, ty - ny], [sx - nx, sy - ny]])]);
    }
    for (let i = 0; i < P.length; i++) {
      const end = !closed && (i === 0 || i === P.length - 1);
      if (end ? cap === 'round' : join === 'round') pieces.push(circle(P[i][0], P[i][1], r, n));
    }
  }
  return unionAll(pieces);
}
const polylinesOf = (subs, tol) => flatten(subs, tol).filter((p) => p.pts.length > 1);

export function offsetPath(subs, d, opts = {}) {
  if (!d) return subs;
  const G = toMultiPolygon(subs);
  if (!G.length) return outlineStroke(subs, Math.abs(d) * 2, opts);
  const rings = G.flatMap((poly) => poly.map((r) => ({ pts: r.slice(0, -1), closed: true })));
  const B = buffer(rings, Math.abs(d), { join: opts.join || 'round' });
  const res = d > 0 ? safe(polygonClipping.union, G, B) : safe(polygonClipping.difference, G, B);
  return fromMultiPolygon(res, { tol: opts.tol ?? 0.35, smooth: !!opts.smooth });
}

export function outlineStroke(subs, width, { cap = 'round', join = 'round', align = 'center', smooth = false } = {}) {
  const r = Math.max(0.25, width / 2);
  const lines = polylinesOf(subs, 0.4);
  if (align !== 'center') {
    const G = toMultiPolygon(subs); const B = buffer(lines, width, { cap, join });
    const res = align === 'inside' ? safe(polygonClipping.intersection, G, B) : safe(polygonClipping.difference, safe(polygonClipping.union, G, B), G);
    return fromMultiPolygon(res, { smooth });
  }
  return fromMultiPolygon(buffer(lines, r, { cap, join }), { smooth });
}

// ---------------------------------------------------------------- variable width
function resample(pts, closed, step) {
  const P = closed ? [...pts, pts[0]] : pts; const out = []; const len = [0];
  for (let i = 1; i < P.length; i++) len.push(len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = len[len.length - 1]; if (!total) return { pts: [], total: 0 };
  const N = Math.max(8, Math.min(400, Math.ceil(total / step)));
  let j = 1;
  for (let k = 0; k <= N; k++) {
    const s = (k / N) * total; while (j < len.length - 1 && len[j] < s) j++;
    const t = (s - len[j - 1]) / (len[j] - len[j - 1] || 1);
    out.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * t, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * t]);
  }
  return { pts: out, total };
}
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// profile: name or stops "0:0.2 0.4:1 1:0" → f(t, angle) ∈ [0,1]
export function profileFn(profile = 'uniform', seed = 3) {
  const p = String(profile).trim();
  const r = rng(seed); const noise = Array.from({ length: 24 }, () => r());
  const nz = (t) => { const x = t * 23, i = Math.floor(x), f = x - i; const a = noise[i % 24], b = noise[(i + 1) % 24]; return a + (b - a) * (f * f * (3 - 2 * f)); };
  const P = {
    uniform: () => 1,
    taper: (t) => Math.pow(Math.sin(Math.PI * t), 0.55),
    'taper-start': (t) => Math.pow(Math.min(1, t * 1.6), 0.6),
    'taper-end': (t) => Math.pow(Math.min(1, (1 - t) * 1.6), 0.6),
    wedge: (t) => 1 - t,
    brush: (t) => Math.pow(Math.sin(Math.PI * t), 0.4) * (0.85 + 0.15 * Math.sin(t * 9)),
    ink: (t) => Math.pow(Math.sin(Math.PI * t), 0.5) * (0.55 + 0.45 * nz(t)),
    marker: (t) => (t < 0.03 || t > 0.97 ? 0.85 : 1),
    bulge: (t) => 0.35 + 0.65 * Math.sin(Math.PI * t),
    calligraphy: (t, ang) => 0.18 + 0.82 * Math.abs(Math.sin(ang - Math.PI / 4)),
  };
  if (P[p]) return P[p];
  const stops = p.split(/\s+/).map((s) => s.split(':').map(Number)).filter((s) => s.length === 2 && !isNaN(s[0]) && !isNaN(s[1])).sort((a, b) => a[0] - b[0]);
  if (!stops.length) return P.uniform;
  return (t) => {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, v0] = stops[i - 1], [t1, v1] = stops[i]; const u = (t - t0) / (t1 - t0 || 1); const e = u * u * (3 - 2 * u); return v0 + (v1 - v0) * e; }
    return stops[stops.length - 1][1];
  };
}
export function widthProfile(subs, width, profile = 'taper', { seed = 3, min = 0.02 } = {}) {
  const f = profileFn(profile, seed); const pieces = [];
  for (const line of polylinesOf(subs, 0.3)) {
    const { pts } = resample(line.pts, line.closed, Math.max(1, width / 3)); const N = pts.length; if (N < 2) continue;
    const left = [], right = [];
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)]; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const t = i / (N - 1); const hw = (width / 2) * Math.max(min, f(line.closed ? (t * 2) % 1 : t, ang));
      const nx = -Math.sin(ang) * hw, ny = Math.cos(ang) * hw;
      left.push([pts[i][0] + nx, pts[i][1] + ny]); right.push([pts[i][0] - nx, pts[i][1] - ny]);
    }
    if (line.closed) { pieces.push(...safe(polygonClipping.xor, [[close(left)]], [[close(right)]])); continue; }
    pieces.push([close([...left, ...right.reverse()])]);
  }
  // union cleans self-overlaps (tight curves); closed rings: outer xor inner
  const res = pieces.length ? safe(polygonClipping.union, pieces[0], ...pieces.slice(1)) : [];
  return fromMultiPolygon(res, { tol: 0.2 });
}

// ---------------------------------------------------------------- scatter brush
// spec: "scatter star spacing=16 size=10 jitter=0.3 rotate=follow|random|0 seed=2 scale=0.5..1"
export function scatterBrush(subs, spec) {
  const parts = String(spec).trim().split(/\s+/); const kindIdx = parts[0] === 'scatter' ? 1 : 0;
  const kind = parts[kindIdx] || 'ellipse'; const o = {};
  for (const p of parts.slice(kindIdx + 1)) { const m = /^([\w-]+)=(.+)$/.exec(p); if (m) o[m[1]] = m[2]; }
  const size = +o.size || 10, spacing = +o.spacing || size * 1.6, jitter = +o.jitter || 0, seed = +o.seed || 2;
  const [smin, smax] = String(o.scale || '1').split('..').map(Number); const r = rng(seed);
  const shapeParams = {}; for (const [k, v] of Object.entries(o)) if (!['size', 'spacing', 'jitter', 'seed', 'scale', 'rotate'].includes(k)) shapeParams[k] = v;
  const out = [];
  for (const line of polylinesOf(subs, 0.3)) {
    const { pts, total } = resample(line.pts, line.closed, 1); if (!total) continue;
    const count = Math.max(1, Math.floor(total / spacing));
    for (let k = 0; k <= count; k++) {
      if (line.closed && k === count) break;
      const idx = Math.round((k / Math.max(1, count)) * (pts.length - 1));
      const a = pts[Math.max(0, idx - 1)], b = pts[Math.min(pts.length - 1, idx + 1)]; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const sc = (smax ? smin + (smax - smin) * r() : smin) || 1; const s = size * sc;
      let rot = o.rotate === 'random' ? r() * 360 : o.rotate === undefined || o.rotate === 'follow' ? (ang * 180) / Math.PI : +o.rotate;
      const off = jitter ? (r() - 0.5) * 2 * jitter * size : 0;
      const cx = pts[idx][0] - Math.sin(ang) * off, cy = pts[idx][1] + Math.cos(ang) * off;
      let shp = shapePath(kind, s, s, shapeParams);
      shp = rotatePath(translatePath(shp, cx - s / 2, cy - s / 2), rot, cx, cy);
      out.push(...shp);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Shape Builder regions
// geoms: [subs, subs, …] in a common coordinate space → [{ subs, owners:[indices] }] (each connected region)
export function arrangeRegions(list) {
  let regions = [];
  list.forEach((subs, i) => {
    const G = toMultiPolygon(subs); if (!G.length) return;
    const next = []; let rest = G;
    for (const r of regions) {
      const inter = safe(polygonClipping.intersection, r.geom, G); const diff = safe(polygonClipping.difference, r.geom, G);
      if (inter.length) next.push({ geom: inter, owners: [...r.owners, i] });
      if (diff.length) next.push({ geom: diff, owners: r.owners });
      rest = rest.length ? safe(polygonClipping.difference, rest, r.geom) : rest;
    }
    if (rest.length) next.push({ geom: rest, owners: [i] });
    regions = next;
  });
  // split multipolygons into connected parts, drop slivers
  const out = [];
  for (const r of regions) for (const poly of r.geom) {
    const area = Math.abs(ringArea(poly[0])) - poly.slice(1).reduce((s, h) => s + Math.abs(ringArea(h)), 0);
    if (area < 4) continue;
    out.push({ geom: [poly], owners: r.owners, area, subs: fromMultiPolygon([poly], { tol: 0.2 }) });
  }
  return out;
}
function ringArea(r) { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }
export function unionSubs(list) { const mps = list.map((s) => toMultiPolygon(s)).filter((g) => g.length); if (!mps.length) return []; return fromMultiPolygon(safe(polygonClipping.union, mps[0], ...mps.slice(1)), { tol: 0.2 }); }
export { scalePath };
