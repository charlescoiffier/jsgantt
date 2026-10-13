import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar, WEEK, frenchHolidays, americanHolidays } from '../src/calendar.js';
import { toDay, fromDay } from '../src/dates.js';

const d = (s) => toDay(s);
const f = (n) => fromDay(n);
const ouvres = (holidays = []) => createCalendar({ workingDays: WEEK.OUVRES, holidays });

test('calendrier par défaut : tous les jours sont ouvrés', () => {
  const c = createCalendar();
  assert.equal(c.isDefault, true);
  assert.equal(c.isWorking(d('2026-10-10')), true); // samedi
  assert.equal(c.addWorkingDays(d('2026-10-05'), 3), d('2026-10-08'));
  assert.equal(c.workingDistance(d('2026-10-05'), d('2026-10-12')), 7);
  assert.equal(c.toJSON(), null);
});

test('préréglages', () => {
  assert.deepEqual(WEEK.OUVRES, [1, 2, 3, 4, 5]);
  assert.deepEqual(WEEK.OUVRABLES, [1, 2, 3, 4, 5, 6]);
  assert.equal(WEEK.ALL.length, 7);
});

test('isWorking : week-ends et jours fériés', () => {
  const c = ouvres([{ date: '2026-10-12', name: 'Férié' }]);
  assert.equal(c.isDefault, false);
  assert.equal(c.isWorking(d('2026-10-09')), true); // vendredi
  assert.equal(c.isWorking(d('2026-10-10')), false); // samedi
  assert.equal(c.isWorking(d('2026-10-11')), false); // dimanche
  assert.equal(c.isWorking(d('2026-10-12')), false); // férié un lundi
  assert.equal(c.holidayName(d('2026-10-12')), 'Férié');
  assert.equal(c.holidayName(d('2026-10-13')), null);
});

test('ouvrables : seul le dimanche et les fériés sont exclus', () => {
  const c = createCalendar({ workingDays: WEEK.OUVRABLES, holidays: ['2026-10-13'] });
  assert.equal(c.isWorking(d('2026-10-10')), true); // samedi
  assert.equal(c.isWorking(d('2026-10-11')), false); // dimanche
  assert.equal(c.isWorking(d('2026-10-13')), false); // mardi férié
});

test('nextWorking et prevWorking', () => {
  const c = ouvres(['2026-10-12']);
  assert.equal(f(c.nextWorking(d('2026-10-09'))), '2026-10-09');
  assert.equal(f(c.nextWorking(d('2026-10-10'))), '2026-10-13'); // samedi -> lundi férié -> mardi
  assert.equal(f(c.prevWorking(d('2026-10-12'))), '2026-10-09');
  assert.equal(f(c.prevWorking(d('2026-10-14'))), '2026-10-14');
});

test('addWorkingDays : avant, arrière, zéro', () => {
  const c = ouvres(['2026-10-12']);
  assert.equal(f(c.addWorkingDays(d('2026-10-09'), 1)), '2026-10-13'); // vendredi + 1 = mardi (lundi férié)
  assert.equal(f(c.addWorkingDays(d('2026-10-09'), 5)), '2026-10-19');
  assert.equal(f(c.addWorkingDays(d('2026-10-13'), -1)), '2026-10-09');
  assert.equal(f(c.addWorkingDays(d('2026-10-14'), 0)), '2026-10-14');
  assert.equal(f(c.addWorkingDays(d('2026-10-10'), 0)), '2026-10-13'); // jour non ouvré : ramené en avant
});

test('workingDistance et workingDaysBetween', () => {
  const c = ouvres();
  assert.equal(c.workingDistance(d('2026-10-09'), d('2026-10-12')), 1); // vendredi -> lundi
  assert.equal(c.workingDistance(d('2026-10-12'), d('2026-10-09')), -1);
  assert.equal(c.workingDistance(d('2026-10-05'), d('2026-10-05')), 0);
  assert.equal(c.workingDaysBetween(d('2026-10-05'), d('2026-10-14')), 8); // 5-9 et 12-14
  assert.equal(c.workingDaysBetween(d('2026-10-10'), d('2026-10-11')), 0);
});

test('erreurs de configuration', () => {
  assert.throws(() => createCalendar({ workingDays: [] }), /workingDays/);
  assert.throws(() => createCalendar({ workingDays: [7] }), /workingDays/);
  assert.throws(() => createCalendar({ workingDays: [1.5] }), /workingDays/);
  assert.throws(() => createCalendar({ lagUnit: 'heures' }), /lagUnit/);
  assert.throws(() => createCalendar({ holidays: ['2026-02-30'] }), /Date invalide/);
  assert.throws(() => createCalendar({ holidays: [42] }), /férié/);
  // tous les mercredis fériés pendant plus de 10 ans alors que seul le mercredi est ouvré
  const never = createCalendar({ workingDays: [3], holidays: Array.from({ length: 8000 }, (_, i) => ({ date: f(d('2020-01-01') + i * 7) })) });
  assert.throws(() => never.nextWorking(d('2020-01-02')), /ouvré/);
});

