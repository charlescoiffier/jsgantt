import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDay, fromDay, dayOfWeek, ymd, dayFromYMD } from '../src/dates.js';

test('toDay : epoch et jour suivant', () => {
  assert.equal(toDay('1970-01-01'), 0);
  assert.equal(toDay('1970-01-02'), 1);
});

test('fromDay est l\'inverse de toDay', () => {
  for (const s of ['2026-10-13', '2028-02-29', '1999-12-31', '0099-03-04']) {
    assert.equal(fromDay(toDay(s)), s);
  }
});

test('année bissextile : 2028-02-28 -> 2028-03-01 = 2 jours', () => {
  assert.equal(toDay('2028-03-01') - toDay('2028-02-28'), 2);
});

test('année non bissextile : 2027-02-28 -> 2027-03-01 = 1 jour', () => {
  assert.equal(toDay('2027-03-01') - toDay('2027-02-28'), 1);
});

test('passage de l\'année et changement d\'heure sans décalage', () => {
  assert.equal(toDay('2027-01-01') - toDay('2026-12-31'), 1);
  assert.equal(toDay('2026-10-26') - toDay('2026-10-24'), 2);
});

test('dates invalides rejetées', () => {
  for (const s of ['2026-02-30', '2026-13-01', '2026-1-1', 'abc', '', '2026-10-13T00:00']) {
    assert.throws(() => toDay(s), /Date invalide/, s);
  }
  assert.throws(() => toDay(20261013), /Date invalide/);
  assert.throws(() => toDay(undefined), /Date invalide/);
});

test('dayOfWeek', () => {
  assert.equal(dayOfWeek(toDay('2026-10-13')), 2);
  assert.equal(dayOfWeek(toDay('2026-10-11')), 0);
  assert.equal(dayOfWeek(toDay('2026-10-10')), 6);
});

test('ymd et dayFromYMD', () => {
  assert.deepEqual(ymd(toDay('2026-10-13')), { year: 2026, month: 9, day: 13 });
  assert.equal(dayFromYMD(2026, 9, 13), toDay('2026-10-13'));
  assert.equal(dayFromYMD(2026, 12, 1), toDay('2027-01-01'));
  assert.equal(dayFromYMD(2026, 0, 1) - 1, toDay('2025-12-31'));
});
