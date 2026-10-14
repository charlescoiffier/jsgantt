// Vue du tableau : colonnes, tri entre tâches sœurs et filtre. Ne modifie jamais le modèle.

export const BUILTIN_COLUMNS = ['name', 'wbs', 'start', 'end', 'duration', 'progress', 'slack', 'owner'];
// Texte au bout des barres : une colonne intégrée ou rien.
export const BAR_LABELS = [...BUILTIN_COLUMNS, 'none'];
export const DEFAULT_COLUMNS = ['name', 'start', 'end', 'duration'];
// Colonnes éditables en ligne (double-clic, F2, Tab).
export const EDITABLE_COLUMNS = ['name', 'start', 'end'];

// Liste de colonnes (ids intégrés ou { id, label, width, value }) → spécifications, « name » toujours en premier.
export function normalizeColumns(columns = DEFAULT_COLUMNS) {
  if (!Array.isArray(columns)) throw new Error('"columns" doit être un tableau');
  const out = [{ id: 'name', builtin: true }];
  const seen = new Set(['name']);
  for (const c of columns) {
    if (typeof c === 'string') {
      if (!BUILTIN_COLUMNS.includes(c)) throw new Error(`Colonne inconnue : "${c}" (attendu : ${BUILTIN_COLUMNS.join(', ')} ou un objet)`);
      if (seen.has(c)) continue;
      seen.add(c);
      out.push({ id: c, builtin: true });
    } else if (c && typeof c === 'object' && typeof c.id === 'string' && typeof c.value === 'function') {
      if (BUILTIN_COLUMNS.includes(c.id) || seen.has(c.id)) throw new Error(`Identifiant de colonne déjà utilisé : "${c.id}"`);
      seen.add(c.id);
      out.push({ id: c.id, builtin: false, label: String(c.label ?? c.id), width: c.width, value: c.value });
    } else {
      throw new Error('Colonne personnalisée : { id, label, width, value: (task) => texte } attendu');
    }
  }
  return out;
}

// Numéros hiérarchiques (1, 1.1, 1.2…) dans l'ordre du plan.
export function wbsNumbers(model) {
  const out = new Map();
  const walk = (parentId, prefix) => {
    model.childrenOf(parentId).forEach((t, i) => {
      const n = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      out.set(t.id, n);
      walk(t.id, n);
    });
  };
  walk(null, '');
  return out;
}

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Vrai si le nom de la tâche contient le texte, sans tenir compte de la casse ni des accents.
export function matchesText(task, text) {
  return fold(task.name).includes(fold(text).trim());
}

// Contexte partagé par les cellules : calculs coûteux faits une fois, à la demande.
export function viewContext(model, i18n) {
  let wbs = null;
  let slack = null;
  return {
    model,
    i18n,
    get wbs() {
      return (wbs ??= wbsNumbers(model));
    },
    get slack() {
      return (slack ??= model.slack());
    },
  };
}

// Valeur de tri d'une cellule : nombre ou texte.
export function sortValue(col, id, ctx) {
  const { model } = ctx;
  const t = model.getTask(id);
  switch (col.id) {
    case 'name':
      return t.name;
    case 'wbs':
      return ctx.wbs.get(id).split('.').map(Number);
    case 'start':
      return t.start;
    case 'end':
      return t.end;
    case 'duration':
      return model.durationDays(id);
    case 'progress':
      return model.progressOf(id);
    case 'slack':
      return ctx.slack.get(id)?.total ?? 0;
    case 'owner':
      return model.ownerName(t.owner);
    default:
      return customText(col, t);
  }
}

