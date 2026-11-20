// Vector toolkit: SVG path parse/serialize, editable bezier nodes, flattening, booleans, simplification,
// curve fitting and parametric shape generators (the "rigs" behind <shape kind=…>).
import polygonClipping from 'polygon-clipping';

// ------------------------------------------------------------------ parse → [{closed, nodes:[{x,y,in,out}]}]
// in/out are absolute control points (null = straight)
export function parsePath(d) {
  const toks = String(d || '').match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const subs = []; let cur = null; let i = 0; let cmd = null;
  let x = 0, y = 0, sx = 0, sy = 0, lcx = null, lcy = null, lqx = null, lqy = null;
  const n = () => parseFloat(toks[i++]);
  const start = (px, py) => { cur = { closed: false, nodes: [{ x: px, y: py, in: null, out: null }] }; subs.push(cur); sx = px; sy = py; };
  const last = () => cur.nodes[cur.nodes.length - 1];
  const lineTo = (px, py) => { if (!cur) start(x, y); cur.nodes.push({ x: px, y: py, in: null, out: null }); };
  const cubicTo = (c1x, c1y, c2x, c2y, px, py) => { if (!cur) start(x, y); last().out = { x: c1x, y: c1y }; cur.nodes.push({ x: px, y: py, in: { x: c2x, y: c2y }, out: null }); };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C !== 'C' && C !== 'S') { lcx = lcy = null; }
    if (C !== 'Q' && C !== 'T') { lqx = lqy = null; }
    switch (C) {
      case 'M': { x = ox + n(); y = oy + n(); start(x, y); cmd = rel ? 'l' : 'L'; break; }
      case 'L': x = ox + n(); y = oy + n(); lineTo(x, y); break;
      case 'H': x = (rel ? x : 0) + n(); lineTo(x, y); break;
      case 'V': y = (rel ? y : 0) + n(); lineTo(x, y); break;
      case 'C': { const a = ox + n(), b = oy + n(), c = ox + n(), e = oy + n(); x = ox + n(); y = oy + n(); cubicTo(a, b, c, e, x, y); lcx = c; lcy = e; break; }
      case 'S': { const a = lcx !== null ? 2 * x - lcx : x, b = lcy !== null ? 2 * y - lcy : y; const c = ox + n(), e = oy + n(); x = ox + n(); y = oy + n(); cubicTo(a, b, c, e, x, y); lcx = c; lcy = e; break; }
      case 'Q': { const qx = ox + n(), qy = oy + n(); const px = ox + n(), py = oy + n(); cubicTo(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py), px, py); x = px; y = py; lqx = qx; lqy = qy; break; }
      case 'T': { const qx = lqx !== null ? 2 * x - lqx : x, qy = lqy !== null ? 2 * y - lqy : y; const px = ox + n(), py = oy + n(); cubicTo(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py), px, py); x = px; y = py; lqx = qx; lqy = qy; break; }
      case 'A': { const rx = n(), ry = n(), rot = n(), large = n(), sweep = n(); const px = ox + n(), py = oy + n(); for (const c of arcToCubics(x, y, rx, ry, rot, large, sweep, px, py)) cubicTo(...c); x = px; y = py; break; }
      case 'Z': {
        if (cur) {
          cur.closed = true;
          const f = cur.nodes[0], l = last();
          if (cur.nodes.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) { f.in = l.in; cur.nodes.pop(); }
          x = sx; y = sy; cur = null;
        }
        break;
      }
      default: i++;
    }
  }
  return subs;
}

function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const rad = (phi * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sign = fa === fs ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2)); const out = []; const d = dt / segs;
  const k = (4 / 3) * Math.tan(d / 4);
  for (let s = 0; s < segs; s++) {
    const a1 = t1 + s * d, a2 = a1 + d;
    const p = (a) => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos];
    const dp = (a) => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos];
    const [ax, ay] = p(a1), [bx, by] = p(a2), [dax, day] = dp(a1), [dbx, dby] = dp(a2);
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  return out;
}

const f = (v) => +v.toFixed(2);
export function serializePath(subs) {
  let d = '';
  for (const s of subs) {
    if (!s.nodes.length) continue;
    const N = s.nodes; d += `M${f(N[0].x)} ${f(N[0].y)}`;
    const seg = (a, b) => (a.out || b.in ? `C${f((a.out || a).x)} ${f((a.out || a).y)} ${f((b.in || b).x)} ${f((b.in || b).y)} ${f(b.x)} ${f(b.y)}` : `L${f(b.x)} ${f(b.y)}`);
    for (let k = 1; k < N.length; k++) d += seg(N[k - 1], N[k]);
    if (s.closed) { if (N.length > 1 && (N[N.length - 1].out || N[0].in)) d += seg(N[N.length - 1], N[0]); d += 'Z'; }
  }
  return d;
}

