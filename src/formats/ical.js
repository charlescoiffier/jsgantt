import { fromDay } from '../dates.js';

// iCalendar (RFC 5545) : un événement « journée entière » par tâche (groupes exclus), par jalon, par repère et par zone.

const compact = (day) => fromDay(day).replace(/-/g, '');
// Échappement des textes : antislash, point-virgule, virgule, retours à la ligne.
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Repli des lignes à 75 octets (UTF-8), sans couper un caractère.
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// opts : { name (nom du calendrier), now (Date, pour DTSTAMP), labels: { progress, owner, group, marker, zone } }
export function toICS(model, { name = 'Gantt', now = new Date(), labels = {} } = {}) {
  const L = { progress: 'Avancement', owner: 'Responsable', group: 'Groupe', marker: 'Repère', zone: 'Zone', ...labels };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//jsgantt//FR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`];
  const event = (uid, start, end, summary, description, categories) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@jsgantt`, `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(start)}`, `DTEND;VALUE=DATE:${compact(end + 1)}`, `SUMMARY:${esc(summary)}`);
    if (description) lines.push(`DESCRIPTION:${esc(description)}`);
    if (categories) lines.push(`CATEGORIES:${esc(categories)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  };
  for (const t of model.tasks) {
    if (model.isGroup(t.id)) continue;
    const info = [];
    if (!t.milestone) info.push(`${L.progress} : ${Math.round(t.progress * 100)} %`);
    if (t.owner) info.push(`${L.owner} : ${model.ownerName(t.owner)}`);
    if (t.parentId) info.push(`${L.group} : ${model.getTask(t.parentId).name}`);
    event(`task-${t.id}`, t.start, t.end, t.name, info.join('\n'), t.milestone ? 'Jalon' : null);
  }
  for (const m of model.markers) event(`marker-${m.id}`, m.date, m.date, m.label || L.marker, null, L.marker);
  for (const z of model.zones) event(`zone-${z.id}`, z.start, z.end, z.label || L.zone, null, L.zone);
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