test('toJSON et reconstruction', () => {
  const c = createCalendar({ workingDays: WEEK.OUVRES, holidays: [{ date: '2026-12-25', name: 'Noël' }, '2026-01-01'], lagUnit: 'calendar' });
  const json = c.toJSON();
  assert.deepEqual(json.workingDays, [1, 2, 3, 4, 5]);
  assert.deepEqual(json.holidays, [{ date: '2026-01-01' }, { date: '2026-12-25', name: 'Noël' }]);
  assert.equal(json.lagUnit, 'calendar');
  const again = createCalendar(json);
  assert.deepEqual(again.toJSON(), json);
});

test('lagUnit par défaut', () => {
  assert.equal(createCalendar().lagUnit, 'working');
  assert.equal(createCalendar({ lagUnit: 'calendar' }).lagUnit, 'calendar');
});

test('frenchHolidays 2026', () => {
  const h = frenchHolidays(2026);
  assert.equal(h.length, 11);
  const byName = Object.fromEntries(h.map((x) => [x.name, x.date]));
  assert.equal(byName["Jour de l'an"], '2026-01-01');
  assert.equal(byName['Lundi de Pâques'], '2026-04-06');
  assert.equal(byName['Fête du Travail'], '2026-05-01');
  assert.equal(byName['Victoire 1945'], '2026-05-08');
  assert.equal(byName['Ascension'], '2026-05-14');
  assert.equal(byName['Lundi de Pentecôte'], '2026-05-25');
  assert.equal(byName['Fête nationale'], '2026-07-14');
  assert.equal(byName['Assomption'], '2026-08-15');
  assert.equal(byName['Toussaint'], '2026-11-01');
  assert.equal(byName['Armistice 1918'], '2026-11-11');
  assert.equal(byName['Noël'], '2026-12-25');
});

test('frenchHolidays : autres années et plusieurs années', () => {
  assert.equal(frenchHolidays(2027).find((x) => x.name === 'Lundi de Pâques').date, '2027-03-29');
  assert.equal(frenchHolidays(2024).find((x) => x.name === 'Lundi de Pâques').date, '2024-04-01');
  assert.equal(frenchHolidays([2026, 2027]).length, 22);
  assert.throws(() => frenchHolidays('abc'), /Année invalide/);
});

test('americanHolidays 2026', () => {
  const h = americanHolidays(2026);
  const by = Object.fromEntries(h.map((x) => [x.name, x.date]));
  assert.equal(h.length, 11);
  assert.equal(by["New Year's Day"], '2026-01-01');
  assert.equal(by['Martin Luther King Jr. Day'], '2026-01-19');
  assert.equal(by["Presidents' Day"], '2026-02-16');
  assert.equal(by['Memorial Day'], '2026-05-25');
  assert.equal(by['Juneteenth'], '2026-06-19');
  assert.equal(by['Independence Day (observed)'], '2026-07-03'); // le 4 juillet 2026 est un samedi
  assert.equal(by['Labor Day'], '2026-09-07');
  assert.equal(by['Columbus Day'], '2026-10-12');
  assert.equal(by['Veterans Day'], '2026-11-11');
  assert.equal(by['Thanksgiving'], '2026-11-26');
  assert.equal(by['Christmas Day'], '2026-12-25');
});

test('americanHolidays : report des jours fériés tombant un week-end', () => {
  const by = (y) => Object.fromEntries(americanHolidays(y).map((x) => [x.name, x.date]));
  assert.equal(by(2027)['Juneteenth (observed)'], '2027-06-18'); // samedi -> vendredi
  assert.equal(by(2027)['Independence Day (observed)'], '2027-07-05'); // dimanche -> lundi
  assert.equal(by(2027)['Christmas Day (observed)'], '2027-12-24'); // samedi -> vendredi
  assert.equal(by(2028)["New Year's Day (observed)"], '2027-12-31'); // samedi 1er janvier -> vendredi de l'année précédente
  assert.equal(americanHolidays([2026, 2027]).length, 22);
});

test('les listes de jours fériés sont utilisables par createCalendar', () => {
  const c = createCalendar({ workingDays: WEEK.OUVRES, holidays: frenchHolidays([2026]) });
  assert.equal(c.isWorking(d('2026-05-14')), false); // Ascension
  assert.equal(c.holidayName(d('2026-12-25')), 'Noël');
  assert.equal(f(c.addWorkingDays(d('2026-12-24'), 1)), '2026-12-28'); // jeudi 24 + 1 : vendredi 25 férié, week-end -> lundi 28
});
