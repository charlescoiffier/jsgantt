import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { WEEK } from '../src/calendar.js';
import { GanttError } from '../src/i18n.js';
import { toDay, fromDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const span = (m, id) => `${fromDay(m.getTask(id).start)}..${fromDay(m.getTask(id).end)}`;
const back = (end) => ({ direction: 'backward', ...(end ? { end } : {}) });
const build = (tasks, links = [], planning = back(), calendar) => new GanttModel({ tasks, links, planning, calendar });
const ouvres = { workingDays: WEEK.OUVRES };
const grab = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

test('par défaut : planification en avant, aucune clé planning dans les données', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-06')] });
  assert.deepEqual(m.planning, { direction: 'forward', end: null });
  assert.equal('planning' in m.getData(), false);
});

test('en arrière : la fin imposée ramène plus tôt les tâches qui la dépassent', () => {
  const m = build([t('a', '2026-10-05', '2026-10-30'), t('ok', '2026-10-05', '2026-10-10')], [], back('2026-10-20'));
  assert.equal(span(m, 'a'), '2026-09-25..2026-10-20'); // 26 jours conservés
  assert.equal(span(m, 'ok'), '2026-10-05..2026-10-10');
});

test('en arrière sans date : la fin actuelle du projet est retenue', () => {
  const m = build([t('a', '2026-10-05', '2026-10-30'), t('b', '2026-10-01', '2026-10-02')]);
  assert.equal(fromDay(m.planning.end), '2026-10-30');
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-30');
});

test('en arrière : les prédécesseurs sont avancés, les successeurs jamais repoussés', () => {
  const tasks = [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-01', '2026-10-02')];
  const m = build(tasks, [l('a', 'b')]);
  assert.equal(span(m, 'a'), '2026-09-26..2026-09-30'); // doit finir avant le début de b
  assert.equal(span(m, 'b'), '2026-10-01..2026-10-02');
  const free = build([t('a', '2026-10-01', '2026-10-02'), t('b', '2026-10-20', '2026-10-21')], [l('a', 'b')]);
  assert.equal(span(free, 'a'), '2026-10-01..2026-10-02');
  assert.equal(span(free, 'b'), '2026-10-20..2026-10-21');
});

test('en avant : un prédécesseur n\'est jamais avancé (comportement inchangé)', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-01', '2026-10-02')], links: [l('a', 'b')] });
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-09');
  assert.equal(span(m, 'b'), '2026-10-10..2026-10-11');
});

