// Icon packs: lucide is bundled; other packs (Material Symbols, Tabler, Phosphor, Heroicons, brands)
// are loaded on demand from icons/<pack>.json, or embedded as a subset of the icons a project uses.
import { ICONS } from './icons.js';

export const PACKS = {
  lucide: { label: 'Lucide', mode: 'stroke', vb: '0 0 24 24', count: 0 },
  material: { label: 'Material Symbols (Google)', mode: 'fill' },
  'material-rounded': { label: 'Material Symbols Rounded', mode: 'fill' },
  tabler: { label: 'Tabler', mode: 'stroke' },
  'tabler-filled': { label: 'Tabler Filled', mode: 'fill' },
  ph: { label: 'Phosphor', mode: 'fill' },
  'ph-bold': { label: 'Phosphor Bold', mode: 'fill' },
  'ph-fill': { label: 'Phosphor Fill', mode: 'fill' },
  'ph-duotone': { label: 'Phosphor Duotone', mode: 'fill' },
  hero: { label: 'Heroicons', mode: 'stroke' },
  'hero-solid': { label: 'Heroicons Solid', mode: 'fill' },
  'hero-mini': { label: 'Heroicons Mini', mode: 'fill' },
  brand: { label: 'Marques (Simple Icons)', mode: 'fill' },
};

const loaded = {}; // pack -> { vb, mode, icons: {name: body} }
const pending = {};
let base = 'icons/';
export function setIconBase(b) { base = b; }

export function registerPack(name, data) {
  if (!data || !data.icons) return;
  if (loaded[name]) Object.assign(loaded[name].icons, data.icons);
  else loaded[name] = { vb: data.vb, mode: data.mode, sw: data.sw, icons: { ...data.icons } };
}
export function registerPacks(obj) { for (const [k, v] of Object.entries(obj || {})) registerPack(k, v); }
export function packLoaded(name) { return name === 'lucide' || !!loaded[name]; }
export function packIcons(name) { return name === 'lucide' ? Object.keys(ICONS) : loaded[name] ? Object.keys(loaded[name].icons) : []; }

export function splitIconName(full) {
  const s = String(full || '');
  const i = s.indexOf(':');
  if (i > 0 && PACKS[s.slice(0, i)]) return [s.slice(0, i), s.slice(i + 1)];
  return ['lucide', s];
}

// -> { vb, mode, body, sw } | null
export function getIcon(full) {
  const [pack, name] = splitIconName(full);
  if (pack === 'lucide') return ICONS[name] ? { vb: '0 0 24 24', mode: 'stroke', body: ICONS[name] } : null;
  const p = loaded[pack];
  if (!p || p.icons[name] === undefined) return null;
  return { vb: p.vb, mode: p.mode, body: p.icons[name], sw: p.sw };
}

export function loadPack(name) {
  if (name === 'lucide' || loaded[name]) return Promise.resolve(true);
  if (pending[name]) return pending[name];
  if (typeof fetch === 'undefined') return Promise.resolve(false);
  pending[name] = fetch(base + name + '.json').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) registerPack(name, d); return !!d; }).catch(() => false);
  return pending[name];
}

// icon names referenced in a source: name=material:home, icon=ph:house, {'tabler:x'}…
export function iconsUsed(source) {
  const out = new Map();
  const re = /\b([a-z]+(?:-[a-z]+)?):([a-z0-9][a-z0-9-]*)/g; let m;
  while ((m = re.exec(source))) if (PACKS[m[1]] && m[1] !== 'lucide') { if (!out.has(m[1])) out.set(m[1], new Set()); out.get(m[1]).add(m[2]); }
  return out;
}

export async function ensureIconPacks(project) {
  const used = iconsUsed(project.source || '');
  const missing = [...used].filter(([pack, names]) => [...names].some((n) => !(loaded[pack] && loaded[pack].icons[n] !== undefined))).map(([p]) => p);
  return Promise.all(missing.map(loadPack));
}

export function iconSvg(full, { size = 20, sw, fill } = {}) {
  const ic = getIcon(full);
  if (!ic) return null;
  const strokeMode = ic.mode === 'stroke';
  const width = sw ?? ic.sw ?? (strokeMode ? 2 : undefined);
  const attrs = strokeMode
    ? `fill="${fill || 'none'}" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="currentColor"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${ic.vb}" ${attrs}>${ic.body}</svg>`;
}
