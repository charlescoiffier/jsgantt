import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { rowNav, treeKey, neighborAfterRemoval, structureMove, cycleLinks, linkTypeForKey } from '../src/keynav.js';
import { t, l } from './helpers.js';

const model = () =>
  new GanttModel({
    tasks: [
      t('a', '2026-10-05', '2026-10-09'),
      { id: 'g', name: 'g' },
      t('c1', '2026-10-12', '2026-10-14', { parentId: 'g' }),
      t('c2', '2026-10-15', '2026-10-16', { parentId: 'g' }),
      t('z', '2026-10-20', '2026-10-22'),
    ],
    links: [l('a', 'c1'), l('c2', 'z'), l('a', 'z', 'SS')],
  });

test('rowNav : flèches, début et fin, bornes', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(rowNav(ids, 'b', 'ArrowDown'), 'c');
  assert.equal(rowNav(ids, 'c', 'ArrowDown'), 'c');
  assert.equal(rowNav(ids, 'b', 'ArrowUp'), 'a');
  assert.equal(rowNav(ids, 'a', 'ArrowUp'), 'a');
  assert.equal(rowNav(ids, 'b', 'Home'), 'a');
  assert.equal(rowNav(ids, 'b', 'End'), 'c');
  assert.equal(rowNav(ids, null, 'ArrowDown'), 'a');
  assert.equal(rowNav(ids, null, 'ArrowUp'), 'c');
  assert.equal(rowNav([], null, 'ArrowDown'), null);
  assert.equal(rowNav(ids, 'b', 'x'), 'b');
});

test('treeKey : droite et gauche sur groupes et feuilles', () => {
  const m = model();
  assert.equal(treeKey(m, 'a', 'ArrowRight'), null);
  assert.equal(treeKey(m, 'a', 'ArrowLeft'), null);
  assert.deepEqual(treeKey(m, 'g', 'ArrowRight'), { action: 'select', id: 'c1' });
  assert.deepEqual(treeKey(m, 'g', 'ArrowLeft'), { action: 'collapse' });
  m.toggleCollapsed('g');
  assert.deepEqual(treeKey(m, 'g', 'ArrowRight'), { action: 'expand' });
  assert.equal(treeKey(m, 'g', 'ArrowLeft'), null);
  m.toggleCollapsed('g');
  assert.deepEqual(treeKey(m, 'c1', 'ArrowLeft'), { action: 'select', id: 'g' });
  assert.equal(treeKey(m, 'c1', 'ArrowRight'), null);
});

test('neighborAfterRemoval : ligne après le sous-arbre, sinon la précédente', () => {
  const m = model();
  assert.equal(neighborAfterRemoval(m, 'a'), 'g');
  assert.equal(neighborAfterRemoval(m, 'g'), 'z');
  assert.equal(neighborAfterRemoval(m, 'c2'), 'z');
  assert.equal(neighborAfterRemoval(m, 'z'), 'c2');
  const solo = new GanttModel({ tasks: [t('s', '2026-10-05', '2026-10-06')] });
  assert.equal(neighborAfterRemoval(solo, 's'), null);
});

test('structureMove : monter, descendre, indenter, désindenter', () => {
  const m = model();
  assert.equal(structureMove(m, 'a', 'up'), null);
  assert.deepEqual(structureMove(m, 'z', 'up'), { parentId: null, beforeId: 'g' });
  assert.deepEqual(structureMove(m, 'a', 'down'), { parentId: null, beforeId: 'z' });
  assert.deepEqual(structureMove(m, 'g', 'down'), { parentId: null, beforeId: null });
  assert.equal(structureMove(m, 'z', 'down'), null);
  assert.deepEqual(structureMove(m, 'c1', 'down'), { parentId: 'g', beforeId: null });
  assert.deepEqual(structureMove(m, 'z', 'indent'), { parentId: 'g', beforeId: null });
  assert.equal(structureMove(m, 'a', 'indent'), null);
  assert.deepEqual(structureMove(m, 'c2', 'outdent'), { parentId: null, beforeId: 'z' });
  assert.equal(structureMove(m, 'a', 'outdent'), null);
  assert.throws(() => structureMove(m, 'a', 'diagonale'), /inconnu/);
});

test('cycleLinks : parcourt les liens d\'une tâche en boucle', () => {
  const m = model();
  const ids = m.links.filter((x) => x.from === 'a' || x.to === 'a').map((x) => x.id);
  assert.equal(ids.length, 2);
  assert.equal(cycleLinks(m, 'a', null), ids[0]);
  assert.equal(cycleLinks(m, 'a', ids[0]), ids[1]);
  assert.equal(cycleLinks(m, 'a', ids[1]), ids[0]);
  assert.equal(cycleLinks(m, 'g', null), null);
});

test('linkTypeForKey', () => {
  assert.equal(linkTypeForKey('1'), 'FS');
  assert.equal(linkTypeForKey('2'), 'SS');
  assert.equal(linkTypeForKey('3'), 'FF');
  assert.equal(linkTypeForKey('4'), 'SF');
  assert.equal(linkTypeForKey('Enter'), 'FS');
  assert.equal(linkTypeForKey('5'), null);
});
