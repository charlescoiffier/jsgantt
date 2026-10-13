import { GanttModel } from './model.js';
import { Timescale, SCALES } from './timescale.js';
import { computeLayout, renderSVG, readMetrics } from './renderer.js';
import { attachInteractions } from './interactions.js';
import { buildStandaloneSVG, serializeSVG, downloadBlob, exportPDFBlob } from './export.js';

let uidCounter = 0;

function todayDay() {
  const n = new Date();
  return Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000);
}

export class Gantt {
  #listeners = new Map();

  constructor(el, options = {}) {
    const scale = options.scale ?? 'week';
    if (!SCALES.includes(scale)) throw new Error(`Échelle inconnue : "${scale}"`);
    this.root = el;
    this.root.classList.add('gantt-root');
    this.scroller = document.createElement('div');
    this.scroller.className = 'gantt-scroll';
    this.scroller.tabIndex = 0;
    this.root.replaceChildren(this.scroller);
    this.uid = `gantt${++uidCounter}`;
    this.readonly = options.readonly === true;
    this.scale = scale;
    this.pdfLibs = options.pdfLibs ?? {};
    this.model = new GanttModel({ tasks: options.tasks, links: options.links });
    this.state = { selectedId: null, selectedLinkId: null };
    this.scroller.addEventListener('scroll', () => this.applySticky(), { passive: true });
    this.refresh();
    this.detach = attachInteractions(this);
    this.onBeforePrint = () => {
      for (const g of this.svg.querySelectorAll('[data-sticky]')) g.removeAttribute('transform');
    };
    this.onAfterPrint = () => this.applySticky();
    window.addEventListener('beforeprint', this.onBeforePrint);
    window.addEventListener('afterprint', this.onAfterPrint);
  }

  destroy() {
    this.detach();
    window.removeEventListener('beforeprint', this.onBeforePrint);
    window.removeEventListener('afterprint', this.onAfterPrint);
    this.root.replaceChildren();
  }

  on(name, fn) {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name).add(fn);
    return () => this.#listeners.get(name).delete(fn);
  }

  emit(name, detail = {}) {
    for (const fn of this.#listeners.get(name) ?? []) fn(detail);
  }

  #buildTimescale() {
    let min = Infinity;
    let max = -Infinity;
    for (const t of this.model.tasks) {
      if (t.start < min) min = t.start;
      if (t.end > max) max = t.end;
    }
    if (min === Infinity) min = max = todayDay();
    const originDay = min - 7;
    const endDay = Math.max(max + 14, originDay + 30);
    return new Timescale({ scale: this.scale, colWidths: this.metrics.colWidths, originDay, endDay });
  }

  refresh() {
    this.metrics = readMetrics(this.root);
    this.timescale = this.#buildTimescale();
    this.render();
  }

  render({ model = this.model, dragId = null } = {}) {
    this.layout = computeLayout(model, this.timescale, this.metrics, { ...this.state, today: todayDay() });
    const svg = renderSVG(this.layout, { uid: this.uid, readonly: this.readonly, dragId });
    const { scrollLeft, scrollTop } = this.scroller;
    this.scroller.replaceChildren(svg);
    this.scroller.scrollLeft = scrollLeft;
    this.scroller.scrollTop = scrollTop;
    this.svg = svg;
    this.applySticky();
  }

  applySticky() {
    if (!this.svg) return;
    const { scrollLeft, scrollTop } = this.scroller;
    for (const g of this.svg.querySelectorAll('[data-sticky]')) {
      const mode = g.dataset.sticky;
      const x = mode.includes('x') ? scrollLeft : 0;
      const y = mode.includes('y') ? scrollTop : 0;
      g.setAttribute('transform', `translate(${x},${y})`);
    }
  }

  setScale(scale) {
    if (!SCALES.includes(scale)) throw new Error(`Échelle inconnue : "${scale}"`);
    if (scale === this.scale) return;
    const view = (this.scroller.clientWidth - this.metrics.tableWidth) / 2;
    const centerDay = this.timescale.xToDay(this.scroller.scrollLeft + view);
    this.scale = scale;
    this.refresh();
    this.scroller.scrollLeft = Math.max(0, this.timescale.dayToX(centerDay) - view);
    this.applySticky();
    this.emit('scale', { scale });
  }

  select(id, linkId = null) {
    this.state.selectedId = id;
    this.state.selectedLinkId = linkId;
    for (const n of this.svg.querySelectorAll('.is-selected')) n.classList.remove('is-selected');
    if (id) {
      for (const n of this.svg.querySelectorAll('[data-selectable]')) {
        if (n.dataset.id === id) n.classList.add('is-selected');
      }
    }
    if (linkId) {
      for (const n of this.svg.querySelectorAll('.gantt-link')) {
        if (n.dataset.linkId === linkId) n.classList.add('is-selected');
      }
    }
    this.emit('select', { id, linkId });
  }

  commit(type, detail, mutate) {
    const result = mutate(this.model);
    if (result && result.ok === false) {
      this.emit('invalid', { reason: result.reason });
      this.render();
      return result;
    }
    this.emit('change', { type, ...detail });
    this.refresh();
    return result ?? { ok: true };
  }

  exportJSON(filename = 'gantt.json') {
    const text = JSON.stringify(this.model.getData(), null, 2);
    if (filename) downloadBlob(new Blob([text], { type: 'application/json' }), filename);
    return text;
  }

  exportSVG(filename = 'gantt.svg') {
    const text = serializeSVG(buildStandaloneSVG(this.svg));
    if (filename) downloadBlob(new Blob([text], { type: 'image/svg+xml' }), filename);
    return text;
  }

  async exportPDF(filename = 'gantt.pdf') {
    const blob = await exportPDFBlob(this.svg, this.pdfLibs);
    if (filename) downloadBlob(blob, filename);
    return blob;
  }

  print() {
    window.print();
  }

  getData() {
    return this.model.getData();
  }

  setData(data) {
    const model = new GanttModel(data); // lève avant de toucher à l'état courant
    this.model = model;
    this.state = { selectedId: null, selectedLinkId: null };
    this.refresh();
  }
}
