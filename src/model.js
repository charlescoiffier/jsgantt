import { toDay, fromDay } from './dates.js';
import { computeDates } from './scheduler.js';

export const LINK_TYPES = ['FS', 'SS', 'FF', 'SF'];

export class GanttModel {
  #tasks = new Map();
  #children = new Map();
  #links = [];
  #linkSeq = 0;

  constructor(data = {}) {
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
    addEdge(from, to);
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
    if ('name' in next) t.name = next.name;
    if (!this.isGroup(id)) {
      t.start = start;
      t.end = end;
    }
    this.reschedule();
    return { ok: true };
  }

  toggleCollapsed(id) {
    const t = this.#require(id);
    t.collapsed = !t.collapsed;
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
