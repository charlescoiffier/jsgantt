import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../src/history.js';

const s = (n) => ({ tasks: [{ id: 'a', n }] });

test('historique vide : rien à annuler ni à rétablir', () => {
  const h = new History();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo(s(0)), null);
  assert.equal(h.redo(s(0)), null);
});

test('push puis undo restaure l\'état précédent, redo le re-applique', () => {
  const h = new History();
  assert.equal(h.push(s(1), s(2)), true);
  assert.equal(h.canUndo, true);
  assert.deepEqual(h.undo(s(2)), s(1));
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);
  assert.deepEqual(h.redo(s(1)), s(2));
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, false);
});

test('plusieurs étapes dépilées dans l\'ordre inverse', () => {
  const h = new History();
  h.push(s(1), s(2));
  h.push(s(2), s(3));
  assert.deepEqual(h.undo(s(3)), s(2));
  assert.deepEqual(h.undo(s(2)), s(1));
  assert.equal(h.undo(s(1)), null);
});

test('une nouvelle modification vide la pile rétablir', () => {
  const h = new History();
  h.push(s(1), s(2));
  h.undo(s(2));
  assert.equal(h.canRedo, true);
  h.push(s(1), s(5));
  assert.equal(h.canRedo, false);
});

test('états identiques : rien n\'est enregistré', () => {
  const h = new History();
  assert.equal(h.push(s(1), s(1)), false);
  assert.equal(h.canUndo, false);
});

test('limite : les plus anciennes étapes sont oubliées', () => {
  const h = new History(2);
  h.push(s(1), s(2));
  h.push(s(2), s(3));
  h.push(s(3), s(4));
  assert.deepEqual(h.undo(s(4)), s(3));
  assert.deepEqual(h.undo(s(3)), s(2));
  assert.equal(h.undo(s(2)), null);
});

test('les instantanés sont isolés des objets d\'origine', () => {
  const h = new History();
  const before = s(1);
  h.push(before, s(2));
  before.tasks[0].n = 99;
  assert.deepEqual(h.undo(s(2)), s(1));
});

test('clear vide les deux piles', () => {
  const h = new History();
  h.push(s(1), s(2));
  h.undo(s(2));
  h.clear();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
});

test('limite invalide rejetée', () => {
  assert.throws(() => new History(0), /limite/);
  assert.throws(() => new History(1.5), /limite/);
});
