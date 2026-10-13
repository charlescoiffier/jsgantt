import { GanttError } from './i18n.js';

const MS = 86400000;

function utc(year, month, day) {
  const d = new Date(0);
  d.setUTCFullYear(year, month, day);
  return d;
}

export function toDay(str) {
  const m = typeof str === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(str) : null;
  if (!m) throw new GanttError('date.format', { value: JSON.stringify(str) ?? 'undefined' });
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const d = utc(year, month, day);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) {
    throw new GanttError('date.nonexistent', { value: JSON.stringify(str) });
  }
  return d.getTime() / MS;
}

export function fromDay(n) {
  return new Date(n * MS).toISOString().slice(0, 10);
}

export function dayOfWeek(n) {
  return new Date(n * MS).getUTCDay();
}

export function ymd(n) {
  const d = new Date(n * MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

export function dayFromYMD(year, month, day) {
  return utc(year, month, day).getTime() / MS;
}
