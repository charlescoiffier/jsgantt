import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { toICS } from '../src/formats/ical.js';
import { t } from './helpers.js';

const now = new Date('2026-10-14T09:30:00Z');

test('iCalendar : événements journée entière (fin exclusive), jalons, repères, zones ; groupes exclus', () => {
  const m = new GanttModel({
    owners: [{ id: 'ana', name: 'Ana' }],
    tasks: [
      { id: 'g', name: 'Phase 1' },
      t('a', '2026-10-05', '2026-10-09', { parentId: 'g', name: 'Étude, analyse; cadrage', progress: 0.4, owner: 'ana' }),
      t('m', '2026-10-16', '2026-10-16', { name: 'Livraison', milestone: true }),
    ],
    markers: [{ id: 'c', date: '2026-10-20', label: 'Copil' }],
    zones: [{ id: 'z', start: '2026-11-02', end: '2026-11-06', label: 'Gel' }],
  });
  const ics = toICS(m, { name: 'Projet', now });
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-2), 'END:VCALENDAR');
  assert.equal(lines.filter((x) => x === 'BEGIN:VEVENT').length, 4);
  assert.ok(lines.includes('UID:task-a@jsgantt'));
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261005'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20261010'));
  assert.ok(lines.includes('SUMMARY:Étude\\, analyse\; cadrage'));
  assert.ok(lines.includes('DESCRIPTION:Avancement : 40 %\\nResponsable : Ana\\nGroupe : Phase 1'));
  assert.ok(lines.includes('DTSTAMP:20261014T093000Z'));
  assert.ok(lines.includes('CATEGORIES:Jalon'));
  assert.ok(lines.includes('UID:marker-c@jsgantt'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20261107'));
  assert.equal(lines.includes('UID:task-g@jsgantt'), false);
});

test('iCalendar : lignes repliées à 75 octets sans couper les caractères', () => {
  const m = new GanttModel({ tasks: [t('a', '2026-10-05', '2026-10-05', { name: 'é'.repeat(80) })] });
  const ics = toICS(m, { now });
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(ics.replace(/\r\n /g, '').includes(`SUMMARY:${'é'.repeat(80)}`));
});
