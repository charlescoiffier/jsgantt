import { fromDay } from './dates.js';
import { createI18n } from './i18n.js';

const FR = createI18n('fr');

const nameOf = (model, id, i18n) => model.getTask(id)?.name || i18n.t('a11y.untitled');

export function constraintText(model, id, i18n = FR) {
  const c = model.constraintOf(id);
  if (!c) return null;
  return i18n.t('constraint.text', { type: i18n.t(`constraint.type.${c.type}`), date: fromDay(c.date) });
}

export function describeTask(model, id, depth, i18n = FR) {
  const { t } = i18n;
  const task = model.getTask(id);
  const group = model.isGroup(id);
  const parts = [task.name || t('a11y.untitled')];
  if (task.milestone && !group) {
    parts.push(t('a11y.milestone', { date: fromDay(task.start) }));
  } else {
    parts.push(t('a11y.range', { start: fromDay(task.start), end: fromDay(task.end) }));
    parts.push(t('a11y.progress', { p: Math.round(model.progressOf(id) * 100) }));
  }
  parts.push(t('a11y.level', { n: depth + 1 }));
  if (group) {
    parts.push(t('a11y.group', {
      count: model.childrenOf(id).length,
      state: t(task.collapsed ? 'a11y.collapsed' : 'a11y.expanded'),
    }));
  }
  const constraint = constraintText(model, id, i18n);
  if (constraint) parts.push(t('a11y.constraint', { text: constraint }));
  if (model.violations().some((v) => v.id === id)) parts.push(t('a11y.constraintViolated'));
  const preds = model.links.filter((l) => l.to === id).map((l) => `${nameOf(model, l.from, i18n)} (${l.type})`);
  if (preds.length) parts.push(t('a11y.predecessors', { list: preds.join(', ') }));
  return parts.join(', ');
}

export function announceChange(model, detail, i18n = FR) {
  const { t } = i18n;
  const { type, id } = detail;
  const task = id ? model.getTask(id) : null;
  const name = () => nameOf(model, id, i18n);
  switch (type) {
    case 'move':
    case 'resize':
    case 'dates':
      return task ? t('a11y.rowDates', { name: name(), range: t('a11y.range', { start: fromDay(task.start), end: fromDay(task.end) }) }) : null;
    case 'progress':
      return task ? t('a11y.rowProgress', { name: name(), progress: t('a11y.progress', { p: Math.round(model.progressOf(id) * 100) }) }) : null;
    case 'add':
      return task ? t('a11y.added', { name: name() }) : t('a11y.addedBare');
    case 'rename':
      return task ? t('a11y.renamed', { name: name() }) : null;
    case 'remove':
      return t('a11y.removed');
    case 'link':
      return t('a11y.linkCreated', { from: nameOf(model, detail.from, i18n), to: nameOf(model, detail.to, i18n), type: detail.linkType });
    case 'unlink':
      return t('a11y.linkRemoved');
    case 'reorder':
      return task ? t('a11y.reordered', { name: name(), level: t('a11y.level', { n: model.ancestorsOf(id).length + 1 }) }) : null;
    case 'constraint':
      return task ? t('a11y.constraintChanged', { name: name() }) : null;
    case 'planning':
      return t('a11y.planningChanged');
    case 'align':
      return t(detail.mode === 'latest' ? 'a11y.alignedLatest' : 'a11y.alignedEarliest');
    case 'calendar':
      return t('a11y.calendarChanged');
    case 'undo':
      return t('a11y.undo');
    case 'redo':
      return t('a11y.redo');
    default:
      return null;
  }
}

export function syncAria(g) {
  const s = g.scroller;
  s.setAttribute('role', 'treegrid');
  s.setAttribute('aria-label', g.i18n.t('a11y.chart'));
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
    g.on('change', (d) => g.say(announceChange(g.model, d, g.i18n))),
    g.on('invalid', ({ reason }) => g.say(g.i18n.t('a11y.refused', { reason }))),
  ];
  return () => {
    for (const off of offs) off();
    live.remove();
    delete g.say;
  };
}
