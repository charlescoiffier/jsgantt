import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { toDay, fromDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const span = (m, id) => `${fromDay(m.getTask(id).start)}..${fromDay(m.getTask(id).end)}`;

const base = () =>
  new GanttModel({
    tasks: [
      t('a', '2026-10-05', '2026-10-09'),
      t('b', '2026-10-12', '2026-10-14'),
      { id: 'g', name: 'g' },
      t('c1', '2026-10-19', '2026-10-21', { parentId: 'g' }),
      t('c2', '2026-10-20', '2026-10-23', { parentId: 'g' }),
    ],
    links: [l('a', 'b', 'FS')],
  });

test('moveTask décale une tâche et ses successeurs en cascade', () => {
  const m = base();
  m.moveTask('a', 7);
  assert.equal(span(m, 'a'), '2026-10-12..2026-10-16');
  assert.equal(span(m, 'b'), '2026-10-17..2026-10-19');
});

test('moveTask vers l\'arrière ne tire pas les successeurs', () => {
  const m = base();
  m.moveTask('a', -3);
  assert.equal(span(m, 'a'), '2026-10-02..2026-10-06');
  assert.equal(span(m, 'b'), '2026-10-12..2026-10-14');
});

test('moveTask ne peut pas passer sous une contrainte de dépendance', () => {
  const m = base();
  m.moveTask('b', -10);
  assert.equal(span(m, 'b'), '2026-10-10..2026-10-12');
});

test('moveTask sur un groupe décale tous ses descendants', () => {
  const m = base();
  m.moveTask('g', 3);
  assert.equal(span(m, 'c1'), '2026-10-22..2026-10-24');
  assert.equal(span(m, 'c2'), '2026-10-23..2026-10-26');
  assert.equal(span(m, 'g'), '2026-10-22..2026-10-26');
});

test('moveTask refuse un delta non entier', () => {
  assert.throws(() => base().moveTask('a', 1.5), /entier/);
});

test('resizeTask : début et fin', () => {
  const m = base();
  assert.deepEqual(m.resizeTask('a', 'end', toDay('2026-10-11')), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-05..2026-10-11');
  assert.equal(span(m, 'b'), '2026-10-12..2026-10-14');
  assert.deepEqual(m.resizeTask('a', 'start', toDay('2026-10-03')), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-03..2026-10-11');
});

test('resizeTask : agrandir la fin d\'un prédécesseur pousse le successeur', () => {
  const m = base();
  m.resizeTask('a', 'end', toDay('2026-10-14'));
  assert.equal(span(m, 'b'), '2026-10-15..2026-10-17');
});

test('resizeTask : refus (groupe, jalon, inversion, contrainte)', () => {
  const m = new GanttModel({
    tasks: [
      t('a', '2026-10-05', '2026-10-09'),
      t('b', '2026-10-12', '2026-10-14'),
      t('ms', '2026-10-20', '2026-10-20', { milestone: true }),
      { id: 'g', name: 'g' },
      t('c', '2026-10-19', '2026-10-21', { parentId: 'g' }),
    ],
    links: [l('a', 'b', 'FS')],
  });
  assert.match(m.resizeTask('g', 'end', toDay('2026-10-30')).reason, /groupe/);
  assert.match(m.resizeTask('ms', 'end', toDay('2026-10-30')).reason, /jalon/);
  assert.match(m.resizeTask('b', 'start', toDay('2026-10-20')).reason, /début/);
  const r = m.resizeTask('b', 'start', toDay('2026-10-08'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /dépendance/);
  assert.equal(span(m, 'b'), '2026-10-12..2026-10-14');
  assert.throws(() => m.resizeTask('a', 'milieu', 1), /Bord inconnu/);
});

test('setProgress : arrondi, borne, refus pour un groupe', () => {
  const m = base();
  assert.deepEqual(m.setProgress('a', 0.456), { ok: true });
  assert.equal(m.getTask('a').progress, 0.46);
  m.setProgress('a', 2);
  assert.equal(m.getTask('a').progress, 1);
  m.setProgress('a', -1);
  assert.equal(m.getTask('a').progress, 0);
  assert.match(m.setProgress('g', 0.5).reason, /groupe/);
});

test('updateTask : nom, dates, erreurs', () => {
  const m = base();
  assert.deepEqual(m.updateTask('a', { name: 'Nouveau' }), { ok: true });
  assert.equal(m.getTask('a').name, 'Nouveau');
  assert.deepEqual(m.updateTask('a', { start: '2026-10-06', end: '2026-10-08' }), { ok: true });
  assert.equal(span(m, 'a'), '2026-10-06..2026-10-08');
  assert.match(m.updateTask('a', { end: 'pas une date' }).reason, /Date invalide/);
  assert.match(m.updateTask('a', { start: '2026-10-30' }).reason, /précède/);
  assert.match(m.updateTask('g', { start: '2026-10-06' }).reason, /groupe/);
  assert.equal(m.updateTask('g', { name: 'Groupe' }).ok, true);
});

test('updateTask sur un jalon déplace le jalon', () => {
  const m = new GanttModel({ tasks: [t('ms', '2026-10-20', '2026-10-20', { milestone: true })] });
  m.updateTask('ms', { start: '2026-10-25' });
  assert.equal(span(m, 'ms'), '2026-10-25..2026-10-25');
});

test('toggleCollapsed', () => {
  const m = base();
  assert.equal(m.visibleRows().length, 5);
  m.toggleCollapsed('g');
  assert.equal(m.visibleRows().length, 3);
  m.toggleCollapsed('g');
  assert.equal(m.visibleRows().length, 5);
});

test('méthodes d\'édition : id inconnu', () => {
  assert.throws(() => base().moveTask('zzz', 1), /inconnue/);
});

test('updateTask : une date bloquée par une dépendance est refusée, état restauré', () => {
  const m = new GanttModel({
    tasks: [t('a', '2026-10-05', '2026-10-10'), t('b', '2026-10-11', '2026-10-15')],
    links: [l('a', 'b', 'FS')],
  });
  const r = m.updateTask('b', { start: '2026-10-05' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /dépendance/);
  assert.equal(span(m, 'b'), '2026-10-11..2026-10-15');
  assert.equal(m.updateTask('b', { start: '2026-10-12' }).ok, true);
  assert.equal(span(m, 'b'), '2026-10-12..2026-10-15');
});

test('updateTask : une fin bloquée par un lien FF est refusée', () => {
  const m = new GanttModel({
    tasks: [t('a', '2026-10-05', '2026-10-20'), t('b', '2026-10-05', '2026-10-20')],
    links: [l('a', 'b', 'FF')],
  });
  assert.match(m.updateTask('b', { end: '2026-10-10' }).reason, /dépendance/);
  assert.equal(span(m, 'b'), '2026-10-05..2026-10-20');
});
