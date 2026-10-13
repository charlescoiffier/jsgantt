import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { describeTask, announceChange } from '../src/a11y.js';
import { t, l } from './helpers.js';

const model = () =>
  new GanttModel({
    tasks: [
      t('a', '2026-10-05', '2026-10-09', { name: 'Conception', progress: 0.6 }),
      { id: 'g', name: 'Équipe' },
      t('c1', '2026-10-12', '2026-10-14', { parentId: 'g', name: 'Maquettes' }),
      t('m', '2026-10-20', '2026-10-20', { milestone: true, name: 'Livraison' }),
    ],
    links: [l('a', 'c1'), l('c1', 'm', 'SS')],
  });

test('describeTask : tâche simple avec niveau et progression', () => {
  assert.equal(describeTask(model(), 'a', 0), 'Conception, du 2026-10-05 au 2026-10-09, progression 60 %, niveau 1');
});

test('describeTask : prédécesseurs, niveau et jalon', () => {
  const m = model();
  assert.equal(
    describeTask(m, 'c1', 1),
    'Maquettes, du 2026-10-12 au 2026-10-14, progression 0 %, niveau 2, prédécesseurs : Conception (FS)',
  );
  assert.equal(
    describeTask(m, 'm', 0),
    'Livraison, jalon le 2026-10-20, niveau 1, prédécesseurs : Maquettes (SS)',
  );
});

test('describeTask : groupe replié ou déplié', () => {
  const m = model();
  assert.match(describeTask(m, 'g', 0), /^Équipe, du 2026-10-12 au 2026-10-14, progression 0 %, niveau 1, groupe de 1 tâche, déplié/);
  m.toggleCollapsed('g');
  assert.match(describeTask(m, 'g', 0), /groupe de 1 tâche, replié$/);
});

test('describeTask : nom vide', () => {
  const m = new GanttModel({ tasks: [t('x', '2026-10-05', '2026-10-05', { name: '' })] });
  assert.match(describeTask(m, 'x', 0), /^Tâche sans nom, /);
});

test('announceChange : messages par type d\'événement', () => {
  const m = model();
  assert.equal(announceChange(m, { type: 'move', id: 'a' }), 'Conception : du 2026-10-05 au 2026-10-09');
  assert.equal(announceChange(m, { type: 'progress', id: 'a' }), 'Conception : progression 60 %');
  assert.equal(announceChange(m, { type: 'add', id: 'a' }), 'Tâche ajoutée : Conception');
  assert.equal(announceChange(m, { type: 'remove', id: 'zzz' }), 'Tâche supprimée');
  assert.equal(announceChange(m, { type: 'link', from: 'a', to: 'c1', linkType: 'FS' }), 'Lien créé : Conception vers Maquettes (FS)');
  assert.equal(announceChange(m, { type: 'unlink', linkId: 'l1' }), 'Lien supprimé');
  assert.equal(announceChange(m, { type: 'undo' }), 'Annulé');
  assert.equal(announceChange(m, { type: 'redo' }), 'Rétabli');
  assert.equal(announceChange(m, { type: 'reorder', id: 'c1' }), 'Maquettes déplacée, niveau 2');
  assert.equal(announceChange(m, { type: 'collapse', id: 'g' }), null);
});
