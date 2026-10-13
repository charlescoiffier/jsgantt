import { GanttModel } from './model.js';
import { Timescale, SCALES } from './timescale.js';
import { computeLayout, renderParts, readMetrics } from './renderer.js';
import { attachInteractions } from './interactions.js';
import { History } from './history.js';
import { attachA11y, syncAria } from './a11y.js';
import { attachKeyboard } from './keyboard.js';
import { fromDay } from './dates.js';
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
    this.canvas = document.createElement('div');
    this.canvas.className = 'gantt-canvas';
    this.scroller.replaceChildren(this.canvas);
    this.root.replaceChildren(this.scroller);
    this.uid = `gantt${++uidCounter}`;
    this.readonly = options.readonly === true;
    this.scale = scale;
    this.pdfLibs = options.pdfLibs ?? {};
    this.history = new History(options.historyLimit ?? 100);
    this.model = new GanttModel({ tasks: options.tasks, links: options.links });
    this.state = { selectedId: null, selectedLinkId: null };
    this.refresh();
    this.detach = attachInteractions(this);
    this.detachA11y = attachA11y(this);
    this.detachKeyboard = attachKeyboard(this);
    // À l'impression, les couches sont recomposées en un seul dessin (comme pour l'export SVG).
    this.onBeforePrint = () => {
      this.onAfterPrint();
      const sheet = document.createElement('div');
      sheet.className = 'gantt-print-only';
      sheet.append(buildStandaloneSVG(this.parts));
      this.root.append(sheet);
    };
    this.onAfterPrint = () => {
      for (const n of this.root.querySelectorAll('.gantt-print-only')) n.remove();
    };
    window.addEventListener('beforeprint', this.onBeforePrint);
    window.addEventListener('afterprint', this.onAfterPrint);
  }

  destroy() {
    this.detach();
    this.detachKeyboard();
    this.detachA11y();
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
    const previous = this.timescale;
    this.metrics = readMetrics(this.root);
    this.timescale = this.#buildTimescale();
    this.render();
    if (previous && previous.scale === this.timescale.scale && previous.originDay !== this.timescale.originDay) {
      // L'origine a bougé : on garde les mêmes jours à l'écran.
      const shift = (previous.originDay - this.timescale.originDay) * this.timescale.pixelsPerDay;
      this.scroller.scrollLeft = Math.max(0, this.scroller.scrollLeft + shift);
    }
  }

  render({ model = this.model, dragId = null } = {}) {
    this.root.classList.toggle('is-readonly', this.readonly);
    this.layout = computeLayout(model, this.timescale, this.metrics, { ...this.state, today: todayDay(), showAdd: !this.readonly });
    const parts = renderParts(this.layout, { uid: this.uid, readonly: this.readonly, dragId });
    const { scrollLeft, scrollTop } = this.scroller;
    this.canvas.replaceChildren(parts.main, parts.table, parts.header, parts.corner, parts.overlay);
    this.scroller.scrollLeft = scrollLeft;
    this.scroller.scrollTop = scrollTop;
    this.parts = parts;
    this.svg = parts.main;
    syncAria(this);
  }

  setScale(scale) {
    if (!SCALES.includes(scale)) throw new Error(`Échelle inconnue : "${scale}"`);
    if (scale === this.scale) return;
    const view = (this.scroller.clientWidth - this.metrics.tableWidth) / 2;
    const centerDay = this.timescale.xToDay(this.scroller.scrollLeft + view);
    this.scale = scale;
    this.refresh();
    this.scroller.scrollLeft = Math.max(0, this.timescale.dayToX(centerDay) - view);
    this.emit('scale', { scale });
  }

  select(id, linkId = null) {
    this.state.selectedId = id;
    this.state.selectedLinkId = linkId;
    for (const n of this.canvas.querySelectorAll('.is-selected')) n.classList.remove('is-selected');
    if (id) {
      for (const n of this.canvas.querySelectorAll('[data-selectable]')) {
        if (n.dataset.id === id) n.classList.add('is-selected');
      }
    }
    if (linkId) {
      for (const n of this.canvas.querySelectorAll('.gantt-link')) {
        if (n.dataset.linkId === linkId) n.classList.add('is-selected');
      }
    }
    syncAria(this);
    this.emit('select', { id, linkId });
  }

  commit(type, detail, mutate) {
    const before = this.model.getData();
    const result = mutate(this.model);
    if (result && result.ok === false) {
      this.emit('invalid', { reason: result.reason });
      this.render();
      return result;
    }
    // Le repli est un état d'affichage : il n'entre pas dans l'historique.
    if (type !== 'collapse') this.#record(before);
    const extra = result?.link ? { linkId: result.link.id } : result?.task ? { id: result.task.id } : {};
    this.#reconcileSelection();
    this.emit('change', { type, ...detail, ...extra });
    this.refresh();
    return result ?? { ok: true };
  }

  #reconcileSelection() {
    if (this.state.selectedId && !this.model.getTask(this.state.selectedId)) this.state.selectedId = null;
    if (this.state.selectedLinkId && !this.model.links.some((l) => l.id === this.state.selectedLinkId)) {
      this.state.selectedLinkId = null;
    }
  }

  #denyReadonly() {
    const reason = 'le diagramme est en lecture seule';
    this.emit('invalid', { reason });
    return { ok: false, reason };
  }

  #viewCenterDay() {
    const view = (this.scroller.clientWidth - this.metrics.tableWidth) / 2;
    return view > 0 ? this.timescale.xToDay(this.scroller.scrollLeft + view) : todayDay();
  }

  addTask(opts = {}) {
    if (this.readonly) return this.#denyReadonly();
    const spec = { ...opts };
    if (spec.start === undefined) spec.start = fromDay(this.#viewCenterDay());
    const result = this.commit('add', {}, (m) => m.addTask(spec));
    if (result.ok && result.task) {
      this.select(result.task.id);
      this.reveal(result.task.id);
      this.editCell(result.task.id, 'name');
    }
    return result;
  }

  removeTask(id) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('remove', { id }, (m) => m.removeTask(id));
  }

  moveTaskTo(id, to) {
    if (this.readonly) return this.#denyReadonly();
    const work = this.model.clone();
    const probe = work.moveTaskTo(id, to);
    if (probe.ok && JSON.stringify(work.getData()) === JSON.stringify(this.model.getData())) {
      return { ok: true, unchanged: true };
    }
    return this.commit('reorder', { id }, (m) => m.moveTaskTo(id, to));
  }

  reveal(id) {
    const row = this.layout.rows.find((r) => r.id === id);
    if (!row) return;
    const { scrollTop, clientHeight } = this.scroller;
    const top = row.y;
    const bottom = row.y + this.layout.rowHeight;
    if (top < scrollTop + this.layout.headerHeight) this.scroller.scrollTop = Math.max(0, top - this.layout.headerHeight);
    else if (bottom > scrollTop + clientHeight) this.scroller.scrollTop = bottom - clientHeight;
    const bar = this.layout.bars.find((b) => b.id === id);
    if (bar) {
      const { scrollLeft, clientWidth } = this.scroller;
      const left = scrollLeft + this.metrics.tableWidth;
      if (bar.x < left) this.scroller.scrollLeft = Math.max(0, bar.x - this.metrics.tableWidth - 24);
      else if (bar.x + bar.width > scrollLeft + clientWidth) this.scroller.scrollLeft = bar.x + bar.width - clientWidth + 24;
    }
  }

  editCell(id, field) {
    this.openEditor?.(id, field);
  }

  #record(before) {
    if (this.history.push(before, this.model.getData())) this.#emitHistory();
  }

  #emitHistory() {
    this.emit('history', { canUndo: this.canUndo, canRedo: this.canRedo });
  }

  get canUndo() {
    return !this.readonly && this.history.canUndo;
  }

  get canRedo() {
    return !this.readonly && this.history.canRedo;
  }

  undo() {
    if (!this.canUndo) return false;
    this.#restore(this.history.undo(this.model.getData()), 'undo');
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this.#restore(this.history.redo(this.model.getData()), 'redo');
    return true;
  }

  #restore(snapshot, type) {
    // Les groupes gardent leur état replié actuel.
    const collapsed = new Map(this.model.tasks.map((t) => [t.id, t.collapsed]));
    for (const t of snapshot.tasks) {
      if (!collapsed.has(t.id)) continue;
      if (collapsed.get(t.id)) t.collapsed = true;
      else delete t.collapsed;
    }
    this.model = new GanttModel(snapshot);
    this.#reconcileSelection();
    this.emit('change', { type });
    this.refresh();
    this.#emitHistory();
  }

  exportJSON(filename = 'gantt.json') {
    const text = JSON.stringify(this.model.getData(), null, 2);
    if (filename) downloadBlob(new Blob([text], { type: 'application/json' }), filename);
    return text;
  }

  exportSVG(filename = 'gantt.svg') {
    const text = serializeSVG(buildStandaloneSVG(this.parts));
    if (filename) downloadBlob(new Blob([text], { type: 'image/svg+xml' }), filename);
    return text;
  }

  async exportPDF(filename = 'gantt.pdf') {
    const blob = await exportPDFBlob(this.parts, this.pdfLibs);
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
    this.history.clear();
    this.#emitHistory();
    this.refresh();
  }
}
