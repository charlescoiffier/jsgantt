import { toDay, fromDay } from './dates.js';
import { computeDates } from './scheduler.js';

export const LINK_TYPES = ['FS', 'SS', 'FF', 'SF'];

export class GanttModel {
  #tasks = new Map();
  #children = new Map();
  #links = [];
  #linkSeq = 0;

  constructor(data = {}) {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Les données doivent être un objet { tasks, links }');
    }
    for (const key of Object.keys(data)) {
      if (key !== 'tasks' && key !== 'links') throw new Error(`Les données contiennent une clé inconnue "${key}" (attendu : tasks, links)`);
    }
    const { tasks = [], links = [] } = data;
    if (!Array.isArray(tasks)) throw new Error('"tasks" doit être un tableau');
    if (!Array.isArray(links)) throw new Error('"links" doit être un tableau');
    for (const raw of tasks) this.#loadTask(raw);
    this.#buildHierarchy();
    this.#resolveDates();
    this.#aggregateGroups();
    for (const raw of links) {
      const res = this.addLink(raw);
      if (!res.ok) throw new Error(`Lien ${raw?.id ?? `${raw?.from}→${raw?.to}`} invalide : ${res.reason}`);
    }
    this.reschedule();
  }

  #loadTask(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Chaque tâche doit être un objet');
    const { id } = raw;
    if (typeof id !== 'string' || id === '') throw new Error('Chaque tâche doit avoir un "id" (chaîne non vide)');
    if (this.#tasks.has(id)) throw new Error(`Identifiant de tâche dupliqué : "${id}"`);
    const progress = raw.progress ?? 0;
    if (typeof progress !== 'number' || !(progress >= 0 && progress <= 1)) {
      throw new Error(`Tâche "${id}" : "progress" doit être un nombre entre 0 et 1`);
    }
    const parse = (key) => {
      if (raw[key] === undefined) return undefined;
      try {
        return toDay(raw[key]);
      } catch (e) {
        throw new Error(`Tâche "${id}" : ${e.message}`);
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
      if (t.parentId === t.id) throw new Error(`Boucle dans la hiérarchie autour de "${t.id}"`);
      if (t.parentId !== null && !this.#tasks.has(t.parentId)) {
        throw new Error(`Tâche "${t.id}" : parent inconnu "${t.parentId}"`);
      }
      push(t.parentId, t.id);
    }
    for (const t of this.#tasks.values()) {
      let cur = t;
      let steps = 0;
      while (cur.parentId !== null) {
        cur = this.#tasks.get(cur.parentId);
        if (++steps > this.#tasks.size) throw new Error(`Boucle dans la hiérarchie autour de "${t.id}"`);
      }
    }
  }

  #resolveDates() {
    for (const t of this.#tasks.values()) {
      if (this.isGroup(t.id)) continue;
      if (t.start === undefined) throw new Error(`Tâche "${t.id}" : "start" est requis`);
      if (t.milestone) {
        if (t.end === undefined) t.end = t.start;
        else if (t.end !== t.start) throw new Error(`Tâche "${t.id}" : un jalon doit avoir une fin égale à son début`);
        continue;
      }
      if (t.end === undefined) throw new Error(`Tâche "${t.id}" : "end" est requis`);
      if (t.end < t.start) throw new Error(`Tâche "${t.id}" : la fin précède le début`);
    }
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
        return 'le déplacement créerait un lien interdit entre un groupe et un de ses descendants';
      }
    }
    return this.#wouldCycle() ? 'le déplacement créerait un cycle' : null;
  }

  checkLink(link) {
    const { from, to } = link;
    if (!this.#tasks.has(from)) return `tâche source inconnue : "${from}"`;
    if (!this.#tasks.has(to)) return `tâche cible inconnue : "${to}"`;
    if (!LINK_TYPES.includes(link.type)) return `type de lien inconnu : "${link.type}"`;
    if (!Number.isInteger(link.lag ?? 0)) return 'le décalage (lag) doit être un entier';
    if (from === to) return 'une tâche ne peut pas être liée à elle-même';
    if (this.ancestorsOf(from).includes(to) || this.ancestorsOf(to).includes(from)) {
      return 'lien interdit entre un groupe et un de ses descendants';
    }
    if (this.#links.some((x) => x.from === from && x.to === to && x.type === link.type)) {
      return 'ce lien existe déjà';
    }
    if (this.#wouldCycle(from, to)) return 'ce lien créerait un cycle';
    return null;
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
    const reason = this.checkLink(norm);
    if (reason) return { ok: false, reason };
    let id = link?.id;
    if (id === undefined) {
      do {
        id = `l${++this.#linkSeq}`;
      } while (this.#links.some((x) => x.id === id));
    } else if (this.#links.some((x) => x.id === id)) {
      return { ok: false, reason: `identifiant de lien dupliqué : "${id}"` };
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
    if (!t) throw new Error(`Tâche inconnue : "${id}"`);
    return t;
  }

  moveTask(id, delta) {
    this.#require(id);
    if (!Number.isInteger(delta)) throw new TypeError('delta doit être un entier');
    for (const leafId of this.leafIdsUnder(id)) {
      const leaf = this.#tasks.get(leafId);
      leaf.start += delta;
      leaf.end += delta;
    }
    this.reschedule();
  }

  resizeTask(id, edge, day) {
    const t = this.#require(id);
    if (edge !== 'start' && edge !== 'end') throw new Error(`Bord inconnu : "${edge}"`);
    if (!Number.isInteger(day)) throw new TypeError('day doit être un entier');
    if (this.isGroup(id)) return { ok: false, reason: 'un groupe ne peut pas être redimensionné' };
    if (t.milestone) return { ok: false, reason: 'un jalon ne peut pas être redimensionné' };
    const saved = { start: t.start, end: t.end };
    if (edge === 'start') {
      if (day > t.end) return { ok: false, reason: 'le début ne peut pas suivre la fin' };
      t.start = day;
    } else {
      if (day < t.start) return { ok: false, reason: 'la fin ne peut pas précéder le début' };
      t.end = day;
    }
    const planned = computeDates(this).get(id);
    if (planned.start !== t.start || planned.end !== t.end) {
      t.start = saved.start;
      t.end = saved.end;
      return { ok: false, reason: 'redimensionnement bloqué par une dépendance' };
    }
    this.reschedule();
    return { ok: true };
  }

  setProgress(id, value) {
    const t = this.#require(id);
    if (this.isGroup(id)) return { ok: false, reason: 'la progression d\'un groupe est calculée' };
    t.progress = Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
    return { ok: true };
  }

  updateTask(id, patch) {
    const t = this.#require(id);
    const next = {};
    if ('name' in patch) next.name = String(patch.name);
    for (const key of ['start', 'end']) {
      if (!(key in patch)) continue;
      if (this.isGroup(id)) return { ok: false, reason: 'les dates d\'un groupe sont calculées' };
      try {
        next[key] = toDay(patch[key]);
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    }
    let start = next.start ?? t.start;
    let end = next.end ?? t.end;
    if (t.milestone && !this.isGroup(id) && ('start' in next || 'end' in next)) {
      start = end = next.start ?? next.end;
    }
    if (end < start) return { ok: false, reason: 'la fin précède le début' };
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
        return { ok: false, reason: 'modification bloquée par une dépendance' };
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
    if (typeof start !== 'string') return { ok: false, reason: '"start" est requis (AAAA-MM-JJ)' };
    let s;
    let e;
    try {
      s = toDay(start);
      e = end === undefined ? s + 2 : toDay(end);
    } catch (err) {
      return { ok: false, reason: err.message };
    }
    if (e < s) return { ok: false, reason: 'la fin précède le début' };
    if (afterId !== null) {
      const ref = this.#tasks.get(afterId);
      if (!ref) return { ok: false, reason: `tâche de référence inconnue : "${afterId}"` };
      parentId = ref.parentId;
    } else if (parentId !== null && !this.#tasks.has(parentId)) {
      return { ok: false, reason: `parent inconnu : "${parentId}"` };
    }
    if (id === undefined) {
      let n = this.#tasks.size + 1;
      while (this.#tasks.has(`t${n}`)) n++;
      id = `t${n}`;
    } else if (this.#tasks.has(id)) {
      return { ok: false, reason: `identifiant de tâche dupliqué : "${id}"` };
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
      return { ok: false, reason: 'une tâche ne peut pas être déplacée dans elle-même ni dans un de ses descendants' };
    }
    if (parentId !== null && !this.#tasks.has(parentId)) return { ok: false, reason: `parent inconnu : "${parentId}"` };
    if (beforeId !== null) {
      const b = this.#tasks.get(beforeId);
      if (!b || b.parentId !== parentId || beforeId === id) {
        return { ok: false, reason: 'beforeId doit être un enfant du nouveau parent' };
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
    const reason = this.#linksProblem();
    if (reason) {
      t.parentId = saved.parentId;
      this.#applyOrder(saved.order);
      return { ok: false, reason };
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
    return { tasks, links: this.#links.map((x) => ({ ...x })) };
  }

  clone() {
    return new GanttModel(this.getData());
  }
}
