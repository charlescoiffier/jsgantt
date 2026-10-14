import { fromDay } from '../dates.js';
import { GanttError } from '../i18n.js';
import { COLORS } from '../colors.js';
import { CONSTRAINT_TYPES } from '../constraints.js';
import { wbsNumbers } from '../view.js';

// CSV : une ligne par tâche. Export depuis un modèle, import vers des données { tasks, links, owners }.

const FIELDS = ['wbs', 'id', 'name', 'start', 'end', 'duration', 'progress', 'owner', 'color', 'parent', 'predecessors', 'constraint', 'constraintDate', 'milestone'];
const HEADERS = {
  fr: ['N°', 'Id', 'Nom', 'Début', 'Fin', 'Durée (j)', 'Avancement (%)', 'Responsable', 'Couleur', 'Parent', 'Prédécesseurs', 'Contrainte', 'Date contrainte', 'Jalon'],
  en: ['No.', 'Id', 'Name', 'Start', 'End', 'Duration (d)', 'Progress (%)', 'Owner', 'Color', 'Parent', 'Predecessors', 'Constraint', 'Constraint date', 'Milestone'],
};
const YES = { fr: 'oui', en: 'yes' };

// Noms d'en-têtes reconnus à l'import (sans casse, accents, ponctuation ni unité entre parenthèses).
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const ALIASES = {
  wbs: ['n', 'no', 'num', 'numero', 'wbs', 'edt', 'outline', 'outlinenumber'],
  id: ['id', 'identifiant', 'uid'],
  name: ['nom', 'name', 'tache', 'task', 'titre', 'title', 'libelle'],
  start: ['debut', 'start', 'datededebut', 'startdate'],
  end: ['fin', 'end', 'finish', 'datedefin', 'enddate', 'finishdate'],
  duration: ['duree', 'duration'],
  progress: ['avancement', 'progress', 'complete', 'percentcomplete', 'pourcentage'],
  owner: ['responsable', 'owner', 'ressource', 'resource', 'assignee'],
  color: ['couleur', 'color', 'colour'],
  parent: ['parent', 'parentid'],
  predecessors: ['predecesseurs', 'predecessors', 'dependances', 'dependencies'],
  constraint: ['contrainte', 'constraint', 'constrainttype'],
  constraintDate: ['datecontrainte', 'constraintdate'],
  milestone: ['jalon', 'milestone'],
};
const COLOR_NAMES_FR = {
  rouge: 'red', orange: 'orange', ambre: 'amber', jaune: 'yellow', citronvert: 'lime', vert: 'green', sarcelle: 'teal',
  cyan: 'cyan', bleu: 'blue', indigo: 'indigo', violet: 'purple', rose: 'pink',
};

const quote = (v, sep) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Prédécesseurs d'une tâche : « t1 », « t1SS », « t1FS+2 », « t2FF-1 » (FS sans décalage s'écrit seul).
const predText = (l) => `${l.from}${l.type === 'FS' && !l.lag ? '' : l.type}${l.lag ? (l.lag > 0 ? `+${l.lag}` : l.lag) : ''}`;

// opts : { sep (défaut « ; » en français, « , » sinon), locale ('fr' | 'en') }
export function toCSV(model, { locale = 'fr', sep } = {}) {
  const lang = locale === 'en' ? 'en' : 'fr';
  const s = sep ?? (lang === 'fr' ? ';' : ',');
  const listSep = s === ';' ? ', ' : '; ';
  const wbs = wbsNumbers(model);
  const order = [...wbs.keys()];
  const lines = [HEADERS[lang].map((h) => quote(h, s)).join(s)];
  for (const id of order) {
    const t = model.getTask(id);
    const group = model.isGroup(id);
    const preds = model.links.filter((l) => l.to === id).map(predText).join(listSep);
    const row = {
      wbs: wbs.get(id),
      id,
      name: t.name,
      start: fromDay(t.start),
      end: fromDay(t.end),
      duration: model.durationDays(id),
      progress: Math.round(model.progressOf(id) * 100),
      owner: model.ownerName(t.owner),
      color: t.color ?? '',
      parent: t.parentId ?? '',
      predecessors: preds,
      constraint: !group && t.constraint ? t.constraint.type : '',
      constraintDate: !group && t.constraint ? fromDay(t.constraint.date) : '',
      milestone: t.milestone && !group ? YES[lang] : '',
    };
    lines.push(FIELDS.map((f) => quote(row[f], s)).join(s));
  }
  return `${lines.join('\r\n')}\r\n`;
}

// Découpe un texte CSV (RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans un champ).
export function parseCSV(text, sep) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push({ cells: row, line: rowLine });
      row = [];
      field = '';
      line++;
      rowLine = line;
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push({ cells: row, line: rowLine });
  }
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ''));
}

// Séparateur le plus présent dans la première ligne (hors guillemets) parmi « ; », « , » et la tabulation.
function detectSeparator(text) {
  const first = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
  const count = (c) => first.split(c).length - 1;
  return [';', ',', '\t'].reduce((best, c) => (count(c) > count(best) ? c : best), ';');
}

