import { GanttModel } from './model.js';
import { Timescale, SCALES } from './timescale.js';
import { computeLayout, renderParts, readMetrics } from './renderer.js';
import { attachInteractions } from './interactions.js';
import { History } from './history.js';
import { attachA11y, syncAria } from './a11y.js';
import { attachKeyboard } from './keyboard.js';
import { fromDay } from './dates.js';
import { createI18n } from './i18n.js';
import { openConstraintEditor } from './constraint-editor.js';
import { openAnnotationEditor } from './annotation-editor.js';
import { openTaskEditor } from './task-editor.js';
import { BAR_LABELS } from './view.js';
import { normalizeColumns } from './view.js';
import { buildStandaloneSVG, serializeSVG, downloadBlob, exportPDFBlob } from './export.js';

let uidCounter = 0;

function todayDay() {
  const n = new Date();
  return Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000);
}

const DEFAULT_VIEW_COLUMNS = ['start', 'end', 'duration'];

export class Gantt {
  #listeners = new Map();

  constructor(el, options = {}) {
    const scale = options.scale ?? 'week';
    if (!SCALES.includes(scale)) throw new Error(`Échelle inconnue : "${scale}"`);
    this.i18n = createI18n(options.locale);
    this.weekStart = options.weekStart ?? 1;
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
    this.showCritical = options.showCritical === true;
    this.scale = scale;
    this.pdfLibs = options.pdfLibs ?? {};
    this.history = new History(options.historyLimit ?? 100);
    try {
      this.model = new GanttModel({
        tasks: options.tasks, links: options.links, calendar: options.calendar, planning: options.planning,
        markers: options.markers, zones: options.zones, owners: options.owners,
      });
    } catch (e) {
      throw this.#localizeError(e);
    }
    this.state = { selectedId: null, selectedLinkId: null };
    // Vue du tableau (ni dans les données, ni dans l'historique) : colonnes, tri, filtre, largeur.
    this.view = { columns: DEFAULT_VIEW_COLUMNS, sort: null, filter: null, tableWidth: null, barLabel: 'name' };
    this.#applyView(options);
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
    if (this.model.planning.end !== null) max = Math.max(max, this.model.planning.end);
    // Les repères et zones élargissent l'échelle de temps.
    for (const m of this.model.markers) {
      min = Math.min(min, m.date);
      max = Math.max(max, m.date);
    }
    for (const z of this.model.zones) {
      min = Math.min(min, z.start);
      max = Math.max(max, z.end);
    }
    const originDay = min - 7;
    const endDay = Math.max(max + 14, originDay + 30);
    return new Timescale({
      scale: this.scale,
      colWidths: this.metrics.colWidths,
      originDay,
      endDay,
      months: this.i18n.months,
      weekStart: this.weekStart,
      calendar: this.model.calendar,
    });
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
    this.layout = computeLayout(model, this.timescale, this.metrics, {
      ...this.state, today: todayDay(), showAdd: !this.readonly, showCritical: this.showCritical, i18n: this.i18n,
      columns: this.#columnSpecs, sort: this.view.sort, filter: this.view.filter, tableWidth: this.view.tableWidth,
      barLabel: this.view.barLabel,
      frozenRows: dragId && this.layout ? this.layout.rowsInfo : undefined,
    });
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
    const view = (this.scroller.clientWidth - this.layout.table.width) / 2;
    const centerDay = this.timescale.xToDay(this.scroller.scrollLeft + view);
    this.scale = scale;
    this.refresh();
    this.scroller.scrollLeft = Math.max(0, this.timescale.dayToX(centerDay) - view);
    this.emit('scale', { scale });
  }

  // --- Vue du tableau ---

  #columnSpecs = normalizeColumns();

