import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GanttModel } from '../src/model.js';
import { GanttError } from '../src/i18n.js';
import { WEEK } from '../src/calendar.js';
import { toMSPDI, fromMSPDI } from '../src/formats/mspdi.js';
import { parseXML, child, textOf } from '../src/formats/xml.js';
import { t, l } from './helpers.js';

const grab = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};
const model = () =>
  new GanttModel({
    calendar: { workingDays: WEEK.OUVRES, holidays: [{ date: '2026-11-11', name: 'Armistice' }] },
    owners: [{ id: 'ana', name: 'Ana & Co' }],
    tasks: [
      { id: 'g', name: 'Phase <1>' },
      t('a', '2026-10-05', '2026-10-09', { parentId: 'g', name: 'Étude', progress: 0.5, owner: 'ana' }),
      t('b', '2026-10-14', '2026-10-16', { parentId: 'g', name: 'Code', constraint: { type: 'FNLT', date: '2026-10-23' } }),
      t('m', '2026-10-19', '2026-10-19', { name: 'Livraison', milestone: true }),
    ],
    links: [l('a', 'b', 'FS', 2), l('b', 'm', 'SS')],
  });

test('lecteur XML : éléments, entités, CDATA, commentaires, balises auto-fermantes', () => {
  const doc = parseXML('<?xml version="1.0"?><!-- c --><a x="1"><b>1 &lt; 2 &amp; &#233;</b><c/><d><![CDATA[<brut>]]></d></a>');
  const a = child(doc, 'a');
  assert.equal(textOf(a, 'b'), '1 < 2 & é');
  assert.equal(textOf(a, 'd'), '<brut>');
  assert.ok(child(a, 'c'));
  assert.equal(grab(() => parseXML('<a><b></a>')).code, 'xml.malformed');
});

test('export MS Project : structure, calendrier, durées en heures, liens, contraintes, ressources', () => {
  const xml = toMSPDI(model(), { title: 'Projet' });
  const project = child(parseXML(xml), 'Project');
  assert.equal(textOf(project, 'MinutesPerWeek'), '2400');
  assert.match(xml, /<WeekDay><DayType>1<\/DayType><DayWorking>0<\/DayWorking><\/WeekDay>/); // dimanche chômé
  assert.match(xml, /<FromDate>2026-11-11T00:00:00<\/FromDate>.*<Name>Armistice<\/Name>/s);
  assert.match(xml, /<Name>Phase &lt;1&gt;<\/Name><OutlineNumber>1<\/OutlineNumber><OutlineLevel>1<\/OutlineLevel>.*<Summary>1<\/Summary>/);
  assert.match(xml, /<Name>Étude<\/Name>.*<Duration>PT40H0M0S<\/Duration>.*<PercentComplete>50<\/PercentComplete><ConstraintType>4<\/ConstraintType><ConstraintDate>2026-10-05T08:00:00/);
  assert.match(xml, /<PredecessorUID>2<\/PredecessorUID><Type>1<\/Type><LinkLag>9600<\/LinkLag><LagFormat>7<\/LagFormat>/);
  assert.match(xml, /<ConstraintType>7<\/ConstraintType><ConstraintDate>2026-10-23T17:00:00/);
  assert.match(xml, /<Name>Livraison<\/Name>.*<Duration>PT0H0M0S<\/Duration>.*<Milestone>1<\/Milestone>/);
  assert.match(xml, /<Resource><UID>1<\/UID><ID>1<\/ID><Name>Ana &amp; Co<\/Name>/);
  assert.match(xml, /<Assignment><UID>1<\/UID><TaskUID>2<\/TaskUID><ResourceUID>1<\/ResourceUID>/);
});