// ------------------------------------------------------------------ geometry helpers
export function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
}
export function segments(s) { // [[a,b]] pairs of nodes
  const out = []; const N = s.nodes;
  for (let k = 1; k < N.length; k++) out.push([N[k - 1], N[k], k]);
  if (s.closed && N.length > 1) out.push([N[N.length - 1], N[0], 0]);
  return out;
}
export function flatten(subs, tol = 0.6) {
  const polys = [];
  for (const s of subs) {
    if (s.nodes.length < 2) continue;
    const pts = [[s.nodes[0].x, s.nodes[0].y]];
    for (const [a, b] of segments(s)) {
      if (!a.out && !b.in) { pts.push([b.x, b.y]); continue; }
      const p1 = a.out || a, p2 = b.in || b;
      const len = Math.hypot(p1.x - a.x, p1.y - a.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(b.x - p2.x, b.y - p2.y);
      const n = Math.max(2, Math.min(64, Math.ceil(len / (tol * 6))));
      for (let i = 1; i <= n; i++) { const p = cubicPoint(a, p1, p2, b, i / n); pts.push([p.x, p.y]); }
    }
    polys.push({ pts, closed: s.closed });
  }
  return polys;
}
export function bbox(subs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of flatten(subs, 1)) for (const [x, y] of p.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}
export function transformPath(subs, fn) {
  const m = (p) => (p ? fn(p) : null);
  return subs.map((s) => ({ closed: s.closed, nodes: s.nodes.map((n) => { const q = fn(n); return { x: q.x, y: q.y, in: m(n.in), out: m(n.out), smooth: n.smooth }; }) }));
}
export const translatePath = (subs, dx, dy) => transformPath(subs, (p) => ({ x: p.x + dx, y: p.y + dy }));
export const scalePath = (subs, sx, sy, ox = 0, oy = 0) => transformPath(subs, (p) => ({ x: ox + (p.x - ox) * sx, y: oy + (p.y - oy) * sy }));
export const rotatePath = (subs, deg, cx, cy) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return transformPath(subs, (p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c })); };

// split segment a→b at t (de Casteljau) : returns the new middle node and updates a.out / b.in
export function splitAt(a, b, t) {
  const p0 = a, p1 = a.out || a, p2 = b.in || b, p3 = b;
  const L = (u, v) => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
  const q0 = L(p0, p1), q1 = L(p1, p2), q2 = L(p2, p3), r0 = L(q0, q1), r1 = L(q1, q2), s = L(r0, r1);
  const curved = !!(a.out || b.in);
  if (curved) { a.out = q0; b.in = q2; return { x: s.x, y: s.y, in: r0, out: r1, smooth: true }; }
  return { x: s.x, y: s.y, in: null, out: null };
}
// nearest point on path: { sub, seg index k (index of b in nodes), t, x, y, dist }
export function nearest(subs, px, py) {
  let best = null;
  subs.forEach((s, si) => {
    for (const [a, b, k] of segments(s)) {
      for (let i = 0; i <= 40; i++) {
        const t = i / 40; const p = a.out || b.in ? cubicPoint(a, a.out || a, b.in || b, b, t) : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const d = Math.hypot(p.x - px, p.y - py);
        if (!best || d < best.dist) best = { sub: si, k, t, x: p.x, y: p.y, dist: d };
      }
    }
  });
  return best;
}

// ------------------------------------------------------------------ freehand: simplify (RDP) + smooth fit (Catmull-Rom → Bézier)
export function simplify(pts, tol = 1.5) {
  if (pts.length < 3) return pts.slice();
  const sq = (a, b, p) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = dx * dx + dy * dy; let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1]; return x * x + y * y; };
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) { const [s, e] = stack.pop(); let md = 0, mi = -1; for (let i = s + 1; i < e; i++) { const d = sq(pts[s], pts[e], pts[i]); if (d > md) { md = d; mi = i; } } if (md > tol * tol) { keep[mi] = 1; stack.push([s, mi], [mi, e]); } }
  return pts.filter((_, i) => keep[i]);
}
export function smoothPath(pts, closed = false, tension = 1) {
  const N = pts.length; if (N < 2) return [];
  const nodes = pts.map(([x, y]) => ({ x, y, in: null, out: null, smooth: true }));
  const P = (i) => pts[closed ? (i + N) % N : Math.max(0, Math.min(N - 1, i))];
  for (let i = 0; i < N; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1);
    const tx = ((p2[0] - p0[0]) / 6) * tension, ty = ((p2[1] - p0[1]) / 6) * tension;
    if (closed || i > 0) nodes[i].in = { x: p1[0] - tx, y: p1[1] - ty };
    if (closed || i < N - 1) nodes[i].out = { x: p1[0] + tx, y: p1[1] + ty };
  }
  return [{ closed, nodes }];
}

