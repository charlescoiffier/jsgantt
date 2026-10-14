import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { GanttError } from '../src/i18n.js';
import { fromDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const owners = [{ id: 'ana', name: 'Ana' }, { id: 'bob', name: 'Bob' }];
const grab = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

test('couleur et responsable : chargés, exportés seulement s’ils sont définis', () => {
  const m = new GanttModel({
    owners,
    tasks: [t('a', '2026-10-05', '2026-10-06', { color: 'teal', owner: 'ana' }), t('b', '2026-10-07', '2026-10-08')],
  });
  const data = m.getData();
  assert.deepEqual(data.owners, owners);
  assert.equal(data.tasks[0].color, 'teal');
  assert.equal(data.tasks[0].owner, 'ana');
  assert.equal('color' in data.tasks[1] || 'owner' in data.tasks[1], false);
  assert.equal(m.ownerName('ana'), 'Ana');
  assert.equal(m.ownerName(null), '');
  assert.equal('owners' in new GanttModel({ tasks: [] }).getData(), false);
  assert.deepEqual(new GanttModel(data).getData(), data);
});

test('import invalide : couleur, responsable inconnu, liste de responsables', () => {
  const bad = (d) => grab(() => new GanttModel(d));
  const cases = [
    [{ tasks: [t('a', '2026-10-05', '2026-10-06', { color: 'fuchsia' })] }, 'task.color'],
    [{ tasks: [t('a', '2026-10-05', '2026-10-06', { owner: 'zoe' })] }, 'task.owner'],
    [{ owners: {} }, 'data.ownersNotArray'],
    [{ owners: [{ name: 'X' }] }, 'owner.idRequired'],
    [{ owners: [{ id: 'x', name: 'X' }, { id: 'x', name: 'Y' }] }, 'owner.duplicateId'],
    [{ owners: [{ id: 'x', name: ' ' }] }, 'owner.nameRequired'],
  ];
  for (const [d, code] of cases) {
    const e = bad(d);
    assert.ok(e instanceof GanttError, code);
    assert.equal(e.code, code);
  }
});

test('responsables : ajouter, renommer, supprimer (les tâches perdent ce responsable)', () => {
  const m = new GanttModel({ owners, tasks: [t('a', '2026-10-05', '2026-10-06', { owner: 'bob' })] });
  const r = m.addOwner('Chloé');
  assert.deepEqual(r.owner, { id: 'o1', name: 'Chloé' });
  assert.equal(m.addOwner('  ').code, 'owner.nameRequired');
  assert.equal(m.renameOwner('bob', 'Robert').ok, true);
  assert.equal(m.ownerName('bob'), 'Robert');
  assert.equal(m.renameOwner('zoe', 'Z').code, 'owner.unknown');
  assert.equal(m.removeOwner('bob').ok, true);
  assert.equal(m.getTask('a').owner, null);
  assert.deepEqual(m.owners.map((o) => o.id), ['ana', 'o1']);
  assert.equal(m.removeOwner('bob').code, 'owner.unknown');
});

test('setOwners : remplace la liste, valide avant de changer quoi que ce soit', () => {
  const m = new GanttModel({ owners, tasks: [t('a', '2026-10-05', '2026-10-06', { owner: 'ana' }), t('b', '2026-10-05', '2026-10-06', { owner: 'bob' })] });
  assert.equal(m.setOwners([{ id: 'x', name: '' }]).code, 'owner.nameRequired');
  assert.equal(m.owners.length, 2);
  assert.equal(m.setOwners([{ id: 'ana', name: 'Anaïs' }, { name: 'Nouveau' }]).ok, true);
  assert.deepEqual(m.owners, [{ id: 'ana', name: 'Anaïs' }, { id: 'o1', name: 'Nouveau' }]);
  assert.equal(m.getTask('a').owner, 'ana');
  assert.equal(m.getTask('b').owner, null);
});

test('updateTaskProps : tout ou rien', () => {
  const m = new GanttModel({
    owners,
    tasks: [t('a', '2026-10-05', '2026-10-06'), t('b', '2026-10-07', '2026-10-08')],
    links: [l('a', 'b')],
  });
  const ok = m.updateTaskProps('b', {
    name: 'Beta', start: '2026-10-09', end: '2026-10-12', progress: 0.5, color: 'pink', owner: 'ana',
    constraint: { type: 'FNLT', date: '2026-10-20' },
  });
  assert.equal(ok.ok, true);
  const b = m.getTask('b');
  assert.deepEqual([b.name, fromDay(b.start), fromDay(b.end), b.progress, b.color, b.owner], ['Beta', '2026-10-09', '2026-10-12', 0.5, 'pink', 'ana']);
  assert.equal(m.constraintOf('b').type, 'FNLT');
  const before = JSON.stringify(m.getData());
  // date bloquée par le lien : rien n'est appliqué, ni le nom ni la couleur
  assert.equal(m.updateTaskProps('b', { name: 'X', color: 'red', start: '2026-10-01', end: '2026-10-02' }).code, 'update.blocked');
  assert.equal(m.updateTaskProps('b', { color: 'fuchsia', name: 'X' }).code, 'task.color');
  assert.equal(m.updateTaskProps('b', { owner: 'zoe' }).code, 'task.owner');
  assert.equal(m.updateTaskProps('b', { progress: 2 }).code, 'task.progressRange');
  assert.equal(m.updateTaskProps('b', { constraint: { type: 'XX', date: '2026-10-01' } }).code, 'constraint.type');
  assert.equal(JSON.stringify(m.getData()), before);
  assert.equal(m.updateTaskProps('b', { color: null, owner: null, constraint: null }).ok, true);
  assert.deepEqual([m.getTask('b').color, m.getTask('b').owner, m.constraintOf('b')], [null, null, null]);
});

test('updateTaskProps sur un groupe : couleur et responsable oui, dates et progression non', () => {
  const m = new GanttModel({ owners, tasks: [{ id: 'g', name: 'G' }, t('c', '2026-10-05', '2026-10-06', { parentId: 'g' })] });
  assert.equal(m.updateTaskProps('g', { color: 'indigo', owner: 'bob', name: 'Groupe' }).ok, true);
  assert.deepEqual([m.getTask('g').color, m.getTask('g').owner, m.getTask('g').name], ['indigo', 'bob', 'Groupe']);
  assert.equal(m.updateTaskProps('g', { progress: 0.5 }).code, 'progress.group');
  assert.equal(m.updateTaskProps('g', { constraint: { type: 'SNET', date: '2026-10-05' } }).code, 'constraint.group');
});