test('aller-retour MS Project : tâches, hiérarchie, liens, contraintes, calendrier, responsables', () => {
  const { data, warnings } = fromMSPDI(toMSPDI(model()));
  assert.deepEqual(warnings, []);
  const m = new GanttModel(data);
  const orig = model();
  const shape = (mm) => mm.visibleRows().map((r) => {
    const x = mm.getTask(r.id);
    return [r.depth, x.name, x.start, x.end, x.milestone, x.progress, mm.constraintOf(r.id)?.type ?? null, mm.ownerName(x.owner)];
  });
  assert.deepEqual(shape(m), shape(orig));
  assert.deepEqual(m.links.map((x) => [m.getTask(x.from).name, m.getTask(x.to).name, x.type, x.lag]), [['Étude', 'Code', 'FS', 2], ['Code', 'Livraison', 'SS', 0]]);
  assert.deepEqual(m.calendar.toJSON(), orig.calendar.toJSON());
});

test('import MS Project : récapitulatif du projet ignoré, fin à minuit, ancien format d’exception, décalage écoulé, avertissements', () => {
  const xml = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project">
    <ScheduleFromStart>0</ScheduleFromStart><FinishDate>2026-10-30T17:00:00</FinishDate><CalendarUID>1</CalendarUID>
    <Calendars><Calendar><UID>1</UID><WeekDays>
      <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay><WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
      <WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>2026-10-12T00:00:00</FromDate><ToDate>2026-10-13T23:59:00</ToDate></TimePeriod></WeekDay>
    </WeekDays></Calendar></Calendars>
    <Tasks>
      <Task><UID>0</UID><Name>Projet</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
      <Task><UID>1</UID><Name>A</Name><OutlineLevel>1</OutlineLevel><Start>2026-10-05T08:00:00</Start><Finish>2026-10-08T00:00:00</Finish><ConstraintType>1</ConstraintType></Task>
      <Task><UID>2</UID><Name>B</Name><OutlineLevel>1</OutlineLevel><Start>2026-10-14T08:00:00</Start><Finish>2026-10-15T17:00:00</Finish>
        <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>28800</LinkLag><LagFormat>8</LagFormat></PredecessorLink>
        <PredecessorLink><PredecessorUID>9</PredecessorUID></PredecessorLink></Task>
    </Tasks>
    <Resources><Resource><UID>0</UID><IsNull>1</IsNull></Resource><Resource><UID>1</UID><Name>Ana</Name></Resource><Resource><UID>2</UID><Name>Bob</Name></Resource></Resources>
    <Assignments><Assignment><TaskUID>2</TaskUID><ResourceUID>1</ResourceUID></Assignment><Assignment><TaskUID>2</TaskUID><ResourceUID>2</ResourceUID></Assignment></Assignments>
  </Project>`;
  const { data, warnings } = fromMSPDI(xml);
  assert.deepEqual(data.tasks.map((x) => [x.id, x.start, x.end]), [['t1', '2026-10-05', '2026-10-07'], ['t2', '2026-10-14', '2026-10-15']]);
  assert.deepEqual(data.links, [{ from: 't1', to: 't2', type: 'FS', lag: 2 }]);
  assert.deepEqual(data.calendar, { workingDays: [1, 2, 3, 4, 5], holidays: [{ date: '2026-10-12' }, { date: '2026-10-13' }] });
  assert.deepEqual(data.planning, { direction: 'backward', end: '2026-10-30' });
  assert.equal(data.tasks[1].owner, 'r1');
  assert.deepEqual(warnings.map((w) => w.code), ['msp.constraintIgnored', 'msp.linkIgnored', 'msp.multipleOwners']);
  assert.ok(new GanttModel(data));
});

test('import MS Project : .mpp binaire et XML étranger refusés', () => {
  assert.equal(grab(() => fromMSPDI('ÐÏ\u0011àbinaire')).code, 'msp.binary');
  assert.equal(grab(() => fromMSPDI('<html><body/></html>')).code, 'msp.notProject');
  assert.ok(grab(() => fromMSPDI('<Project><Tasks>')) instanceof GanttError);
});
