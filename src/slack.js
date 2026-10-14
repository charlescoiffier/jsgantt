import { computeDates, latestEdge } from './scheduler.js';

// Marges et chemin critique, en jours ouvrés, sans modifier le modèle.
// Fin de référence : la fin imposée en planification en arrière, sinon la fin la plus tardive du projet.
// Renvoie Map id → { total, free, lateStart, lateEnd, critical } pour chaque tâche et chaque groupe.
export function computeSlack(model) {
  const out = new Map();
  const cal = model.calendar;
  const leaves = model.tasks.filter((t) => !model.isGroup(t.id));
  if (leaves.length === 0) return out;
  const { direction, end } = model.planning;
  const refEnd = direction === 'backward' && end !== null ? end : Math.max(...leaves.map((t) => t.end));
  const anchor = cal.prevWorking(refEnd);

  // Dates au plus tard : toutes les tâches finissent à la fin de référence, puis les liens les ramènent plus tôt.
  const initial = new Map();
  for (const t of leaves) {
    const k = cal.workingDistance(t.end, anchor);
    initial.set(t.id, { start: cal.addWorkingDays(t.start, k), end: anchor });
  }
  const late = computeDates(model, { direction: 'backward', anchor: refEnd, initial });

  const span = (id) => model.getTask(id);
  const gap = new Map();
  for (const { link, edge, value } of linkGaps(model)) {
    const prev = gap.get(link.from);
    gap.set(link.from, prev ? [...prev, { edge, value }] : [{ edge, value }]);
  }

  for (const t of leaves) {
    const l = late.get(t.id);
    const total = cal.workingDistance(t.end, l.end);
    // Marge libre : limitée par les liens de la tâche et par ceux de ses groupes (bord du groupe à atteindre en plus).
    let free = total;
    for (const owner of [t.id, ...model.ancestorsOf(t.id)]) {
      const o = span(owner);
      for (const g of gap.get(owner) ?? []) free = Math.min(free, g.value + cal.workingDistance(t[g.edge], o[g.edge]));
    }
    out.set(t.id, { total, free, lateStart: l.start, lateEnd: l.end, critical: total <= 0 && t.progress < 1 });
  }

  for (const t of model.tasks) {
    if (!model.isGroup(t.id)) continue;
    const ids = model.leafIdsUnder(t.id);
    if (ids.length === 0) continue;
    const items = ids.map((id) => out.get(id));
    const total = Math.min(...items.map((s) => s.total));
    let free = total;
    for (const g of gap.get(t.id) ?? []) free = Math.min(free, g.value);
    out.set(t.id, {
      total,
      free,
      lateStart: Math.min(...items.map((s) => s.lateStart)),
      lateEnd: Math.max(...items.map((s) => s.lateEnd)),
      critical: items.some((s) => s.critical),
    });
  }
  return out;
}

// Écart (jours ouvrés) entre le bord de la source de chaque lien et la limite que lui impose sa cible, aux dates actuelles.
function linkGaps(model) {
  const cal = model.calendar;
  return model.links.map((link) => {
    const a = model.getTask(link.from);
    const { edge, latest } = latestEdge(cal, link, model.getTask(link.to));
    return { link, edge, value: cal.workingDistance(a[edge], latest) };
  });
}

// Liens du chemin critique : entre deux tâches critiques et sans écart. `slack` : résultat de computeSlack.
export function criticalLinkIds(model, slack = computeSlack(model)) {
  const ids = new Set();
  for (const { link, value } of linkGaps(model)) {
    if (value <= 0 && slack.get(link.from)?.critical && slack.get(link.to)?.critical) ids.add(link.id);
  }
  return ids;
}
