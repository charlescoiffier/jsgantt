export function computeDates(model) {
  const cur = new Map();
  const leavesOf = new Map();
  for (const t of model.tasks) {
    leavesOf.set(t.id, model.leafIdsUnder(t.id));
    if (!model.isGroup(t.id)) cur.set(t.id, { start: t.start, end: t.end });
  }
  const span = (id) => {
    let start = Infinity;
    let end = -Infinity;
    for (const leaf of leavesOf.get(id)) {
      const c = cur.get(leaf);
      if (c.start < start) start = c.start;
      if (c.end > end) end = c.end;
    }
    return { start, end };
  };

  const cal = model.calendar;
  const links = model.links;
  const limit = (model.tasks.length + 1) * (links.length + 1) + 10;
  for (let pass = 0; ; pass++) {
    if (pass > limit) throw new Error('Planification non convergente (cycle de dépendances ?)');
    let changed = false;
    for (const link of links) {
      const a = span(link.from);
      const b = span(link.to);
      const lag = link.lag ?? 0;
      // Jour de référence de A, puis décalage (lag) en jours ouvrés ou calendaires, ramené sur un jour ouvré.
      let base;
      let current;
      switch (link.type) {
        case 'FS':
          base = cal.addWorkingDays(a.end, 1);
          current = b.start;
          break;
        case 'SS':
          base = a.start;
          current = b.start;
          break;
        case 'FF':
          base = a.end;
          current = b.end;
          break;
        case 'SF':
          base = cal.addWorkingDays(a.start, -1);
          current = b.end;
          break;
        default:
          throw new Error(`Type de lien inconnu : "${link.type}"`);
      }
      const target = cal.lagUnit === 'working' ? cal.addWorkingDays(base, lag) : cal.nextWorking(base + lag);
      if (current < target) {
        const k = cal.workingDistance(current, target);
        for (const leaf of leavesOf.get(link.to)) {
          const c = cur.get(leaf);
          c.start = cal.addWorkingDays(c.start, k);
          c.end = cal.addWorkingDays(c.end, k);
        }
        changed = true;
      }
    }
    if (!changed) break;
  }
  return cur;
}
