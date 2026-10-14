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

test('SNET : la tâche est repoussée au plus tôt à la date', () => {
  assert.equal(span(build([t('a', '2026-10-05', '2026-10-07', c('SNET', '2026-10-12'))]), 'a'), '2026-10-12..2026-10-14');
  assert.equal(span(build([t('a', '2026-10-20', '2026-10-22', c('SNET', '2026-10-12'))]), 'a'), '2026-10-20..2026-10-22');
});

test('FNET : la fin est repoussée au plus tôt à la date', () => {
  assert.equal(span(build([t('a', '2026-10-05', '2026-10-07', c('FNET', '2026-10-12'))]), 'a'), '2026-10-10..2026-10-12');
});

test('MSO et MFO : calées sur la date, repoussées vers elle', () => {
  assert.equal(span(build([t('a', '2026-10-05', '2026-10-07', c('MSO', '2026-10-08'))]), 'a'), '2026-10-08..2026-10-10');
  assert.equal(span(build([t('a', '2026-10-05', '2026-10-07', c('MFO', '2026-10-09'))]), 'a'), '2026-10-07..2026-10-09');
});

test('SNLT et FNLT : aucun décalage', () => {
  assert.equal(span(build([t('a', '2026-10-20', '2026-10-22', c('SNLT', '2026-10-12'))]), 'a'), '2026-10-20..2026-10-22');
  assert.equal(span(build([t('a', '2026-10-20', '2026-10-22', c('FNLT', '2026-10-12'))]), 'a'), '2026-10-20..2026-10-22');
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

test('calendrier : une date non travaillée est ramenée sur un jour travaillé', () => {
  // samedi 10 octobre : SNET -> lundi 12 ; FNET -> vendredi 9
  assert.equal(span(build([t('a', '2026-10-05', '2026-10-06', c('SNET', '2026-10-10'))], [], ouvres), 'a'), '2026-10-12..2026-10-13');
  assert.equal(span(build([t('a', '2026-10-05', '2026-10-06', c('FNET', '2026-10-10'))], [], ouvres), 'a'), '2026-10-08..2026-10-09');
});

test('déplacer ou redimensionner à la main : la date de SNET suit en deçà de la borne seulement', () => {
  const m = build([t('a', '2026-10-12', '2026-10-16', c('SNET', '2026-10-12'))]);
  m.moveTask('a', -3); // en deçà de la borne : la borne suit
  assert.equal(span(m, 'a'), '2026-10-09..2026-10-13');
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-09');
  assert.deepEqual(m.violations(), []);
  m.moveTask('a', 2); // plus tard : la borne reste
  assert.equal(span(m, 'a'), '2026-10-11..2026-10-15');
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-09');
  assert.deepEqual(m.resizeTask('a', 'start', toDay('2026-10-07')), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-07..2026-10-15');
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-07');
  assert.deepEqual(m.updateTask('a', { start: '2026-10-05' }), { ok: true });
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-05');
});

test('FNET : la date suit la fin ramenée en deçà de la borne', () => {
  const m = build([t('a', '2026-10-05', '2026-10-12', c('FNET', '2026-10-12'))]);
  assert.deepEqual(m.resizeTask('a', 'end', toDay('2026-10-09')), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-09');
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-09');
  m.resizeTask('a', 'end', toDay('2026-10-14')); // plus loin : la borne reste
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-09');
  m.moveTask('a', -2);
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-09'); // la fin (12) reste au-delà de la borne
  m.moveTask('a', -6);
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-06'); // fin ramenée au 6, en deçà de la borne : elle suit
});

test('« doit commencer le » / « doit finir le » : la date suit les déplacements', () => {
  const m = build([t('a', '2026-10-12', '2026-10-14', c('MSO', '2026-10-12')), t('b', '2026-10-12', '2026-10-14', c('MFO', '2026-10-14'))]);
  m.moveTask('a', 3);
  assert.equal(span(m, 'a'), '2026-10-15..2026-10-17');
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-15');
  m.moveTask('b', -2);
  assert.equal(fromDay(m.constraintOf('b').date), '2026-10-12');
  assert.deepEqual(m.violations(), []);
});

test('au plus tard : une échéance ne suit pas ; dépassée, elle est signalée', () => {
  const m = build([t('a', '2026-10-12', '2026-10-14', c('SNLT', '2026-10-12')), t('b', '2026-10-12', '2026-10-14', c('FNLT', '2026-10-14'))]);
  m.moveTask('a', 3);
  m.moveTask('b', 3);
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-12');
  assert.equal(fromDay(m.constraintOf('b').date), '2026-10-14');
  assert.deepEqual(m.violations().map((v) => v.id).sort(), ['a', 'b']);
});

test('un groupe déplacé fait suivre les contraintes de ses enfants', () => {
  const m = build([{ id: 'g', name: 'g' }, t('c1', '2026-10-12', '2026-10-13', { parentId: 'g', ...c('MSO', '2026-10-12') })]);
  m.moveTask('g', 2);
  assert.equal(span(m, 'c1'), '2026-10-14..2026-10-15');
  assert.equal(fromDay(m.constraintOf('c1').date), '2026-10-14');
});

test('un redimensionnement refusé par une dépendance laisse la contrainte intacte', () => {
  const m = build(
    [t('x', '2026-10-05', '2026-10-09'), t('a', '2026-10-12', '2026-10-16', c('SNET', '2026-10-12'))],
    [l('x', 'a')],
  );
  const r = m.resizeTask('a', 'start', toDay('2026-10-10')); // le lien impose de commencer au plus tôt le 10
  assert.equal(r.ok, true); // le 10 est permis par le lien (x finit le 9)
  const blocked = m.resizeTask('a', 'start', toDay('2026-10-08')); // avant la fin de x : refusé
  assert.equal(blocked.code, 'resize.blocked');
  assert.equal(span(m, 'a'), '2026-10-10..2026-10-16');
  assert.equal(fromDay(m.constraintOf('a').date), '2026-10-10');
});

test('jalon avec contrainte', () => {
  const m = build([t('ms', '2026-10-05', '2026-10-05', { milestone: true, ...c('SNET', '2026-10-12') })]);
  assert.equal(span(m, 'ms'), '2026-10-12..2026-10-12');
});

test('contrainte et liens se combinent', () => {
  const m = build(
    [t('x', '2026-10-05', '2026-10-09'), t('y', '2026-10-01', '2026-10-02', c('SNET', '2026-10-20'))],
    [l('x', 'y')],
  );
  assert.equal(span(m, 'y'), '2026-10-20..2026-10-21'); // la contrainte est plus tardive que le lien (le 10)
});

test('contrainte sur un enfant d\'un groupe : le groupe suit', () => {
  const m = build([{ id: 'g', name: 'g' }, t('c1', '2026-10-05', '2026-10-06', { parentId: 'g', ...c('SNET', '2026-10-12') })]);
  assert.equal(span(m, 'g'), '2026-10-12..2026-10-13');
});

test('setConstraint : pose, remplace, retire', () => {
  const m = build([t('a', '2026-10-05', '2026-10-07')]);
  assert.deepEqual(m.setConstraint('a', { type: 'SNET', date: '2026-10-12' }), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-12..2026-10-14');
  assert.deepEqual(m.constraintOf('a'), { type: 'SNET', date: toDay('2026-10-12') });
  assert.deepEqual(m.setConstraint('a', { type: 'MSO', date: '2026-10-15' }), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-15..2026-10-17');
  assert.deepEqual(m.setConstraint('a', null), { ok: true });
  assert.equal(m.constraintOf('a'), null);
  assert.equal(span(m, 'a'), '2026-10-15..2026-10-17'); // les dates ne reviennent pas en arrière
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
