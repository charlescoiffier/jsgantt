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

  const links = model.links;
  const limit = (model.tasks.length + 1) * (links.length + 1) + 10;
  for (let pass = 0; ; pass++) {
    if (pass > limit) throw new Error('Planification non convergente (cycle de dépendances ?)');
    let changed = false;
    for (const link of links) {
      const a = span(link.from);
      const b = span(link.to);
      const lag = link.lag ?? 0;
      let delta;
      switch (link.type) {
        case 'FS':
          delta = a.end + 1 + lag - b.start;
          break;
        case 'SS':
          delta = a.start + lag - b.start;
          break;
        case 'FF':
          delta = a.end + lag - b.end;
          break;
        case 'SF':
          delta = a.start - 1 + lag - b.end;
          break;
        default:
          throw new Error(`Type de lien inconnu : "${link.type}"`);
      }
      if (delta > 0) {
        for (const leaf of leavesOf.get(link.to)) {
          const c = cur.get(leaf);
          c.start += delta;
          c.end += delta;
        }
        changed = true;
      }
    }
    if (!changed) break;
  }
  return cur;
}