// ------------------------------------------------------------------ booleans (union / subtract / intersect / exclude)
function toMulti(subs) {
  // even-odd: each closed ring becomes a polygon; polygon-clipping resolves overlaps
  const rings = flatten(subs, 0.4).filter((p) => p.pts.length > 2).map((p) => { const r = p.pts.slice(); const a = r[0], b = r[r.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]); return r; });
  let acc = [];
  for (const r of rings) { try { acc = acc.length ? polygonClipping.xor(acc, [[r]]) : [[r]]; } catch (e) { /* skip bad ring */ } }
  return acc;
}
export function booleanPaths(list, op = 'union') {
  const geoms = list.map(toMulti).filter((g) => g.length);
  if (!geoms.length) return [];
  const fn = { union: polygonClipping.union, subtract: polygonClipping.difference, intersect: polygonClipping.intersection, exclude: polygonClipping.xor }[op] || polygonClipping.union;
  let res;
  try { res = fn(geoms[0], ...geoms.slice(1)); } catch (e) { res = geoms[0]; }
  const subs = [];
  for (const poly of res) for (const ring of poly) {
    const pts = ring.slice(0, -1);
    subs.push({ closed: true, nodes: simplify(pts, 0.25).map(([x, y]) => ({ x, y, in: null, out: null })) });
  }
  return subs;
}

// ------------------------------------------------------------------ parametric shapes (all in a w×h box)
const P = (x, y) => ({ x, y, in: null, out: null });
const K = 0.5523; // circle kappa
function poly(points, closed = true) { return [{ closed, nodes: points.map(([x, y]) => P(x, y)) }]; }
// rounded polygon: cubic corners of radius r (clamped), optional smoothing (0..1, iOS-like squircle)
export function roundPoly(points, r = 0, smoothing = 0) {
  if (!r) return poly(points);
  const N = points.length; const nodes = [];
  for (let i = 0; i < N; i++) {
    const p0 = points[(i - 1 + N) % N], p1 = points[i], p2 = points[(i + 1) % N];
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))));
    let rr = Math.min(Array.isArray(r) ? r[i] || 0 : r, (Math.min(l1, l2) / 2) * Math.tan(ang / 2));
    if (rr <= 0.01) { nodes.push(P(...p1)); continue; }
    const cut = Math.min(rr / Math.tan(ang / 2) * (1 + smoothing), Math.min(l1, l2) / 2);
    const a = [p1[0] + (v1[0] / l1) * cut, p1[1] + (v1[1] / l1) * cut], b = [p1[0] + (v2[0] / l2) * cut, p1[1] + (v2[1] / l2) * cut];
    const kk = (4 / 3) * Math.tan((Math.PI - ang) / 4) * (1 + smoothing * 0.6) * (rr / Math.max(0.001, cut / Math.tan(ang / 2)) * (1 / (1 + smoothing)));
    const h = Math.min(cut, cut * Math.max(0.3, kk));
    nodes.push({ x: a[0], y: a[1], in: null, out: { x: a[0] - (v1[0] / l1) * h, y: a[1] - (v1[1] / l1) * h } });
    nodes.push({ x: b[0], y: b[1], in: { x: b[0] - (v2[0] / l2) * h, y: b[1] - (v2[1] / l2) * h }, out: null });
  }
  return [{ closed: true, nodes }];
}
function regular(n, w, h, rot = -90, inner = null) {
  const pts = []; const cx = w / 2, cy = h / 2; const total = inner ? n * 2 : n;
  for (let i = 0; i < total; i++) { const a = ((rot + (360 / total) * i) * Math.PI) / 180; const k = inner && i % 2 ? inner : 1; pts.push([cx + (Math.cos(a) * w / 2) * k, cy + (Math.sin(a) * h / 2) * k]); }
  return pts;
}
function rngf(seed) { let a = (seed * 9301 + 49297) | 0; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; }
function ellipseArc(w, h, start = 0, sweep = 360, ratio = 0) {
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  if (sweep >= 360 && !ratio) {
    return [{ closed: true, nodes: [{ x: cx + rx, y: cy, in: { x: cx + rx, y: cy - ry * K }, out: { x: cx + rx, y: cy + ry * K } }, { x: cx, y: cy + ry, in: { x: cx + rx * K, y: cy + ry }, out: { x: cx - rx * K, y: cy + ry } }, { x: cx - rx, y: cy, in: { x: cx - rx, y: cy + ry * K }, out: { x: cx - rx, y: cy - ry * K } }, { x: cx, y: cy - ry, in: { x: cx - rx * K, y: cy - ry }, out: { x: cx + rx * K, y: cy - ry } }] }];
  }
  const arc = (r1x, r1y, a0, a1) => { // cubic arc nodes from a0 to a1 (deg)
    const segs = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90)); const d = (a1 - a0) / segs; const out = [];
    for (let s = 0; s <= segs; s++) { const a = ((a0 + d * s) * Math.PI) / 180; out.push({ x: cx + r1x * Math.cos(a), y: cy + r1y * Math.sin(a), in: null, out: null, a }); }
    const k = (4 / 3) * Math.tan((d * Math.PI) / 180 / 4);
    for (let s = 0; s < out.length; s++) { const n = out[s]; const tx = -r1x * Math.sin(n.a), ty = r1y * Math.cos(n.a); if (s > 0) n.in = { x: n.x - k * tx, y: n.y - k * ty }; if (s < out.length - 1) n.out = { x: n.x + k * tx, y: n.y + k * ty }; delete n.a; }
    return out;
  };
  const sw = Math.max(0.5, Math.min(359.99, sweep));
  const outer = arc(rx, ry, start, start + sw);
  if (ratio > 0) { const inner = arc(rx * ratio, ry * ratio, start + sw, start).map((n) => n); return [{ closed: true, nodes: [...outer, ...inner] }]; }
  return [{ closed: true, nodes: [P(cx, cy), ...outer] }];
}

