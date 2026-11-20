// Public runtime API (exposed as window.MQ)
import { parse, serialize, serializeNode, clone, textOf, newId, bumpIds, ParseError, fmtAttr, TEXT_TAGS, patchSource, patchStyle } from './parse.js';
import { Project, DEVICES, parseAttrString, parseColor, withAlpha, splitTop, TYPESCALES, SPACING } from './project.js';
import * as Color from './color.js';
import * as Path from './pathkit.js';
import * as Vector from './vector.js';
import * as PathOps from './pathops.js';
import { makeCtx, renderScreen, renderStandalone, renderNode, BASE_CSS, fontsHref, layoutOf, cssFor, resolveAttrs, imageSrc, fillToCss } from './render.js';
import { Player, TRANSITIONS, parseTransition } from './proto.js';
import { playAnims, PRESETS, ENTRANCE, LOOPS, ACCENTS, MODIFIERS, EASINGS, parseSpec, totalDuration, springEasing, resolveEasing, shapeFrames, setTimeScale, getTimeScale, prefersReducedMotion } from './anim.js';
import { inspectScreen, lintScreen, lintProject, formatIssues, contrast, scoreIssues, applyFixes, fixSource, CATEGORIES } from './inspect.js';
import { genImage, SCENE_NAMES } from './gen.js';
import { ICONS } from './icons.js';
import { PACKS, registerPack, registerPacks, loadPack, ensureIconPacks, iconsUsed, getIcon, iconSvg, packIcons, packLoaded, setIconBase } from './iconpacks.js';
import { deviceFrame } from './chrome.js';
import { evaluate, interp, Scope } from './expr.js';
import { importShadcnTheme } from './themes.js';
import KIT from './kit.mq';

export const VERSION = '0.1.0';

export function loadProject(source, opts = {}) {
  return new Project(source, { kit: opts.kit === false ? '' : KIT, ...opts });
}

let cssInjected = false;
export function ensureStyles(doc = document) {
  if (cssInjected && doc === document) return;
  const st = doc.createElement('style'); st.id = 'mq-base'; st.textContent = BASE_CSS; doc.head.appendChild(st);
  if (doc === document) cssInjected = true;
}
const fontLinks = new Map();
// returns a promise resolved once the Google Fonts stylesheet is loaded (or failed)
export function ensureFonts(project, doc = document) {
  const href = fontsHref(project);
  if (fontLinks.has(href)) return fontLinks.get(href);
  const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = href;
  const pr = new Promise((res) => { l.onload = res; l.onerror = res; setTimeout(res, 4000); });
  fontLinks.set(href, pr);
  doc.head.appendChild(l);
  return pr;
}

// convenience: render screen by name into a new detached element
export function screenElement(project, name, opts = {}) {
  const s = typeof name === 'string' ? project.screen(name) : name;
  if (!s) throw new Error(`Écran introuvable: ${name}`);
  const ctx = makeCtx(project, opts);
  return renderScreen(s, ctx);
}

// Mount a playable prototype inside `stage` (any element with a size): device bezel centred and
// scaled to fit (transform does not change layout, so the bezel is positioned absolutely),
// bezel rebuilt when navigating to a screen of another device/size, refit on resize.
export function mountPrototype(project, stage, opts = {}) {
  ensureStyles(); ensureFonts(project);
  if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
  stage.style.overflow = 'hidden';
  const fit = document.createElement('div');
  fit.style.cssText = 'position:absolute;left:50%;top:50%;transform-origin:center center;transform:translate(-50%,-50%)';
  stage.appendChild(fit);
  const host = document.createElement('div');
  let frame = null, key = null;
  const pad = opts.pad ?? 24;
  const resize = () => {
    if (!frame) return;
    const r = stage.getBoundingClientRect(); const fw = frame.offsetWidth, fh = frame.offsetHeight;
    if (!fw || !fh || !r.width || !r.height) return;
    const p = r.width < 600 ? Math.min(pad, 12) : pad;
    const k = Math.min(opts.maxScale ?? 1, (r.width - p * 2) / fw, (r.height - p * 2) / fh);
    fit.style.transform = `translate(-50%, -50%) scale(${k})`;
  };
  const refit = (name) => {
    const s = project.screen(name); if (!s) return;
    const z = project.sizeOf(s); const k = `${s.attrs.device || ''}:${z.w}x${z.h}`;
    if (k !== key) { frame = opts.frame === false ? host : deviceFrame(z.device, host, z); if (opts.frame === false) { host.style.width = z.w + 'px'; host.style.height = z.h + 'px'; } fit.replaceChildren(frame); key = k; }
    resize();
  };
  const iconsReady = ensureIconPacks(project);
  const player = new Player(project, host, { ...opts, onEvent: (t, d) => { if (t === 'prenavigate' || t === 'navigate') refit(d.name); if (opts.onEvent) opts.onEvent(t, d); } });
  const onResize = () => resize();
  addEventListener('resize', onResize);
  const ro = window.ResizeObserver ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(stage);
  iconsReady.then(() => player.start(opts.start));
  if (document.fonts) document.fonts.ready.then(resize);
  return { player, resize, get frame() { return frame; }, destroy() { removeEventListener('resize', onResize); if (ro) ro.disconnect(); player.destroy(); fit.remove(); } };
}

// export rendered element tree as static HTML+inline CSS (handoff)
export function toStaticHTML(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('[data-id],[data-tag],[data-key],[data-hot],[data-proto],[data-comp]').forEach((n) => { for (const a of ['data-id', 'data-proto', 'data-hot']) n.removeAttribute(a); });
  return c.outerHTML;
}

export {
  parse, serialize, serializeNode, clone, textOf, newId, bumpIds, ParseError, fmtAttr, TEXT_TAGS,
  Path, Vector, PathOps,
  Project, DEVICES, parseAttrString, parseColor, withAlpha, splitTop, TYPESCALES, SPACING, Color,
  makeCtx, renderScreen, renderStandalone, renderNode, BASE_CSS, fontsHref, layoutOf, cssFor, resolveAttrs, imageSrc, fillToCss,
  Player, TRANSITIONS, parseTransition,
  playAnims, PRESETS, ENTRANCE, LOOPS, ACCENTS, MODIFIERS, EASINGS, parseSpec, totalDuration, springEasing, resolveEasing, shapeFrames, setTimeScale, getTimeScale, prefersReducedMotion,
  inspectScreen, lintScreen, lintProject, formatIssues, contrast, scoreIssues, applyFixes, fixSource, CATEGORIES, patchSource, patchStyle,
  importShadcnTheme,
  genImage, SCENE_NAMES, ICONS, deviceFrame, evaluate, interp, Scope, KIT,
  PACKS, registerPack, registerPacks, loadPack, ensureIconPacks, iconsUsed, getIcon, iconSvg, packIcons, packLoaded, setIconBase,
};
