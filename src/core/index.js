// Public runtime API (exposed as window.MQ)
import { parse, serialize, serializeNode, clone, textOf, newId, bumpIds, ParseError, fmtAttr, TEXT_TAGS } from './parse.js';
import { Project, DEVICES, parseAttrString, parseColor, withAlpha, splitTop } from './project.js';
import { makeCtx, renderScreen, renderStandalone, renderNode, BASE_CSS, fontsHref, layoutOf, cssFor, resolveAttrs, imageSrc } from './render.js';
import { Player, TRANSITIONS, parseTransition } from './proto.js';
import { playAnims, PRESETS, ENTRANCE, LOOPS, EASINGS, parseSpec, totalDuration, springEasing } from './anim.js';
import { inspectScreen, lintScreen, lintProject, formatIssues, contrast } from './inspect.js';
import { genImage, SCENE_NAMES } from './gen.js';
import { ICONS } from './icons.js';
import { deviceFrame } from './chrome.js';
import { evaluate, interp, Scope } from './expr.js';
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
const fontLinks = new Set();
export function ensureFonts(project, doc = document) {
  const href = fontsHref(project);
  if (fontLinks.has(href)) return;
  fontLinks.add(href);
  const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = href; doc.head.appendChild(l);
}

// convenience: render screen by name into a new detached element
export function screenElement(project, name, opts = {}) {
  const s = typeof name === 'string' ? project.screen(name) : name;
  if (!s) throw new Error(`Écran introuvable: ${name}`);
  const ctx = makeCtx(project, opts);
  return renderScreen(s, ctx);
}

// export rendered element tree as static HTML+inline CSS (handoff)
export function toStaticHTML(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('[data-id],[data-tag],[data-key],[data-hot],[data-proto],[data-comp]').forEach((n) => { for (const a of ['data-id', 'data-proto', 'data-hot']) n.removeAttribute(a); });
  return c.outerHTML;
}

export {
  parse, serialize, serializeNode, clone, textOf, newId, bumpIds, ParseError, fmtAttr, TEXT_TAGS,
  Project, DEVICES, parseAttrString, parseColor, withAlpha, splitTop,
  makeCtx, renderScreen, renderStandalone, renderNode, BASE_CSS, fontsHref, layoutOf, cssFor, resolveAttrs, imageSrc,
  Player, TRANSITIONS, parseTransition,
  playAnims, PRESETS, ENTRANCE, LOOPS, EASINGS, parseSpec, totalDuration, springEasing,
  inspectScreen, lintScreen, lintProject, formatIssues, contrast,
  genImage, SCENE_NAMES, ICONS, deviceFrame, evaluate, interp, Scope, KIT,
};
