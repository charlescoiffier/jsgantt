import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { WEEK } from '../src/calendar.js';
import { GanttError } from '../src/i18n.js';
import { toDay, fromDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const span = (m, id) => `${fromDay(m.getTask(id).start)}..${fromDay(m.getTask(id).end)}`;
const cal = (extra = {}) => ({ workingDays: WEEK.OUVRES, ...extra });
// 2026-10-05 est un lundi : 05 lun, 06 mar, 07 mer, 08 jeu, 09 ven, 10 sam, 11 dim, 12 lun, 13 mar …
const build = (tasks, links, calendar = cal()) => new GanttModel({ tasks, links, calendar });

test('sans calendrier : aucune clé calendar dans les données, comportement inchangé', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-09', '2026-10-12')] });
  assert.equal(m.calendar.isDefault, true);
  assert.equal('calendar' in m.getData(), false);
  assert.equal(span(m, 'a'), '2026-10-09..2026-10-12');
});

test('chargement : les dates sont ramenées sur des jours ouvrés', () => {
  const m = build([
    t('w', '2026-10-10', '2026-10-11'), // week-end seul
    t('s', '2026-10-10', '2026-10-14'),
    t('e', '2026-10-05', '2026-10-10'),
    t('ms', '2026-10-11', '2026-10-11', { milestone: true }),
  ]);
  assert.equal(span(m, 'w'), '2026-10-12..2026-10-12');
  assert.equal(span(m, 's'), '2026-10-12..2026-10-14');
  assert.equal(span(m, 'e'), '2026-10-05..2026-10-09');
  assert.equal(span(m, 'ms'), '2026-10-12..2026-10-12');
});

