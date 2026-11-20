// Shader fills (Figma Config 2026 "shader fills"): shader="caustics scale=240 speed=0.4 colors=#063a5c,#bff4ff"
// One WebGL2 context is shared by every layer; each layer gets a 2D <canvas> behind its children
// that receives a copy of the frame. `phase=` freezes time, `speed=` animates (one global rAF loop).
import { parseColor } from './color.js';

const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };

const HEAD = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T, SEED, SC, DPR; uniform float P[8]; uniform vec3 C[16]; uniform int NC;
out vec4 o;
vec2 pix(){ return vec2(gl_FragCoord.x, R.y - gl_FragCoord.y) / DPR; }
vec2 uv(){ return pix() / SC; }
vec2 nuv(){ return vec2(gl_FragCoord.x, R.y - gl_FragCoord.y) / R; }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21) + SEED * 0.1373); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p + n + 17.0)); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f); return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
vec2 gr(vec2 i){ float a = h21(i) * 6.2831853; return vec2(cos(a), sin(a)); }
float pnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  float a = dot(gr(i), f), b = dot(gr(i+vec2(1,0)), f-vec2(1,0)), c = dot(gr(i+vec2(0,1)), f-vec2(0,1)), d = dot(gr(i+vec2(1,1)), f-vec2(1,1));
  return 0.5 + 0.75 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
float voro(vec2 p){ vec2 i = floor(p), f = fract(p); float m = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y); vec2 r = g + 0.5 + 0.42 * sin(T + 6.2831 * h22(i + g)) - f; m = min(m, dot(r, r)); }
  return sqrt(m); }
