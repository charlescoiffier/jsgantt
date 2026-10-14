import { fromDay, toDay } from '../dates.js';
import { GanttError } from '../i18n.js';
import { wbsNumbers } from '../view.js';
import { parseXML, child, children, textOf } from './xml.js';

// MS Project XML (MSPDI) : lu et écrit par MS Project, Merlin Project, ProjectLibre, OmniPlan…
// Journée de 8 h (08:00–12:00, 13:00–17:00). Les décalages sont en dixièmes de minute.

const MINUTES_PER_DAY = 480;
const CONSTRAINT_CODES = { MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7 };
const CONSTRAINT_TYPES = Object.fromEntries(Object.entries(CONSTRAINT_CODES).map(([k, v]) => [v, k]));
const LINK_CODES = { FF: 0, FS: 1, SF: 2, SS: 3 };
const LINK_TYPES = ['FF', 'FS', 'SF', 'SS'];
const ELAPSED_LAG_FORMATS = new Set([4, 6, 8, 10, 12]); // formats « écoulés » (calendaires)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const el = (name, value) => `<${name}>${esc(value)}</${name}>`;
const at = (day, time) => `${fromDay(day)}T${time}`;

// opts : { title }
export function toMSPDI(model, { title = 'Gantt' } = {}) {
  const cal = model.calendar;
  const wbs = wbsNumbers(model);
  const order = [...wbs.keys()];
  const uid = new Map(order.map((id, i) => [id, i + 1]));
  const leaves = model.tasks.filter((t) => !model.isGroup(t.id));
  const start = Math.min(...leaves.map((t) => t.start));
  const finish = Math.max(...leaves.map((t) => t.end));
  const { direction, end } = model.planning;
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<Project xmlns="http://schemas.microsoft.com/project">'];
  out.push(el('SaveVersion', 14), el('Name', `${title}.xml`), el('Title', title));
  out.push(el('ScheduleFromStart', direction === 'backward' ? 0 : 1));
  if (leaves.length) out.push(el('StartDate', at(start, '08:00:00')), el('FinishDate', at(direction === 'backward' && end !== null ? end : finish, '17:00:00')));
  out.push(el('CalendarUID', 1), el('MinutesPerDay', MINUTES_PER_DAY), el('MinutesPerWeek', MINUTES_PER_DAY * cal.workingDays.length), el('DaysPerMonth', 20));

  // Calendrier : jours ouvrés de la semaine (DayType 1 = dimanche … 7 = samedi) et jours fériés.
  out.push('<Calendars><Calendar>', el('UID', 1), el('Name', 'Standard'), el('IsBaseCalendar', 1), '<WeekDays>');
  for (let d = 0; d < 7; d++) {
    const working = cal.workingDays.includes(d);
    out.push(`<WeekDay>${el('DayType', d + 1)}${el('DayWorking', working ? 1 : 0)}${working
      ? '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>'
      : ''}</WeekDay>`);
  }
  out.push('</WeekDays>');
  const holidays = cal.toJSON()?.holidays ?? [];
  if (holidays.length) {
    out.push('<Exceptions>');
    for (const h of holidays) {
      out.push(`<Exception>${el('EnteredByOccurrences', 0)}<TimePeriod>${el('FromDate', `${h.date}T00:00:00`)}${el('ToDate', `${h.date}T23:59:00`)}</TimePeriod>${el('Occurrences', 1)}${el('Name', h.name ?? '')}${el('Type', 1)}${el('DayWorking', 0)}</Exception>`);
    }
    out.push('</Exceptions>');
  }
  out.push('</Calendar></Calendars>');

  out.push('<Tasks>');
  for (const id of order) {
    const t = model.getTask(id);
    const group = model.isGroup(id);
    const milestone = t.milestone && !group;
    const days = model.durationDays(id);
    const parts = [
      el('UID', uid.get(id)), el('ID', uid.get(id)), el('Name', t.name), el('OutlineNumber', wbs.get(id)),
      el('OutlineLevel', wbs.get(id).split('.').length),
      el('Start', at(t.start, '08:00:00')), el('Finish', at(t.end, milestone ? '08:00:00' : '17:00:00')),
      el('Duration', `PT${milestone ? 0 : days * 8}H0M0S`), el('DurationFormat', 7),
      el('Milestone', milestone ? 1 : 0), el('Summary', group ? 1 : 0),
      el('PercentComplete', Math.round(model.progressOf(id) * 100)),
    ];
    // Sans contrainte, « Début au plus tôt le » fixe la date (comme une tâche déplacée à la main dans MS Project).
    if (!group) {
      const c = t.constraint ?? { type: 'SNET', date: t.start };
      parts.push(el('ConstraintType', CONSTRAINT_CODES[c.type]), el('ConstraintDate', at(c.date, c.type[0] === 'F' || c.type === 'MFO' ? '17:00:00' : '08:00:00')));
    }
    for (const l of model.links.filter((x) => x.to === id)) {
      const elapsed = cal.lagUnit === 'calendar';
      const lag = (l.lag ?? 0) * (elapsed ? 1440 : MINUTES_PER_DAY) * 10;
      parts.push(`<PredecessorLink>${el('PredecessorUID', uid.get(l.from))}${el('Type', LINK_CODES[l.type])}${el('LinkLag', lag)}${el('LagFormat', elapsed ? 8 : 7)}</PredecessorLink>`);
    }
    out.push(`<Task>${parts.join('')}</Task>`);
  }
  out.push('</Tasks>');

  const owners = model.owners;
  out.push('<Resources>');
  owners.forEach((o, i) => out.push(`<Resource>${el('UID', i + 1)}${el('ID', i + 1)}${el('Name', o.name)}${el('Type', 1)}</Resource>`));
  out.push('</Resources><Assignments>');
  let a = 0;
  for (const id of order) {
    const t = model.getTask(id);
    const r = owners.findIndex((o) => o.id === t.owner);
    if (r !== -1) out.push(`<Assignment>${el('UID', ++a)}${el('TaskUID', uid.get(id))}${el('ResourceUID', r + 1)}${el('Units', 1)}</Assignment>`);
  }
  out.push('</Assignments></Project>');
  return `${out.join('\n')}\n`;
}

