import { PERIODS } from './view.js';

const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
  if (text !== undefined) e.textContent = text;
  return e;
};

// Fenêtre de filtre d'une colonne, ancrée à son entonnoir. « Appliquer » (ou Entrée) fixe le filtre,
// « Effacer » le retire, Échap ferme sans rien changer.
export function openFilterEditor(g, column) {
  const col = g.layout.table.columns.find((c) => c.id === column);
  if (!col) return;
  g.root.querySelector('.gantt-popover')?.remove();
  let anchor = null;
  for (const n of g.canvas.querySelectorAll('[data-role="col-filter"]')) if (n.dataset.col === column) anchor = n;
  const host = g.root.getBoundingClientRect();
  const rect = anchor?.getBoundingClientRect() ?? host;
  const current = g.view.filters[column] ?? {};
  const uid = `${g.uid}-f`;

  const pop = el('form', { class: 'gantt-popover gantt-popover--filter', role: 'dialog', 'aria-label': col.filterTitle });
  pop.append(el('h4', {}, col.filterTitle));
  const row = (label, input) => {
    const r = el('div', { class: 'gantt-popover-row' });
    r.append(el('label', { for: input.id }, label), input);
    pop.append(r);
    return input;
  };
  const check = (label, value, checked, name) => {
    const l = el('label', { class: 'gantt-popover-check' });
    const box = el('input', { type: 'checkbox', name, value });
    box.checked = checked;
    l.append(box, document.createTextNode(` ${label}`));
    pop.append(l);
    return box;
  };
  const number = (id, value) => {
    const input = el('input', { id, type: 'number', min: 0, step: 1 });
    input.value = Number.isFinite(value) ? String(value) : '';
    return input;
  };
  const num = (input) => (input.value === '' ? undefined : Number(input.value));

  let read; // () => spec | null
  let first;
  switch (column) {
    case 'start':
    case 'end': {
      const mode = row(g.t('filter.condition'), el('select', { id: `${uid}-mode` }));
      mode.append(el('option', { value: '' }, g.t('filter.none')));
      for (const p of PERIODS) mode.append(el('option', { value: `period:${p}` }, g.t(`filter.period.${p}`)));
      for (const m of ['before', 'after', 'between']) mode.append(el('option', { value: m }, g.t(`filter.${m}`)));
      const d1 = row(g.t('filter.date'), el('input', { id: `${uid}-d1`, type: 'date' }));
      const d2 = row(g.t('filter.and'), el('input', { id: `${uid}-d2`, type: 'date' }));
      if (current.period) mode.value = `period:${current.period}`;
      else if (current.before) [mode.value, d1.value] = ['before', current.before];
      else if (current.after) [mode.value, d1.value] = ['after', current.after];
      else if (current.from || current.to) [mode.value, d1.value, d2.value] = ['between', current.from ?? '', current.to ?? ''];
      const sync = () => {
        const custom = ['before', 'after', 'between'].includes(mode.value);
        d1.parentElement.hidden = !custom;
        d2.parentElement.hidden = mode.value !== 'between';
        d1.required = custom && mode.value !== 'between';
        d1.previousSibling.textContent = g.t(mode.value === 'between' ? 'filter.from' : 'filter.date');
      };
      mode.addEventListener('change', sync);
      sync();
      read = () => {
        const v = mode.value;
        if (!v) return null;
        if (v.startsWith('period:')) return { period: v.slice(7) };
        if (v === 'before') return d1.value ? { before: d1.value } : null;
        if (v === 'after') return d1.value ? { after: d1.value } : null;
        const spec = {};
        if (d1.value) spec.from = d1.value;
        if (d2.value) spec.to = d2.value;
        return Object.keys(spec).length ? spec : null;
      };
      first = mode;
      break;
    }
    case 'duration': {
      const min = row(g.t('filter.min'), number(`${uid}-min`, current.min));
      const max = row(g.t('filter.max'), number(`${uid}-max`, current.max));
      read = () => {
        const spec = { min: num(min), max: num(max) };
        return spec.min === undefined && spec.max === undefined ? null : spec;
      };
      first = min;
      break;
    }
    case 'progress': {
      const states = current.states ?? [];
      const boxes = ['todo', 'doing', 'done'].map((s) => check(g.t(`filter.progress.${s}`), s, states.includes(s), `${uid}-p`));
      read = () => {
        const on = boxes.filter((b) => b.checked).map((b) => b.value);
        return on.length ? { states: on } : null;
      };
      first = boxes[0];
      break;
    }
    case 'slack': {
      const critical = check(g.t('filter.criticalOnly'), 'critical', current.critical === true, `${uid}-c`);
      const max = row(g.t('filter.slackMax'), number(`${uid}-smax`, current.max));
      const sync = () => {
        max.disabled = critical.checked;
      };
      critical.addEventListener('change', sync);
      sync();
      read = () => (critical.checked ? { critical: true } : num(max) !== undefined ? { max: num(max) } : null);
      first = critical;
      break;
    }
    case 'owner': {
      const chosen = current.in ?? [];
      const options = [...g.model.owners.map((o) => [o.id, o.name]), [null, g.t('filter.noOwner')]];
      const boxes = options.map(([id, name]) => check(name, id ?? '', chosen.includes(id), `${uid}-o`));
      read = () => {
        const on = boxes.filter((b) => b.checked).map((b) => b.value || null);
        return on.length ? { in: on } : null;
      };
      first = boxes[0];
      break;
    }
    case 'wbs': {
      const prefix = row(g.t('filter.prefix'), el('input', { id: `${uid}-prefix`, type: 'text', inputmode: 'decimal' }));
      prefix.value = current.prefix ?? '';
      read = () => (prefix.value.trim() ? { prefix: prefix.value.trim() } : null);
      first = prefix;
      break;
    }
    default: {
      const text = row(g.t('filter.contains'), el('input', { id: `${uid}-text`, type: 'text' }));
      text.value = current.contains ?? '';
      read = () => (text.value.trim() ? { contains: text.value.trim() } : null);
      first = text;
    }
  }

  const actions = el('div', { class: 'gantt-popover-actions' });
  const clear = el('button', { type: 'button', class: 'gantt-popover-start' }, g.t('filter.clear'));
  const apply = el('button', { type: 'submit', class: 'gantt-popover-apply' }, g.t('constraint.apply'));
  actions.append(clear, apply);
  pop.append(actions);

  // Le rendu remplace l'entonnoir : on redonne le focus au nouveau.
  const close = () => {
    pop.remove();
    for (const n of g.canvas.querySelectorAll('[data-role="col-filter"]')) if (n.dataset.col === column) n.focus({ preventScroll: true });
  };
  clear.addEventListener('click', () => {
    pop.remove();
    g.setColumnFilter(column, null);
    close();
  });
  pop.addEventListener('submit', (e) => {
    e.preventDefault();
    const spec = read();
    pop.remove();
    g.setColumnFilter(column, spec);
    close();
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
  const left = Math.min(rect.left - host.left - 8, host.width - pop.offsetWidth - 8);
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${rect.bottom - host.top + 6}px`;
  first?.focus();
}