float fbm(vec2 p, int oct){ float s = 0., a = .5, n = 0.; for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * pnoise(p); n += a; p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.1, 9.3); a *= .5; } return s / n; }
float fbmv(vec2 p, int oct){ float s = 0., a = .5, n = 0.; for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * vnoise(p); n += a; p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.1, 9.3); a *= .5; } return s / n; }
vec3 ramp(float t){ t = clamp(t, 0., 1.); float x = t * float(NC - 1); int i = int(min(floor(x), float(NC - 2))); return mix(C[i], C[i + 1], x - float(i)); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;

// name → { glsl main body, params: [name, default, enum?], colors, scale }
const SH = {
  clouds: { p: [['coverage', 0.5], ['softness', 0.3], ['layers', 5], ['drift', 1]], colors: '#4f8fd8,#ffffff,#b8c8e0', scale: 260,
    main: `vec2 p = uv() + vec2(T * 0.06 * P[3], T * 0.015 * P[3]); float n = fbm(p, int(P[2]));
      float c = smoothstep(1. - P[0] - P[1] * .5, 1. - P[0] + P[1] * .5, n);
      vec3 sky = mix(C[0], C[0] * 0.75 + 0.25, nuv().y * 0.6);
      vec3 col = mix(sky, C[1], c);
      if (NC > 2) col = mix(col, C[2], c * smoothstep(0.35, 0.8, fbm(p * 1.9 + 3.1, 3)) * 0.7);
      o = vec4(col, 1.);` },
  noise: { p: [['type', 1, ['value', 'perlin', 'voronoi']], ['layers', 4], ['contrast', 1.3], ['warp', 0]], colors: '#0b0b14,#5b5bd6,#f3a6ff', scale: 160,
    main: `vec2 p = uv() + vec2(T * 0.05); int oc = int(P[1]);
      if (P[3] > 0.) p += P[3] * vec2(fbm(p + 1.7, 3) - .5, fbm(p + 9.2, 3) - .5) * 2.;
      float n;
      if (P[0] < 0.5) n = fbmv(p, oc);
      else if (P[0] < 1.5) n = fbm(p, oc);
      else { float s = 0., a = .5, q = 0.; vec2 pp = p; for (int i = 0; i < 6; i++) { if (i >= oc) break; s += a * voro(pp); q += a; pp *= 2.1; a *= .5; } n = s / q; }
      n = (n - .5) * P[2] + .5; o = vec4(ramp(n), 1.);` },
  wave: { p: [['amplitude', 0.16], ['frequency', 1.3], ['thickness', 1.6], ['glow', 1], ['lines', 3]], colors: '#06060b,#7c5cff,#22d3ee,#f472b6', scale: 100,
    main: `vec2 q = nuv(); vec3 col = C[0]; float H = R.y / DPR; int L = int(P[4]);
      for (int k = 0; k < 8; k++) { if (k >= L) break; float fk = float(k);
        float y = 0.5 + P[0] * (1. - 0.18 * fk) * sin(q.x * P[1] * 6.2831 + T * (1. + fk * .17) + fk * 0.9) * (0.75 + 0.25 * sin(q.x * 3.1 + T * 0.5 + fk));
        float d = abs(q.y - y) * H; float g = P[2] / max(d, 0.35); g = g * g * 0.35 + exp(-d / (14. * P[3])) * 0.35 * P[3];
        int ci = NC > 1 ? 1 + k - (k / (NC - 1)) * (NC - 1) : 0; col += C[ci] * min(g, 2.0); }
      o = vec4(1. - exp(-col * 1.2), 1.);` },
  caustics: { p: [['intensity', 1], ['depth', 0.5]], colors: '#063a5c,#c8f6ff', scale: 260,
    main: `vec2 p = uv() * 6.2831 - 250.; vec2 i = p; float c = 1.; float inten = .005;
      for (int n = 0; n < 5; n++) { float t = T * (1. - (3.5 / float(n + 1))); i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x)); c += 1. / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten))); }
      c /= 5.; c = 1.17 - pow(c, 1.4); float v = clamp(pow(abs(c), 8.) * P[0], 0., 1.);
      vec3 deep = mix(C[0], C[0] * (1. - P[1] * 0.6), nuv().y);
      o = vec4(mix(deep, NC > 2 ? mix(C[1], C[2], nuv().x) : C[1], v), 1.);` },
  nebula: { p: [['travel', 1], ['stars', 0.6], ['density', 1]], colors: '#05030f,#5b1d99,#ff5f8f,#ffd36e', scale: 320,
    main: `vec2 p = uv(); float tt = T * 0.05 * P[0];
      vec2 q = vec2(fbm(p + tt, 5), fbm(p + vec2(5.2, 1.3) - tt, 5));
      vec2 r = vec2(fbm(p + 4. * q + vec2(1.7, 9.2) + tt * 2., 5), fbm(p + 4. * q + vec2(8.3, 2.8), 5));
      float f = fbm(p + 4. * r, 5); f = pow(f, 1.6 - 0.5 * P[2]);
      vec3 col = mix(C[0], C[1], clamp(f * f * 2.2, 0., 1.));
      if (NC > 2) col = mix(col, C[2], clamp(length(q) * 1.2 - .55, 0., 1.) * f);
      if (NC > 3) col = mix(col, C[3], clamp(pow(r.x, 3.) * 2.4, 0., 1.) * f);
      col *= (f * f * f + .6 * f * f + .5 * f) * 1.9;
      vec2 sp = pix() / 2.; vec2 cell = floor(sp); float s = h21(cell); float tw = 0.6 + 0.4 * sin(T * 2. + s * 40.);
      col += step(1. - 0.004 * P[1], s) * tw * smoothstep(0.7, 0., length(fract(sp) - .5) * 2.);
      o = vec4(col, 1.);` },
  moire: { p: [['mode', 0, ['rings', 'lines']], ['offset', 0.08], ['sharpness', 0.2], ['angle', 3]], colors: '#0a0a0a,#f2f2f2', scale: 7,
    main: `vec2 px = pix(); vec2 Rr = R / DPR; float m;
      if (P[0] < 0.5) { vec2 c1 = Rr * vec2(.5 - P[1] * (1. + .3 * sin(T)), .5), c2 = Rr * vec2(.5 + P[1], .5 + P[1] * .4 * cos(T * .7));
        m = sin(length(px - c1) / SC * 3.1416) * sin(length(px - c2) / SC * 3.1416); }
      else { vec2 a = rot(radians(P[3] + T * 2.)) * (px - Rr * .5); m = sin(px.x / SC * 3.1416) * sin(a.x / SC * 3.1416); }
      float v = smoothstep(-P[2], P[2], m); o = vec4(mix(C[0], C[1], v), 1.);` },
  concentric: { p: [['cx', 0.5], ['cy', 0.5], ['period', 36], ['steps', 0], ['twist', 0]], colors: '#120f2b,#4e2bd6,#ff7ab6,#ffd8a8', scale: 1,
    main: `vec2 Rr = R / DPR; vec2 d = pix() - Rr * vec2(P[0], P[1]); float a = atan(d.y, d.x);
      float r = length(d) + a * P[4] * P[2] / 6.2831; float t = fract(r / max(P[2], 1.) - T * 0.12);
      if (P[3] > 0.5) t = floor(t * P[3]) / (P[3] - 1.);
      o = vec4(ramp(1. - abs(t * 2. - 1.)), 1.);` },
  grid: { p: [['shape', 1, ['diamond', 'circle', 'box', 'triangle', 'hex', 'cross', 'ring']], ['layout', 0, ['grid', 'brick', 'hex']], ['size', 0.6], ['rotate', 0], ['wave', 0], ['gradient', 0]], colors: '#101014,#f2f2f2', scale: 24,
    main: `vec2 p = uv(); if (P[1] > 1.5) p.y /= 0.866; if (P[1] > 0.5 && mod(floor(p.y), 2.) > 0.5) p.x += .5;
      vec2 cell = floor(p); vec2 f = rot(radians(P[3])) * (fract(p) - .5); if (P[1] > 1.5) f.y *= 0.866;
      float s = P[2] * 0.5; vec2 Rr = R / DPR;
      if (P[4] > 0.) s *= 1. + P[4] * 0.5 * sin(T * 2. + cell.x * 0.55 + cell.y * 0.35);
      if (P[5] != 0.) s *= mix(1., clamp(nuv().x, 0., 1.) * 1.4, abs(P[5])) ;
      float d; int sh = int(P[0] + .5);
      if (sh == 0) d = (abs(f.x) + abs(f.y)) - s * 1.25;
      else if (sh == 1) d = length(f) - s;
      else if (sh == 2) d = max(abs(f.x), abs(f.y)) - s;
      else if (sh == 3) { vec2 q = f; q.y += s * .25; d = max(abs(q.x) * 0.866 + q.y * 0.5, -q.y) - s * 0.5; }
      else if (sh == 4) { vec2 q = abs(f); d = max(q.x * 0.866 + q.y * 0.5, q.y) - s; }
      else if (sh == 5) { vec2 q = abs(f); d = min(max(q.x - s, q.y - s * .3), max(q.x - s * .3, q.y - s)); }
      else d = abs(length(f) - s * .75) - s * .25;
      float aa = fwidth(d); float v = 1. - smoothstep(-aa, aa, d);
      vec3 fg = NC > 2 ? C[1 + int(mod(cell.x + cell.y * 2., float(NC - 1)))] : C[1];
      o = vec4(mix(C[0], fg, v), 1.);` },
  mesh: { p: [['warp', 0.18], ['cols', 0], ['grain', 0]], colors: '#ff9a9e,#fad0c4,#a1c4fd,#c2e9fb', scale: 200,
    main: `vec2 q = nuv(); q += P[0] * vec2(fbm(q * 2.2 + T * .08, 3) - .5, fbm(q * 2.2 + 7. - T * .08, 3) - .5);
      float gx = P[1] > 1.5 ? P[1] : max(2., floor(sqrt(float(NC)) + .5)); float gy = max(2., ceil(float(NC) / gx));
      vec2 g = clamp(q, 0., 1.) * vec2(gx - 1., gy - 1.); vec2 i = min(floor(g), vec2(gx - 2., gy - 2.)); vec2 f = g - i; f = f * f * (3. - 2. * f);
      int i00 = int(i.y * gx + i.x); int n1 = NC - 1;
      vec3 a = C[min(i00, n1)], b = C[min(i00 + 1, n1)], c = C[min(i00 + int(gx), n1)], d = C[min(i00 + int(gx) + 1, n1)];
      vec3 col = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      col += (h21(gl_FragCoord.xy + T) - .5) * P[2] * 0.2;
      o = vec4(col, 1.);` },
};
// aliases
const ALIAS = { 'fractal-noise': 'noise', perlin: 'noise', voronoi: 'noise', 'glowing-wave': 'wave', glow: 'wave', water: 'caustics', 'water-caustics': 'caustics', space: 'nebula', 'pattern-grid': 'grid', pattern: 'grid', rings: 'concentric', 'mesh-gradient': 'mesh' };
export const SHADER_NAMES = Object.keys(SH);
export const SHADER_DOC = Object.fromEntries(Object.entries(SH).map(([k, v]) => [k, v.p.map(([n, d, e]) => (e ? `${n}=${e.join('|')}` : `${n}=${d}`)).join(' ') + ` colors=${v.colors} scale=${v.scale} speed phase seed`]));
export const shaderDefaults = (name) => { const s = SH[ALIAS[name] || name]; return s ? { params: s.p.map(([n, d, e]) => ({ name: n, def: e ? e[d] : d, options: e || null })), colors: s.colors, scale: s.scale } : null; };

export function parseShader(spec) {
  const toks = String(spec || '').trim().match(/[\w.-]+=(?:"[^"]*"|'[^']*'|\S+)|\S+/g) || [];
  const raw = (toks[0] || 'mesh').toLowerCase(); const type = ALIAS[raw] || raw; const o = {}; const pos = [];
  for (const t of toks.slice(1)) { const m = /^([\w.-]+)=(.*)$/.exec(t); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); else pos.push(t); }
  if (raw === 'voronoi' && o.type === undefined) o.type = 'voronoi';
  if (raw === 'perlin' && o.type === undefined) o.type = 'perlin';
  return { type, raw, o, pos };
}

// ------------------------------------------------------------------ WebGL plumbing
let GL = null, glc = null, progs = {}, vbo = null, failed = false;
function gl() {
  if (GL || failed) return GL;
  try {
    glc = document.createElement('canvas'); glc.width = glc.height = 2;
    GL = glc.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!GL) { failed = true; return null; }
    vbo = GL.createBuffer(); GL.bindBuffer(GL.ARRAY_BUFFER, vbo); GL.bufferData(GL.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), GL.STATIC_DRAW);
  } catch (e) { failed = true; GL = null; }
  return GL;
}
function program(type) {
  if (progs[type] !== undefined) return progs[type];
  const g = gl(); if (!g) return null;
  const mk = (t, src) => { const s = g.createShader(t); g.shaderSource(s, src); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)) { console.warn('shader', type, g.getShaderInfoLog(s)); return null; } return s; };
  const vs = mk(g.VERTEX_SHADER, '#version 300 es\nin vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }');
  const fs = mk(g.FRAGMENT_SHADER, HEAD + 'void main(){\n' + SH[type].main + '\n}');
  if (!vs || !fs) return (progs[type] = null);
  const p = g.createProgram(); g.attachShader(p, vs); g.attachShader(p, fs); g.bindAttribLocation(p, 0, 'a'); g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS)) return (progs[type] = null);
  const U = {}; for (const n of ['R', 'T', 'SEED', 'SC', 'DPR', 'P', 'C', 'NC']) U[n] = g.getUniformLocation(p, n === 'P' || n === 'C' ? n + '[0]' : n);
  return (progs[type] = { p, U });
}
const rgb = (c) => { const p = parseColor(String(c).trim()) || [128, 128, 128]; return [p[0] / 255, p[1] / 255, p[2] / 255]; };

