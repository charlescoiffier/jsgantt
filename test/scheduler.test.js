import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { computeDates } from '../src/scheduler.js';
import { fromDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const A = t('a', '2026-10-05', '2026-10-09');
const B = t('b', '2026-10-01', '2026-10-03');

const span = (m, id) => `${fromDay(m.getTask(id).start)}..${fromDay(m.getTask(id).end)}`;
const build = (tasks, links) => new GanttModel({ tasks, links });

test('FS lag 0 : B démarre le lendemain de la fin de A, durée conservée', () => {
  assert.equal(span(build([A, B], [l('a', 'b', 'FS')]), 'b'), '2026-10-10..2026-10-12');
});

test('FS : une tâche déjà assez tard n\'est pas avancée', () => {
  const late = t('b', '2026-10-20', '2026-10-22');
  assert.equal(span(build([A, late], [l('a', 'b', 'FS')]), 'b'), '2026-10-20..2026-10-22');
});

test('FS avec lag négatif (avance)', () => {
  assert.equal(span(build([A, B], [l('a', 'b', 'FS', -2)]), 'b'), '2026-10-08..2026-10-10');
});

test('FS avec lag positif', () => {
  assert.equal(span(build([A, B], [l('a', 'b', 'FS', 2)]), 'b'), '2026-10-12..2026-10-14');
});

test('SS avec lag 2', () => {
  assert.equal(span(build([A, B], [l('a', 'b', 'SS', 2)]), 'b'), '2026-10-07..2026-10-09');
});

test('FF : B finit au plus tôt à la fin de A', () => {
  assert.equal(span(build([A, B], [l('a', 'b', 'FF')]), 'b'), '2026-10-07..2026-10-09');
});

test('SF lag 0 : B finit au plus tôt la veille du début de A', () => {
  assert.equal(span(build([A, B], [l('a', 'b', 'SF')]), 'b'), '2026-10-02..2026-10-04');
});

test('cascade A -> B -> C', () => {
  const c = t('c', '2026-10-01', '2026-10-01');
  const m = build([A, B, c], [l('a', 'b', 'FS'), l('b', 'c', 'FS')]);
  assert.equal(span(m, 'b'), '2026-10-10..2026-10-12');
  assert.equal(span(m, 'c'), '2026-10-13..2026-10-13');
});

test('cascade indépendante de l\'ordre des liens et des tâches', () => {
  const c = t('c', '2026-10-01', '2026-10-01');
  const m = build([c, B, A], [l('b', 'c', 'FS'), l('a', 'b', 'FS')]);
  assert.equal(span(m, 'c'), '2026-10-13..2026-10-13');
});

test('un jalon lié reste un jalon', () => {
  const ms = t('m', '2026-10-01', '2026-10-01', { milestone: true });
  assert.equal(span(build([A, ms], [l('a', 'm', 'FS')]), 'm'), '2026-10-10..2026-10-10');
});

test('lien vers un groupe : tout le groupe est décalé', () => {
  const m = build(
    [
      { id: 'g', name: 'g' },
      t('c1', '2026-10-05', '2026-10-07', { parentId: 'g' }),
      t('c2', '2026-10-06', '2026-10-10', { parentId: 'g' }),
      t('x', '2026-10-12', '2026-10-14'),
    ],
    [l('x', 'g', 'FS')],
  );
  assert.equal(span(m, 'c1'), '2026-10-15..2026-10-17');
  assert.equal(span(m, 'c2'), '2026-10-16..2026-10-20');
  assert.equal(span(m, 'g'), '2026-10-15..2026-10-20');
});

test('lien depuis un groupe : utilise ses dates agrégées', () => {
  const m = build(
    [
      { id: 'g', name: 'g' },
      t('c1', '2026-10-05', '2026-10-07', { parentId: 'g' }),
      t('c2', '2026-10-06', '2026-10-10', { parentId: 'g' }),
      t('y', '2026-10-01', '2026-10-02'),
    ],
    [l('g', 'y', 'FS')],
  );
  assert.equal(span(m, 'y'), '2026-10-11..2026-10-12');
});

test('lien FF vers un groupe contraint sa fin agrégée', () => {
  const m = build(
    [
      { id: 'g', name: 'g' },
      t('c1', '2026-10-05', '2026-10-07', { parentId: 'g' }),
      t('x', '2026-10-12', '2026-10-14'),
    ],
    [l('x', 'g', 'FF')],
  );
  assert.equal(span(m, 'c1'), '2026-10-12..2026-10-14');
});

test('computeDates ne modifie pas le modèle', () => {
  const m = build([A, B], []);
  m.addLink(l('a', 'b', 'FS'));
  const before = span(m, 'b');
  const dates = computeDates(m);
  assert.equal(fromDay(dates.get('b').start), '2026-10-10');
  assert.equal(span(m, 'b'), before);
});

test('addLink replanifie immédiatement', () => {
  const m = build([A, B], []);
  assert.equal(span(m, 'b'), '2026-10-01..2026-10-03');
  m.addLink(l('a', 'b', 'FS'));
  assert.equal(span(m, 'b'), '2026-10-10..2026-10-12');
});
