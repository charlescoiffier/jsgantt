import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSTRAINT_TYPES, pushTarget, isViolated, constraintSide } from '../src/constraints.js';
import { createCalendar, WEEK } from '../src/calendar.js';
import { toDay, fromDay } from '../src/dates.js';

const d = toDay;
const all = createCalendar();
const ouvres = createCalendar({ workingDays: WEEK.OUVRES });

test('types de contrainte', () => {
  assert.deepEqual([...CONSTRAINT_TYPES].sort(), ['FNET', 'FNLT', 'MFO', 'MSO', 'SNET', 'SNLT']);
});

test('côté d\'une contrainte : début ou fin', () => {
  for (const t of ['SNET', 'SNLT', 'MSO']) assert.equal(constraintSide(t), 'start');
  for (const t of ['FNET', 'FNLT', 'MFO']) assert.equal(constraintSide(t), 'end');
});

test('pushTarget : borne inférieure pour SNET, FNET, MSO, MFO ; rien pour SNLT et FNLT', () => {
  assert.equal(pushTarget(all, 'SNET', d('2026-10-12')), d('2026-10-12'));
  assert.equal(pushTarget(all, 'FNET', d('2026-10-12')), d('2026-10-12'));
  assert.equal(pushTarget(all, 'MSO', d('2026-10-12')), d('2026-10-12'));
  assert.equal(pushTarget(all, 'MFO', d('2026-10-12')), d('2026-10-12'));
  assert.equal(pushTarget(all, 'SNLT', d('2026-10-12')), null);
  assert.equal(pushTarget(all, 'FNLT', d('2026-10-12')), null);
});

test('pushTarget avec un calendrier : début vers l\'avant, fin vers l\'arrière', () => {
  // samedi 10 octobre 2026
  assert.equal(fromDay(pushTarget(ouvres, 'SNET', d('2026-10-10'))), '2026-10-12'); // lundi
  assert.equal(fromDay(pushTarget(ouvres, 'MSO', d('2026-10-10'))), '2026-10-12');
  assert.equal(fromDay(pushTarget(ouvres, 'FNET', d('2026-10-10'))), '2026-10-09'); // vendredi
  assert.equal(fromDay(pushTarget(ouvres, 'MFO', d('2026-10-10'))), '2026-10-09');
});

test('isViolated : au plus tard dépassé', () => {
  const s = d('2026-10-12');
  const e = d('2026-10-16');
  assert.equal(isViolated(all, 'SNLT', d('2026-10-12'), s, e), false);
  assert.equal(isViolated(all, 'SNLT', d('2026-10-11'), s, e), true);
  assert.equal(isViolated(all, 'FNLT', d('2026-10-16'), s, e), false);
  assert.equal(isViolated(all, 'FNLT', d('2026-10-15'), s, e), true);
});

test('isViolated : au plus tôt jamais violé après planification, mais détecté si les dates sont en deçà', () => {
  const s = d('2026-10-12');
  const e = d('2026-10-16');
  assert.equal(isViolated(all, 'SNET', d('2026-10-12'), s, e), false);
  assert.equal(isViolated(all, 'SNET', d('2026-10-13'), s, e), true);
  assert.equal(isViolated(all, 'FNET', d('2026-10-17'), s, e), true);
});

test('isViolated : « doit » : égalité exigée', () => {
  const s = d('2026-10-12');
  const e = d('2026-10-16');
  assert.equal(isViolated(all, 'MSO', d('2026-10-12'), s, e), false);
  assert.equal(isViolated(all, 'MSO', d('2026-10-11'), s, e), true); // début plus tard que prévu
  assert.equal(isViolated(all, 'MFO', d('2026-10-16'), s, e), false);
  assert.equal(isViolated(all, 'MFO', d('2026-10-15'), s, e), true);
});

test('isViolated avec un calendrier : comparaison sur le jour travaillé effectif', () => {
  // SNLT : date brute ; samedi 10 -> début lundi 12 dépasse
  assert.equal(isViolated(ouvres, 'SNLT', d('2026-10-10'), d('2026-10-12'), d('2026-10-14')), true);
  // MSO un samedi : cible lundi 12, début lundi 12 : respecté
  assert.equal(isViolated(ouvres, 'MSO', d('2026-10-10'), d('2026-10-12'), d('2026-10-14')), false);
  // MFO un samedi : cible vendredi 9, fin vendredi 9 : respecté
  assert.equal(isViolated(ouvres, 'MFO', d('2026-10-10'), d('2026-10-05'), d('2026-10-09')), false);
});