function resolve(spec) {
  const { type, o, pos } = parseShader(spec); const def = SH[type]; if (!def) return null;
  const P = new Float32Array(8);
  def.p.forEach(([n, d, e], i) => { let v = o[n] ?? (i === 0 && pos[0] !== undefined ? pos[0] : undefined); if (e) { const k = e.indexOf(String(v)); P[i] = k >= 0 ? k : num(v, d); } else P[i] = num(v, d); });
  const cols = String(o.colors || def.colors).split(/[,\s]+/).filter(Boolean).slice(0, 16).map(rgb); while (cols.length < 2) cols.push(cols[0] || [0, 0, 0]);
  const C = new Float32Array(48); cols.forEach((c, i) => C.set(c, i * 3));
  return { type, P, C, NC: cols.length, cols, scale: num(o.scale, def.scale), speed: num(o.speed, 0), phase: num(o.phase, 0), seed: num(o.seed, 1), opacity: num(o.opacity, 1), blend: o.blend };
}

function draw(entry, t) {
  const { cv, r } = entry; const w = cv.width, h = cv.height; if (!w || !h) return;
  const pr = program(r.type); const g = gl(); const c2 = cv.getContext('2d');
  if (!pr || !g) { // fallback: plain gradient of the colours
    const gr = c2.createLinearGradient(0, 0, w, h); r.cols.forEach((c, i) => gr.addColorStop(i / Math.max(1, r.cols.length - 1), `rgb(${c.map((x) => Math.round(x * 255)).join(',')})`)); c2.fillStyle = gr; c2.fillRect(0, 0, w, h); return;
  }
  if (glc.width < w || glc.height < h) { glc.width = Math.max(glc.width, w); glc.height = Math.max(glc.height, h); }
  g.viewport(0, 0, w, h); g.useProgram(pr.p);
  g.bindBuffer(g.ARRAY_BUFFER, vbo); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
  const U = pr.U; g.uniform2f(U.R, w, h); g.uniform1f(U.T, t); g.uniform1f(U.SEED, r.seed); g.uniform1f(U.SC, Math.max(1, r.scale)); g.uniform1f(U.DPR, entry.dpr);
  g.uniform1fv(U.P, r.P); g.uniform3fv(U.C, r.C); g.uniform1i(U.NC, r.NC);
  g.drawArrays(g.TRIANGLES, 0, 3);
  c2.clearRect(0, 0, w, h); c2.drawImage(glc, 0, glc.height - h, w, h, 0, 0, w, h);
}