const parseDate = (value, line) => {
  const v = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(v); // JJ/MM/AAAA (Excel en français)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  throw new GanttError('csv.date', { line, value: v });
};

const isYes = (v) => ['oui', 'yes', 'y', 'o', 'x', '1', 'true', 'vrai'].includes(fold(v));

// Texte CSV → { data: { tasks, links, owners }, warnings: [{ code, params }] } ; lève GanttError si illisible.
export function fromCSV(text) {
  const clean = String(text ?? '').replace(/^﻿/, '');
  const rows = parseCSV(clean, detectSeparator(clean));
  if (rows.length < 2) throw new GanttError('csv.empty');
  const cols = {};
  rows[0].cells.forEach((h, i) => {
    const key = fold(h);
    for (const [field, names] of Object.entries(ALIASES)) if (names.includes(key) && !(field in cols)) cols[field] = i;
  });
  if (!('name' in cols) || !('start' in cols)) throw new GanttError('csv.header');
  const warnings = [];
  const get = (r, f) => (f in cols ? (r.cells[cols[f]] ?? '').trim() : '');

  const owners = new Map(); // nom → id
  const ownerId = (name) => {
    if (!owners.has(name)) owners.set(name, `o${owners.size + 1}`);
    return owners.get(name);
  };
  const tasks = [];
  const byWbs = new Map();
  const pendingPreds = [];
  rows.slice(1).forEach((r, i) => {
    const line = r.line;
    const id = get(r, 'id') || `t${i + 1}`;
    const milestone = isYes(get(r, 'milestone'));
    const startRaw = get(r, 'start');
    const endRaw = get(r, 'end');
    const task = { id, name: get(r, 'name') };
    if (startRaw) task.start = parseDate(startRaw, line);
    if (endRaw) task.end = parseDate(endRaw, line);
    if (milestone) task.milestone = true;
    const progress = get(r, 'progress').replace('%', '').replace(',', '.').trim();
    if (progress) {
      const p = Number(progress);
      if (!Number.isFinite(p) || p < 0 || p > 100) throw new GanttError('csv.progress', { line, value: progress });
      task.progress = Math.round(p) / 100;
    }
    const owner = get(r, 'owner');
    if (owner) task.owner = ownerId(owner);
    const color = fold(get(r, 'color'));
    if (color) {
      const c = COLORS.includes(color) ? color : COLOR_NAMES_FR[color];
      if (c) task.color = c;
      else warnings.push({ code: 'csv.colorIgnored', params: { line, value: get(r, 'color') } });
    }
    const parent = get(r, 'parent');
    if (parent) task.parentId = parent;
    const ctype = get(r, 'constraint').toUpperCase();
    if (ctype) {
      if (CONSTRAINT_TYPES.includes(ctype) && get(r, 'constraintDate')) {
        task.constraint = { type: ctype, date: parseDate(get(r, 'constraintDate'), line) };
      } else warnings.push({ code: 'csv.constraintIgnored', params: { line, value: ctype } });
    }
    const wbs = get(r, 'wbs');
    if (wbs) byWbs.set(wbs, task);
    tasks.push({ task, wbs, line });
    const preds = get(r, 'predecessors');
    if (preds) pendingPreds.push({ to: id, text: preds, line });
  });
  // Sans colonne Parent, la hiérarchie se déduit des numéros (1.2 est enfant de 1).
  if (!('parent' in cols)) {
    for (const { task, wbs } of tasks) {
      const parentWbs = wbs.includes('.') ? wbs.slice(0, wbs.lastIndexOf('.')) : '';
      if (parentWbs && byWbs.has(parentWbs)) task.parentId = byWbs.get(parentWbs).id;
    }
  }
  // Une tâche qui a des enfants est un groupe : ses dates viennent de ses enfants.
  const parents = new Set(tasks.map(({ task }) => task.parentId).filter(Boolean));
  for (const { task, line } of tasks) {
    if (parents.has(task.id)) {
      delete task.start;
      delete task.end;
      delete task.milestone;
      delete task.progress;
      delete task.constraint;
    } else if (!task.start) throw new GanttError('csv.startRequired', { line });
  }
  const links = [];
  const ids = new Set(tasks.map(({ task }) => task.id));
  for (const { to, text: predsText, line } of pendingPreds) {
    for (const part of predsText.split(/[;,]/).map((p) => p.trim()).filter(Boolean)) {
      const m = /^(.+?)\s*(FS|SS|FF|SF|DF|DD|FD)?\s*([+-]\s*\d+)?\s*[jd]?$/i.exec(part);
      if (!m || !ids.has(m[1].trim())) throw new GanttError('csv.predecessor', { line, value: part });
      const type = { FD: 'FS', DD: 'SS', DF: 'SF' }[m[2]?.toUpperCase()] ?? (m[2]?.toUpperCase() || 'FS');
      links.push({ from: m[1].trim(), to, type, lag: m[3] ? Number(m[3].replace(/\s/g, '')) : 0 });
    }
  }
  return {
    data: {
      tasks: tasks.map(({ task }) => task),
      links,
      ...(owners.size ? { owners: [...owners].map(([name, id]) => ({ id, name })) } : {}),
    },
    warnings,
  };
}
