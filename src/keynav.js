export function rowNav(ids, current, key) {
  if (ids.length === 0) return null;
  const i = ids.indexOf(current);
  switch (key) {
    case 'ArrowDown':
      return i === -1 ? ids[0] : ids[Math.min(ids.length - 1, i + 1)];
    case 'ArrowUp':
      return i === -1 ? ids[ids.length - 1] : ids[Math.max(0, i - 1)];
    case 'Home':
      return ids[0];
    case 'End':
      return ids[ids.length - 1];
    default:
      return current;
  }
}

export function treeKey(model, id, key) {
  const task = model.getTask(id);
  const group = model.isGroup(id);
  if (key === 'ArrowRight') {
    if (!group) return null;
    if (task.collapsed) return { action: 'expand' };
    return { action: 'select', id: model.childrenOf(id)[0].id };
  }
  if (key === 'ArrowLeft') {
    if (group && !task.collapsed) return { action: 'collapse' };
    return task.parentId !== null ? { action: 'select', id: task.parentId } : null;
  }
  return null;
}

export function neighborAfterRemoval(model, id) {
  const rows = model.visibleRows().map((r) => r.id);
  const family = new Set([id, ...model.descendantsOf(id)]);
  const i = rows.indexOf(id);
  const after = rows.slice(i + 1).find((r) => !family.has(r));
  if (after !== undefined) return after;
  const before = rows.slice(0, i).pop();
  return before ?? null;
}

export function structureMove(model, id, kind) {
  const t = model.getTask(id);
  const sibs = model.childrenOf(t.parentId);
  const i = sibs.findIndex((s) => s.id === id);
  switch (kind) {
    case 'up':
      return i > 0 ? { parentId: t.parentId, beforeId: sibs[i - 1].id } : null;
    case 'down':
      return i < sibs.length - 1 ? { parentId: t.parentId, beforeId: sibs[i + 2]?.id ?? null } : null;
    case 'indent':
      return i > 0 ? { parentId: sibs[i - 1].id, beforeId: null } : null;
    case 'outdent': {
      if (t.parentId === null) return null;
      const parent = model.getTask(t.parentId);
      const ps = model.childrenOf(parent.parentId);
      const pi = ps.findIndex((s) => s.id === parent.id);
      return { parentId: parent.parentId, beforeId: ps[pi + 1]?.id ?? null };
    }
    default:
      throw new Error(`Mouvement inconnu : "${kind}"`);
  }
}

export function cycleLinks(model, id, currentLinkId) {
  const ids = model.links.filter((l) => l.from === id || l.to === id).map((l) => l.id);
  if (ids.length === 0) return null;
  const i = ids.indexOf(currentLinkId);
  return ids[(i + 1) % ids.length];
}

const LINK_KEYS = { 1: 'FS', 2: 'SS', 3: 'FF', 4: 'SF', Enter: 'FS' };

export function linkTypeForKey(key) {
  return LINK_KEYS[key] ?? null;
}
