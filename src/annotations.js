import { toDay, fromDay } from './dates.js';
import { GanttError } from './i18n.js';

// Repères (jalons de projet) et zones colorées : indicatifs, ils ne déplacent aucune tâche.
// Repère : { id, date, label, color, className } ; zone : { id, start, end, label, color, className }.

export const ANNOTATION_COLORS = ['red', 'orange', 'green', 'blue', 'purple', 'grey'];

const day = (kind, id, value) => {
  try {
    return toDay(value);
  } catch (e) {
    throw new GanttError(`${kind}.date`, { id, detail: e });
  }
};

// Champs communs (libellé, couleur, classe) d'un objet brut ; `base` : valeurs actuelles lors d'une modification.
function common(kind, id, raw, base = {}) {
  const color = 'color' in raw ? raw.color ?? null : base.color ?? null;
  if (color !== null && !ANNOTATION_COLORS.includes(color)) {
    throw new GanttError(`${kind}.color`, { id, color: String(color), list: ANNOTATION_COLORS.join(', ') });
  }
  return {
    label: 'label' in raw ? String(raw.label ?? '') : base.label ?? '',
    color,
    className: 'className' in raw ? String(raw.className ?? '') : base.className ?? '',
  };
}

function checkObject(kind, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new GanttError(`${kind}.notObject`);
}

// Repère normalisé (date en numéro de jour) ; `base` : repère existant pour une modification partielle.
export function parseMarker(raw, id, base = null) {
  checkObject('marker', raw);
  if (raw.date === undefined && !base) throw new GanttError('marker.dateRequired', { id });
  const date = raw.date === undefined ? base.date : day('marker', id, raw.date);
  return { id, date, ...common('marker', id, raw, base ?? {}) };
}

export function parseZone(raw, id, base = null) {
  checkObject('zone', raw);
  if ((raw.start === undefined || raw.end === undefined) && !base) throw new GanttError('zone.datesRequired', { id });
  const start = raw.start === undefined ? base.start : day('zone', id, raw.start);
  const end = raw.end === undefined ? base.end : day('zone', id, raw.end);
  if (end < start) throw new GanttError('zone.endBeforeStart', { id });
  return { id, start, end, ...common('zone', id, raw, base ?? {}) };
}

// Identifiant libre : prefixe + plus petit numéro non utilisé.
export function freeId(prefix, taken) {
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

const extras = (a) => ({
  ...(a.label ? { label: a.label } : {}),
  ...(a.color ? { color: a.color } : {}),
  ...(a.className ? { className: a.className } : {}),
});

export const markerToJSON = (m) => ({ id: m.id, date: fromDay(m.date), ...extras(m) });
export const zoneToJSON = (z) => ({ id: z.id, start: fromDay(z.start), end: fromDay(z.end), ...extras(z) });
