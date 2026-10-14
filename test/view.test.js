import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { normalizeColumns, wbsNumbers, matchesText, viewRows, DEFAULT_COLUMNS } from '../src/view.js';
import { t, l } from './helpers.js';

const model = () =>
  new GanttModel({
    tasks: [
      { id: 'g', name: 'Développement' },
      t('b', '2026-10-12', '2026-10-14', { parentId: 'g', name: 'Rendu', progress: 0.5 }),
      t('a', '2026-10-05', '2026-10-09', { parentId: 'g', name: 'Noyau' }),
      t('c', '2026-10-01', '2026-10-20', { name: 'Écriture de la doc' }),
      t('d', '2026-10-02', '2026-10-03', { name: 'atelier' }),
    ],
    links: [l('a', 'b')],
  });
const ids = (rows) => rows.map((r) => `${r.id}${r.depth ? `:${r.depth}` : ''}`).join(' ');

test('colonnes : « name » toujours en premier, ids intégrés et colonnes personnalisées', () => {
  assert.deepEqual(normalizeColumns().map((c) => c.id), DEFAULT_COLUMNS);
  assert.deepEqual(normalizeColumns(['end', 'name', 'progress', 'end']).map((c) => c.id), ['name', 'end', 'progress']);
  const [, custom] = normalizeColumns([{ id: 'team', label: 'Responsable', width: 90, value: (task) => task.data?.owner }]);
  assert.deepEqual([custom.id, custom.label, custom.width, custom.builtin], ['team', 'Responsable', 90, false]);
  assert.throws(() => normalizeColumns(['nope']), /Colonne inconnue/);
  assert.throws(() => normalizeColumns([{ id: 'start', value: () => '' }]), /déjà utilisé/);
  assert.throws(() => normalizeColumns([{ id: 'x' }]), /Colonne personnalisée/);
});

test('numéros hiérarchiques dans l’ordre du plan', () => {
  assert.deepEqual([...wbsNumbers(model())], [['g', '1'], ['b', '1.1'], ['a', '1.2'], ['c', '2'], ['d', '3']]);
});

test('filtre texte : casse et accents ignorés', () => {
  const task = { name: 'Écriture de la DOC' };
  assert.equal(matchesText(task, 'ecriture'), true);
  assert.equal(matchesText(task, ' doc '), true);
  assert.equal(matchesText(task, 'code'), false);
});

test('sans tri ni filtre : ordre du plan et repli respecté', () => {
  const m = model();
  assert.equal(ids(viewRows(m)), 'g b:1 a:1 c d');
  m.toggleCollapsed('g');
  assert.equal(ids(viewRows(m)), 'g c d');
});

test('tri entre sœurs : la hiérarchie est conservée', () => {
  const m = model();
  assert.equal(ids(viewRows(m, { sort: { column: 'start', dir: 'asc' } })), 'c d g a:1 b:1');
  assert.equal(ids(viewRows(m, { sort: { column: 'start', dir: 'desc' } })), 'g b:1 a:1 d c');
  assert.equal(ids(viewRows(m, { sort: { column: 'name', dir: 'asc' } })), 'd g a:1 b:1 c');
  assert.equal(ids(viewRows(m, { sort: { column: 'progress', dir: 'desc' } })), 'g b:1 a:1 c d');
  assert.equal(ids(viewRows(m, { sort: { column: 'duration', dir: 'asc' } })), 'd g b:1 a:1 c');
  assert.equal(ids(viewRows(m, { sort: { column: 'wbs', dir: 'desc' } })), 'd c g a:1 b:1');
});

test('tri sur une colonne personnalisée (texte avec nombres)', () => {
  const m = new GanttModel({
    tasks: [t('x', '2026-10-01', '2026-10-01', { data: { lot: 'L10' } }), t('y', '2026-10-01', '2026-10-01', { data: { lot: 'L9' } })],
  });
  const columns = normalizeColumns([{ id: 'lot', value: (task) => task.data.lot }]);
  assert.equal(ids(viewRows(m, { sort: { column: 'lot', dir: 'asc' }, columns })), 'y x');
});

test('filtre : les groupes parents restent affichés, même repliés ; fonction acceptée', () => {
  const m = model();
  m.toggleCollapsed('g');
  assert.equal(ids(viewRows(m, { filter: 'noyau' })), 'g a:1');
  assert.equal(ids(viewRows(m, { filter: (task) => task.progress > 0 })), 'g b:1');
  assert.equal(ids(viewRows(m, { filter: 'introuvable' })), '');
  assert.equal(ids(viewRows(m, { filter: '' })), 'g c d');
});

test('champ libre data : conservé, copié, validé, modifiable', () => {
  const raw = { owner: 'Ana', tags: ['ui'] };
  const m = new GanttModel({ tasks: [t('a', '2026-10-01', '2026-10-02', { data: raw })] });
  raw.owner = 'Bob';
  assert.deepEqual(m.getData().tasks[0].data, { owner: 'Ana', tags: ['ui'] });
  assert.equal('data' in new GanttModel({ tasks: [t('b', '2026-10-01', '2026-10-02')] }).getData().tasks[0], false);
  assert.throws(() => new GanttModel({ tasks: [t('a', '2026-10-01', '2026-10-02', { data: [1] })] }), /data/);
  assert.equal(m.updateTask('a', { data: { owner: 'Cy' } }).ok, true);
  assert.deepEqual(m.getTask('a').data, { owner: 'Cy' });
  assert.equal(m.updateTask('a', { data: 'x' }).code, 'task.data');
});
