import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { createI18n, GanttError } from '../src/i18n.js';
import { fromDay } from '../src/dates.js';
import { t } from './helpers.js';

const fr = createI18n('fr');
const grab = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

test('repères et zones : chargés, copiés, exportés seulement s’il y en a', () => {
  const m = new GanttModel({
    tasks: [t('a', '2026-10-05', '2026-10-09')],
    markers: [{ id: 'copil', date: '2026-10-20', label: 'Comité', color: 'purple' }],
    zones: [{ id: 'gel', start: '2026-10-12', end: '2026-10-16', label: 'Gel', color: 'blue', className: 'freeze' }],
  });
  assert.deepEqual(m.markers.map((x) => [x.id, fromDay(x.date), x.label, x.color]), [['copil', '2026-10-20', 'Comité', 'purple']]);
  const data = m.getData();
  assert.deepEqual(data.markers, [{ id: 'copil', date: '2026-10-20', label: 'Comité', color: 'purple' }]);
  assert.deepEqual(data.zones, [{ id: 'gel', start: '2026-10-12', end: '2026-10-16', label: 'Gel', color: 'blue', className: 'freeze' }]);
  m.markers[0].label = 'modifié';
  assert.equal(m.markers[0].label, 'Comité');
  const empty = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-09')] }).getData();
  assert.equal('markers' in empty || 'zones' in empty, false);
  assert.deepEqual(new GanttModel(data).getData(), data);
});

test('les repères et zones ne déplacent aucune tâche', () => {
  const tasks = [t('a', '2026-10-05', '2026-10-09')];
  const m = new GanttModel({ tasks, zones: [{ id: 'z', start: '2026-10-01', end: '2026-10-31' }], markers: [{ id: 'm', date: '2026-10-06' }] });
  assert.deepEqual(m.getData().tasks, new GanttModel({ tasks }).getData().tasks);
});

test('import invalide : erreurs précises et traduisibles', () => {
  const bad = (extra) => grab(() => new GanttModel({ tasks: [], ...extra }));
  const cases = [
    [{ markers: {} }, 'data.markersNotArray'],
    [{ zones: [1] }, 'zone.notObject'],
    [{ markers: [{ date: '2026-10-01' }] }, 'marker.idRequired'],
    [{ markers: [{ id: 'x', date: '2026-10-01' }, { id: 'x', date: '2026-10-02' }] }, 'marker.duplicateId'],
    [{ markers: [{ id: 'x' }] }, 'marker.dateRequired'],
    [{ markers: [{ id: 'x', date: '2026-13-01' }] }, 'marker.date'],
    [{ markers: [{ id: 'x', date: '2026-10-01', color: 'fuchsia' }] }, 'marker.color'],
    [{ zones: [{ id: 'z', start: '2026-10-05' }] }, 'zone.datesRequired'],
    [{ zones: [{ id: 'z', start: '2026-10-05', end: '2026-10-01' }] }, 'zone.endBeforeStart'],
  ];
  for (const [extra, code] of cases) {
    const e = bad(extra);
    assert.ok(e instanceof GanttError, code);
    assert.equal(e.code, code);
  }
  assert.equal(fr.localize(bad({ markers: [{ id: 'x', date: '2026-10-01', color: 'fuchsia' }] })),
    'Repère "x" : couleur inconnue "fuchsia" (attendu : red, orange, amber, yellow, lime, green, teal, cyan, blue, indigo, purple, pink)');
});

test('ajouter, modifier, supprimer un repère', () => {
  const m = new GanttModel({ tasks: [] });
  const r = m.addMarker({ date: '2026-10-20', label: 'Mise en prod' });
  assert.equal(r.ok, true);
  assert.equal(r.marker.id, 'm1');
  assert.equal(m.addMarker({ date: '2026-10-21' }).marker.id, 'm2');
  assert.equal(m.addMarker({ id: 'm1', date: '2026-10-21' }).code, 'marker.duplicateId');
  assert.equal(m.addMarker({ date: 'demain' }).code, 'marker.date');
  assert.equal(m.updateMarker('m1', { date: '2026-10-22', color: 'red' }).ok, true);
  assert.deepEqual(m.getData().markers[0], { id: 'm1', date: '2026-10-22', label: 'Mise en prod', color: 'red' });
  assert.equal(m.updateMarker('m1', { color: null }).marker.color, null);
  assert.equal(m.updateMarker('zz', { label: 'x' }).code, 'marker.unknown');
  assert.equal(m.updateMarker('m1', { color: 'fuchsia' }).code, 'marker.color');
  assert.equal(m.removeMarker('m1').ok, true);
  assert.deepEqual(m.markers.map((x) => x.id), ['m2']);
  assert.equal(m.removeMarker('m1').code, 'marker.unknown');
});

test('ajouter, modifier, supprimer une zone', () => {
  const m = new GanttModel({ tasks: [] });
  const r = m.addZone({ start: '2026-10-12', end: '2026-10-16', label: 'Congés', color: 'green' });
  assert.equal(r.zone.id, 'z1');
  assert.equal(m.updateZone('z1', { end: '2026-10-10' }).code, 'zone.endBeforeStart');
  assert.equal(fromDay(m.zones[0].end), '2026-10-16'); // inchangée après un refus
  assert.equal(m.updateZone('z1', { start: '2026-10-13', end: '2026-10-20' }).ok, true);
  assert.deepEqual(m.getData().zones, [{ id: 'z1', start: '2026-10-13', end: '2026-10-20', label: 'Congés', color: 'green' }]);
  assert.equal(m.addZone({ start: '2026-10-12' }).code, 'zone.datesRequired');
  assert.equal(m.removeZone('z1').ok, true);
  assert.equal(m.zones.length, 0);
});
