import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, GanttError, fail, failFrom, BUILTIN_LOCALES } from '../src/i18n.js';

test('français par défaut, paramètres substitués', () => {
  const i = createI18n();
  assert.equal(i.code, 'fr');
  assert.equal(i.t('task.unknown', { id: 'x' }), 'Tâche inconnue : "x"');
  assert.equal(i.t('ui.addTask'), 'Ajouter une tâche');
});

test('anglais fourni', () => {
  const i = createI18n('en');
  assert.equal(i.code, 'en');
  assert.equal(i.t('ui.addTask'), 'Add a task');
  assert.equal(i.t('task.unknown', { id: 'x' }), 'Unknown task: "x"');
  assert.equal(i.months.long[9], 'October');
  assert.equal(i.months.short[0], 'Jan');
});

test('pluriels', () => {
  const fr = createI18n('fr');
  assert.equal(fr.t('a11y.group', { count: 1, state: 'replié' }), 'groupe de 1 tâche, replié');
  assert.equal(fr.t('a11y.group', { count: 3, state: 'déplié' }), 'groupe de 3 tâches, déplié');
  const en = createI18n('en');
  assert.equal(en.t('a11y.group', { count: 1, state: 'collapsed' }), 'group of 1 task, collapsed');
  assert.equal(en.t('a11y.group', { count: 2, state: 'expanded' }), 'group of 2 tasks, expanded');
});

test('clé inconnue : la clé elle-même ; clé absente d\'une langue : repli sur le français', () => {
  assert.equal(createI18n('en').t('cle.inexistante'), 'cle.inexistante');
  const custom = createI18n({ code: 'es', messages: { 'ui.addTask': 'Añadir una tarea' } });
  assert.equal(custom.t('ui.addTask'), 'Añadir una tarea');
  assert.equal(custom.t('ui.name'), 'Nom'); // repli français
});

test('langue personnalisée : mois fournis, sinon repli', () => {
  const months = { short: Array.from({ length: 12 }, (_, i) => `m${i}`), long: Array.from({ length: 12 }, (_, i) => `mois${i}`) };
  assert.equal(createI18n({ code: 'xx', months }).months.long[2], 'mois2');
  assert.equal(createI18n({ code: 'xx' }).months.long[0], 'janvier');
});

test('une langue partielle s\'appuie sur la langue de base indiquée', () => {
  const i = createI18n({ code: 'en-GB', base: 'en', messages: { 'ui.addTask': 'Add task' } });
  assert.equal(i.t('ui.addTask'), 'Add task');
  assert.equal(i.t('ui.remove'), 'Delete the task');
  assert.equal(i.months.long[0], 'January');
});

test('GanttError : message français par défaut, code et paramètres conservés', () => {
  const e = new GanttError('task.unknown', { id: 'a' });
  assert.ok(e instanceof Error);
  assert.equal(e.message, 'Tâche inconnue : "a"');
  assert.equal(e.code, 'task.unknown');
  assert.deepEqual(e.params, { id: 'a' });
});

test('fail et failFrom', () => {
  assert.deepEqual(fail('link.cycle'), { ok: false, reason: 'ce lien créerait un cycle', code: 'link.cycle', params: {} });
  const e = new GanttError('date.format', { value: '"x"' });
  assert.deepEqual(failFrom(e), { ok: false, reason: e.message, code: 'date.format', params: { value: '"x"' } });
  assert.deepEqual(failFrom(new Error('boum')), { ok: false, reason: 'boum' });
});

test('paramètres imbriqués traduits récursivement', () => {
  const inner = fail('link.cycle');
  const fr = createI18n('fr');
  assert.equal(fr.t('link.invalid', { link: 'a→b', reason: inner }), 'Lien a→b invalide : ce lien créerait un cycle');
  assert.equal(createI18n('en').t('link.invalid', { link: 'a→b', reason: inner }), 'Link a→b is invalid: this link would create a cycle');
  const err = new GanttError('date.format', { value: '"x"' });
  assert.equal(createI18n('en').t('task.error', { id: 'a', detail: err }), 'Task "a": Invalid date: "x" (expected YYYY-MM-DD)');
});

test('localize : résultat ou erreur avec code traduit, sinon texte brut', () => {
  const en = createI18n('en');
  assert.equal(en.localize(fail('link.cycle')), 'this link would create a cycle');
  assert.equal(en.localize(new GanttError('task.unknown', { id: 'q' })), 'Unknown task: "q"');
  assert.equal(en.localize({ ok: false, reason: 'brut' }), 'brut');
  assert.equal(en.localize(new Error('brut2')), 'brut2');
});

test('toutes les clés françaises existent en anglais et inversement', () => {
  const fr = Object.keys(BUILTIN_LOCALES.fr.messages).sort();
  const en = Object.keys(BUILTIN_LOCALES.en.messages).sort();
  assert.deepEqual(en, fr);
});

test('les gabarits des deux langues utilisent les mêmes paramètres', () => {
  const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [key, template] of Object.entries(BUILTIN_LOCALES.fr.messages)) {
    assert.equal(params(BUILTIN_LOCALES.en.messages[key]), params(template), key);
  }
});