const live = new Set(); let raf = 0; const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
function loop() {
  raf = 0; const now = (performance.now() - t0) / 1000;
  for (const e of live) {
    if (!e.cv.isConnected) { if (++e.miss > 120) live.delete(e); continue; }
    e.miss = 0; if (e.r.speed) draw(e, e.r.phase + now * e.r.speed);
  }
  if ([...live].some((e) => e.r.speed)) raf = requestAnimationFrame(loop);
}

function fit(e) {
  const el = e.cv.parentElement; if (!el) return false;
  const W = el.clientWidth || el.offsetWidth, H = el.clientHeight || el.offsetHeight; if (!W || !H) return false;
  const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
  const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
  if (e.cv.width !== w || e.cv.height !== h) { e.cv.width = w; e.cv.height = h; }
  e.dpr = dpr; draw(e, e.r.phase + (e.r.speed ? (performance.now() - t0) / 1000 * e.r.speed : 0)); return true;
}

export function applyShader(el, spec, ctx) {
  if (typeof document === 'undefined') return;
  const r = resolve(spec); if (!r) { ctx && ctx.errors && ctx.errors.push?.({ msg: `shader inconnu : ${String(spec).split(/\s/)[0]}` }); return; }
  const cv = document.createElement('canvas'); cv.className = 'mq-shader';
  cv.style.cssText = `position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;pointer-events:none;z-index:-1;display:block${r.opacity < 1 ? `;opacity:${r.opacity}` : ''}${r.blend ? `;mix-blend-mode:${r.blend}` : ''}`;
  if (!el.style.position) el.style.position = 'relative';
  el.style.isolation = 'isolate';
  // a vector (path / boolean / metaball): the shader follows the outline
  const vf = el.querySelector(':scope > .mq-vec-fill');
  if (vf) for (const k of ['webkitMaskImage', 'maskImage', 'webkitMaskSize', 'maskSize', 'webkitMaskRepeat', 'maskRepeat', 'inset', 'left', 'top', 'width', 'height']) if (vf.style[k]) cv.style[k] = vf.style[k];
  el.insertBefore(cv, el.firstChild);
  const e = { cv, r, dpr: 1, miss: 0 };
  live.add(e);
  const tryFit = (k) => { if (fit(e)) return; if (k < 60) requestAnimationFrame(() => tryFit(k + 1)); };
  requestAnimationFrame(() => tryFit(0));
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(() => { if (!cv.isConnected) { ro.disconnect(); return; } fit(e); }); ro.observe(el); }
  if (r.speed && !raf) raf = requestAnimationFrame(loop);
}

