import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { WEEK } from '../src/calendar.js';
import { fromDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const build = (tasks, links = [], extra = {}) => new GanttModel({ tasks, links, ...extra });
const ouvres = { workingDays: WEEK.OUVRES };
// { total, free, late: 'début..fin', critical } pour une tâche
const of = (m, id) => {
  const s = m.slack().get(id);
  return { total: s.total, free: s.free, late: `${fromDay(s.lateStart)}..${fromDay(s.lateEnd)}`, critical: s.critical };
};

test('chaîne FS : les tâches de la chaîne sont critiques, la tâche isolée a de la marge jusqu’à la fin du projet', () => {
  const m = build([t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-07', '2026-10-09'), t('c', '2026-10-05', '2026-10-05')], [l('a', 'b')]);
  assert.deepEqual(of(m, 'a'), { total: 0, free: 0, late: '2026-10-05..2026-10-06', critical: true });
  assert.deepEqual(of(m, 'b'), { total: 0, free: 0, late: '2026-10-07..2026-10-09', critical: true });
  assert.deepEqual(of(m, 'c'), { total: 4, free: 4, late: '2026-10-09..2026-10-09', critical: false });
  assert.deepEqual(m.criticalIds(), ['a', 'b']);
});

test('branches parallèles : seule la plus longue est critique', () => {
  const m = build(
    [t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-05', '2026-10-09'), t('c', '2026-10-10', '2026-10-12')],
    [l('a', 'c'), l('b', 'c')],
  );
  assert.equal(of(m, 'a').total, 3);
  assert.equal(of(m, 'a').critical, false);
  assert.equal(of(m, 'b').critical, true);
  assert.equal(of(m, 'c').critical, true);
});

test('marge libre plus petite que la marge totale quand le successeur direct a lui-même de la marge', () => {
  const m = build(
    [t('a', '2026-10-05', '2026-10-05'), t('b', '2026-10-08', '2026-10-08'), t('d', '2026-10-12', '2026-10-12'), t('x', '2026-10-05', '2026-10-11')],
    [l('a', 'b'), l('b', 'd'), l('x', 'd')],
  );
  assert.deepEqual(of(m, 'b'), { total: 3, free: 3, late: '2026-10-11..2026-10-11', critical: false });
  assert.deepEqual(of(m, 'a'), { total: 5, free: 2, late: '2026-10-10..2026-10-10', critical: false });
  assert.equal(of(m, 'x').critical, true);
});

test('les quatre types de lien et le décalage sont pris en compte', () => {
  const fs = build([t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-10', '2026-10-11')], [l('a', 'b', 'FS', 2)]);
  assert.equal(of(fs, 'a').total, 1);
  const ss = build([t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-08', '2026-10-09')], [l('a', 'b', 'SS', 1)]);
  assert.deepEqual(of(ss, 'a'), { total: 2, free: 2, late: '2026-10-07..2026-10-08', critical: false });
  const ff = build([t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-05', '2026-10-09')], [l('a', 'b', 'FF')]);
  assert.equal(of(ff, 'a').total, 3);
  const sf = build([t('a', '2026-10-10', '2026-10-12'), t('b', '2026-10-05', '2026-10-09')], [l('a', 'b', 'SF')]);
  assert.equal(of(sf, 'a').critical, true);
  assert.equal(of(sf, 'b').total, 3);
});

test('jours ouvrés : un week-end entre deux tâches liées ne compte pas comme de la marge', () => {
  const m = build(
    [t('a', '2026-10-09', '2026-10-09'), t('b', '2026-10-12', '2026-10-12'), t('c', '2026-10-05', '2026-10-05')],
    [l('a', 'b')],
    { calendar: ouvres },
  );
  assert.equal(of(m, 'a').critical, true);
  assert.deepEqual(of(m, 'c'), { total: 5, free: 5, late: '2026-10-12..2026-10-12', critical: false });
});

test('décalage en jours calendaires : la marge se compte en jours ouvrés', () => {
  const m = build(
    [t('a', '2026-10-07', '2026-10-07'), t('b', '2026-10-12', '2026-10-12')],
    [l('a', 'b', 'FS', 2)],
    { calendar: { ...ouvres, lagUnit: 'calendar' } },
  );
  assert.deepEqual(of(m, 'a'), { total: 1, free: 1, late: '2026-10-08..2026-10-08', critical: false });
});

test('groupe source d’un lien : sa marge est celle de sa tâche la plus contrainte, la marge libre suit le groupe', () => {
  const m = build(
    [{ id: 'g', name: 'g' }, t('g1', '2026-10-05', '2026-10-06', { parentId: 'g' }), t('g2', '2026-10-05', '2026-10-08', { parentId: 'g' }), t('x', '2026-10-09', '2026-10-09')],
    [l('g', 'x')],
  );
  assert.deepEqual(of(m, 'g1'), { total: 2, free: 2, late: '2026-10-07..2026-10-08', critical: false });
  assert.equal(of(m, 'g2').critical, true);
  assert.equal(of(m, 'g2').free, 0);
  assert.equal(of(m, 'g').critical, true);
  assert.deepEqual(m.criticalIds(), ['g', 'g2', 'x']);
});

test('lien vers un groupe : le prédécesseur est limité par le début du groupe', () => {
  const m = build(
    [t('a', '2026-10-05', '2026-10-06'), { id: 'g', name: 'g' }, t('g1', '2026-10-07', '2026-10-08', { parentId: 'g' }), t('g2', '2026-10-07', '2026-10-10', { parentId: 'g' })],
    [l('a', 'g')],
  );
  assert.equal(of(m, 'a').critical, true);
  assert.equal(of(m, 'g1').total, 2);
  assert.equal(of(m, 'g2').critical, true);
});

test('jalon : il a une marge comme une tâche', () => {
  const m = build(
    [t('a', '2026-10-05', '2026-10-06'), t('ms', '2026-10-07', '2026-10-07', { milestone: true }), t('b', '2026-10-05', '2026-10-12')],
    [l('a', 'ms')],
  );
  assert.equal(of(m, 'ms').total, 5);
  assert.equal(of(m, 'a').total, 5);
  assert.equal(of(m, 'b').critical, true);
});

test('planification en arrière : la fin imposée sert de référence', () => {
  const m = build([t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-07', '2026-10-09')], [l('a', 'b')], {
    planning: { direction: 'backward', end: '2026-10-20' },
  });
  assert.equal(of(m, 'b').total, 11);
  assert.equal(of(m, 'a').total, 11);
  assert.deepEqual(m.criticalIds(), []);
});

test('une tâche terminée (100 %) n’est jamais critique', () => {
  const m = build([t('a', '2026-10-05', '2026-10-06', { progress: 1 }), t('b', '2026-10-07', '2026-10-09')], [l('a', 'b')]);
  assert.equal(of(m, 'a').critical, false);
  assert.equal(of(m, 'b').critical, true);
});

test('le calcul ne modifie pas le modèle', () => {
  const m = build([t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-07', '2026-10-09'), t('c', '2026-10-05', '2026-10-05')], [l('a', 'b')]);
  const before = JSON.stringify(m.getData());
  m.slack();
  assert.equal(JSON.stringify(m.getData()), before);
});

test('projet vide : aucune marge', () => {
  assert.equal(build([]).slack().size, 0);
});

test('liens critiques : entre deux tâches critiques et sans écart', async () => {
  const { criticalLinkIds } = await import('../src/slack.js');
  const m = build(
    [t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-07', '2026-10-09'), t('c', '2026-10-05', '2026-10-05')],
    [{ id: 'ab', ...l('a', 'b') }, { id: 'cb', ...l('c', 'b') }],
  );
  assert.deepEqual([...criticalLinkIds(m)], ['ab']);
});
