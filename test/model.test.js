import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { toDay, fromDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const ids = (rows) => rows.map((r) => r.id);

test('planning vide (sans argument, {} ou tableaux vides)', () => {
  for (const m of [new GanttModel(), new GanttModel({}), new GanttModel({ tasks: [], links: [] })]) {
    assert.deepEqual(m.getData(), { tasks: [], links: [] });
    assert.deepEqual(m.visibleRows(), []);
  }
});

test('aller-retour getData', () => {
  const data = {
    tasks: [
      t('a', '2026-10-05', '2026-10-09', { progress: 0.5 }),
      t('m', '2026-10-12', '2026-10-12', { milestone: true, className: 'jalon' }),
    ].map((x) => ({ parentId: null, progress: 0, ...x })),
    links: [{ id: 'l1', from: 'a', to: 'm', type: 'FS', lag: 0 }],
  };
  assert.deepEqual(new GanttModel(data).getData(), data);
});

test('un jalon sans fin prend son début', () => {
  const m = new GanttModel({ tasks: [{ id: 'm', name: 'm', start: '2026-10-12', milestone: true }] });
  assert.equal(fromDay(m.getTask('m').end), '2026-10-12');
});

test('erreurs de chargement avec message précis', () => {
  const bad = (tasks, re, links) => assert.throws(() => new GanttModel({ tasks, links }), re);
  bad([t('a', '2026-10-05', '2026-10-09'), t('a', '2026-10-05', '2026-10-09')], /dupliqué.*"a"/);
  bad([t('a', '2026-02-30', '2026-03-01')], /Tâche "a".*Date invalide/);
  bad([t('a', '2026-10-09', '2026-10-05')], /Tâche "a".*précède/);
  bad([{ id: 'a', name: 'a', end: '2026-10-05' }], /Tâche "a".*"start"/);
  bad([{ id: 'a', name: 'a', start: '2026-10-05' }], /Tâche "a".*"end"/);
  bad([t('a', '2026-10-05', '2026-10-09', { parentId: 'zzz' })], /parent inconnu "zzz"/);
  bad([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }], /Boucle/);
  bad([t('a', '2026-10-05', '2026-10-09', { progress: 1.5 })], /progress/);
  bad([t('m', '2026-10-05', '2026-10-06', { milestone: true })], /jalon/);
  bad([{ name: 'sans id' }], /"id"/);
  bad([t('a', '2026-10-05', '2026-10-09')], /inconnue/, [l('a', 'zzz')]);
  bad(
    [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-05', '2026-10-09')],
    /cycle/,
    [l('a', 'b'), l('b', 'a')],
  );
  assert.throws(() => new GanttModel({ tasks: 'x' }), /"tasks"/);
});

test('groupes : dates agrégées depuis les enfants, ordre d\'affichage et repli', () => {
  const m = new GanttModel({
    tasks: [
      { id: 'g', name: 'g' },
      t('c1', '2026-10-05', '2026-10-07', { parentId: 'g' }),
      t('c2', '2026-10-06', '2026-10-10', { parentId: 'g' }),
      t('x', '2026-10-12', '2026-10-13'),
    ],
  });
  assert.equal(m.isGroup('g'), true);
  assert.equal(m.isGroup('c1'), false);
  assert.equal(fromDay(m.getTask('g').start), '2026-10-05');
  assert.equal(fromDay(m.getTask('g').end), '2026-10-10');
  assert.deepEqual(m.visibleRows(), [
    { id: 'g', depth: 0 },
    { id: 'c1', depth: 1 },
    { id: 'c2', depth: 1 },
    { id: 'x', depth: 0 },
  ]);
  assert.deepEqual(m.descendantsOf('g'), ['c1', 'c2']);
  assert.deepEqual(m.leafIdsUnder('g'), ['c1', 'c2']);
  assert.deepEqual(m.leafIdsUnder('x'), ['x']);
  assert.deepEqual(m.ancestorsOf('c1'), ['g']);
  assert.deepEqual(ids(m.childrenOf('g')), ['c1', 'c2']);
});

test('groupes imbriqués repliés', () => {
  const m = new GanttModel({
    tasks: [
      { id: 'g', name: 'g', collapsed: true },
      { id: 'h', name: 'h', parentId: 'g' },
      t('c', '2026-10-05', '2026-10-07', { parentId: 'h' }),
    ],
  });
  assert.deepEqual(ids(m.visibleRows()), ['g']);
  assert.deepEqual(m.leafIdsUnder('g'), ['c']);
  assert.equal(fromDay(m.getTask('g').start), '2026-10-05');
});

test('progressOf : moyenne pondérée par la durée pour un groupe', () => {
  const m = new GanttModel({
    tasks: [
      { id: 'g', name: 'g' },
      t('c1', '2026-10-05', '2026-10-05', { parentId: 'g', progress: 1 }),
      t('c2', '2026-10-06', '2026-10-08', { parentId: 'g', progress: 0 }),
    ],
  });
  assert.equal(m.progressOf('g'), 0.25);
  assert.equal(m.progressOf('c1'), 1);
});

test('liens : ajout, id auto, doublon, suppression', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-12', '2026-10-14')] });
  const r = m.addLink({ from: 'a', to: 'b' });
  assert.equal(r.ok, true);
  assert.match(r.link.id, /^l\d+$/);
  assert.equal(r.link.type, 'FS');
  assert.equal(r.link.lag, 0);
  assert.match(m.addLink({ from: 'a', to: 'b' }).reason, /existe déjà/);
  assert.equal(m.addLink({ from: 'a', to: 'b', type: 'SS' }).ok, true);
  assert.equal(m.removeLink(r.link.id), true);
  assert.equal(m.removeLink(r.link.id), false);
  assert.equal(m.links.length, 1);
});

