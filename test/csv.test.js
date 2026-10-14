import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { GanttError } from '../src/i18n.js';
import { toCSV, fromCSV, parseCSV } from '../src/formats/csv.js';
import { t, l } from './helpers.js';

const model = () =>
  new GanttModel({
    owners: [{ id: 'ana', name: 'Ana' }],
    tasks: [
      { id: 'g', name: 'Groupe; "spécial"' },
      t('a', '2026-10-05', '2026-10-09', { parentId: 'g', name: 'Alpha', progress: 0.5, owner: 'ana', color: 'teal' }),
      t('b', '2026-10-12', '2026-10-14', { parentId: 'g', name: 'Beta', constraint: { type: 'FNLT', date: '2026-10-20' } }),
      t('m', '2026-10-16', '2026-10-16', { name: 'Livraison', milestone: true }),
    ],
    links: [l('a', 'b'), l('b', 'm', 'SS', 2)],
  });
const grab = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

test('export CSV : en-têtes français, séparateur « ; », guillemets, prédécesseurs', () => {
  const lines = toCSV(model()).trim().split('\r\n');
  assert.equal(lines[0], 'N°;Id;Nom;Début;Fin;Durée (j);Avancement (%);Responsable;Couleur;Parent;Prédécesseurs;Contrainte;Date contrainte;Jalon');
  assert.equal(lines[1], '1;g;"Groupe; ""spécial""";2026-10-05;2026-10-14;10;31;;;;;;;');
  assert.equal(lines[2], '1.1;a;Alpha;2026-10-05;2026-10-09;5;50;Ana;teal;g;;;;');
  assert.equal(lines[3], '1.2;b;Beta;2026-10-12;2026-10-14;3;0;;;g;a;FNLT;2026-10-20;');
  assert.equal(lines[4], '2;m;Livraison;2026-10-16;2026-10-16;0;0;;;;bSS+2;;;oui');
  const en = toCSV(model(), { locale: 'en' }).split('\r\n');
  assert.match(en[0], /^No\.,Id,Name,Start,End/);
  assert.match(en[4], /,yes$/);
});

test('aller-retour CSV : mêmes tâches, liens, responsables, couleurs, contraintes', () => {
  const m = model();
  const { data, warnings } = fromCSV(toCSV(m));
  assert.deepEqual(warnings, []);
  const back = new GanttModel(data);
  const strip = (d) => d.tasks.map(({ id, name, start, end, parentId, milestone, color, constraint, progress }) => ({ id, name, start, end, parentId, milestone, color, constraint, progress }));
  assert.deepEqual(strip(back.getData()), strip(m.getData()));
  assert.deepEqual(back.links.map((x) => [x.from, x.to, x.type, x.lag]), [['a', 'b', 'FS', 0], ['b', 'm', 'SS', 2]]);
  assert.equal(back.ownerName(back.getTask('a').owner), 'Ana');
  // séparateur « , » détecté tout seul
  assert.equal(new GanttModel(fromCSV(toCSV(m, { locale: 'en' })).data).tasks.length, 4);
});

test('import CSV tolérant : en-têtes variés, dates JJ/MM/AAAA, hiérarchie par N°, BOM, couleurs françaises', () => {
  const csv = '﻿N°,Tâche,Date de début,Date de fin,Avancement,Couleur,Dépendances\n1,Phase,,,,,\n1.1,Étude,05/10/2026,09/10/2026,40 %,Bleu,\n1.2,Code,12/10/2026,16/10/2026,,vert,t2\n';
  const { data } = fromCSV(csv);
  const m = new GanttModel(data);
  assert.deepEqual(m.visibleRows().map((r) => `${r.id}:${r.depth}`), ['t1:0', 't2:1', 't3:1']);
  assert.equal(m.getTask('t2').progress, 0.4);
  assert.equal(m.getTask('t2').color, 'blue');
  assert.equal(m.getTask('t3').color, 'green');
  assert.deepEqual(m.links.map((x) => [x.from, x.to]), [['t2', 't3']]);
});

test('import CSV : erreurs précises, avertissements pour ce qui est ignoré', () => {
  const code = (csv) => grab(() => fromCSV(csv))?.code;
  assert.equal(code(''), 'csv.empty');
  assert.equal(code('Foo;Bar\n1;2\n'), 'csv.header');
  assert.equal(code('Nom;Début;Fin\nA;demain;2026-10-02\n'), 'csv.date');
  assert.equal(code('Nom;Début;Fin;Avancement\nA;2026-10-01;2026-10-02;150\n'), 'csv.progress');
  assert.equal(code('Nom;Début;Fin;Prédécesseurs\nA;2026-10-01;2026-10-02;?\n'), 'csv.predecessor');
  const e = grab(() => fromCSV('Nom;Début\nA;2026-10-01\nB;31/02/2026x\n'));
  assert.ok(e instanceof GanttError);
  assert.deepEqual(e.params, { line: 3, value: '31/02/2026x' });
  const { warnings } = fromCSV('Nom;Début;Fin;Couleur;Contrainte\nA;2026-10-01;2026-10-02;fuchsia;XYZ\n');
  assert.deepEqual(warnings.map((w) => w.code), ['csv.colorIgnored', 'csv.constraintIgnored']);
});

test('parseCSV : retours à la ligne dans un champ, lignes vides ignorées', () => {
  const rows = parseCSV('a;"b\nc";d\n\n1;2;3', ';');
  assert.deepEqual(rows.map((r) => [r.cells, r.line]), [[['a', 'b\nc', 'd'], 1], [['1', '2', '3'], 4]]);
});

test('prédécesseurs aux codes français de MS Project (FD, DD, FF, DF) et décalage en jours', () => {
  const csv = 'Id;Nom;Début;Fin;Prédécesseurs\na;A;2026-10-01;2026-10-02;\nb;B;2026-10-05;2026-10-06;aFD+2j, aDD\nc;C;2026-10-05;2026-10-09;aFF;\nd;D;2026-09-28;2026-09-30;bDF\n';
  const { data } = fromCSV(csv);
  assert.deepEqual(data.links.map((x) => `${x.from}${x.type}${x.lag}>${x.to}`), ['aFS2>b', 'aSS0>b', 'aFF0>c', 'bSF0>d']);
});