const datePart = (v) => (v ? v.slice(0, 10) : '');
const num = (v, fallback = 0) => (v === '' || v === undefined ? fallback : Number(v));

// XML MSPDI → { data, warnings } ; lève GanttError si le fichier n'est pas un projet lisible.
export function fromMSPDI(text) {
  const src = String(text ?? '');
  if (src.startsWith('ÐÏ') || src.startsWith('��') || src.includes('\u0000')) throw new GanttError('msp.binary');
  const doc = parseXML(src.replace(/^﻿/, ''));
  const project = child(doc, 'Project');
  if (!project) throw new GanttError('msp.notProject');
  const warnings = [];
  const minutesPerDay = num(textOf(project, 'MinutesPerDay'), MINUTES_PER_DAY) || MINUTES_PER_DAY;

  // Calendrier du projet (et son calendrier de base) : jours ouvrés et jours non travaillés.
  const calendars = children(child(project, 'Calendars'), 'Calendar');
  const calByUid = new Map(calendars.map((c) => [textOf(c, 'UID'), c]));
  const working = new Set([0, 1, 2, 3, 4, 5, 6]);
  const holidays = new Map();
  const addOff = (from, to, name) => {
    if (!from) return;
    let d = toDay(datePart(from));
    const last = toDay(datePart(to || from));
    for (; d <= last && holidays.size < 5000; d++) holidays.set(fromDay(d), name || undefined);
  };
  const readCalendar = (cal, depth = 0) => {
    if (!cal || depth > 5) return;
    readCalendar(calByUid.get(textOf(cal, 'BaseCalendarUID')), depth + 1);
    for (const wd of children(child(cal, 'WeekDays'), 'WeekDay')) {
      const type = num(textOf(wd, 'DayType'));
      const isWorking = textOf(wd, 'DayWorking') === '1';
      if (type >= 1 && type <= 7) {
        if (isWorking) working.add(type - 1);
        else working.delete(type - 1);
      } else if (type === 0 && !isWorking) {
        const tp = child(wd, 'TimePeriod');
        addOff(textOf(tp, 'FromDate'), textOf(tp, 'ToDate'));
      }
    }
    for (const ex of children(child(cal, 'Exceptions'), 'Exception')) {
      if (textOf(ex, 'DayWorking') === '1') continue;
      const tp = child(ex, 'TimePeriod');
      addOff(textOf(tp, 'FromDate'), textOf(tp, 'ToDate'), textOf(ex, 'Name'));
    }
  };
  readCalendar(calByUid.get(textOf(project, 'CalendarUID')) ?? calendars.find((c) => textOf(c, 'IsBaseCalendar') === '1'));
  const calendar = working.size === 7 && holidays.size === 0
    ? null
    : { workingDays: [...working].sort((x, y) => x - y), holidays: [...holidays].map(([date, name]) => (name ? { date, name } : { date })) };

  // Tâches : hiérarchie par niveau de plan ; la tâche récapitulative du projet (niveau 0) est ignorée.
  const raw = children(child(project, 'Tasks'), 'Task').filter((t) => textOf(t, 'IsNull') !== '1' && num(textOf(t, 'OutlineLevel'), 1) > 0 && textOf(t, 'UID') !== '0');
  const idOf = (uid) => `t${uid}`;
  const known = new Set(raw.map((t) => textOf(t, 'UID')));
  const stack = [];
  const tasks = [];
  const links = [];
  for (const node of raw) {
    const uid = textOf(node, 'UID');
    const name = textOf(node, 'Name');
    const level = num(textOf(node, 'OutlineLevel'), 1);
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const task = { id: idOf(uid), name };
    if (stack.length) task.parentId = stack[stack.length - 1].id;
    stack.push({ id: task.id, level });
    if (textOf(node, 'Summary') !== '1') {
      const start = textOf(node, 'Start');
      let finish = textOf(node, 'Finish');
      task.start = datePart(start);
      // Une fin à minuit appartient au jour précédent.
      if (finish.endsWith('T00:00:00') && datePart(finish) > task.start) finish = fromDay(toDay(datePart(finish)) - 1);
      task.end = datePart(finish) || task.start;
      if (textOf(node, 'Milestone') === '1') {
        task.milestone = true;
        task.end = task.start;
      }
      const pc = num(textOf(node, 'PercentComplete'));
      if (pc > 0) task.progress = Math.min(100, pc) / 100;
      const ctype = num(textOf(node, 'ConstraintType'));
      const cdate = datePart(textOf(node, 'ConstraintDate'));
      if (CONSTRAINT_TYPES[ctype] && cdate) {
        // « Début au plus tôt » à la date de début : simple trace d'un déplacement manuel, sans valeur de contrainte.
        if (!(ctype === 4 && cdate === task.start)) task.constraint = { type: CONSTRAINT_TYPES[ctype], date: cdate };
      } else if (ctype === 1) warnings.push({ code: 'msp.constraintIgnored', params: { name, type: 'ALAP' } });
    }
    for (const pl of children(node, 'PredecessorLink')) {
      const from = textOf(pl, 'PredecessorUID');
      if (!known.has(from)) {
        warnings.push({ code: 'msp.linkIgnored', params: { name } });
        continue;
      }
      const format = num(textOf(pl, 'LagFormat'), 7);
      let lag = 0;
      if (format === 19 || format === 20) warnings.push({ code: 'msp.lagPercent', params: { name } });
      else lag = Math.round(num(textOf(pl, 'LinkLag')) / 10 / (ELAPSED_LAG_FORMATS.has(format) ? 1440 : minutesPerDay));
      links.push({ from: idOf(from), to: task.id, type: LINK_TYPES[num(textOf(pl, 'Type'), 1)] ?? 'FS', lag });
    }
    tasks.push(task);
  }

  // Ressources de travail → responsables ; la première affectation d'une tâche donne son responsable.
  const owners = children(child(project, 'Resources'), 'Resource')
    .filter((r) => textOf(r, 'Name') && textOf(r, 'IsNull') !== '1' && num(textOf(r, 'Type'), 1) === 1)
    .map((r) => ({ id: `r${textOf(r, 'UID')}`, name: textOf(r, 'Name') }));
  const ownerIds = new Set(owners.map((o) => o.id));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const as of children(child(project, 'Assignments'), 'Assignment')) {
    const task = byId.get(idOf(textOf(as, 'TaskUID')));
    const owner = `r${textOf(as, 'ResourceUID')}`;
    if (!task || !ownerIds.has(owner) || task.start === undefined) continue;
    if (task.owner && task.owner !== owner) warnings.push({ code: 'msp.multipleOwners', params: { name: task.name } });
    else task.owner = owner;
  }

  const data = { tasks, links };
  if (owners.length) data.owners = owners;
  if (calendar) data.calendar = calendar;
  if (textOf(project, 'ScheduleFromStart') === '0' && textOf(project, 'FinishDate')) {
    data.planning = { direction: 'backward', end: datePart(textOf(project, 'FinishDate')) };
  }
  return { data, warnings };
}
