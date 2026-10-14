import { COLORS } from './colors.js';
import { fromDay } from './dates.js';

const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

// Petite fenêtre ancrée à l'étiquette d'un repère ou d'une zone : libellé, date(s), couleur.
// Entrée valide, Échap annule, « Supprimer » retire l'élément.
export function openAnnotationEditor(g, kind, id) {
  if (g.readonly) return;
  const item = (kind === 'marker' ? g.model.markers : g.model.zones).find((a) => a.id === id);
  if (!item) return;
  g.root.querySelector('.gantt-popover')?.remove();
  let anchor = null;
  for (const n of g.canvas.querySelectorAll(`[data-role="${kind}"]`)) if (n.dataset[`${kind}Id`] === id) anchor = n;
  anchor?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const host = g.root.getBoundingClientRect();
  const rect = anchor?.getBoundingClientRect() ?? host;

  const title = g.t(`${kind}.edit`);
  const pop = el('form', { class: 'gantt-popover', role: 'dialog', 'aria-label': title });
  pop.append(el('h4', {}, title));
  const row = (labelKey, input) => {
    const r = el('div', { class: 'gantt-popover-row' });
    r.append(el('label', { for: input.id }, g.t(labelKey)), input);
    pop.append(r);
    return input;
  };
  const label = row('annotation.label', el('input', { id: `${g.uid}-al`, type: 'text' }));
  label.value = item.label;
  const dates = kind === 'marker'
    ? { date: row('annotation.date', el('input', { id: `${g.uid}-ad`, type: 'date', required: '' })) }
    : {
        start: row('annotation.start', el('input', { id: `${g.uid}-as`, type: 'date', required: '' })),
        end: row('annotation.end', el('input', { id: `${g.uid}-ae`, type: 'date', required: '' })),
      };
  for (const [key, input] of Object.entries(dates)) input.value = fromDay(item[key]);
  const color = row('annotation.color', el('select', { id: `${g.uid}-ac` }));
  color.append(el('option', { value: '' }, g.t('color.none')));
  for (const c of COLORS) color.append(el('option', { value: c }, g.t(`color.${c}`)));
  color.value = item.color ?? '';

  const actions = el('div', { class: 'gantt-popover-actions' });
  const remove = el('button', { type: 'button', class: 'gantt-popover-remove' }, g.t('annotation.remove'));
  const apply = el('button', { type: 'submit', class: 'gantt-popover-apply' }, g.t('constraint.apply'));
  actions.append(remove, apply);
  pop.append(actions);

  const close = () => {
    pop.remove();
    g.scroller.focus({ preventScroll: true });
  };
  remove.addEventListener('click', () => {
    close();
    if (kind === 'marker') g.removeMarker(id);
    else g.removeZone(id);
  });
  pop.addEventListener('submit', (e) => {
    e.preventDefault();
    const patch = { label: label.value.trim(), color: color.value || null };
    for (const [key, input] of Object.entries(dates)) patch[key] = input.value;
    close();
    if (kind === 'marker') g.updateMarker(id, patch);
    else g.updateZone(id, patch);
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
  const left = Math.min(rect.left - host.left, host.width - pop.offsetWidth - 8);
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${rect.bottom - host.top + 4}px`;
  label.focus();
  label.select();
}