  // Valide puis applique les clés présentes de `v` ; lève (sans rien changer) si une valeur est invalide.
  #applyView(v) {
    const next = { ...this.view };
    let specs = this.#columnSpecs;
    if ('columns' in v && v.columns !== undefined) {
      specs = normalizeColumns(v.columns ?? DEFAULT_VIEW_COLUMNS);
      next.columns = v.columns ?? DEFAULT_VIEW_COLUMNS;
    }
    if ('sort' in v && v.sort !== undefined) next.sort = v.sort;
    if (v.barLabel !== undefined) {
      if (!BAR_LABELS.includes(v.barLabel)) throw new Error(`"barLabel" inconnu : "${v.barLabel}" (attendu : ${BAR_LABELS.join(', ')})`);
      next.barLabel = v.barLabel;
    }
    if ('filter' in v && v.filter !== undefined) next.filter = v.filter === '' ? null : v.filter;
    if ('tableWidth' in v && v.tableWidth !== undefined) {
      if (v.tableWidth !== null && !(Number.isFinite(v.tableWidth) && v.tableWidth > 0)) {
        throw new Error('"tableWidth" doit être un nombre positif ou null');
      }
      next.tableWidth = v.tableWidth === null ? null : Math.round(v.tableWidth);
    }
    if (next.sort !== null) {
      const { column, dir } = next.sort ?? {};
      if (dir !== 'asc' && dir !== 'desc') throw new Error('"sort.dir" doit valoir "asc" ou "desc"');
      // Une colonne retirée emporte son tri.
      if (!specs.some((c) => c.id === column)) {
        if ('sort' in v && v.sort !== undefined) throw new Error(`Tri : colonne absente du tableau : "${column}"`);
        next.sort = null;
      }
    }
    if (next.filter !== null && typeof next.filter !== 'string' && typeof next.filter !== 'function') {
      throw new Error('"filter" doit être un texte, une fonction (task) => booléen ou null');
    }
    this.view = next;
    this.#columnSpecs = specs;
  }

  getView() {
    const { columns, sort, filter, tableWidth, barLabel } = this.view;
    return { columns: [...columns], sort: sort ? { ...sort } : null, filter, tableWidth, barLabel, scale: this.scale };
  }

  // Applique une vue partielle : { columns, sort, filter, tableWidth, scale }.
  setView(v = {}) {
    this.#applyView(v);
    if (v.scale !== undefined && v.scale !== this.scale) this.setScale(v.scale);
    else this.refresh();
    if (this.state.selectedId && !this.layout.rows.some((r) => r.id === this.state.selectedId)) this.select(null);
    this.emit('view', this.getView());
  }

  setColumns(columns) {
    this.setView({ columns });
  }

  // { column, dir: 'asc' | 'desc' } ou null (ordre du plan).
  setSort(sort) {
    this.setView({ sort });
  }

  // Texte cherché dans les noms, fonction (task) => booléen, ou null.
  setFilter(filter) {
    this.setView({ filter });
  }

  setTableWidth(px) {
    this.setView({ tableWidth: px });
  }

  // Clic sur un en-tête : croissant, décroissant, puis ordre du plan.
  cycleSort(column) {
    const cur = this.view.sort;
    if (!cur || cur.column !== column) this.setSort({ column, dir: 'asc' });
    else if (cur.dir === 'asc') this.setSort({ column, dir: 'desc' });
    else this.setSort(null);
  }

  // Affiche ou masque le chemin critique et les marges.
  setShowCritical(on) {
    this.showCritical = on === true;
    this.render();
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
      this.emit('invalid', { reason: this.i18n.localize(result), code: result.code });
      this.render();
      return result;
    }
    // Le repli est un état d'affichage : il n'entre pas dans l'historique.
    if (type !== 'collapse') this.#record(before);
    const extra = result?.link ? { linkId: result.link.id }
      : result?.task ? { id: result.task.id }
        : result?.owner ? { ownerId: result.owner.id }
        : result?.marker ? { markerId: result.marker.id }
          : result?.zone ? { zoneId: result.zone.id } : {};
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
    const reason = this.i18n.t('readonly');
    this.emit('invalid', { reason, code: 'readonly' });
    return { ok: false, reason, code: 'readonly' };
  }

  #localizeError(e) {
    if (e?.code) e.message = this.i18n.localize(e);
    return e;
  }

  t(key, params) {
    return this.i18n.t(key, params);
  }

  refuse(code, params = {}) {
    this.emit('invalid', { reason: this.i18n.t(code, params), code });
  }

  // Calendrier : { workingDays, holidays, lagUnit } ou null (7 jours sur 7). Replanifie ; annulable.
  setCalendar(spec) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('calendar', {}, (m) => m.setCalendar(spec));
  }

  // Sens de planification : { direction: 'forward' | 'backward', end?: 'AAAA-MM-JJ' } (en arrière : fin imposée) ou null. Annulable.
  setPlanning(spec) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('planning', {}, (m) => m.setPlanning(spec));
  }

  // Cale les tâches reliées au plus tôt / au plus tard (les tâches sans lien ne bougent pas). Annulable.
  alignEarliest() {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('align', { mode: 'earliest' }, (m) => m.alignEarliest());
  }

  alignLatest() {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('align', { mode: 'latest' }, (m) => m.alignLatest());
  }

  // Contrainte de date d'une tâche : { type: 'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO', date } ou null. Annulable.
  setConstraint(id, spec) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('constraint', { id }, (m) => m.setConstraint(id, spec));
  }

  editConstraint(id) {
    openConstraintEditor(this, id);
  }

  // --- Propriétés d'une tâche et responsables ---

  // { name, start, end, progress, color, owner, constraint } en une seule action annulable ; tout ou rien.
  updateTaskProps(id, patch) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('props', { id }, (m) => m.updateTaskProps(id, patch));
  }

  editTask(id) {
    openTaskEditor(this, id);
  }

  // Liste des responsables : [{ id?, name }] ; les tâches dont le responsable disparaît n'en ont plus. Annulable.
  setOwners(list) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('owners', {}, (m) => m.setOwners(list));
  }

  addOwner(name) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('owners', { action: 'add' }, (m) => m.addOwner(name));
  }

  renameOwner(id, name) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('owners', { action: 'rename', ownerId: id }, (m) => m.renameOwner(id, name));
  }

  removeOwner(id) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('owners', { action: 'remove', ownerId: id }, (m) => m.removeOwner(id));
  }

  // --- Repères (jalons de projet) et zones colorées : annulables, refusés en lecture seule ---

  // Sans date : le jour au centre de la vue.
  addMarker(spec = {}) {
    if (this.readonly) return this.#denyReadonly();
    const full = { ...spec, date: spec.date ?? fromDay(this.#viewCenterDay()) };
    return this.commit('marker', { action: 'add' }, (m) => m.addMarker(full));
  }

  updateMarker(id, patch) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('marker', { action: 'update', markerId: id }, (m) => m.updateMarker(id, patch));
  }

  removeMarker(id) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('marker', { action: 'remove', markerId: id }, (m) => m.removeMarker(id));
  }

  // Sans dates : une semaine à partir du jour au centre de la vue.
  addZone(spec = {}) {
    if (this.readonly) return this.#denyReadonly();
    const center = this.#viewCenterDay();
    const full = { ...spec, start: spec.start ?? fromDay(center), end: spec.end ?? fromDay(center + 6) };
    return this.commit('zone', { action: 'add' }, (m) => m.addZone(full));
  }

  updateZone(id, patch) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('zone', { action: 'update', zoneId: id }, (m) => m.updateZone(id, patch));
  }

  removeZone(id) {
    if (this.readonly) return this.#denyReadonly();
    return this.commit('zone', { action: 'remove', zoneId: id }, (m) => m.removeZone(id));
  }

  // Petite fenêtre d'édition (libellé, date(s), couleur, suppression).
  editMarker(id) {
    openAnnotationEditor(this, 'marker', id);
  }

  editZone(id) {
    openAnnotationEditor(this, 'zone', id);
  }

  setWeekStart(day) {
    if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error('weekStart doit être un entier de 0 (dimanche) à 6');
    this.weekStart = day;
    this.refresh();
  }

  setLocale(locale) {
    this.i18n = createI18n(locale);
    this.refresh();
    this.emit('locale', { code: this.i18n.code });
  }

  #viewCenterDay() {
    const view = (this.scroller.clientWidth - this.layout.table.width) / 2;
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
    if (this.view.sort) {
      this.refuse('reorder.sorted');
      return { ok: false, reason: this.i18n.t('reorder.sorted'), code: 'reorder.sorted' };
    }
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
      const tw = this.layout.table.width;
      const left = scrollLeft + tw;
      if (bar.x < left) this.scroller.scrollLeft = Math.max(0, bar.x - tw - 24);
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
    let blob;
    try {
      blob = await exportPDFBlob(this.parts, this.pdfLibs);
    } catch (e) {
      throw this.#localizeError(e);
    }
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
    let model;
    try {
      model = new GanttModel(data); // lève avant de toucher à l'état courant
    } catch (e) {
      throw this.#localizeError(e);
    }
    this.model = model;
    this.state = { selectedId: null, selectedLinkId: null };
    this.history.clear();
    this.#emitHistory();
    this.refresh();
  }
}
