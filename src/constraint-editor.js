import { CONSTRAINT_TYPES } from './constraints.js';
import { fromDay } from './dates.js';

const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

// Petite fenêtre ancrée à la ligne de la tâche : type de contrainte + date. Entrée valide, Échap annule.
export function openConstraintEditor(g, id) {
  if (g.readonly) return;
  if (g.model.isGroup(id)) {
    g.refuse('constraint.group');
    return;
  }
  g.root.querySelector('.gantt-popover')?.remove();
  g.reveal(id);
  let anchor = null;
  for (const n of g.canvas.querySelectorAll('[data-role="cell-name"]')) if (n.dataset.id === id) anchor = n;
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const host = g.root.getBoundingClientRect();

  const current = g.model.constraintOf(id);
  const pop = el('form', { class: 'gantt-popover', role: 'dialog', 'aria-label': g.t('constraint.title') });
  const typeId = `${g.uid}-ct`;
  const dateId = `${g.uid}-cd`;
  pop.append(el('h4', {}, g.t('constraint.title')));

  const typeRow = el('div', { class: 'gantt-popover-row' });
  const select = el('select', { id: typeId });
  select.append(el('option', { value: '' }, g.t('constraint.none')));
  for (const type of CONSTRAINT_TYPES) select.append(el('option', { value: type }, g.t(`constraint.type.${type}`)));
  select.value = current?.type ?? '';
  typeRow.append(el('label', { for: typeId }, g.t('constraint.kind')), select);

  const dateRow = el('div', { class: 'gantt-popover-row' });
  const date = el('input', { id: dateId, type: 'date' });
  date.value = fromDay(current?.date ?? g.model.getTask(id).start);
  dateRow.append(el('label', { for: dateId }, g.t('constraint.date')), date);

  const actions = el('div', { class: 'gantt-popover-actions' });
  const remove = el('button', { type: 'button', class: 'gantt-popover-remove' }, g.t('constraint.remove'));
  const apply = el('button', { type: 'submit', class: 'gantt-popover-apply' }, g.t('constraint.apply'));
  if (current) actions.append(remove);
  actions.append(apply);
  pop.append(typeRow, dateRow, actions);

  const syncDate = () => {
    dateRow.hidden = select.value === '';
    date.required = select.value !== '';
  };
  select.addEventListener('change', syncDate);
  syncDate();

  const close = () => {
    pop.remove();
    g.scroller.focus({ preventScroll: true });
  };
  remove.addEventListener('click', () => {
    close();
    g.setConstraint(id, null);
  });
  pop.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = select.value;
    close();
    g.setConstraint(id, type === '' ? null : { type, date: date.value });
  });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  pop.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !pop.contains(e.relatedTarget)) pop.remove();
  });

  g.root.append(pop);
  pop.style.left = `${Math.max(8, rect.left - host.left + 8)}px`;
  pop.style.top = `${rect.bottom - host.top + 4}px`;
  select.focus();
}
