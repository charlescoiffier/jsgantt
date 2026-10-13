import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { Timescale } from '../src/timescale.js';
import { toDay } from '../src/dates.js';
import { computeLayout, routeLink, roundedPath, MIN_BAR_WIDTH } from '../src/renderer.js';
import { t } from './helpers.js';

const metrics = {
  rowHeight: 32, barHeight: 18, headerHeight: 48, tableWidth: 300,
  dateColWidth: 80, indent: 16, linkGap: 10, linkRadius: 4,
};
const ts = (opts = {}) =>
  new Timescale({
    scale: 'day',
    colWidths: { day: 20 },
    originDay: toDay('2026-10-01'),
    endDay: toDay('2026-10-31'),
    ...opts,
  });
const barOf = (layout, id) => layout.bars.find((b) => b.id === id);

test('planning vide : mise en page sans exception', () => {
  const layout = computeLayout(new GanttModel(), ts(), metrics);
  assert.equal(layout.bars.length, 0);
  assert.equal(layout.links.length, 0);
  assert.equal(layout.height, 48);
  assert.equal(layout.width, 300 + 31 * 20);
});

test('géométrie d\'une barre de tâche', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-07', { progress: 0.5 })] });
  const layout = computeLayout(m, ts(), metrics);
  const b = barOf(layout, 'a');
  assert.deepEqual(
    [b.kind, b.x, b.y, b.width, b.height, b.progressWidth],
    ['task', 300 + 4 * 20, 48 + 7, 60, 18, 30],
  );
  assert.equal(layout.height, 48 + 32);
  assert.deepEqual(layout.rows, [{ id: 'a', y: 48, alt: false }]);
});

test('jalon : losange de la hauteur de barre centré sur le jour', () => {
  const m = new GanttModel({ tasks: [t('m', '2026-10-05', '2026-10-05', { milestone: true })] });
  const b = barOf(computeLayout(m, ts(), metrics), 'm');
  assert.equal(b.kind, 'milestone');
  assert.equal(b.width, 18);
  assert.equal(b.x + b.width / 2, 300 + 4 * 20 + 10);
});

test('barre minimale visible à très petite échelle (tâche d\'un jour)', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-05')] });
  const small = ts({ scale: 'month', colWidths: { month: 30 } });
  assert.equal(barOf(computeLayout(m, small, metrics), 'a').width, MIN_BAR_WIDTH);
});

test('groupe : barre agrégée, progression pondérée, ligne de tableau', () => {
  const m = new GanttModel({
    tasks: [
      { id: 'g', name: 'Groupe' },
      t('c1', '2026-10-05', '2026-10-05', { parentId: 'g', progress: 1 }),
      t('c2', '2026-10-06', '2026-10-08', { parentId: 'g' }),
    ],
  });
  const layout = computeLayout(m, ts(), metrics);
  const g = barOf(layout, 'g');
  assert.equal(g.kind, 'group');
  assert.equal(g.width, 4 * 20);
  assert.equal(g.progress, 0.25);
  const rows = layout.table.rows;
  assert.deepEqual(rows.map((r) => [r.id, r.depth, r.group]), [['g', 0, true], ['c1', 1, false], ['c2', 1, false]]);
  assert.equal(rows[0].startLabel, '2026-10-05');
  assert.equal(rows[0].endLabel, '2026-10-08');
  assert.deepEqual(layout.rows.map((r) => r.alt), [false, true, false]);
});

test('en-tête, grille, week-ends et aujourd\'hui', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-07')] });
  const layout = computeLayout(m, ts(), metrics, { today: toDay('2026-10-03') });
  assert.equal(layout.header.bottom.length, 31);
  assert.equal(layout.header.bottom[0].x, 300);
  assert.equal(layout.weekends[0].x, 300 + 2 * 20);
  assert.equal(layout.today.x, 300 + 2 * 20 + 10);
  assert.equal(computeLayout(m, ts(), metrics, { today: toDay('2027-01-01') }).today, null);
  assert.equal(layout.gridLines.length, 31);
});

