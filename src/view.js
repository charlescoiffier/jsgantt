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
export function viewRows(model, { sort = null, filter = null, columns = null, ctx = null } = {}) {
  let keep = null;
  if (filter !== null && filter !== undefined && filter !== '') {
    const test = typeof filter === 'function' ? filter : (t) => matchesText(t, filter);
    keep = new Set();
    for (const t of model.tasks) {
      if (!test(t)) continue;
      keep.add(t.id);
      for (const a of model.ancestorsOf(t.id)) keep.add(a);
    }
  }
  const col = sort ? (columns ?? normalizeColumns(BUILTIN_COLUMNS)).find((c) => c.id === sort.column) : null;
  const context = ctx ?? viewContext(model);
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
