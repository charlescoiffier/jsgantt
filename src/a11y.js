import { fromDay } from './dates.js';

const T = {
  untitled: 'Tâche sans nom',
  level: (n) => `niveau ${n}`,
  progress: (p) => `progression ${Math.round(p * 100)} %`,
  milestone: (d) => `jalon le ${d}`,
  range: (a, b) => `du ${a} au ${b}`,
  group: (n, collapsed) => `groupe de ${n} tâche${n > 1 ? 's' : ''}, ${collapsed ? 'replié' : 'déplié'}`,
  predecessors: (list) => `prédécesseurs : ${list}`,
  added: 'Tâche ajoutée',
  removed: 'Tâche supprimée',
  renamed: 'Tâche renommée',
  linkCreated: 'Lien créé',
  linkRemoved: 'Lien supprimé',
  undo: 'Annulé',
  redo: 'Rétabli',
  refused: 'Action refusée',
};

const nameOf = (model, id) => model.getTask(id)?.name || T.untitled;

export function describeTask(model, id, depth) {
  const t = model.getTask(id);
  const group = model.isGroup(id);
  const parts = [t.name || T.untitled];
  if (t.milestone && !group) {
    parts.push(T.milestone(fromDay(t.start)));
  } else {
    parts.push(T.range(fromDay(t.start), fromDay(t.end)));
    parts.push(T.progress(model.progressOf(id)));
  }
  parts.push(T.level(depth + 1));
  if (group) parts.push(T.group(model.childrenOf(id).length, t.collapsed));
  const preds = model.links.filter((l) => l.to === id).map((l) => `${nameOf(model, l.from)} (${l.type})`);
  if (preds.length) parts.push(T.predecessors(preds.join(', ')));
  return parts.join(', ');
}

export function announceChange(model, detail) {
  const { type, id } = detail;
  const task = id ? model.getTask(id) : null;
  switch (type) {
    case 'move':
    case 'resize':
    case 'dates':
      return task ? `${nameOf(model, id)} : ${T.range(fromDay(task.start), fromDay(task.end))}` : null;
    case 'progress':
      return task ? `${nameOf(model, id)} : ${T.progress(model.progressOf(id))}` : null;
    case 'add':
      return task ? `${T.added} : ${nameOf(model, id)}` : T.added;
    case 'rename':
      return task ? `${T.renamed} : ${nameOf(model, id)}` : null;
    case 'remove':
      return T.removed;
    case 'link':
      return `${T.linkCreated} : ${nameOf(model, detail.from)} vers ${nameOf(model, detail.to)} (${detail.linkType})`;
    case 'unlink':
      return T.linkRemoved;
    case 'reorder':
      return task ? `${nameOf(model, id)} déplacée, ${T.level(model.ancestorsOf(id).length + 1)}` : null;
    case 'undo':
      return T.undo;
    case 'redo':
      return T.redo;
    default:
      return null;
  }
}

export function syncAria(g) {
  const s = g.scroller;
  s.setAttribute('role', 'treegrid');
  s.setAttribute('aria-label', 'Diagramme de Gantt');
  s.setAttribute('aria-rowcount', String(g.layout.rows.length));
  const i = g.layout.rows.findIndex((r) => r.id === g.state.selectedId);
  if (i === -1) s.removeAttribute('aria-activedescendant');
  else s.setAttribute('aria-activedescendant', `${g.uid}-row-${i}`);
}

export function attachA11y(g) {
  const live = document.createElement('div');
  live.className = 'gantt-live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  g.root.append(live);
  let flip = false;
  g.say = (message) => {
    if (!message) return;
    flip = !flip;
    live.textContent = message + (flip ? '' : ' ');
  };
  const offs = [
    g.on('change', (d) => g.say(announceChange(g.model, d))),
    g.on('invalid', ({ reason }) => g.say(`${T.refused} : ${reason}`)),
  ];
  return () => {
    for (const off of offs) off();
    live.remove();
    delete g.say;
  };
}
