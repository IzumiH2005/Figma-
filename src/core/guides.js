// Layout guides (Figma, ex-"layout grids"): columns, rows and uniform grids on a frame.
//   guides="cols 12 margin=32 gutter=24 | rows 8 top height=48 gutter=16 offset=24 | grid 8"
// cols/rows: stretch (default: margin + gutter, size = auto) · left|center|right / top|center|bottom (fixed size= + gutter, offset)
// grid N: uniform square grid of N px. color= on any guide. Several guides combine with | or ;
// The legacy grid="12 40 20" (cols margin gutter) still works.
const num = (v, d) => { const n = parseFloat(v); return isNaN(n) ? d : n; };

export function autoGuides(w) {
  return w >= 1440 ? 'cols 12 margin=100 gutter=20' : w >= 1024 ? 'cols 12 margin=40 gutter=20' : w >= 700 ? 'cols 8 margin=32 gutter=16' : 'cols 4 margin=16 gutter=8';
}

export function parseGuides(spec, w, h) {
  const out = []; if (!spec || spec === 'none') return out;
  for (const part of String(spec).split(/[|;]/).map((s) => s.trim()).filter(Boolean)) {
    const toks = part.split(/\s+/); let kind = toks[0];
    if (/^\d/.test(kind)) { const [c, m, g] = toks.map(Number); out.push(...parseGuides(`cols ${c} margin=${m || 0} gutter=${g || 0}`, w, h)); continue; }
    const o = {}; const pos = [];
    for (const t of toks.slice(1)) { const m = /^([\w-]+)=(.+)$/.exec(t); if (m) o[m[1]] = m[2]; else pos.push(t); }
    if (kind === 'grid') { out.push({ kind: 'grid', size: num(pos[0], 8), color: o.color || 'rgba(255,40,90,.10)' }); continue; }
    const horiz = kind === 'cols' || kind === 'columns';
    const count = Math.max(1, Math.round(num(pos[0], horiz ? 12 : 4)));
    const align = pos[1] || o.align || 'stretch';
    const gutter = num(o.gutter, horiz ? 20 : 16), total = horiz ? w : h;
    let size, start;
    if (align === 'stretch') { const margin = num(o.margin, 0); size = (total - margin * 2 - gutter * (count - 1)) / count; start = margin; }
    else {
      size = num(o.size ?? o.width ?? o.height, 64); const span = size * count + gutter * (count - 1); const off = num(o.offset, 0);
      start = align === 'center' ? (total - span) / 2 + off : (align === 'right' || align === 'bottom') ? total - span - off : off;
    }
    const bands = []; for (let i = 0; i < count; i++) bands.push([start + i * (size + gutter), size]);
    out.push({ kind: horiz ? 'cols' : 'rows', bands, color: o.color || (horiz ? 'rgba(255,40,90,.12)' : 'rgba(40,120,255,.10)'), gutter, size });
  }
  return out;
}

// snapping candidates: every band edge (and centre) in frame coordinates
export function guideLines(guides) {
  const xs = [], ys = [];
  for (const g of guides) {
    if (g.kind === 'cols') for (const [a, s] of g.bands) xs.push(a, a + s);
    if (g.kind === 'rows') for (const [a, s] of g.bands) ys.push(a, a + s);
  }
  return { xs, ys };
}

// DOM overlay (editor + CLI --guides)
export function guidesOverlay(guides, doc = document) {
  const root = doc.createElement('div'); root.className = 'mq-guides';
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:8000';
  for (const g of guides) {
    if (g.kind === 'grid') { const d = doc.createElement('div'); d.style.cssText = `position:absolute;inset:0;background-image:linear-gradient(${g.color} 1px, transparent 1px),linear-gradient(90deg, ${g.color} 1px, transparent 1px);background-size:${g.size}px ${g.size}px`; root.appendChild(d); continue; }
    for (const [a, s] of g.bands) {
      const d = doc.createElement('div');
      d.style.cssText = g.kind === 'cols' ? `position:absolute;top:0;bottom:0;left:${a}px;width:${s}px;background:${g.color}` : `position:absolute;left:0;right:0;top:${a}px;height:${s}px;background:${g.color}`;
      root.appendChild(d);
    }
  }
  return root;
}
