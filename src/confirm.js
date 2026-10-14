import { neighborAfterRemoval } from './keynav.js';

const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

// Texte de confirmation : nom de la tâche et nombre de sous-tâches emportées.
export function deleteQuestion(g, id) {
  const name = g.model.getTask(id)?.name || g.t('a11y.untitled');
  const count = g.model.descendantsOf(id).length;
  return count ? g.t('task.deleteConfirmTree', { name, count }) : g.t('task.deleteConfirm', { name });
}

// Supprime la tâche puis sélectionne la ligne voisine visible.
export function removeAndSelectNeighbor(g, id) {
  const neighbor = neighborAfterRemoval(g.model, id, g.layout.rows.map((r) => r.id));
  const res = g.removeTask(id);
  if (res.ok && neighbor) {
    g.select(neighbor, null);
    g.reveal(neighbor);
  }
  return res;
}

// Petite fenêtre « Supprimer … ? » sous la ligne ; le focus est sur « Supprimer » (Suppr puis Entrée), Échap annule.
export function openDeleteConfirm(g, id) {
  if (!g.model.getTask(id)) return;
  g.root.querySelector('.gantt-popover')?.remove();
  g.reveal(id);
  let anchor = null;
  for (const n of g.canvas.querySelectorAll('[data-role="cell-name"]')) if (n.dataset.id === id) anchor = n;
  const host = g.root.getBoundingClientRect();
  const rect = anchor?.getBoundingClientRect() ?? host;
  const pop = el('div', { class: 'gantt-popover gantt-popover--confirm', role: 'alertdialog', 'aria-label': g.t('task.delete') });
  const text = el('p', { class: 'gantt-popover-text', id: `${g.uid}-confirm-text` }, deleteQuestion(g, id));
  pop.setAttribute('aria-describedby', text.id);
  const actions = el('div', { class: 'gantt-popover-actions' });
  const cancel = el('button', { type: 'button' }, g.t('task.cancel'));
  const ok = el('button', { type: 'button', class: 'gantt-popover-danger' }, g.t('task.delete'));
  actions.append(cancel, ok);
  pop.append(text, actions);
  const close = () => {
    pop.remove();
    g.scroller.focus({ preventScroll: true });
  };
  cancel.addEventListener('click', close);
  ok.addEventListener('click', () => {
    close();
    removeAndSelectNeighbor(g, id);
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
  ok.focus();
}