function customText(col, task) {
  try {
    const v = col.value(task);
    return v === undefined || v === null ? '' : String(v);
  } catch {
    return '';
  }
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
function compare(a, b) {
  if (Array.isArray(a)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? -1) - (b[i] ?? -1);
      if (d) return d;
    }
    return 0;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

// Lignes visibles [{ id, depth }] : tri entre sœurs (sort = { column, dir: 'asc' | 'desc' }) et filtre (texte ou
// fonction (task) => booléen). Un filtre garde les groupes parents des tâches retenues et ignore le repli.
// `filters` (facultatif) : filtres par colonne (voir columnPredicate), combinés au filtre global ;
// `today`, `weekStart` : référence des périodes relatives.
export function viewRows(model, { sort = null, filter = null, filters = null, columns = null, ctx = null, today, weekStart } = {}) {
  let keep = null;
  const context0 = ctx ?? viewContext(model);
  const global = filter !== null && filter !== undefined && filter !== ''
    ? (typeof filter === 'function' ? filter : (t) => matchesText(t, filter))
    : null;
  const perColumn = columnsPredicate(columns ?? normalizeColumns(BUILTIN_COLUMNS), filters, context0, { today, weekStart });
  if (global || perColumn) {
    const test = (t) => (!global || global(t)) && (!perColumn || perColumn(t));
    keep = new Set();
    for (const t of model.tasks) {
      if (!test(t)) continue;
      keep.add(t.id);
      for (const a of model.ancestorsOf(t.id)) keep.add(a);
    }
  }
  const col = sort ? (columns ?? normalizeColumns(BUILTIN_COLUMNS)).find((c) => c.id === sort.column) : null;
  const context = context0;
  const sign = sort?.dir === 'desc' ? -1 : 1;
  const rows = [];
  const walk = (parentId, depth) => {
    let children = model.childrenOf(parentId);
    if (keep) children = children.filter((t) => keep.has(t.id));
    if (col) {
      const keyed = children.map((t, i) => ({ t, i, v: sortValue(col, t.id, context) }));
      keyed.sort((a, b) => sign * compare(a.v, b.v) || a.i - b.i);
      children = keyed.map((k) => k.t);
    }
    for (const t of children) {
      rows.push({ id: t.id, depth });
      if (keep ? true : !t.collapsed) walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

// --- Filtres par colonne ---
// Spécifications (JSON, gardées dans la vue) :
//   texte (nom, colonnes personnalisées) : { contains } ; N° : { prefix }
//   dates (start, end) : { period } | { before } | { after } | { from, to } (dates 'AAAA-MM-JJ' ; avant/après exclus, entre inclus)
//   duration : { min, max } ; progress : { states: ['todo', 'doing', 'done'] }
//   slack : { critical: true } | { max } ; owner : { in: [id | null] }
export const PERIODS = ['today', 'thisWeek', 'nextWeek', 'thisMonth', 'nextMonth', 'next30', 'past', 'future'];

// Bornes [début, fin] (jours, incluses ; null = ouvert) d'une période relative à `today`.
export function periodRange(period, today, weekStart = 1) {
  const dow = ((today % 7) + 7 + 4) % 7; // 1970-01-01 (jour 0) était un jeudi
  const weekFirst = today - ((dow - weekStart + 7) % 7);
  const d = new Date(today * 86400000);
  const monthStart = (y, m) => Date.UTC(y, m, 1) / 86400000;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (period) {
    case 'today':
      return [today, today];
    case 'thisWeek':
      return [weekFirst, weekFirst + 6];
    case 'nextWeek':
      return [weekFirst + 7, weekFirst + 13];
    case 'thisMonth':
      return [monthStart(y, m), monthStart(y, m + 1) - 1];
    case 'nextMonth':
      return [monthStart(y, m + 1), monthStart(y, m + 2) - 1];
    case 'next30':
      return [today, today + 29];
    case 'past':
      return [null, today - 1];
    case 'future':
      return [today + 1, null];
    default:
      throw new Error(`Période inconnue : "${period}" (attendu : ${PERIODS.join(', ')})`);
  }
}

const dayOf = (s) => {
  const [y, mo, da] = String(s).split('-').map(Number);
  const v = Date.UTC(y, mo - 1, da) / 86400000;
  if (!Number.isFinite(v)) throw new Error(`Date de filtre illisible : "${s}"`);
  return v;
};

// Prédicat (task) => booléen pour le filtre `spec` de la colonne `col` ; null si le filtre est vide.
export function columnPredicate(col, spec, ctx, { today, weekStart = 1 } = {}) {
  if (!spec || typeof spec !== 'object') return null;
  const { model } = ctx;
  switch (col.id) {
    case 'start':
    case 'end': {
      let lo = null;
      let hi = null;
      if (spec.period) [lo, hi] = periodRange(spec.period, today, weekStart);
      else if (spec.before) hi = dayOf(spec.before) - 1;
      else if (spec.after) lo = dayOf(spec.after) + 1;
      else if (spec.from || spec.to) {
        lo = spec.from ? dayOf(spec.from) : null;
        hi = spec.to ? dayOf(spec.to) : null;
      } else return null;
      return (t) => (lo === null || t[col.id] >= lo) && (hi === null || t[col.id] <= hi);
    }
    case 'duration': {
      const min = Number.isFinite(spec.min) ? spec.min : null;
      const max = Number.isFinite(spec.max) ? spec.max : null;
      if (min === null && max === null) return null;
      return (t) => {
        const d = model.durationDays(t.id);
        return (min === null || d >= min) && (max === null || d <= max);
      };
    }
    case 'progress': {
      const states = Array.isArray(spec.states) ? spec.states : [];
      if (!states.length) return null;
      return (t) => {
        const p = model.progressOf(t.id);
        return states.includes(p <= 0 ? 'todo' : p >= 1 ? 'done' : 'doing');
      };
    }
    case 'slack': {
      if (spec.critical) return (t) => ctx.slack.get(t.id)?.critical === true;
      if (!Number.isFinite(spec.max)) return null;
      return (t) => (ctx.slack.get(t.id)?.total ?? 0) <= spec.max;
    }
    case 'owner': {
      if (!Array.isArray(spec.in) || !spec.in.length) return null;
      return (t) => spec.in.includes(t.owner ?? null);
    }
    case 'wbs': {
      const prefix = String(spec.prefix ?? '').trim();
      if (!prefix) return null;
      return (t) => {
        const n = ctx.wbs.get(t.id);
        return n === prefix || n.startsWith(`${prefix}.`);
      };
    }
    default: {
      const text = String(spec.contains ?? '').trim();
      if (!text) return null;
      const read = col.id === 'name' ? (t) => t.name : (t) => sortValue(col, t.id, ctx);
      return (t) => fold(read(t)).includes(fold(text));
    }
  }
}

// Filtres actifs des colonnes affichées → un prédicat (toutes les conditions), ou null.
export function columnsPredicate(columns, filters, ctx, opts) {
  if (!filters) return null;
  const preds = [];
  for (const col of columns) {
    const p = columnPredicate(col, filters[col.id], ctx, opts);
    if (p) preds.push(p);
  }
  return preds.length ? (t) => preds.every((p) => p(t)) : null;
}
