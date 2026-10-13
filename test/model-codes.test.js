import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { GanttError, createI18n } from '../src/i18n.js';
import { toDay } from '../src/dates.js';
import { t, l } from './helpers.js';

const en = createI18n('en');
const base = () =>
  new GanttModel({
    tasks: [
      t('a', '2026-10-05', '2026-10-09'),
      { id: 'g', name: 'g' },
      t('c1', '2026-10-12', '2026-10-14', { parentId: 'g' }),
      t('x', '2026-10-20', '2026-10-22'),
    ],
    links: [l('c1', 'x')],
  });

test('addLink : refus avec code et paramètres, traduisible', () => {
  const m = base();
  const r = m.addLink(l('x', 'c1'));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'link.cycle');
  assert.equal(en.localize(r), 'this link would create a cycle');
  assert.equal(m.addLink(l('a', 'zzz')).code, 'link.targetUnknown');
  assert.deepEqual(m.addLink(l('a', 'zzz')).params, { id: 'zzz' });
  assert.equal(m.addLink(l('a', 'a')).code, 'link.self');
  assert.equal(m.addLink({ from: 'a', to: 'x', type: 'XX' }).code, 'link.typeUnknown');
  assert.equal(m.addLink({ from: 'a', to: 'x', lag: 1.5 }).code, 'link.lagInteger');
  assert.equal(m.addLink(l('g', 'c1')).code, 'link.groupDescendant');
  assert.equal(m.addLink(l('c1', 'x')).code, 'link.exists');
});

test('checkLink reste une chaîne ; linkProblem donne le détail', () => {
  const m = base();
  assert.equal(typeof m.checkLink(l('x', 'c1')), 'string');
  assert.equal(m.checkLink(l('a', 'x')), null);
  assert.equal(m.linkProblem(l('a', 'x')), null);
  assert.equal(m.linkProblem(l('x', 'c1')).code, 'link.cycle');
});

test('opérations : codes des refus', () => {
  const m = base();
  assert.equal(m.resizeTask('g', 'end', 1).code, 'resize.group');
  assert.equal(m.setProgress('g', 0.5).code, 'progress.group');
  assert.equal(m.updateTask('g', { start: '2026-10-06' }).code, 'dates.group');
  assert.equal(m.updateTask('a', { end: 'pas une date' }).code, 'date.format');
  assert.equal(m.updateTask('a', { start: '2026-10-30' }).code, 'dates.endBeforeStart');
  assert.equal(m.addTask({}).code, 'add.startRequired');
  assert.equal(m.addTask({ start: '2026-10-26', parentId: 'zzz' }).code, 'parent.unknown');
  assert.equal(m.addTask({ start: '2026-10-26', afterId: 'zzz' }).code, 'add.refUnknown');
  assert.equal(m.moveTaskTo('g', { parentId: 'c1' }).code, 'move.intoSelf');
  assert.equal(m.moveTaskTo('a', { parentId: 'g', beforeId: 'x' }).code, 'move.beforeId');
  assert.equal(m.resizeTask('a', 'start', toDay('2026-10-20')).code, 'resize.startAfterEnd');
});

test('déplacement refusé : lien interdit et cycle', () => {
  const m = base();
  m.addLink(l('a', 'g'));
  assert.equal(m.moveTaskTo('a', { parentId: 'g' }).code, 'move.linkForbidden');
  const cyc = new GanttModel({
    tasks: [{ id: 'g', name: 'g' }, t('c', '2026-10-05', '2026-10-06', { parentId: 'g' }), t('x', '2026-10-12', '2026-10-13'), t('y', '2026-10-01', '2026-10-02')],
    links: [l('y', 'x'), l('x', 'g')],
  });
  assert.equal(cyc.moveTaskTo('y', { parentId: 'g' }).code, 'move.cycle');
});

test('erreurs d\'import : GanttError avec code et paramètres', () => {
  const grab = (data) => {
    try {
      new GanttModel(data);
    } catch (e) {
      return e;
    }
    return null;
  };
  let e = grab({ task: [] });
  assert.ok(e instanceof GanttError);
  assert.equal(e.code, 'data.unknownKey');
  assert.deepEqual(e.params, { key: 'task' });
  assert.equal(grab(null).code, 'data.notObject');
  assert.equal(grab({ tasks: 'x' }).code, 'data.tasksNotArray');
  assert.equal(grab({ tasks: [t('a', '2026-10-05', '2026-10-06'), t('a', '2026-10-05', '2026-10-06')] }).code, 'task.duplicateId');
  assert.equal(grab({ tasks: [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }] }).code, 'hierarchy.loop');
  e = grab({ tasks: [t('a', '2026-02-30', '2026-03-01')] });
  assert.equal(e.code, 'task.error');
  assert.equal(e.params.detail.code, 'date.nonexistent');
  assert.equal(en.localize(e), 'Task "a": Invalid date: "2026-02-30" (this day does not exist)');
  e = grab({ tasks: [t('a', '2026-10-05', '2026-10-06')], links: [l('a', 'zzz')] });
  assert.equal(e.code, 'link.invalid');
  assert.equal(en.localize(e), 'Link a→zzz is invalid: unknown target task: "zzz"');
});

test('id de tâche inconnu : GanttError traduisible', () => {
  let e;
  try {
    base().moveTask('zzz', 1);
  } catch (err) {
    e = err;
  }
  assert.equal(e.code, 'task.unknown');
  assert.equal(en.localize(e), 'Unknown task: "zzz"');
});