export const SHAPES = {
  rect: { params: { radius: 0, smoothing: 0 }, make: (w, h, p) => roundPoly([[0, 0], [w, 0], [w, h], [0, h]], String(p.radius).includes(' ') ? String(p.radius).split(/\s+/).map(Number) : +p.radius || 0, +p.smoothing || 0) },
  squircle: { params: { smoothing: 1 }, make: (w, h, p) => roundPoly([[0, 0], [w, 0], [w, h], [0, h]], Math.min(w, h) * 0.32, +p.smoothing || 1) },
  ellipse: { params: { start: 0, sweep: 360, ratio: 0 }, make: (w, h, p) => ellipseArc(w, h, +p.start || 0, p.sweep === undefined ? 360 : +p.sweep, +p.ratio || 0) },
  ring: { params: { ratio: 0.6, start: 0, sweep: 360 }, make: (w, h, p) => { if ((p.sweep === undefined ? 360 : +p.sweep) >= 360) { const o = ellipseArc(w, h), i = ellipseArc(w * (+p.ratio || 0.6), h * (+p.ratio || 0.6)); return [...o, ...translatePath(i, (w - w * (+p.ratio || 0.6)) / 2, (h - h * (+p.ratio || 0.6)) / 2)]; } return ellipseArc(w, h, +p.start || 0, +p.sweep, +p.ratio || 0.6); } },
  polygon: { params: { sides: 6, radius: 0, rotate: -90 }, make: (w, h, p) => roundPoly(regular(Math.max(3, +p.sides || 6), w, h, +p.rotate || -90), +p.radius || 0) },
  triangle: { params: { radius: 0 }, make: (w, h, p) => roundPoly([[w / 2, 0], [w, h], [0, h]], +p.radius || 0) },
  star: { params: { points: 5, inner: 0.45, radius: 0 }, make: (w, h, p) => roundPoly(regular(Math.max(3, +p.points || 5), w, h, -90, +p.inner || 0.45), +p.radius || 0) },
  burst: { params: { points: 16, depth: 0.82, radius: 0 }, make: (w, h, p) => roundPoly(regular(Math.max(4, +p.points || 16), w, h, -90, +p.depth || 0.82), +p.radius || 0) },
  heart: { params: {}, make: (w, h) => parsePathScaled('M50 88C20 66 4 50 4 30C4 15 15 4 29 4c9 0 16 5 21 12c5-7 12-12 21-12c14 0 25 11 25 26c0 20-16 36-46 58Z', w, h) },
  arrow: { params: { head: 0.42, shaft: 0.38, radius: 0 }, make: (w, h, p) => { const hd = w * (+p.head || 0.42), sh = h * (+p.shaft || 0.38); const y0 = (h - sh) / 2; return roundPoly([[0, y0], [w - hd, y0], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, y0 + sh], [0, y0 + sh]], +p.radius || 0); } },
  chevron: { params: { thickness: 0.35, radius: 0 }, make: (w, h, p) => { const t = w * (+p.thickness || 0.35); return roundPoly([[0, 0], [t, 0], [w, h / 2], [t, h], [0, h], [w - t, h / 2]], +p.radius || 0); } },
  cross: { params: { thickness: 0.34, radius: 0 }, make: (w, h, p) => { const tx = w * (+p.thickness || 0.34), ty = h * (+p.thickness || 0.34); const ax = (w - tx) / 2, ay = (h - ty) / 2; return roundPoly([[ax, 0], [ax + tx, 0], [ax + tx, ay], [w, ay], [w, ay + ty], [ax + tx, ay + ty], [ax + tx, h], [ax, h], [ax, ay + ty], [0, ay + ty], [0, ay], [ax, ay]], +p.radius || 0); } },
  bubble: { params: { radius: 16, tail: 0.25 }, make: (w, h, p) => { const th = Math.min(h * 0.22, 18), bh = h - th, tx = w * (+p.tail || 0.25); return roundPoly([[0, 0], [w, 0], [w, bh], [tx + th, bh], [tx, h], [tx, bh], [0, bh]], [+p.radius || 16, +p.radius || 16, +p.radius || 16, 0, 0, 0, +p.radius || 16]); } },
  blob: { params: { seed: 3, points: 7, wobble: 0.28 }, make: (w, h, p) => { const r = rngf(+p.seed || 3); const n = Math.max(3, +p.points || 7); const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const k = 1 - (+p.wobble || 0.28) * r(); pts.push([w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k]); } return smoothPath(pts, true, 1.1); } },
  wave: { params: { waves: 3, amp: 0.25 }, make: (w, h, p) => { const n = Math.max(1, +p.waves || 3), A = h * (+p.amp || 0.25), N = n * 8; const pts = []; for (let i = 0; i <= N; i++) pts.push([(w * i) / N, A + Math.sin((i / N) * n * Math.PI * 2) * A]); const top = smoothPath(pts, false, 1)[0].nodes; return [{ closed: true, nodes: [...top, P(w, h), P(0, h)] }]; } },
  gear: { params: { teeth: 10, depth: 0.16, hole: 0.3 }, make: (w, h, p) => { const n = Math.max(4, +p.teeth || 10), d = +p.depth || 0.16; const pts = []; for (let i = 0; i < n * 4; i++) { const a = (i / (n * 4)) * Math.PI * 2; const k = i % 4 < 2 ? 1 : 1 - d; pts.push([w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k]); } const out = poly(pts); const hr = +p.hole || 0; return hr ? [...out, ...translatePath(ellipseArc(w * hr, h * hr), (w - w * hr) / 2, (h - h * hr) / 2)] : out; } },
  spiral: { params: { turns: 3 }, make: (w, h, p) => { const T = +p.turns || 3, N = Math.round(T * 24), pts = []; for (let i = 0; i <= N; i++) { const t = i / N, a = t * T * Math.PI * 2, r = t; pts.push([w / 2 + Math.cos(a) * (w / 2) * r, h / 2 + Math.sin(a) * (h / 2) * r]); } return smoothPath(pts, false, 1); } },
  line: { params: {}, make: (w, h) => poly([[0, h / 2], [w, h / 2]], false) },
};
export const SHAPE_KINDS = Object.keys(SHAPES);

function parsePathScaled(d, w, h) { return scalePath(parsePath(d), w / 100, h / 92); }

export function shapePath(kind, w, h, params = {}) {
  const s = SHAPES[kind] || SHAPES.rect;
  const p = { ...s.params, ...params };
  return s.make(Math.max(1, w), Math.max(1, h), p);
}

// even-odd aware: subpaths inside others become holes (counter-forms)
export function isClosed(subs) { return subs.every((s) => s.closed); }