test('lien FS : points de départ et d\'arrivée sur les bords des barres', () => {
  const m = new GanttModel({
    tasks: [t('a', '2026-10-05', '2026-10-07'), t('b', '2026-10-12', '2026-10-14')],
    links: [{ id: 'l1', from: 'a', to: 'b', type: 'FS', lag: 0 }],
  });
  const layout = computeLayout(m, ts(), metrics);
  const [link] = layout.links;
  const a = barOf(layout, 'a');
  const b = barOf(layout, 'b');
  assert.equal(link.type, 'FS');
  assert.deepEqual(link.points[0], { x: a.x + a.width, y: a.y + 9 });
  assert.deepEqual(link.points.at(-1), { x: b.x, y: b.y + 9 });
  assert.match(link.d, /^M/);
});

test('lien dont une extrémité est dans un groupe replié : rattaché au groupe', () => {
  const m = new GanttModel({
    tasks: [
      { id: 'g', name: 'g', collapsed: true },
      t('c1', '2026-10-05', '2026-10-07', { parentId: 'g' }),
      t('c2', '2026-10-08', '2026-10-09', { parentId: 'g' }),
      t('x', '2026-10-20', '2026-10-22'),
    ],
    links: [
      { id: 'l1', from: 'c2', to: 'x', type: 'FS', lag: 0 },
      { id: 'l2', from: 'c1', to: 'c2', type: 'FS', lag: 0 },
    ],
  });
  const layout = computeLayout(m, ts(), metrics);
  assert.deepEqual(layout.bars.map((b) => b.id), ['g', 'x']);
  assert.equal(layout.links.length, 1);
  assert.deepEqual([layout.links[0].fromId, layout.links[0].toId], ['g', 'x']);
});

test('sélection reflétée dans la mise en page', () => {
  const m = new GanttModel({
    tasks: [t('a', '2026-10-05', '2026-10-07'), t('b', '2026-10-12', '2026-10-14')],
    links: [{ id: 'l1', from: 'a', to: 'b', type: 'FS', lag: 0 }],
  });
  const layout = computeLayout(m, ts(), metrics, { selectedId: 'a', selectedLinkId: 'l1' });
  assert.equal(barOf(layout, 'a').selected, true);
  assert.equal(barOf(layout, 'b').selected, false);
  assert.equal(layout.links[0].selected, true);
  assert.equal(layout.table.rows[0].selected, true);
});

test('routeLink : FS direct', () => {
  const pts = routeLink({ x: 100, y: 20 }, 'end', { x: 200, y: 52 }, 'start', 10, 32);
  assert.deepEqual(pts, [{ x: 100, y: 20 }, { x: 190, y: 20 }, { x: 190, y: 52 }, { x: 200, y: 52 }]);
});

test('routeLink : FS avec contournement quand B commence avant la fin de A', () => {
  const pts = routeLink({ x: 100, y: 20 }, 'end', { x: 105, y: 52 }, 'start', 10, 32);
  assert.deepEqual(pts, [
    { x: 100, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 36 },
    { x: 95, y: 36 }, { x: 95, y: 52 }, { x: 105, y: 52 },
  ]);
});

test('routeLink : SS, FF, SF', () => {
  assert.deepEqual(
    routeLink({ x: 100, y: 20 }, 'start', { x: 150, y: 52 }, 'start', 10, 32).map((p) => p.x),
    [100, 90, 90, 150],
  );
  assert.deepEqual(
    routeLink({ x: 100, y: 20 }, 'end', { x: 80, y: 52 }, 'end', 10, 32).map((p) => p.x),
    [100, 110, 110, 80],
  );
  assert.deepEqual(
    routeLink({ x: 200, y: 20 }, 'start', { x: 100, y: 52 }, 'end', 10, 32).map((p) => p.x),
    [200, 110, 110, 100],
  );
  assert.equal(routeLink({ x: 100, y: 20 }, 'start', { x: 150, y: 52 }, 'end', 10, 32).length, 6);
});

test('routeLink : cible au-dessus -> le contournement passe au-dessus', () => {
  const pts = routeLink({ x: 100, y: 52 }, 'end', { x: 105, y: 20 }, 'start', 10, 32);
  assert.equal(pts[2].y, 36);
});

test('roundedPath : coins arrondis et segments dégénérés', () => {
  assert.equal(
    roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 4),
    'M0,0 L6,0 Q10,0 10,4 L10,10',
  );
  assert.equal(roundedPath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }], 4), 'M0,0 L10,0');
  assert.equal(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 4), 'M0,0 L10,0');
});
