import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { fromDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const span = (m, id) => `${fromDay(m.getTask(id).start)}..${fromDay(m.getTask(id).end)}`;
const order = (m) => m.visibleRows().map((r) => r.id);

const base = () =>
  new GanttModel({
    tasks: [
      t('a', '2026-10-05', '2026-10-09'),
      { id: 'g', name: 'g' },
      t('c1', '2026-10-12', '2026-10-14', { parentId: 'g' }),
      t('c2', '2026-10-15', '2026-10-16', { parentId: 'g' }),
      t('z', '2026-10-20', '2026-10-22'),
    ],
  });

test('addTask : ajout à la fin, id généré, 3 jours par défaut, nom par défaut', () => {
  const m = base();
  const r = m.addTask({ start: '2026-10-26' });
  assert.equal(r.ok, true);
  assert.match(r.task.id, /^t\d+$/);
  assert.equal(r.task.name, 'Nouvelle tâche');
  assert.equal(span(m, r.task.id), '2026-10-26..2026-10-28');
  assert.deepEqual(order(m), ['a', 'g', 'c1', 'c2', 'z', r.task.id]);
});

test('addTask : ids générés sans collision avec les ids existants', () => {
  const m = new GanttModel({ tasks: [t('t1', '2026-10-05', '2026-10-06'), t('t2', '2026-10-05', '2026-10-06')] });
  const r = m.addTask({ start: '2026-10-05' });
  assert.equal(new Set(m.tasks.map((x) => x.id)).size, 3);
  assert.notEqual(r.task.id, 't1');
});

test('addTask afterId : même parent, placé après le sous-arbre', () => {
  const m = base();
  const r1 = m.addTask({ start: '2026-10-26', end: '2026-10-27', name: 'N1', afterId: 'a' });
  assert.deepEqual(order(m), ['a', r1.task.id, 'g', 'c1', 'c2', 'z']);
  const r2 = m.addTask({ start: '2026-10-26', name: 'N2', afterId: 'g' });
  assert.deepEqual(order(m), ['a', r1.task.id, 'g', 'c1', 'c2', r2.task.id, 'z']);
  const r3 = m.addTask({ start: '2026-10-26', name: 'N3', afterId: 'c1' });
  assert.equal(m.getTask(r3.task.id).parentId, 'g');
  assert.deepEqual(order(m), ['a', r1.task.id, 'g', 'c1', r3.task.id, 'c2', r2.task.id, 'z']);
});

test('addTask parentId : ajout en dernier enfant, une tâche simple devient un groupe', () => {
  const m = base();
  const r = m.addTask({ start: '2026-10-30', end: '2026-11-02', name: 'Sous-tâche', parentId: 'a' });
  assert.equal(m.isGroup('a'), true);
  assert.equal(span(m, 'a'), '2026-10-30..2026-11-02');
  assert.deepEqual(order(m), ['a', r.task.id, 'g', 'c1', 'c2', 'z']);
  const r2 = m.addTask({ start: '2026-10-20', parentId: 'g' });
  assert.deepEqual(m.childrenOf('g').map((x) => x.id), ['c1', 'c2', r2.task.id]);
  assert.equal(span(m, 'g'), '2026-10-12..2026-10-22');
});

test('addTask : refus (parent ou afterId inconnu, date invalide, fin avant début)', () => {
  const m = base();
  assert.match(m.addTask({ start: '2026-10-26', parentId: 'zzz' }).reason, /parent inconnu/);
  assert.match(m.addTask({ start: '2026-10-26', afterId: 'zzz' }).reason, /inconnue/);
  assert.match(m.addTask({ start: '2026-02-30' }).reason, /Date invalide/);
  assert.match(m.addTask({ start: '2026-10-26', end: '2026-10-20' }).reason, /précède/);
  assert.match(m.addTask({}).reason, /start/);
  assert.equal(m.tasks.length, 5);
});

test('removeTask : une tâche et ses liens', () => {
  const m = new GanttModel({
    tasks: [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-12', '2026-10-14'), t('c', '2026-10-20', '2026-10-22')],
    links: [l('a', 'b'), l('b', 'c')],
  });
  const r = m.removeTask('b');
  assert.equal(r.ok, true);
  assert.deepEqual(r.removedTasks, ['b']);
  assert.equal(r.removedLinks.length, 2);
  assert.equal(m.links.length, 0);
  assert.deepEqual(order(m), ['a', 'c']);
});

test('removeTask : un groupe emporte ses descendants et leurs liens', () => {
  const m = base();
  m.addLink(l('a', 'c1'));
  const r = m.removeTask('g');
  assert.deepEqual(r.removedTasks, ['g', 'c1', 'c2']);
  assert.equal(m.links.length, 0);
  assert.deepEqual(order(m), ['a', 'z']);
});

test('removeTask : le dernier enfant retiré, le parent redevient une tâche simple avec ses dernières dates', () => {
  const m = base();
  m.removeTask('c1');
  m.removeTask('c2');
  assert.equal(m.isGroup('g'), false);
  assert.equal(span(m, 'g'), '2026-10-15..2026-10-16'); // dates agrégées au moment du retrait du dernier enfant
  // et la tâche obtenue est valide : redimensionnable, exportable
  assert.deepEqual(m.resizeTask('g', 'end', m.getTask('g').end + 1), { ok: true });
  assert.doesNotThrow(() => new GanttModel(m.getData()));
});

test('removeTask : retirer un enfant met à jour les dates agrégées du groupe', () => {
  const m = base();
  m.removeTask('c2');
  assert.equal(span(m, 'g'), '2026-10-12..2026-10-14');
});

test('removeTask : id inconnu', () => {
  assert.throws(() => base().removeTask('zzz'), /inconnue/);
});

test('moveTaskTo : réordonner des frères (beforeId)', () => {
  const m = base();
  assert.deepEqual(m.moveTaskTo('z', { parentId: null, beforeId: 'a' }), { ok: true });
  assert.deepEqual(order(m), ['z', 'a', 'g', 'c1', 'c2']);
  assert.deepEqual(m.moveTaskTo('c2', { parentId: 'g', beforeId: 'c1' }), { ok: true });
  assert.deepEqual(order(m), ['z', 'a', 'g', 'c2', 'c1']);
});

test('moveTaskTo : changer de parent, en fin de liste, vers la racine', () => {
  const m = base();
  assert.deepEqual(m.moveTaskTo('a', { parentId: 'g' }), { ok: true });
  assert.deepEqual(m.childrenOf('g').map((x) => x.id), ['c1', 'c2', 'a']);
  assert.equal(span(m, 'g'), '2026-10-05..2026-10-16');
  assert.deepEqual(m.moveTaskTo('c1', { parentId: null }), { ok: true });
  assert.deepEqual(order(m), ['g', 'c2', 'a', 'z', 'c1']);
});

test('moveTaskTo : un groupe garde ses descendants et passe sous une tâche simple', () => {
  const m = base();
  assert.deepEqual(m.moveTaskTo('g', { parentId: 'z' }), { ok: true });
  assert.equal(m.isGroup('z'), true);
  assert.deepEqual(order(m), ['a', 'z', 'g', 'c1', 'c2']);
  assert.deepEqual(m.descendantsOf('z'), ['g', 'c1', 'c2']);
});

test('moveTaskTo : le dernier enfant déplacé, l\'ancien parent redevient une tâche simple', () => {
  const m = base();
  m.moveTaskTo('c1', { parentId: null });
  m.moveTaskTo('c2', { parentId: null });
  assert.equal(m.isGroup('g'), false);
  assert.equal(span(m, 'g'), '2026-10-15..2026-10-16');
});

test('moveTaskTo : refus (soi-même, descendant, parent inconnu, beforeId incohérent)', () => {
  const m = base();
  assert.match(m.moveTaskTo('g', { parentId: 'g' }).reason, /lui-même|descendant/);
  assert.match(m.moveTaskTo('g', { parentId: 'c1' }).reason, /descendant/);
  assert.match(m.moveTaskTo('a', { parentId: 'zzz' }).reason, /parent inconnu/);
  assert.match(m.moveTaskTo('a', { parentId: 'g', beforeId: 'z' }).reason, /beforeId/);
  assert.match(m.moveTaskTo('a', { parentId: null, beforeId: 'a' }).reason, /beforeId/);
  assert.deepEqual(order(m), ['a', 'g', 'c1', 'c2', 'z']);
  assert.throws(() => m.moveTaskTo('zzz', {}), /inconnue/);
});

test('moveTaskTo : refus si un lien deviendrait groupe/descendant, état restauré', () => {
  const m = base();
  m.addLink(l('a', 'g')); // a -> groupe g : autorisé
  const r = m.moveTaskTo('a', { parentId: 'g' }); // a deviendrait descendant de g
  assert.equal(r.ok, false);
  assert.match(r.reason, /lien/);
  assert.deepEqual(order(m), ['a', 'g', 'c1', 'c2', 'z']);
  assert.equal(m.getTask('a').parentId, null);
  assert.equal(m.links.length, 1);
});

test('moveTaskTo : refus si le déplacement crée un cycle via un groupe', () => {
  const m = new GanttModel({
    tasks: [
      { id: 'g', name: 'g' },
      t('c', '2026-10-05', '2026-10-06', { parentId: 'g' }),
      t('x', '2026-10-12', '2026-10-13'),
      t('y', '2026-10-01', '2026-10-02'),
    ],
    links: [l('y', 'x'), l('x', 'g')],
  });
  // y sous g : g contiendrait y, or y -> x -> g donnerait y -> x -> y
  const r = m.moveTaskTo('y', { parentId: 'g' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cycle/);
  assert.equal(m.getTask('y').parentId, null);
});

test('l\'ordre modifié survit à getData et à clone', () => {
  const m = base();
  m.moveTaskTo('z', { parentId: null, beforeId: 'a' });
  m.addTask({ start: '2026-10-26', name: 'N', afterId: 'a' });
  assert.deepEqual(order(m.clone()), order(m));
});
