import { toDay, fromDay } from './dates.js';
import { computeDates } from './scheduler.js';
import { GanttError, fail, failFrom } from './i18n.js';
import { createCalendar } from './calendar.js';

export const LINK_TYPES = ['FS', 'SS', 'FF', 'SF'];

export class GanttModel {
  #tasks = new Map();
  #children = new Map();
  #links = [];
  #linkSeq = 0;
  #calendar = createCalendar();

  constructor(data = {}) {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new GanttError('data.notObject');
    }
    for (const key of Object.keys(data)) {
      if (key !== 'tasks' && key !== 'links' && key !== 'calendar') throw new GanttError('data.unknownKey', { key });
    }
    const { tasks = [], links = [] } = data;
    if (!Array.isArray(tasks)) throw new GanttError('data.tasksNotArray');
    if (!Array.isArray(links)) throw new GanttError('data.linksNotArray');
    this.#calendar = createCalendar(data.calendar);
    for (const raw of tasks) this.#loadTask(raw);
    this.#buildHierarchy();
    this.#resolveDates();
    this.#snapLeaves();
    this.#aggregateGroups();
    for (const raw of links) {
      const res = this.addLink(raw);
      if (!res.ok) throw new GanttError('link.invalid', { link: raw?.id ?? `${raw?.from}→${raw?.to}`, reason: res });
    }
    this.reschedule();
  }

  #loadTask(raw) {
    if (!raw || typeof raw !== 'object') throw new GanttError('task.notObject');
    const { id } = raw;
    if (typeof id !== 'string' || id === '') throw new GanttError('task.idRequired');
    if (this.#tasks.has(id)) throw new GanttError('task.duplicateId', { id });
    const progress = raw.progress ?? 0;
    if (typeof progress !== 'number' || !(progress >= 0 && progress <= 1)) {
      throw new GanttError('task.progressRange', { id });
    }
    const parse = (key) => {
      if (raw[key] === undefined) return undefined;
      try {
        return toDay(raw[key]);
      } catch (e) {
        throw new GanttError('task.error', { id, detail: e });
      }
    };
    this.#tasks.set(id, {
      id,
      name: String(raw.name ?? ''),
      start: parse('start'),
      end: parse('end'),
      progress,
      parentId: raw.parentId ?? null,
      collapsed: raw.collapsed === true,
      milestone: raw.milestone === true,
      className: raw.className ?? '',
    });
  }

  #buildHierarchy() {
    const push = (parent, id) => {
      if (!this.#children.has(parent)) this.#children.set(parent, []);
      this.#children.get(parent).push(id);
    };
    for (const t of this.#tasks.values()) {
      if (t.parentId === t.id) throw new GanttError('hierarchy.loop', { id: t.id });
      if (t.parentId !== null && !this.#tasks.has(t.parentId)) {
        throw new GanttError('task.parentUnknown', { id: t.id, parentId: t.parentId });
      }
      push(t.parentId, t.id);
    }
    for (const t of this.#tasks.values()) {
      let cur = t;
      let steps = 0;
      while (cur.parentId !== null) {
        cur = this.#tasks.get(cur.parentId);
        if (++steps > this.#tasks.size) throw new GanttError('hierarchy.loop', { id: t.id });
      }
    }
  }

  #resolveDates() {
    for (const t of this.#tasks.values()) {
      if (this.isGroup(t.id)) continue;
      if (t.start === undefined) throw new GanttError('task.startRequired', { id: t.id });
      if (t.milestone) {
        if (t.end === undefined) t.end = t.start;
        else if (t.end !== t.start) throw new GanttError('task.milestoneEnd', { id: t.id });
        continue;
      }
      if (t.end === undefined) throw new GanttError('task.endRequired', { id: t.id });
      if (t.end < t.start) throw new GanttError('task.endBeforeStart', { id: t.id });
    }
  }

  // Ramène début et fin des tâches simples sur des jours ouvrés (début vers l'avant, fin vers l'arrière).
  #snapLeaves() {
    const cal = this.#calendar;
    for (const t of this.#tasks.values()) {
      if (this.isGroup(t.id)) continue;
      t.start = cal.nextWorking(t.start);
      t.end = t.milestone ? t.start : Math.max(t.start, cal.prevWorking(t.end));
    }
  }

  get calendar() {
    return this.#calendar;
  }

  setCalendar(spec) {
    let calendar;
    try {
      calendar = createCalendar(spec);
    } catch (e) {
      return failFrom(e);
    }
    this.#calendar = calendar;
    this.#snapLeaves();
    this.reschedule();
    return { ok: true };
  }

  #aggregateGroups() {
    for (const t of this.#tasks.values()) {
      if (!this.isGroup(t.id)) continue;
      let start = Infinity;
      let end = -Infinity;
      for (const id of this.leafIdsUnder(t.id)) {
        const leaf = this.#tasks.get(id);
        start = Math.min(start, leaf.start);
        end = Math.max(end, leaf.end);
      }
      t.start = start;
      t.end = end;
    }
  }

  get tasks() {
    return [...this.#tasks.values()];
  }

  get links() {
    return this.#links;
  }

  getTask(id) {
    return this.#tasks.get(id);
  }

  childrenOf(parentId = null) {
    return (this.#children.get(parentId) ?? []).map((id) => this.#tasks.get(id));
  }

  isGroup(id) {
    return (this.#children.get(id)?.length ?? 0) > 0;
  }

  descendantsOf(id) {
    const out = [];
    const walk = (parent) => {
      for (const child of this.#children.get(parent) ?? []) {
        out.push(child);
        walk(child);
      }
    };
    walk(id);
    return out;
  }

  leafIdsUnder(id) {
    return this.isGroup(id) ? this.descendantsOf(id).filter((d) => !this.isGroup(d)) : [id];
  }

  ancestorsOf(id) {
    const out = [];
    let parent = this.#tasks.get(id)?.parentId ?? null;
    while (parent !== null) {
      out.push(parent);
      parent = this.#tasks.get(parent).parentId;
    }
    return out;
  }

  visibleRows() {
    const rows = [];
    const walk = (parentId, depth) => {
      for (const t of this.childrenOf(parentId)) {
        rows.push({ id: t.id, depth });
        if (!t.collapsed) walk(t.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  }

  progressOf(id) {
    const t = this.#tasks.get(id);
    if (!this.isGroup(id)) return t.progress;
    let done = 0;
    let total = 0;
    for (const leafId of this.leafIdsUnder(id)) {
      const leaf = this.#tasks.get(leafId);
      const duration = leaf.end - leaf.start + 1;
      done += leaf.progress * duration;
      total += duration;
    }
    return total === 0 ? 0 : done / total;
  }

  #indexChildren() {
    this.#children = new Map();
    for (const t of this.#tasks.values()) {
      if (!this.#children.has(t.parentId)) this.#children.set(t.parentId, []);
      this.#children.get(t.parentId).push(t.id);
    }
  }

  #applyOrder(ids) {
    const next = new Map();
    for (const id of ids) next.set(id, this.#tasks.get(id));
    this.#tasks = next;
    this.#indexChildren();
  }

  #linksProblem() {
    for (const link of this.#links) {
      if (this.ancestorsOf(link.from).includes(link.to) || this.ancestorsOf(link.to).includes(link.from)) {
        return fail('move.linkForbidden');
      }
    }
    return this.#wouldCycle() ? fail('move.cycle') : null;
  }

  // Refus éventuel d'un lien : { ok: false, reason, code, params } ou null.
  linkProblem(link) {
    const { from, to } = link;
    if (!this.#tasks.has(from)) return fail('link.sourceUnknown', { id: from });
    if (!this.#tasks.has(to)) return fail('link.targetUnknown', { id: to });
    if (!LINK_TYPES.includes(link.type)) return fail('link.typeUnknown', { type: link.type });
    if (!Number.isInteger(link.lag ?? 0)) return fail('link.lagInteger');
    if (from === to) return fail('link.self');
    if (this.ancestorsOf(from).includes(to) || this.ancestorsOf(to).includes(from)) return fail('link.groupDescendant');
    if (this.#links.some((x) => x.from === from && x.to === to && x.type === link.type)) return fail('link.exists');
    if (this.#wouldCycle(from, to)) return fail('link.cycle');
    return null;
  }

  checkLink(link) {
    return this.linkProblem(link)?.reason ?? null;
  }

  #wouldCycle(from, to) {
    const expand = (id) => [id, ...this.descendantsOf(id)];
    const adj = new Map();
    const addEdge = (a, b) => {
      for (const x of expand(a)) {
        if (!adj.has(x)) adj.set(x, new Set());
        for (const y of expand(b)) adj.get(x).add(y);
      }
    };
    for (const link of this.#links) addEdge(link.from, link.to);
    if (from !== undefined) addEdge(from, to);
    const state = new Map(); // 1 = en cours, 2 = terminé
    for (const root of adj.keys()) {
      if (state.has(root)) continue;
      state.set(root, 1);
      const stack = [[root, adj.get(root).values()]];
      while (stack.length) {
        const [node, it] = stack[stack.length - 1];
        const next = it.next();
        if (next.done) {
          state.set(node, 2);
          stack.pop();
          continue;
        }
        const n = next.value;
        if (state.get(n) === 1) return true;
        if (!state.has(n)) {
          state.set(n, 1);
          stack.push([n, (adj.get(n) ?? new Set()).values()]);
        }
      }
    }
    return false;
  }

  addLink(link) {
    const norm = { from: link?.from, to: link?.to, type: link?.type ?? 'FS', lag: link?.lag ?? 0 };
    const problem = this.linkProblem(norm);
    if (problem) return problem;
    let id = link?.id;
    if (id === undefined) {
      do {
        id = `l${++this.#linkSeq}`;
      } while (this.#links.some((x) => x.id === id));
    } else if (this.#links.some((x) => x.id === id)) {
      return fail('link.duplicateId', { id });
    }
    const stored = { id, ...norm };
    this.#links.push(stored);
    this.reschedule();
    return { ok: true, link: stored };
  }

  removeLink(id) {
    const i = this.#links.findIndex((x) => x.id === id);
    if (i === -1) return false;
    this.#links.splice(i, 1);
    return true;
  }

  reschedule() {
    for (const [id, d] of computeDates(this)) {
      const t = this.#tasks.get(id);
      t.start = d.start;
      t.end = d.end;
    }
    this.#aggregateGroups();
  }

  #require(id) {
    const t = this.#tasks.get(id);
    if (!t) throw new GanttError('task.unknown', { id });
    return t;
  }

  moveTask(id, delta) {
    this.#require(id);
    if (!Number.isInteger(delta)) throw new TypeError('delta doit être un entier');
    if (delta !== 0) {
      // Déplacement en jours calendaires : le début atterrit sur un jour ouvré (dans le sens du déplacement),
      // puis chaque tâche avance du même nombre de jours ouvrés, durée conservée.
      const cal = this.#calendar;
      const from = this.#tasks.get(id).start;
      const target = delta > 0 ? cal.nextWorking(from + delta) : cal.prevWorking(from + delta);
      const k = cal.workingDistance(from, target);
      for (const leafId of this.leafIdsUnder(id)) {
        const leaf = this.#tasks.get(leafId);
        leaf.start = cal.addWorkingDays(leaf.start, k);
        leaf.end = cal.addWorkingDays(leaf.end, k);
      }
    }
    this.reschedule();
  }

  resizeTask(id, edge, day) {
    const t = this.#require(id);
    if (edge !== 'start' && edge !== 'end') throw new Error(`Bord inconnu : "${edge}"`);
    if (!Number.isInteger(day)) throw new TypeError('day doit être un entier');
    if (this.isGroup(id)) return fail('resize.group');
    if (t.milestone) return fail('resize.milestone');
    const saved = { start: t.start, end: t.end };
    if (edge === 'start') {
      const snapped = this.#calendar.nextWorking(day);
      if (snapped > t.end) return fail('resize.startAfterEnd');
      t.start = snapped;
    } else {
      const snapped = this.#calendar.prevWorking(day);
      if (snapped < t.start) return fail('resize.endBeforeStart');
      t.end = snapped;
    }
    const planned = computeDates(this).get(id);
    if (planned.start !== t.start || planned.end !== t.end) {
      t.start = saved.start;
      t.end = saved.end;
      return fail('resize.blocked');
    }
    this.reschedule();
    return { ok: true };
  }

  setProgress(id, value) {
    const t = this.#require(id);
    if (this.isGroup(id)) return fail('progress.group');
    t.progress = Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
    return { ok: true };
  }

  updateTask(id, patch) {
    const t = this.#require(id);
    const next = {};
    if ('name' in patch) next.name = String(patch.name);
    for (const key of ['start', 'end']) {
      if (!(key in patch)) continue;
      if (this.isGroup(id)) return fail('dates.group');
      try {
        next[key] = toDay(patch[key]);
      } catch (e) {
        return failFrom(e);
      }
    }
    let start = next.start ?? t.start;
    let end = next.end ?? t.end;
    if (t.milestone && !this.isGroup(id) && ('start' in next || 'end' in next)) {
      start = end = next.start ?? next.end;
    }
    if (end < start) return fail('dates.endBeforeStart');
    if (!this.isGroup(id)) {
      start = this.#calendar.nextWorking(start);
      end = t.milestone ? start : Math.max(start, this.#calendar.prevWorking(end));
    }
    const saved = { name: t.name, start: t.start, end: t.end };
    if ('name' in next) t.name = next.name;
    if (!this.isGroup(id)) {
      t.start = start;
      t.end = end;
      const planned = computeDates(this).get(id);
      if (planned.start !== t.start || planned.end !== t.end) {
        t.name = saved.name;
        t.start = saved.start;
        t.end = saved.end;
        return fail('update.blocked');
      }
    }
    this.reschedule();
    return { ok: true };
  }

  toggleCollapsed(id) {
    const t = this.#require(id);
    t.collapsed = !t.collapsed;
  }

  addTask(spec = {}) {
    let { id, name, start, end, parentId = null, afterId = null } = spec;
    if (typeof start !== 'string') return fail('add.startRequired');
    let s;
    let e;
    try {
      s = toDay(start);
      e = end === undefined ? undefined : toDay(end);
    } catch (err) {
      return failFrom(err);
    }
    if (e !== undefined && e < s) return fail('dates.endBeforeStart');
    s = this.#calendar.nextWorking(s);
    e = e === undefined ? this.#calendar.addWorkingDays(s, 2) : Math.max(s, this.#calendar.prevWorking(e));
    if (afterId !== null) {
      const ref = this.#tasks.get(afterId);
      if (!ref) return fail('add.refUnknown', { id: afterId });
      parentId = ref.parentId;
    } else if (parentId !== null && !this.#tasks.has(parentId)) {
      return fail('parent.unknown', { id: parentId });
    }
    if (id === undefined) {
      let n = this.#tasks.size + 1;
      while (this.#tasks.has(`t${n}`)) n++;
      id = `t${n}`;
    } else if (this.#tasks.has(id)) {
      return fail('task.duplicateId', { id });
    }
    const order = [...this.#tasks.keys()];
    let at;
    if (afterId !== null) {
      at = order.indexOf(afterId) + 1;
    } else if (parentId === null) {
      at = order.length;
    } else {
      const kids = this.childrenOf(parentId).map((c) => order.indexOf(c.id));
      at = (kids.length ? Math.max(...kids) : order.indexOf(parentId)) + 1;
    }
    const task = {
      id,
      name: String(name ?? 'Nouvelle tâche'),
      start: s,
      end: e,
      progress: 0,
      parentId,
      collapsed: false,
      milestone: false,
      className: '',
    };
    order.splice(at, 0, id);
    this.#tasks.set(id, task);
    this.#applyOrder(order);
    this.reschedule();
    return { ok: true, task: { ...task } };
  }

  removeTask(id) {
    this.#require(id);
    const removedTasks = [id, ...this.descendantsOf(id)];
    const gone = new Set(removedTasks);
    const removedLinks = this.#links.filter((l) => gone.has(l.from) || gone.has(l.to)).map((l) => l.id);
    this.#links = this.#links.filter((l) => !gone.has(l.from) && !gone.has(l.to));
    for (const rid of removedTasks) this.#tasks.delete(rid);
    this.#indexChildren();
    this.reschedule();
    return { ok: true, removedTasks, removedLinks };
  }

  moveTaskTo(id, { parentId = null, beforeId = null } = {}) {
    const t = this.#require(id);
    if (parentId === id || (parentId !== null && this.descendantsOf(id).includes(parentId))) {
      return fail('move.intoSelf');
    }
    if (parentId !== null && !this.#tasks.has(parentId)) return fail('parent.unknown', { id: parentId });
    if (beforeId !== null) {
      const b = this.#tasks.get(beforeId);
      if (!b || b.parentId !== parentId || beforeId === id) {
        return fail('move.beforeId');
      }
    }
    const saved = { order: [...this.#tasks.keys()], parentId: t.parentId };
    const sub = new Set([id, ...this.descendantsOf(id)]);
    const rest = saved.order.filter((x) => !sub.has(x));
    const moved = saved.order.filter((x) => sub.has(x));
    let at;
    if (beforeId !== null) {
      at = rest.indexOf(beforeId);
    } else if (parentId === null) {
      at = rest.length;
    } else {
      const kids = this.childrenOf(parentId).map((c) => c.id).filter((c) => !sub.has(c));
      at = (kids.length ? Math.max(...kids.map((k) => rest.indexOf(k))) : rest.indexOf(parentId)) + 1;
    }
    rest.splice(at, 0, ...moved);
    t.parentId = parentId;
    this.#applyOrder(rest);
    const problem = this.#linksProblem();
    if (problem) {
      t.parentId = saved.parentId;
      this.#applyOrder(saved.order);
      return problem;
    }
    this.reschedule();
    return { ok: true };
  }

  getData() {
    const tasks = this.tasks.map((t) => {
      const o = {
        id: t.id,
        name: t.name,
        start: fromDay(t.start),
        end: fromDay(t.end),
        progress: t.progress,
        parentId: t.parentId,
      };
      if (t.collapsed) o.collapsed = true;
      if (t.milestone) o.milestone = true;
      if (t.className) o.className = t.className;
      return o;
    });
    const calendar = this.#calendar.toJSON();
    return { tasks, links: this.#links.map((x) => ({ ...x })), ...(calendar ? { calendar } : {}) };
  }

  clone() {
    return new GanttModel(this.getData());
  }
}
