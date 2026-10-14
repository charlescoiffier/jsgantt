import { COLORS } from './colors.js';
import { CONSTRAINT_TYPES } from './constraints.js';
import { fromDay } from './dates.js';
import { deleteQuestion, removeAndSelectNeighbor } from './confirm.js';

const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
  if (text !== undefined) e.textContent = text;
  return e;
};

// Fenêtre « Tâche » ancrée à la ligne : nom, dates, avancement, couleur, responsable, contrainte.
// « Appliquer » enregistre tout en une seule action annulable ; Échap annule.
export function openTaskEditor(g, id) {
  if (g.readonly) return;
  const task = g.model.getTask(id);
  if (!task) return;
  g.root.querySelector('.gantt-popover')?.remove();
  g.reveal(id);
  let anchor = null;
  for (const n of g.canvas.querySelectorAll('[data-role="cell-name"]')) if (n.dataset.id === id) anchor = n;
  const host = g.root.getBoundingClientRect();
  const rect = anchor?.getBoundingClientRect() ?? host;
  const group = g.model.isGroup(id);
  const milestone = task.milestone && !group;
  const uid = `${g.uid}-te`;

  const pop = el('form', { class: 'gantt-popover gantt-popover--task', role: 'dialog', 'aria-label': g.t('task.edit') });
  pop.append(el('h4', {}, g.t('task.edit')));
  const row = (labelKey, input, extraClass) => {
    const r = el('div', { class: `gantt-popover-row${extraClass ? ` ${extraClass}` : ''}` });
    r.append(el('label', { for: input.id }, g.t(labelKey)), input);
    pop.append(r);
    return input;
  };

  const name = row('ui.name', el('input', { id: `${uid}-name`, type: 'text' }));
  name.value = task.name;

  let start = null;
  let end = null;
  let progress = null;
  if (!group) {
    const dates = el('div', { class: 'gantt-popover-pair' });
    pop.append(dates);
    const pair = (labelKey, input) => {
      const r = el('div', { class: 'gantt-popover-row' });
      r.append(el('label', { for: input.id }, g.t(labelKey)), input);
      dates.append(r);
      return input;
    };
    start = pair(milestone ? 'annotation.date' : 'ui.start', el('input', { id: `${uid}-start`, type: 'date', required: true }));
    start.value = fromDay(task.start);
    if (!milestone) {
      end = pair('ui.end', el('input', { id: `${uid}-end`, type: 'date', required: true }));
      end.value = fromDay(task.end);
      progress = row('ui.progress', el('input', { id: `${uid}-progress`, type: 'number', min: 0, max: 100, step: 5 }));
      progress.value = String(Math.round(task.progress * 100));
    }
  }

  // Couleur : pastilles (boutons radio natifs, donc flèches du clavier).
  const colorSet = el('fieldset', { class: 'gantt-swatches' });
  colorSet.append(el('legend', {}, g.t('annotation.color')));
  for (const c of [null, ...COLORS]) {
    const label = el('label', { class: `gantt-swatch${c ? ` gantt-swatch--${c}` : ' gantt-swatch--none'}`, title: g.t(`color.${c ?? 'none'}`) });
    const radio = el('input', { type: 'radio', name: `${uid}-color`, value: c ?? '', 'aria-label': g.t(`color.${c ?? 'none'}`) });
    radio.checked = (task.color ?? null) === c;
    label.append(radio, el('span', { 'aria-hidden': 'true' }));
    colorSet.append(label);
  }
  pop.append(colorSet);

  const owner = row('ui.owner', el('select', { id: `${uid}-owner` }));
  owner.append(el('option', { value: '' }, g.t('owner.none')));
  for (const o of g.model.owners) owner.append(el('option', { value: o.id }, o.name));
  owner.value = task.owner ?? '';

  let ctype = null;
  let cdate = null;
  if (!group) {
    const current = g.model.constraintOf(id);
    ctype = row('constraint.title', el('select', { id: `${uid}-ctype` }));
    ctype.append(el('option', { value: '' }, g.t('constraint.none')));
    for (const type of CONSTRAINT_TYPES) ctype.append(el('option', { value: type }, g.t(`constraint.type.${type}`)));
    ctype.value = current?.type ?? '';
    cdate = row('constraint.date', el('input', { id: `${uid}-cdate`, type: 'date' }));
    cdate.value = fromDay(current?.date ?? task.start);
    const sync = () => {
      cdate.parentElement.hidden = ctype.value === '';
      cdate.required = ctype.value !== '';
    };
    ctype.addEventListener('change', sync);
    sync();
  }

  const actions = el('div', { class: 'gantt-popover-actions' });
  const remove = el('button', { type: 'button', class: 'gantt-popover-remove gantt-popover-start' }, g.t('task.delete'));
  const cancel = el('button', { type: 'button' }, g.t('task.cancel'));
  const apply = el('button', { type: 'submit', class: 'gantt-popover-apply' }, g.t('constraint.apply'));
  actions.append(remove, cancel, apply);
  // Confirmation de suppression : remplace le pied de la fenêtre.
  const confirm = el('div', { class: 'gantt-popover-confirm', role: 'alert', hidden: true });
  const question = el('p', { class: 'gantt-popover-text' });
  const confirmActions = el('div', { class: 'gantt-popover-actions' });
  const keep = el('button', { type: 'button' }, g.t('task.cancel'));
  const doRemove = el('button', { type: 'button', class: 'gantt-popover-danger' }, g.t('task.delete'));
  confirmActions.append(keep, doRemove);
  confirm.append(question, confirmActions);
  pop.append(actions, confirm);
  const asking = (on) => {
    actions.hidden = on;
    confirm.hidden = !on;
    if (on) {
      question.textContent = deleteQuestion(g, id);
      doRemove.focus();
    } else remove.focus();
  };
  remove.addEventListener('click', () => {
    if (g.confirmDelete) asking(true);
    else {
      close();
      removeAndSelectNeighbor(g, id);
    }
  });
  keep.addEventListener('click', () => asking(false));
  doRemove.addEventListener('click', () => {
    close();
    removeAndSelectNeighbor(g, id);
  });

  const close = () => {
    pop.remove();
    g.scroller.focus({ preventScroll: true });
  };
  cancel.addEventListener('click', close);
  pop.addEventListener('submit', (e) => {
    e.preventDefault();
    const patch = {
      name: name.value.trim(),
      color: pop.querySelector(`input[name="${uid}-color"]:checked`)?.value || null,
      owner: owner.value || null,
    };
    if (start) {
      patch.start = start.value;
      patch.end = end ? end.value : start.value;
    }
    if (progress) patch.progress = Math.min(100, Math.max(0, Number(progress.value) || 0)) / 100;
    if (ctype) patch.constraint = ctype.value ? { type: ctype.value, date: cdate.value } : null;
    // Un refus garde la fenêtre ouverte pour corriger.
    if (g.updateTaskProps(id, patch).ok) close();
  });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm.hidden) asking(false);
      else close();
    }
  });
  pop.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !pop.contains(e.relatedTarget)) pop.remove();
  });

  g.root.append(pop);
  pop.style.left = `${Math.max(8, rect.left - host.left + 8)}px`;
  // Sous la ligne s'il y a la place, sinon au-dessus.
  let top = rect.bottom - host.top + 4;
  if (top + pop.offsetHeight > Math.max(host.height, window.innerHeight - host.top)) top = Math.max(8, rect.top - host.top - pop.offsetHeight - 4);
  pop.style.top = `${top}px`;
  name.focus();
  name.select();
}
