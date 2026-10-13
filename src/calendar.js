import { toDay, fromDay, dayOfWeek, dayFromYMD } from './dates.js';
import { GanttError } from './i18n.js';

export const WEEK = {
  ALL: [0, 1, 2, 3, 4, 5, 6], // calendaires : 7 jours sur 7
  OUVRES: [1, 2, 3, 4, 5], // ouvrés : lundi à vendredi
  OUVRABLES: [1, 2, 3, 4, 5, 6], // ouvrables : lundi à samedi
};

const MAX_SCAN = 3660; // ~10 ans : au-delà, le calendrier est jugé sans jour ouvré

// spec : { workingDays?: number[] (0 = dimanche … 6), holidays?: (string | { date, name? })[], lagUnit?: 'working' | 'calendar' }
export function createCalendar(spec = {}) {
  const { workingDays = WEEK.ALL, holidays = [], lagUnit = 'working' } = spec ?? {};
  if (!Array.isArray(workingDays) || workingDays.length === 0 || !workingDays.every((n) => Number.isInteger(n) && n >= 0 && n <= 6)) {
    throw new GanttError('calendar.workingDays');
  }
  if (lagUnit !== 'working' && lagUnit !== 'calendar') throw new GanttError('calendar.lagUnit');
  const days = [...new Set(workingDays)].sort((a, b) => a - b);
  const hol = new Map();
  for (const h of holidays) {
    const entry = typeof h === 'string' ? { date: h } : h;
    if (!entry || typeof entry !== 'object' || typeof entry.date !== 'string') throw new GanttError('calendar.holiday');
    hol.set(toDay(entry.date), entry.name ?? null);
  }
  const daySet = new Set(days);
  const isDefault = days.length === 7 && hol.size === 0;

  const isWorking = (day) => daySet.has(dayOfWeek(day)) && !hol.has(day);
  const nextWorking = (day) => {
    for (let i = 0; i < MAX_SCAN; i++) if (isWorking(day + i)) return day + i;
    throw new GanttError('calendar.noWorkingDay');
  };
  const prevWorking = (day) => {
    for (let i = 0; i < MAX_SCAN; i++) if (isWorking(day - i)) return day - i;
    throw new GanttError('calendar.noWorkingDay');
  };
  const addWorkingDays = (day, n) => {
    if (isDefault) return day + n;
    if (n === 0) return nextWorking(day);
    let d = day;
    for (let k = 0; k < Math.abs(n); k++) d = n > 0 ? nextWorking(d + 1) : prevWorking(d - 1);
    return d;
  };
  const workingDaysBetween = (a, b) => {
    if (b < a) return 0;
    if (isDefault) return b - a + 1;
    let count = 0;
    for (let d = a; d <= b; d++) if (isWorking(d)) count++;
    return count;
  };
  // Nombre de jours ouvrés dont il faut avancer (ou reculer, si négatif) de a pour atteindre b (a et b ouvrés).
  const workingDistance = (a, b) => {
    if (isDefault) return b - a;
    if (b >= a) return workingDaysBetween(a + 1, b);
    return -workingDaysBetween(b + 1, a);
  };

  return {
    workingDays: days,
    lagUnit,
    isDefault,
    isWorking,
    isHoliday: (day) => hol.has(day),
    holidayName: (day) => hol.get(day) ?? null,
    nextWorking,
    prevWorking,
    addWorkingDays,
    workingDaysBetween,
    workingDistance,
    toJSON() {
      if (isDefault) return null;
      return {
        workingDays: days,
        holidays: [...hol.entries()]
          .sort((x, y) => x[0] - y[0])
          .map(([day, name]) => (name === null ? { date: fromDay(day) } : { date: fromDay(day), name })),
        lagUnit,
      };
    },
  };
}

// --- Jours fériés ---

function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayFromYMD(year, month - 1, day);
}

function years(arg) {
  const list = Array.isArray(arg) ? arg : [arg];
  for (const y of list) if (!Number.isInteger(y)) throw new GanttError('calendar.year', { year: String(y) });
  return list;
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function frenchHolidays(yearOrYears) {
  const out = [];
  for (const y of years(yearOrYears)) {
    const e = easter(y);
    const fixed = (month, day) => fromDay(dayFromYMD(y, month - 1, day));
    out.push(
      { date: fixed(1, 1), name: "Jour de l'an" },
      { date: fromDay(e + 1), name: 'Lundi de Pâques' },
      { date: fixed(5, 1), name: 'Fête du Travail' },
      { date: fixed(5, 8), name: 'Victoire 1945' },
      { date: fromDay(e + 39), name: 'Ascension' },
      { date: fromDay(e + 50), name: 'Lundi de Pentecôte' },
      { date: fixed(7, 14), name: 'Fête nationale' },
      { date: fixed(8, 15), name: 'Assomption' },
      { date: fixed(11, 1), name: 'Toussaint' },
      { date: fixed(11, 11), name: 'Armistice 1918' },
      { date: fixed(12, 25), name: 'Noël' },
    );
  }
  return out.sort(byDate);
}

// n-ième jour de la semaine d'un mois (n = -1 : le dernier) ; weekday : 0 = dimanche.
function nthWeekday(year, month0, weekday, n) {
  if (n > 0) {
    const first = dayFromYMD(year, month0, 1);
    return first + ((weekday - dayOfWeek(first) + 7) % 7) + (n - 1) * 7;
  }
  const last = dayFromYMD(year, month0 + 1, 1) - 1;
  return last - ((dayOfWeek(last) - weekday + 7) % 7);
}

// Jours fériés fédéraux des États-Unis ; un férié à date fixe tombant un samedi est reporté au vendredi, un dimanche au lundi.
export function americanHolidays(yearOrYears) {
  const out = [];
  for (const y of years(yearOrYears)) {
    const fixed = (month, day, name) => {
      const day0 = dayFromYMD(y, month - 1, day);
      const dow = dayOfWeek(day0);
      if (dow === 6) out.push({ date: fromDay(day0 - 1), name: `${name} (observed)` });
      else if (dow === 0) out.push({ date: fromDay(day0 + 1), name: `${name} (observed)` });
      else out.push({ date: fromDay(day0), name });
    };
    const nth = (month0, weekday, n, name) => out.push({ date: fromDay(nthWeekday(y, month0, weekday, n)), name });
    fixed(1, 1, "New Year's Day");
    nth(0, 1, 3, 'Martin Luther King Jr. Day');
    nth(1, 1, 3, "Presidents' Day");
    nth(4, 1, -1, 'Memorial Day');
    fixed(6, 19, 'Juneteenth');
    fixed(7, 4, 'Independence Day');
    nth(8, 1, 1, 'Labor Day');
    nth(9, 1, 2, 'Columbus Day');
    fixed(11, 11, 'Veterans Day');
    nth(10, 4, 4, 'Thanksgiving');
    fixed(12, 25, 'Christmas Day');
  }
  return out.sort(byDate);
}
