import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timescale, SCALES } from '../src/timescale.js';
import { toDay } from '../src/dates.js';

const day = (opts) =>
  new Timescale({
    scale: 'day',
    colWidths: { day: 20 },
    originDay: toDay('2026-10-01'),
    endDay: toDay('2026-10-07'),
    ...opts,
  });

test('SCALES', () => {
  assert.deepEqual(SCALES, ['day', 'week', 'month']);
});

test('conversions date <-> pixel (échelle jour)', () => {
  const ts = day();
  assert.equal(ts.pixelsPerDay, 20);
  assert.equal(ts.dayToX(toDay('2026-10-03')), 40);
  assert.equal(ts.xToDay(40), toDay('2026-10-03'));
  assert.equal(ts.xToDay(59), toDay('2026-10-03'));
  assert.equal(ts.xToDay(60), toDay('2026-10-04'));
  assert.equal(ts.totalWidth, 140);
});

test('barWidth : fin incluse', () => {
  const ts = day();
  assert.equal(ts.barWidth(toDay('2026-10-01'), toDay('2026-10-03')), 60);
  assert.equal(ts.barWidth(toDay('2026-10-01'), toDay('2026-10-01')), 20);
});

test('pixels par jour selon l\'échelle', () => {
  const mk = (scale) =>
    new Timescale({ scale, colWidths: { day: 28, week: 70, month: 120 }, originDay: 0, endDay: 10 });
  assert.equal(mk('day').pixelsPerDay, 28);
  assert.equal(mk('week').pixelsPerDay, 10);
  assert.equal(mk('month').pixelsPerDay, 4);
});

test('paramètres invalides', () => {
  assert.throws(() => new Timescale({ scale: 'an', originDay: 0, endDay: 1 }), /Échelle inconnue/);
  assert.throws(() => new Timescale({ originDay: 5, endDay: 1 }), /Plage/);
  assert.throws(() => new Timescale({ endDay: 1 }), /Plage/);
});

test('en-tête, échelle jour', () => {
  const { top, bottom } = day().headerCells();
  assert.equal(top.length, 1);
  assert.equal(top[0].label, 'octobre 2026');
  assert.equal(top[0].x, 0);
  assert.equal(top[0].width, 140);
  assert.deepEqual(bottom.map((c) => c.label), ['1', '2', '3', '4', '5', '6', '7']);
  assert.ok(bottom.every((c) => c.width === 20));
  assert.deepEqual(bottom.map((c) => c.weekend), [false, false, true, true, false, false, false]);
});

test('en-tête : un mois à cheval sur deux mois', () => {
  const { top } = day({ originDay: toDay('2026-10-30'), endDay: toDay('2026-11-02') }).headerCells();
  assert.deepEqual(top.map((c) => [c.label, c.x, c.width]), [
    ['octobre 2026', 0, 40],
    ['novembre 2026', 40, 40],
  ]);
});

test('en-tête, échelle semaine : semaines commençant le lundi', () => {
  const ts = new Timescale({
    scale: 'week',
    colWidths: { week: 70 },
    originDay: toDay('2026-10-05'),
    endDay: toDay('2026-10-18'),
  });
  const { top, bottom } = ts.headerCells();
  assert.deepEqual(bottom.map((c) => [c.label, c.x, c.width]), [['5', 0, 70], ['12', 70, 70]]);
  assert.deepEqual(top.map((c) => [c.label, c.width]), [['octobre 2026', 140]]);
});

test('en-tête, échelle semaine : première semaine tronquée', () => {
  const ts = new Timescale({
    scale: 'week',
    colWidths: { week: 70 },
    originDay: toDay('2026-10-07'),
    endDay: toDay('2026-10-11'),
  });
  const { bottom } = ts.headerCells();
  assert.equal(bottom.length, 1);
  assert.equal(bottom[0].x, 0);
  assert.equal(bottom[0].width, 50);
});

test('en-tête, échelle mois (année entière)', () => {
  const ts = new Timescale({
    scale: 'month',
    colWidths: { month: 120 },
    originDay: toDay('2026-01-01'),
    endDay: toDay('2026-12-31'),
  });
  const { top, bottom } = ts.headerCells();
  assert.deepEqual(top.map((c) => [c.label, c.width]), [['2026', 365 * 4]]);
  assert.equal(bottom.length, 12);
  assert.deepEqual([bottom[0].label, bottom[0].width], ['janv.', 124]);
  assert.deepEqual([bottom[1].label, bottom[1].width], ['févr.', 112]);
});

test('en-tête, échelle mois à cheval sur deux années', () => {
  const ts = new Timescale({
    scale: 'month',
    colWidths: { month: 120 },
    originDay: toDay('2026-12-15'),
    endDay: toDay('2027-01-10'),
  });
  const { top, bottom } = ts.headerCells();
  assert.deepEqual(top.map((c) => c.label), ['2026', '2027']);
  assert.deepEqual(bottom.map((c) => c.label), ['déc.', 'janv.']);
});

test('week-ends', () => {
  const ts = day({ originDay: toDay('2026-10-09'), endDay: toDay('2026-10-12') });
  assert.deepEqual(ts.weekendRects(), [{ x: 20, width: 20 }, { x: 40, width: 20 }]);
  const month = new Timescale({ scale: 'month', originDay: 0, endDay: 100 });
  assert.deepEqual(month.weekendRects(), []);
});
