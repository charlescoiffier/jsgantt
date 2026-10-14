import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { toDay, fromDay } from '../src/dates.js';
import { periodRange, viewRows, normalizeColumns, BUILTIN_COLUMNS } from '../src/view.js';
import { t, l } from './helpers.js';

const today = toDay('2026-10-14'); // mercredi
const range = (p, ws) => periodRange(p, today, ws).map((d) => (d === null ? null : fromDay(d))).join('..');

test('périodes relatives à aujourd’hui', () => {
  assert.equal(range('today'), '2026-10-14..2026-10-14');
  assert.equal(range('thisWeek'), '2026-10-12..2026-10-18');
  assert.equal(range('thisWeek', 0), '2026-10-11..2026-10-17'); // semaine commençant le dimanche
  assert.equal(range('nextWeek'), '2026-10-19..2026-10-25');
  assert.equal(range('thisMonth'), '2026-10-01..2026-10-31');
  assert.equal(range('nextMonth'), '2026-11-01..2026-11-30');
  assert.equal(range('next30'), '2026-10-14..2026-11-12');
  assert.equal(range('past'), '..2026-10-13');
  assert.equal(range('future'), '2026-10-15..');
  assert.equal(fromDay(periodRange('nextMonth', toDay('2026-12-20'))[0]), '2027-01-01');
  assert.throws(() => periodRange('someday', today), /Période inconnue/);
});

const model = () =>
  new GanttModel({
    owners: [{ id: 'ana', name: 'Ana' }, { id: 'bob', name: 'Bob' }],
    tasks: [
      { id: 'g', name: 'Groupe' },
      t('a', '2026-10-05', '2026-10-09', { parentId: 'g', name: 'Alpha', progress: 1, owner: 'ana' }),
      t('b', '2026-10-12', '2026-10-16', { parentId: 'g', name: 'Beta', progress: 0.5, owner: 'bob' }),
      t('c', '2026-10-20', '2026-10-30', { name: 'Gamma' }),
      t('d', '2026-11-02', '2026-11-03', { name: 'Delta', owner: 'ana' }),
    ],
    links: [l('a', 'b')],
  });
const cols = normalizeColumns(BUILTIN_COLUMNS);
const ids = (filters, extra = {}) => viewRows(model(), { columns: cols, filters, today, ...extra }).map((r) => r.id).join(' ');

test('filtres de dates : période, avant (exclu), après (exclu), entre (inclus)', () => {
  assert.equal(ids({ start: { period: 'thisWeek' } }), 'g b');
  assert.equal(ids({ end: { period: 'past' } }), 'g a');
  assert.equal(ids({ start: { before: '2026-10-12' } }), 'g a');
  assert.equal(ids({ start: { after: '2026-10-12' } }), 'c d');
  assert.equal(ids({ end: { from: '2026-10-16', to: '2026-10-30' } }), 'g b c');
  assert.equal(ids({ start: { period: 'nextMonth' } }), 'd');
});

test('filtres numériques, états, responsables, texte, N°', () => {
  assert.equal(ids({ duration: { min: 5, max: 5 } }), 'g a b');
  assert.equal(ids({ duration: { max: 2 } }), 'd');
  assert.equal(ids({ progress: { states: ['todo'] } }), 'c d');
  assert.equal(ids({ progress: { states: ['doing', 'done'] } }), 'g a b');
  assert.equal(ids({ owner: { in: ['ana'] } }), 'g a d');
  assert.equal(ids({ owner: { in: [null] } }), 'g c'); // le groupe lui-même n'a pas de responsable
  assert.equal(ids({ name: { contains: 'ET' } }), 'g b');
  assert.equal(ids({ wbs: { prefix: '1' } }), 'g a b');
  assert.equal(ids({ wbs: { prefix: '1.2' } }), 'g b');
  assert.equal(ids({ slack: { critical: true } }), 'd');
  assert.equal(ids({ slack: { max: 4 } }), 'c d');
});

test('filtres combinés entre eux et avec la recherche ; filtres vides ignorés', () => {
  assert.equal(ids({ owner: { in: ['ana'] }, start: { after: '2026-10-01' } }), 'g a d');
  assert.equal(ids({ owner: { in: ['ana'] }, start: { after: '2026-10-10' } }), 'd');
  assert.equal(ids({ owner: { in: ['ana'] } }, { filter: 'alp' }), 'g a');
  assert.equal(ids({ name: { contains: '  ' }, owner: { in: [] }, start: {} }), 'g a b c d');
});

test('un filtre sur une colonne non affichée ne s’applique pas', () => {
  const rows = viewRows(model(), { columns: normalizeColumns(['start']), filters: { owner: { in: ['bob'] } }, today });
  assert.equal(rows.length, 5);
});
