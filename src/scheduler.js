// Planification : en avant, une tâche trop tôt est repoussée plus tard ; en arrière, une tâche trop tard est avancée.
// `opts.direction` ('forward' | 'backward') et `opts.anchor` (jour : fin imposée, plafond de toutes les tâches en arrière).
export function computeDates(model, opts = {}) {
  const direction = opts.direction ?? model.planning.direction;
  const anchor = opts.anchor !== undefined ? opts.anchor : model.planning.end;
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
  const shift = (id, k) => {
    for (const leaf of leavesOf.get(id)) {
      const c = cur.get(leaf);
      c.start = cal.addWorkingDays(c.start, k);
      c.end = cal.addWorkingDays(c.end, k);
    }
  };
  const ceiling = direction === 'backward' && anchor !== null && anchor !== undefined ? cal.prevWorking(anchor) : null;
  const limit = (model.tasks.length + 1) * (links.length + 1) + 10;
  for (let pass = 0; ; pass++) {
    if (pass > limit) throw new Error('Planification non convergente (cycle de dépendances ?)');
    let changed = false;
    for (const link of links) {
      const a = span(link.from);
      const b = span(link.to);
      const lag = link.lag ?? 0;
      if (direction === 'forward') {
        // Jour de référence de A, puis décalage (lag) en jours travaillés ou calendaires, ramené sur un jour travaillé.
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
          shift(link.to, cal.workingDistance(current, target));
          changed = true;
        }
      } else {
        // Miroir : le bord de A ne peut pas dépasser la limite imposée par B.
        const working = cal.lagUnit === 'working';
        let edge;
        let latest;
        switch (link.type) {
          case 'FS':
            edge = 'end';
            latest = working ? cal.addWorkingDays(b.start, -(1 + lag)) : cal.addWorkingDays(cal.prevWorking(b.start - lag), -1);
            break;
          case 'SS':
            edge = 'start';
            latest = working ? cal.addWorkingDays(b.start, -lag) : cal.prevWorking(b.start - lag);
            break;
          case 'FF':
            edge = 'end';
            latest = working ? cal.addWorkingDays(b.end, -lag) : cal.prevWorking(b.end - lag);
            break;
          case 'SF':
            edge = 'start';
            latest = working ? cal.addWorkingDays(b.end, 1 - lag) : cal.addWorkingDays(cal.prevWorking(b.end - lag), 1);
            break;
          default:
            throw new Error(`Type de lien inconnu : "${link.type}"`);
        }
        if (a[edge] > latest) {
          shift(link.from, cal.workingDistance(a[edge], latest));
          changed = true;
        }
      }
    }
    if (ceiling !== null) {
      for (const [id, c] of cur) {
        if (c.end > ceiling) {
          shift(id, cal.workingDistance(c.end, ceiling));
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return cur;
}