test('FS : le lendemain ouvré, week-end et jours fériés sautés', () => {
  const tasks = [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-01', '2026-10-02')];
  assert.equal(span(build(tasks, [l('a', 'b')]), 'b'), '2026-10-12..2026-10-13'); // durée de 2 jours ouvrés conservée
  const withHoliday = build(tasks, [l('a', 'b')], cal({ holidays: ['2026-10-12'] }));
  assert.equal(span(withHoliday, 'b'), '2026-10-13..2026-10-14');
});

test('lag en jours ouvrés (défaut) ou calendaires', () => {
  const tasks = [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-01', '2026-10-01')];
  assert.equal(span(build(tasks, [l('a', 'b', 'FS', 2)]), 'b'), '2026-10-14..2026-10-14');
  // lag 6 : 6 jours ouvrés après le lundi 12 = mardi 20 ; 6 jours calendaires = dimanche 18 -> lundi 19
  assert.equal(span(build(tasks, [l('a', 'b', 'FS', 6)], cal({ lagUnit: 'working' })), 'b'), '2026-10-20..2026-10-20');
  assert.equal(span(build(tasks, [l('a', 'b', 'FS', 6)], cal({ lagUnit: 'calendar' })), 'b'), '2026-10-19..2026-10-19');
});

test('SS, FF et SF en jours ouvrés', () => {
  const a = t('a', '2026-10-05', '2026-10-09');
  assert.equal(span(build([a, t('b', '2026-09-28', '2026-09-29')], [l('a', 'b', 'SS', 1)]), 'b'), '2026-10-06..2026-10-07');
  assert.equal(span(build([a, t('b', '2026-10-01', '2026-10-02')], [l('a', 'b', 'FF')]), 'b'), '2026-10-08..2026-10-09');
  assert.equal(span(build([a, t('b', '2026-09-28', '2026-09-29')], [l('a', 'b', 'SF')]), 'b'), '2026-10-01..2026-10-02');
});

test('lag négatif en jours ouvrés', () => {
  const tasks = [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-01', '2026-10-01')];
  assert.equal(span(build(tasks, [l('a', 'b', 'FS', -1)]), 'b'), '2026-10-09..2026-10-09'); // le dernier jour de A
});

test('lien vers un groupe : décalage en jours ouvrés, structure interne conservée', () => {
  const m = build(
    [
      { id: 'g', name: 'g' },
      t('c1', '2026-10-12', '2026-10-13', { parentId: 'g' }),
      t('c2', '2026-10-14', '2026-10-15', { parentId: 'g' }),
      t('x', '2026-10-12', '2026-10-16'),
    ],
    [l('x', 'g')],
  );
  assert.equal(span(m, 'c1'), '2026-10-19..2026-10-20');
  assert.equal(span(m, 'c2'), '2026-10-21..2026-10-22');
  assert.equal(span(m, 'g'), '2026-10-19..2026-10-22');
});

test('moveTask : saute les week-ends dans le sens du déplacement, durée conservée', () => {
  const m = build([t('a', '2026-10-09', '2026-10-09'), t('b', '2026-10-14', '2026-10-16')]);
  m.moveTask('a', 1); // vendredi + 1 jour = samedi -> lundi
  assert.equal(span(m, 'a'), '2026-10-12..2026-10-12');
  m.moveTask('a', -1); // lundi - 1 = dimanche -> vendredi
  assert.equal(span(m, 'a'), '2026-10-09..2026-10-09');
  m.moveTask('b', 3); // mercredi + 3 = samedi 17 -> lundi 19 ; 3 jours ouvrés conservés
  assert.equal(span(m, 'b'), '2026-10-19..2026-10-21');
});

test('resizeTask : début vers l\'avant, fin vers l\'arrière', () => {
  const m = build([t('a', '2026-10-05', '2026-10-07')]);
  assert.deepEqual(m.resizeTask('a', 'end', toDay('2026-10-10')), { ok: true }); // samedi -> vendredi
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-09');
  const refused = m.resizeTask('a', 'start', toDay('2026-10-10')); // samedi -> lundi 12, après la fin
  assert.equal(refused.code, 'resize.startAfterEnd');
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-09');
});

test('resizeTask : début en week-end ramené au lundi', () => {
  const m = build([t('a', '2026-10-12', '2026-10-16')]);
  assert.deepEqual(m.resizeTask('a', 'start', toDay('2026-10-10')), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-12..2026-10-16');
});

test('updateTask : dates saisies sur un week-end', () => {
  const m = build([t('a', '2026-10-05', '2026-10-09')]);
  assert.deepEqual(m.updateTask('a', { start: '2026-10-10', end: '2026-10-18' }), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-12..2026-10-16');
  assert.equal(m.updateTask('a', { start: '2026-10-20', end: '2026-10-19' }).code, 'dates.endBeforeStart');
});

test('addTask : début ramené sur un jour ouvré, 3 jours ouvrés par défaut', () => {
  const m = build([t('a', '2026-10-05', '2026-10-06')]);
  const r = m.addTask({ start: '2026-10-10' });
  assert.equal(span(m, r.task.id), '2026-10-12..2026-10-14');
  const r2 = m.addTask({ start: '2026-10-14', end: '2026-10-18' });
  assert.equal(span(m, r2.task.id), '2026-10-14..2026-10-16');
});

test('données : le calendrier fait l\'aller-retour et survit à clone', () => {
  const calendar = cal({ holidays: [{ date: '2026-12-25', name: 'Noël' }], lagUnit: 'calendar' });
  const m = build([t('a', '2026-10-05', '2026-10-09')], [], calendar);
  const data = m.getData();
  assert.deepEqual(data.calendar.workingDays, [1, 2, 3, 4, 5]);
  assert.equal(data.calendar.lagUnit, 'calendar');
  assert.deepEqual(data.calendar.holidays, [{ date: '2026-12-25', name: 'Noël' }]);
  assert.deepEqual(m.clone().getData(), data);
  assert.deepEqual(new GanttModel(data).getData(), data);
});

test('setCalendar : replanifie et ramène les dates, refuse une configuration invalide', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-01', '2026-10-02')], links: [l('a', 'b')] });
  assert.equal(span(m, 'b'), '2026-10-10..2026-10-11');
  assert.deepEqual(m.setCalendar(cal()), { ok: true });
  assert.equal(span(m, 'b'), '2026-10-12..2026-10-12'); // b ne couvrait qu'un week-end : un seul jour ouvré
  const bad = m.setCalendar({ workingDays: [] });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'calendar.workingDays');
  assert.equal(m.calendar.isDefault, false); // inchangé
  assert.deepEqual(m.setCalendar(null), { ok: true });
  assert.equal(m.calendar.isDefault, true);
});

test('import : calendrier invalide', () => {
  let e;
  try {
    new GanttModel({ tasks: [], calendar: { workingDays: [9] } });
  } catch (err) {
    e = err;
  }
  assert.ok(e instanceof GanttError);
  assert.equal(e.code, 'calendar.workingDays');
});
