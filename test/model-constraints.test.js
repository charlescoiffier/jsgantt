import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { WEEK } from '../src/calendar.js';
import { GanttError } from '../src/i18n.js';
import { toDay, fromDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const span = (m, id) => `${fromDay(m.getTask(id).start)}..${fromDay(m.getTask(id).end)}`;
const c = (type, date) => ({ constraint: { type, date } });
const build = (tasks, links, calendar) => new GanttModel({ tasks, links, calendar });
const ouvres = { workingDays: WEEK.OUVRES };
const grab = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

test('une contrainte ne déplace jamais la tâche : elle est seulement signalée', () => {
  const cases = [
    ['SNET', '2026-10-12', true],
    ['FNET', '2026-10-12', true],
    ['MSO', '2026-10-08', true],
    ['MFO', '2026-10-09', true],
    ['SNLT', '2026-10-01', true],
    ['FNLT', '2026-10-01', true],
  ];
  for (const [type, date, violated] of cases) {
    const m = build([t('a', '2026-10-05', '2026-10-07', c(type, date))]);
    assert.equal(span(m, 'a'), '2026-10-05..2026-10-07', type);
    assert.equal(m.violations().length, violated ? 1 : 0, type);
  }
});

test('contrainte respectée : aucune violation', () => {
  const ok = [
    ['SNET', '2026-10-05'], ['SNET', '2026-10-01'], ['FNET', '2026-10-07'],
    ['SNLT', '2026-10-05'], ['SNLT', '2026-10-20'], ['FNLT', '2026-10-07'], ['MSO', '2026-10-05'], ['MFO', '2026-10-07'],
  ];
  for (const [type, date] of ok) {
    assert.deepEqual(build([t('a', '2026-10-05', '2026-10-07', c(type, date))]).violations(), [], `${type} ${date}`);
  }
});

test('violations : au plus tard dépassé par un lien', () => {
  const m = build(
    [t('x', '2026-10-05', '2026-10-09'), t('y', '2026-10-01', '2026-10-02', c('SNLT', '2026-10-08')), t('z', '2026-10-01', '2026-10-02', c('SNLT', '2026-10-20'))],
    [l('x', 'y'), l('x', 'z')],
  );
  const v = m.violations();
  assert.equal(v.length, 1);
  assert.equal(v[0].id, 'y');
  assert.equal(v[0].type, 'SNLT');
  assert.equal(v[0].side, 'start');
  assert.equal(fromDay(v[0].date), '2026-10-08');
});

test('violations : FNLT, MSO et MFO repoussés trop loin par un lien', () => {
  const m = build(
    [
      t('x', '2026-10-05', '2026-10-09'),
      t('a', '2026-10-01', '2026-10-02', c('FNLT', '2026-10-10')),
      t('b', '2026-10-01', '2026-10-02', c('MSO', '2026-10-08')),
      t('d', '2026-10-01', '2026-10-02', c('MFO', '2026-10-09')),
    ],
    [l('x', 'a'), l('x', 'b'), l('x', 'd')],
  );
  assert.deepEqual(m.violations().map((v) => v.id).sort(), ['a', 'b', 'd']); // les trois démarrent le 10 et finissent le 11
});

test('aucune violation quand tout est respecté', () => {
  const m = build([t('a', '2026-10-05', '2026-10-07', c('SNET', '2026-10-05')), t('b', '2026-10-05', '2026-10-07', c('FNLT', '2026-10-09'))]);
  assert.deepEqual(m.violations(), []);
});

test('setConstraint : pose, remplace, retire', () => {
  const m = build([t('a', '2026-10-05', '2026-10-07')]);
  assert.deepEqual(m.setConstraint('a', { type: 'SNET', date: '2026-10-12' }), { ok: true });
  assert.deepEqual(m.constraintOf('a'), { type: 'SNET', date: toDay('2026-10-12') });
  assert.deepEqual(m.setConstraint('a', { type: 'MSO', date: '2026-10-15' }), { ok: true });
  assert.deepEqual(m.constraintOf('a'), { type: 'MSO', date: toDay('2026-10-15') });
  assert.deepEqual(m.setConstraint('a', null), { ok: true });
  assert.equal(m.constraintOf('a'), null);
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-07'); // la tâche n'a jamais bougé
});

test('setConstraint : refus avec codes', () => {
  const m = build([{ id: 'g', name: 'g' }, t('c1', '2026-10-05', '2026-10-07', { parentId: 'g' })]);
  assert.equal(m.setConstraint('g', { type: 'SNET', date: '2026-10-12' }).code, 'constraint.group');
  assert.equal(m.setConstraint('c1', { type: 'XXX', date: '2026-10-12' }).code, 'constraint.type');
  assert.equal(m.setConstraint('c1', { type: 'SNET', date: '2026-02-30' }).code, 'date.nonexistent');
  assert.equal(m.setConstraint('c1', 'SNET').code, 'constraint.spec');
  assert.equal(m.constraintOf('c1'), null);
  assert.throws(() => m.setConstraint('zzz', null), /inconnue/);
});

test('données : la contrainte fait l\'aller-retour', () => {
  const m = build([t('a', '2026-10-05', '2026-10-07', c('FNLT', '2026-10-30')), t('b', '2026-10-05', '2026-10-07')]);
  const data = m.getData();
  assert.deepEqual(data.tasks[0].constraint, { type: 'FNLT', date: '2026-10-30' });
  assert.equal('constraint' in data.tasks[1], false);
  assert.deepEqual(m.clone().getData(), data);
});

test('import : contraintes invalides', () => {
  let e = grab(() => build([{ id: 'g', name: 'g', ...c('SNET', '2026-10-12') }, t('c1', '2026-10-05', '2026-10-06', { parentId: 'g' })]));
  assert.ok(e instanceof GanttError);
  assert.equal(e.code, 'task.constraintGroup');
  e = grab(() => build([t('a', '2026-10-05', '2026-10-06', c('XXX', '2026-10-12'))]));
  assert.equal(e.code, 'task.constraintType');
  assert.deepEqual(e.params, { id: 'a', type: 'XXX' });
  e = grab(() => build([t('a', '2026-10-05', '2026-10-06', { constraint: 'SNET' })]));
  assert.equal(e.code, 'task.constraint');
  e = grab(() => build([t('a', '2026-10-05', '2026-10-06', c('SNET', '2026-02-30'))]));
  assert.equal(e.code, 'task.error');
  assert.equal(e.params.detail.code, 'date.nonexistent');
});

test('une tâche qui devient un groupe perd sa contrainte (ajout d\'une sous-tâche, déplacement)', () => {
  const m = build([t('a', '2026-10-05', '2026-10-07', c('SNET', '2026-10-12')), t('b', '2026-10-20', '2026-10-21')]);
  m.addTask({ start: '2026-10-26', parentId: 'a' });
  assert.equal(m.isGroup('a'), true);
  assert.equal(m.constraintOf('a'), null);
  assert.doesNotThrow(() => new GanttModel(m.getData()));
  const n = build([t('p', '2026-10-05', '2026-10-07', c('SNET', '2026-10-12')), t('q', '2026-10-20', '2026-10-21')]);
  n.moveTaskTo('q', { parentId: 'p' });
  assert.equal(n.constraintOf('p'), null);
  assert.doesNotThrow(() => new GanttModel(n.getData()));
});

test('les drapeaux ne bougent jamais : déplacer, redimensionner ou éditer ne change pas la date', () => {
  const m = build([t('a', '2026-10-12', '2026-10-16', c('SNET', '2026-10-12')), t('b', '2026-10-12', '2026-10-14', c('MSO', '2026-10-12'))]);
  const dates = () => ['a', 'b'].map((id) => fromDay(m.constraintOf(id).date)).join(' ');
  m.moveTask('a', -3);
  m.moveTask('b', 4);
  assert.equal(dates(), '2026-10-12 2026-10-12');
  m.resizeTask('a', 'start', toDay('2026-10-05'));
  m.resizeTask('b', 'end', toDay('2026-10-30'));
  m.updateTask('a', { start: '2026-10-02' });
  assert.equal(dates(), '2026-10-12 2026-10-12');
  assert.deepEqual(m.violations().map((v) => v.id).sort(), ['a', 'b']); // les deux ne respectent plus leur règle
  m.moveTask('a', 20);
  m.moveTask('b', -20);
  assert.equal(dates(), '2026-10-12 2026-10-12');
});

test('la violation apparaît et disparaît avec la position de la tâche', () => {
  const m = build([t('a', '2026-10-12', '2026-10-14', c('SNET', '2026-10-12'))]);
  assert.deepEqual(m.violations(), []);
  m.moveTask('a', -2);
  assert.equal(m.violations().length, 1);
  m.moveTask('a', 2);
  assert.deepEqual(m.violations(), []);
});

test('un groupe déplacé ne change pas les contraintes de ses enfants', () => {
  const m = build([{ id: 'g', name: 'g' }, t('c1', '2026-10-12', '2026-10-13', { parentId: 'g', ...c('MSO', '2026-10-12') })]);
  m.moveTask('g', 2);
  assert.equal(span(m, 'c1'), '2026-10-14..2026-10-15');
  assert.equal(fromDay(m.constraintOf('c1').date), '2026-10-12');
  assert.equal(m.violations().length, 1);
});

test('les liens repoussent librement : la contrainte est alors signalée', () => {
  const m = build(
    [t('x', '2026-10-05', '2026-10-09'), t('y', '2026-10-01', '2026-10-02', c('SNLT', '2026-10-08')), t('z', '2026-10-01', '2026-10-02', c('SNET', '2026-10-20'))],
    [l('x', 'y'), l('x', 'z')],
  );
  assert.equal(span(m, 'y'), '2026-10-10..2026-10-11');
  assert.equal(span(m, 'z'), '2026-10-10..2026-10-11'); // pas repoussée par sa contrainte
  assert.deepEqual(m.violations().map((v) => v.id).sort(), ['y', 'z']);
});

test('calendrier : la date d\'une contrainte non travaillée est interprétée sur le jour travaillé', () => {
  // SNET un samedi : borne effective = lundi 12
  const m = build([t('a', '2026-10-09', '2026-10-09', c('SNET', '2026-10-10')), t('b', '2026-10-12', '2026-10-12', c('SNET', '2026-10-10'))], [], ouvres);
  assert.deepEqual(m.violations().map((v) => v.id), ['a']);
});

test('jalon et contrainte', () => {
  const m = build([t('ms', '2026-10-05', '2026-10-05', { milestone: true, ...c('SNET', '2026-10-12') })]);
  assert.equal(span(m, 'ms'), '2026-10-05..2026-10-05');
  assert.equal(m.violations().length, 1);
});

test('setConstraint ne déplace pas la tâche', () => {
  const m = build([t('a', '2026-10-05', '2026-10-07')]);
  m.setConstraint('a', { type: 'SNET', date: '2026-10-12' });
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-07');
  assert.equal(m.violations()[0].id, 'a');
});