// on-canvas handles for shader parameters that live in the layer plane
export function shaderHandles(spec, w, h) {
  const s = parseShader(spec); const out = [];
  const ser = (o) => [s.raw, ...s.pos, ...Object.entries(o).map(([k, v]) => `${k}=${v}`)].join(' ');
  if (s.type === 'concentric') { const cx = num(s.o.cx, 0.5), cy = num(s.o.cy, 0.5); out.push({ param: 'shader', name: 'shader.center', x: cx * w, y: cy * h, guide: { cx: cx * w, cy: cy * h, r: Math.min(w, h) * 0.18 }, map: (lx, ly) => ser({ ...s.o, cx: +(Math.max(0, Math.min(1, lx / w))).toFixed(3), cy: +(Math.max(0, Math.min(1, ly / h))).toFixed(3) }) }); }
  if (s.type === 'moire') { const off = num(s.o.offset, 0.08); out.push({ param: 'shader', name: 'shader.offset', x: (0.5 + off) * w, y: h / 2, map: (lx) => ser({ ...s.o, offset: +Math.max(0, lx / w - 0.5).toFixed(3) }) }); }
  if (s.type === 'grid' || s.type === 'moire' || s.type === 'caustics' || s.type === 'clouds' || s.type === 'noise' || s.type === 'nebula') {
    const sc = num(s.o.scale, SH[s.type].scale); out.push({ param: 'shader', name: 'shader.scale', x: Math.min(w - 10, 10 + sc), y: h - 10, map: (lx) => ser({ ...s.o, scale: Math.max(2, Math.round(lx - 10)) }) });
  }
  if (s.type === 'wave') { const a = num(s.o.amplitude, 0.16); out.push({ param: 'shader', name: 'shader.amplitude', x: w * 0.25, y: h * (0.5 - a), map: (lx, ly) => ser({ ...s.o, amplitude: +Math.max(0, Math.min(0.5, 0.5 - ly / h)).toFixed(3) }) }); }
  return out;
}
