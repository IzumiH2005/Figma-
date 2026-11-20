// Syntax highlighting + full-document code drawer (bidirectional with the canvas)
import { MQ, h, icon, debounce, toast } from './dom.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(src) {
  let out = '';
  const re = /(<!--[\s\S]*?-->)|(\/\/[^\n]*)|(<\/?)([A-Za-z][\w.\-]*)|(\/?>)|("[^"]*"|'[^']*')|(\{[^{}\n]*\})|([A-Za-z_@$:.\-][\w:.\-@$]*)(=)|(\$[\w.\-]+)|(#[0-9a-fA-F]{3,8}\b)|(\b\d+(\.\d+)?\b)/g;
  let last = 0, m, inTag = false;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    last = re.lastIndex;
    if (m[1] || (m[2] && /(^|\s)$/.test(src[m.index - 1] || ' ') && !inTag)) { out += `<span class="hl-c">${esc(m[0])}</span>`; continue; }
    if (m[2]) { out += esc(m[0]); continue; }
    if (m[3]) { inTag = true; const comp = /^(\w+\.)?[A-Z]/.test(m[4]); out += `<span class="hl-p">${esc(m[3])}</span><span class="${comp ? 'hl-comp' : 'hl-t'}">${esc(m[4])}</span>`; continue; }
    if (m[5]) { inTag = false; out += `<span class="hl-p">${esc(m[5])}</span>`; continue; }
    if (m[6]) { out += `<span class="hl-s">${esc(m[6])}</span>`; continue; }
    if (m[7]) { out += `<span class="hl-e">${esc(m[7])}</span>`; continue; }
    if (m[8]) { const ev = /^(on:|@)/.test(m[8]); const st = /^(hover|press|focus|active|dark|light|sm|md|lg|xl):/.test(m[8]); out += `<span class="${ev ? 'hl-ev' : st ? 'hl-st' : 'hl-a'}">${esc(m[8])}</span><span class="hl-p">=</span>`; continue; }
    if (m[10]) { out += `<span class="hl-tok">${esc(m[10])}</span>`; continue; }
    if (m[11]) { out += `<span class="hl-col" style="--c:${m[11]}">${esc(m[11])}</span>`; continue; }
    if (m[12]) { out += `<span class="hl-n">${esc(m[12])}</span>`; continue; }
    out += esc(m[0]);
  }
  return out + esc(src.slice(last));
}

export class CodeDrawer {
  constructor(app, root) {
    this.app = app; this.root = root; this.open = false;
    this.ta = h('textarea.codearea', { spellcheck: 'false' });
    this.pre = h('pre.codehl');
    this.gutter = h('div.gutter');
    this.status = h('div.cstatus');
    const head = h('div.chead', null, icon('code-xml', 14), h('b', null, 'Source .mq'), h('span.muted', null, '— édition en direct, synchronisée avec le canvas'), h('span.grow'),
      this.status,
      h('button.btn', { onclick: () => this.format() }, icon('wand-sparkles', 13), 'Formater'),
      h('button.btn', { onclick: () => { navigator.clipboard && navigator.clipboard.writeText(this.ta.value); toast('Source copiée'); } }, icon('copy', 13), 'Copier'),
      h('button.mini', { onclick: () => this.toggle(false) }, icon('x', 14)));
    this.root.append(head, h('div.codewrap.full', null, this.gutter, h('div.codeinner', null, this.pre, this.ta)));
    const apply = debounce(() => this.apply(), 450);
    this.ta.addEventListener('input', () => { this.sync(); apply(); });
    this.ta.addEventListener('scroll', () => { this.pre.scrollTop = this.ta.scrollTop; this.pre.scrollLeft = this.ta.scrollLeft; this.gutter.scrollTop = this.ta.scrollTop; });
    this.ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
      if (e.key === 'Escape') this.toggle(false);
    });
    this.ta.addEventListener('click', () => this.revealSelection());
  }
  toggle(v = !this.open) { this.open = v; this.root.classList.toggle('open', v); document.body.classList.toggle('code-open', v); if (v) this.refresh(true); }
  refresh(force) {
    if (!this.open) return;
    if (!force && document.activeElement === this.ta) return;
    const src = this.app.source;
    if (this.ta.value !== src) { const st = this.ta.scrollTop; this.ta.value = src; this.ta.scrollTop = st; }
    this.sync(); this.setStatus();
    this.scrollToSelection();
  }
  sync() {
    this.pre.innerHTML = highlight(this.ta.value) + '\n';
    const n = this.ta.value.split('\n').length;
    if (this.gutter.childElementCount !== n) this.gutter.innerHTML = Array.from({ length: n }, (_, i) => `<div>${i + 1}</div>`).join('');
    this.markError();
  }
  apply() {
    const ok = this.app.setSource(this.ta.value);
    this.setStatus();
  }
  setStatus() {
    const e = this.app.error;
    this.status.className = 'cstatus ' + (e ? 'bad' : 'ok');
    this.status.textContent = e ? '✖ ' + e.message : '✓ synchronisé';
    this.markError();
  }
  markError() {
    [...this.gutter.children].forEach((d) => d.classList.remove('errline'));
    const e = this.app.error; if (e && e.line && this.gutter.children[e.line - 1]) this.gutter.children[e.line - 1].classList.add('errline');
  }
  format() { try { this.ta.value = MQ.serialize(MQ.parse(this.ta.value)) + '\n'; this.sync(); this.apply(); } catch (e) { toast(e.message, 'error'); } }
  scrollToSelection() {
    const n = this.app.selNodes[0]; if (!n || !n.line) return;
    if (document.activeElement === this.ta) return;
    // after serialization line numbers change: find by re-parsing positions
    const idx = this.lineOf(n.id);
    if (idx >= 0) { const lh = 19; this.ta.scrollTop = Math.max(0, idx * lh - this.ta.clientHeight / 3); this.highlightLine(idx); }
  }
  lineOf(id) {
    try { const nodes = MQ.parse(this.ta.value); const path = this.app.indexPath(id); let list = nodes, n = null; for (const i of path) { n = list[i]; if (!n) return -1; list = n.children || []; } return n ? n.line - 1 : -1; } catch (e) { return -1; }
  }
  highlightLine(i) { [...this.gutter.children].forEach((d, k) => d.classList.toggle('cur', k === i)); }
  revealSelection() {
    const pos = this.ta.selectionStart; const line = this.ta.value.slice(0, pos).split('\n').length;
    try {
      const nodes = MQ.parse(this.ta.value); let best = null; let bestPath = null;
      const walk = (list, path) => list.forEach((n, i) => { if (n.tag === '#text') return; if (n.line <= line) { best = n; bestPath = [...path, i]; } walk(n.children || [], [...path, i]); });
      walk(nodes, []);
      if (bestPath) { const target = this.app.byIndexPath(bestPath); if (target && !['project', 'page', 'tokens', 'vars', 'styles'].includes(target.tag)) this.app.select(target.id); }
    } catch (e) { /* parse error: ignore */ }
  }
}