test('liens : refus (inconnu, soi-même, type, lag, cycle)', () => {
  const m = new GanttModel({
    tasks: [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-12', '2026-10-14'), t('c', '2026-10-15', '2026-10-16')],
    links: [l('a', 'b'), l('b', 'c')],
  });
  assert.match(m.addLink(l('a', 'zzz')).reason, /cible inconnue/);
  assert.match(m.addLink(l('zzz', 'a')).reason, /source inconnue/);
  assert.match(m.addLink(l('a', 'a')).reason, /elle-même/);
  assert.match(m.addLink({ from: 'a', to: 'c', type: 'XX' }).reason, /type/);
  assert.match(m.addLink({ from: 'a', to: 'c', lag: 1.5 }).reason, /entier/);
  assert.match(m.addLink(l('c', 'a')).reason, /cycle/);
  assert.equal(m.links.length, 2);
});

test('liens et groupes : parent/enfant interdit, cycle via un groupe détecté', () => {
  const m = new GanttModel({
    tasks: [
      { id: 'g', name: 'g' },
      t('c1', '2026-10-05', '2026-10-07', { parentId: 'g' }),
      t('c2', '2026-10-06', '2026-10-10', { parentId: 'g' }),
      t('x', '2026-10-12', '2026-10-13'),
    ],
  });
  assert.match(m.addLink(l('g', 'c1')).reason, /groupe/);
  assert.match(m.addLink(l('c1', 'g')).reason, /groupe/);
  assert.equal(m.addLink(l('x', 'g')).ok, true);
  assert.match(m.addLink(l('g', 'x')).reason, /cycle/);
  assert.match(m.addLink(l('c1', 'x')).reason, /cycle/);
});

test('clone est indépendant', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-09'), t('b', '2026-10-12', '2026-10-14')] });
  const c = m.clone();
  c.addLink(l('a', 'b'));
  assert.equal(m.links.length, 0);
  assert.equal(c.links.length, 1);
  assert.equal(c.getTask('a').start, toDay('2026-10-05'));
});

test('import : la racine doit être un objet { tasks, links }', () => {
  for (const bad of [null, [], 'x', 42]) {
    assert.throws(() => new GanttModel(bad), /objet/, String(bad));
  }
  assert.throws(() => new GanttModel({ task: [] }), /clé inconnue "task"/);
  assert.doesNotThrow(() => new GanttModel({ tasks: [], links: [] }));
});