test('en arrière : SS, FF et SF', () => {
  assert.equal(span(build([t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-01', '2026-10-03')], [l('a', 'b', 'SS', 2)]), 'a'), '2026-09-29..2026-10-03');
  assert.equal(span(build([t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-01', '2026-10-03')], [l('a', 'b', 'FF')]), 'a'), '2026-09-29..2026-10-03');
  assert.equal(span(build([t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-01', '2026-10-03')], [l('a', 'b', 'SF')]), 'a'), '2026-10-04..2026-10-08');
});

test('en arrière avec un calendrier : jours travaillés, week-ends sautés', () => {
  // lundi 5 octobre 2026 ; b commence le lundi 5 : a doit finir le vendredi 2
  const m = build([t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-05', '2026-10-06')], [l('a', 'b')], back(), ouvres);
  assert.equal(span(m, 'a'), '2026-09-28..2026-10-02');
  // lag calendaire de 2 jours : a doit finir le jeudi 8 (b commence le lundi 12 ; 12 - 2 = samedi 10 -> vendredi 9 ; moins 1 jour travaillé)
  const lag = build(
    [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-12', '2026-10-13')],
    [l('a', 'b', 'FS', 2)],
    back(),
    { ...ouvres, lagUnit: 'calendar' },
  );
  assert.equal(span(lag, 'a'), '2026-10-02..2026-10-08');
});

test('en arrière : un groupe source est avancé avec sa structure interne', () => {
  const m = build(
    [{ id: 'g', name: 'g' }, t('c1', '2026-10-12', '2026-10-13', { parentId: 'g' }), t('c2', '2026-10-14', '2026-10-15', { parentId: 'g' }), t('b', '2026-10-01', '2026-10-02')],
    [l('g', 'b')],
  );
  assert.equal(span(m, 'c1'), '2026-09-27..2026-09-28');
  assert.equal(span(m, 'c2'), '2026-09-29..2026-09-30');
});

test('en arrière : déplacer un successeur plus tôt avance son prédécesseur, plus tard ne change rien', () => {
  const m = build([t('a', '2026-10-01', '2026-10-05'), t('b', '2026-10-10', '2026-10-12')], [l('a', 'b')], back('2026-10-31'));
  m.moveTask('b', 3);
  assert.equal(span(m, 'a'), '2026-10-01..2026-10-05');
  m.moveTask('b', -11); // b : 10-02..10-04
  assert.equal(span(m, 'b'), '2026-10-02..2026-10-04');
  assert.equal(span(m, 'a'), '2026-09-27..2026-10-01');
});

test('en arrière : allonger un prédécesseur au-delà de son successeur est refusé', () => {
  const m = build([t('a', '2026-10-01', '2026-10-05'), t('b', '2026-10-06', '2026-10-08')], [l('a', 'b')]);
  assert.equal(m.resizeTask('a', 'end', toDay('2026-10-08')).code, 'resize.blocked');
  assert.equal(span(m, 'a'), '2026-10-01..2026-10-05');
});

test('setPlanning : bascule, date par défaut, retour en avant', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-30')] });
  assert.deepEqual(m.setPlanning({ direction: 'backward' }), { ok: true });
  assert.equal(fromDay(m.planning.end), '2026-10-30');
  assert.deepEqual(m.setPlanning({ direction: 'backward', end: '2026-10-20' }), { ok: true });
  assert.equal(span(m, 'a'), '2026-09-25..2026-10-20');
  assert.deepEqual(m.setPlanning({ direction: 'forward' }), { ok: true });
  assert.deepEqual(m.planning, { direction: 'forward', end: null });
  m.setPlanning({ direction: 'backward', end: '2026-10-18' });
  assert.deepEqual(m.setPlanning(null), { ok: true });
  assert.equal(m.planning.direction, 'forward');
});

test('setPlanning : refus avec codes', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-06')] });
  assert.equal(m.setPlanning({ direction: 'sideways' }).code, 'planning.direction');
  assert.equal(m.setPlanning({ direction: 'backward', end: '2026-02-30' }).code, 'date.nonexistent');
  assert.equal(m.setPlanning('backward').code, 'planning.spec');
  assert.equal(m.planning.direction, 'forward');
});

test('données : la planification en arrière fait l\'aller-retour, la planification en avant est omise', () => {
  const m = build([t('a', '2026-10-05', '2026-10-10')], [], back('2026-10-20'));
  const data = m.getData();
  assert.deepEqual(data.planning, { direction: 'backward', end: '2026-10-20' });
  assert.deepEqual(m.clone().getData(), data);
  assert.deepEqual(new GanttModel(data).getData(), data);
  m.setPlanning({ direction: 'forward' });
  assert.equal('planning' in m.getData(), false);
});

test('import : planification invalide', () => {
  let e = grab(() => new GanttModel({ tasks: [], planning: { direction: 'x' } }));
  assert.ok(e instanceof GanttError);
  assert.equal(e.code, 'planning.direction');
  assert.deepEqual(e.params, { direction: 'x' });
  assert.equal(grab(() => new GanttModel({ tasks: [], planning: 'backward' })).code, 'planning.spec');
  assert.equal(grab(() => new GanttModel({ tasks: [], planning: { direction: 'backward', end: 'pas une date' } })).code, 'date.format');
});

const chain = (extra = {}) => [
  t('a', '2026-10-05', '2026-10-06'),
  t('b', '2026-10-10', '2026-10-11'),
  t('c', '2026-10-20', '2026-10-22'),
  t('u', '2026-10-15', '2026-10-16'), // sans lien : ne bouge jamais
];
const links = [l('a', 'b'), l('b', 'c')];

test('alignEarliest : chaque tâche reliée au plus tôt, les autres inchangées', () => {
  const m = new GanttModel({ tasks: chain(), links });
  assert.deepEqual(m.alignEarliest(), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-06');
  assert.equal(span(m, 'b'), '2026-10-07..2026-10-08');
  assert.equal(span(m, 'c'), '2026-10-09..2026-10-11'); // 3 jours conservés
  assert.equal(span(m, 'u'), '2026-10-15..2026-10-16');
});

test('alignLatest : chaque tâche reliée au plus tard, la fin du projet est conservée', () => {
  const m = new GanttModel({ tasks: chain(), links });
  assert.deepEqual(m.alignLatest(), { ok: true });
  assert.equal(span(m, 'c'), '2026-10-20..2026-10-22');
  assert.equal(span(m, 'b'), '2026-10-18..2026-10-19');
  assert.equal(span(m, 'a'), '2026-10-16..2026-10-17');
  assert.equal(span(m, 'u'), '2026-10-15..2026-10-16');
});

test('alignLatest : la date butoir de la planification en arrière sert de fin', () => {
  const m = new GanttModel({ tasks: chain(), links, planning: back('2026-10-30') });
  m.alignLatest();
  assert.equal(span(m, 'c'), '2026-10-28..2026-10-30');
  assert.equal(span(m, 'b'), '2026-10-26..2026-10-27');
  assert.equal(span(m, 'a'), '2026-10-24..2026-10-25');
});

test('alignEarliest et alignLatest avec un calendrier : jours travaillés', () => {
  const tasks = [t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-12', '2026-10-13')];
  const late = new GanttModel({ tasks, links: [l('a', 'b')], calendar: ouvres });
  late.alignLatest(); // fin du projet : mardi 13 ; a doit finir le vendredi 9
  assert.equal(span(late, 'b'), '2026-10-12..2026-10-13');
  assert.equal(span(late, 'a'), '2026-10-08..2026-10-09');
  const early = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-20', '2026-10-21')], links: [l('a', 'b')], calendar: ouvres });
  early.alignEarliest();
  assert.equal(span(early, 'b'), '2026-10-07..2026-10-08');
});

test('les calages sont cohérents avec la planification en arrière', () => {
  const m = new GanttModel({ tasks: chain(), links, planning: back('2026-10-30') });
  m.alignEarliest();
  assert.equal(span(m, 'c'), '2026-10-09..2026-10-11'); // la fin imposée n'est pas un plancher
  assert.equal(m.planning.direction, 'backward');
});

test('calages sans lien ou sans tâche : rien ne bouge', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-06')] });
  m.alignEarliest();
  m.alignLatest();
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-06');
  assert.deepEqual(new GanttModel().alignEarliest(), { ok: true });
  assert.deepEqual(new GanttModel().alignLatest(), { ok: true });
});
