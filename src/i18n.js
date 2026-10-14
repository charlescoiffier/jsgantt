const FR = {
  code: 'fr',
  months: {
    short: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    long: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  },
  messages: {
    // Interface
    'ui.name': 'Nom',
    'ui.start': 'Début',
    'ui.end': 'Fin',
    'ui.duration': 'Durée',
    'ui.durationValue': '{n} j',
    'ui.addTask': 'Ajouter une tâche',
    'ui.addBelow': 'Ajouter une tâche en dessous',
    'ui.remove': 'Supprimer la tâche',
    'ui.move': 'Déplacer la ligne',
    // Accessibilité
    'a11y.chart': 'Diagramme de Gantt',
    'a11y.untitled': 'Tâche sans nom',
    'a11y.level': 'niveau {n}',
    'a11y.progress': 'progression {p} %',
    'a11y.milestone': 'jalon le {date}',
    'a11y.range': 'du {start} au {end}',
    'a11y.group.one': 'groupe de {count} tâche, {state}',
    'a11y.group.other': 'groupe de {count} tâches, {state}',
    'a11y.collapsed': 'replié',
    'a11y.expanded': 'déplié',
    'a11y.predecessors': 'prédécesseurs : {list}',
    'a11y.rowDates': '{name} : {range}',
    'a11y.rowProgress': '{name} : {progress}',
    'a11y.added': 'Tâche ajoutée : {name}',
    'a11y.addedBare': 'Tâche ajoutée',
    'a11y.renamed': 'Tâche renommée : {name}',
    'a11y.removed': 'Tâche supprimée',
    'a11y.linkCreated': 'Lien créé : {from} vers {to} ({type})',
    'a11y.linkRemoved': 'Lien supprimé',
    'a11y.reordered': '{name} déplacée, {level}',
    'a11y.undo': 'Annulé',
    'a11y.redo': 'Rétabli',
    'a11y.refused': 'Action refusée : {reason}',
    // Clavier
    'kb.linkModeCancelled': 'Mode lien annulé',
    'kb.pickTargetFirst': 'Choisissez d\'abord une cible avec les flèches haut et bas',
    'kb.target': 'Cible : {name}',
    'kb.targetRefused': 'Cible : {name} (refusée : {reason})',
    'kb.linkModeStart': 'Mode lien depuis {name}. Flèches haut et bas pour choisir la cible, puis 1 à 4 pour FS, SS, FF, SF, ou Entrée pour FS. Échap annule.',
    'kb.linkSelected': 'Lien {from} vers {to} ({type}) sélectionné. Suppr pour le supprimer.',
    'kb.noLinks': 'Cette tâche n\'a aucun lien',
    // Dates
    'date.format': 'Date invalide : {value} (attendu AAAA-MM-JJ)',
    'date.nonexistent': 'Date invalide : {value} (ce jour n\'existe pas)',
    // Import des données
    'data.notObject': 'Les données doivent être un objet { tasks, links }',
    'data.unknownKey': 'Les données contiennent une clé inconnue "{key}" (attendu : tasks, links)',
    'data.tasksNotArray': '"tasks" doit être un tableau',
    'data.linksNotArray': '"links" doit être un tableau',
    'link.invalid': 'Lien {link} invalide : {reason}',
    'task.notObject': 'Chaque tâche doit être un objet',
    'task.idRequired': 'Chaque tâche doit avoir un "id" (chaîne non vide)',
    'task.duplicateId': 'Identifiant de tâche dupliqué : "{id}"',
    'task.progressRange': 'Tâche "{id}" : "progress" doit être un nombre entre 0 et 1',
    'task.error': 'Tâche "{id}" : {detail}',
    'hierarchy.loop': 'Boucle dans la hiérarchie autour de "{id}"',
    'task.parentUnknown': 'Tâche "{id}" : parent inconnu "{parentId}"',
    'task.startRequired': 'Tâche "{id}" : "start" est requis',
    'task.milestoneEnd': 'Tâche "{id}" : un jalon doit avoir une fin égale à son début',
    'task.endRequired': 'Tâche "{id}" : "end" est requis',
    'task.endBeforeStart': 'Tâche "{id}" : la fin précède le début',
    'task.unknown': 'Tâche inconnue : "{id}"',
    // Opérations
    'resize.group': 'un groupe ne peut pas être redimensionné',
    'resize.milestone': 'un jalon ne peut pas être redimensionné',
    'resize.startAfterEnd': 'le début ne peut pas suivre la fin',
    'resize.endBeforeStart': 'la fin ne peut pas précéder le début',
    'resize.blocked': 'redimensionnement bloqué par une dépendance',
    'progress.group': 'la progression d\'un groupe est calculée',
    'dates.group': 'les dates d\'un groupe sont calculées',
    'dates.endBeforeStart': 'la fin précède le début',
    'update.blocked': 'modification bloquée par une dépendance',
    'add.startRequired': '"start" est requis (AAAA-MM-JJ)',
    'add.refUnknown': 'tâche de référence inconnue : "{id}"',
    'parent.unknown': 'parent inconnu : "{id}"',
    'link.duplicateId': 'identifiant de lien dupliqué : "{id}"',
    'move.intoSelf': 'une tâche ne peut pas être déplacée dans elle-même ni dans un de ses descendants',
    'move.beforeId': 'beforeId doit être un enfant du nouveau parent',
    'move.linkForbidden': 'le déplacement créerait un lien interdit entre un groupe et un de ses descendants',
    'move.cycle': 'le déplacement créerait un cycle',
    'move.impossible': 'ce déplacement n\'est pas possible ici',
    // Liens
    'link.sourceUnknown': 'tâche source inconnue : "{id}"',
    'link.targetUnknown': 'tâche cible inconnue : "{id}"',
    'link.typeUnknown': 'type de lien inconnu : "{type}"',
    'link.lagInteger': 'le décalage (lag) doit être un entier',
    'link.self': 'une tâche ne peut pas être liée à elle-même',
    'link.groupDescendant': 'lien interdit entre un groupe et un de ses descendants',
    'link.exists': 'ce lien existe déjà',
    'link.cycle': 'ce lien créerait un cycle',
    // Contraintes de dates
    'constraint.type.SNET': 'Début au plus tôt',
    'constraint.type.SNLT': 'Début au plus tard',
    'constraint.type.FNET': 'Fin au plus tôt',
    'constraint.type.FNLT': 'Fin au plus tard',
    'constraint.type.MSO': 'Doit commencer le',
    'constraint.type.MFO': 'Doit finir le',
    'constraint.text': '{type} : {date}',
    'constraint.violated': 'non respectée',
    'constraint.title': 'Contrainte de date',
    'constraint.kind': 'Type',
    'constraint.none': 'Aucune',
    'constraint.date': 'Date',
    'constraint.apply': 'Appliquer',
    'constraint.remove': 'Retirer',
    'ui.constraint': 'Contrainte de date (au plus tôt, au plus tard…)',
    'a11y.constraint': 'contrainte : {text}',
    'a11y.constraintViolated': 'contrainte non respectée',
    'a11y.constraintChanged': 'Contrainte modifiée : {name}',
    'task.constraint': 'Tâche "{id}" : "constraint" doit être un objet { type, date }',
    'task.constraintType': 'Tâche "{id}" : type de contrainte inconnu "{type}"',
    'task.constraintGroup': 'Tâche "{id}" : un groupe ne peut pas porter de contrainte',
    'constraint.group': 'une contrainte ne peut pas être posée sur un groupe',
    'constraint.type': 'type de contrainte inconnu : "{type}"',
    'constraint.spec': 'la contrainte doit être un objet { type, date } ou null',
    // Calendrier
    'calendar.workingDays': 'workingDays invalide : indiquez au moins un jour, entier de 0 (dimanche) à 6 (samedi)',
    'calendar.lagUnit': 'lagUnit doit valoir "working" ou "calendar"',
    'calendar.holiday': 'Jour férié invalide : indiquez une date "AAAA-MM-JJ" ou { date, name }',
    'calendar.noWorkingDay': 'Aucun jour ouvré trouvé dans les 10 prochaines années : vérifiez le calendrier',
    'calendar.year': 'Année invalide : {year}',
    'a11y.calendarChanged': 'Calendrier modifié',
    // Divers
    readonly: 'le diagramme est en lecture seule',
    'export.pdfUnavailable': 'Export PDF indisponible : {detail}',
    'export.loadFailed': 'Impossible de charger {url}',
  },
};

const EN = {
  code: 'en',
  months: {
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    long: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
  messages: {
    'ui.name': 'Name',
    'ui.start': 'Start',
    'ui.end': 'End',
    'ui.duration': 'Duration',
    'ui.durationValue': '{n} d',
    'ui.addTask': 'Add a task',
    'ui.addBelow': 'Add a task below',
    'ui.remove': 'Delete the task',
    'ui.move': 'Move the row',
    'a11y.chart': 'Gantt chart',
    'a11y.untitled': 'Untitled task',
    'a11y.level': 'level {n}',
    'a11y.progress': 'progress {p}%',
    'a11y.milestone': 'milestone on {date}',
    'a11y.range': 'from {start} to {end}',
    'a11y.group.one': 'group of {count} task, {state}',
    'a11y.group.other': 'group of {count} tasks, {state}',
    'a11y.collapsed': 'collapsed',
    'a11y.expanded': 'expanded',
    'a11y.predecessors': 'predecessors: {list}',
    'a11y.rowDates': '{name}: {range}',
    'a11y.rowProgress': '{name}: {progress}',
    'a11y.added': 'Task added: {name}',
    'a11y.addedBare': 'Task added',
    'a11y.renamed': 'Task renamed: {name}',
    'a11y.removed': 'Task deleted',
    'a11y.linkCreated': 'Link created: {from} to {to} ({type})',
    'a11y.linkRemoved': 'Link deleted',
    'a11y.reordered': '{name} moved, {level}',
    'a11y.undo': 'Undone',
    'a11y.redo': 'Redone',
    'a11y.refused': 'Action refused: {reason}',
    'kb.linkModeCancelled': 'Link mode cancelled',
    'kb.pickTargetFirst': 'Pick a target first with the up and down arrows',
    'kb.target': 'Target: {name}',
    'kb.targetRefused': 'Target: {name} (refused: {reason})',
    'kb.linkModeStart': 'Link mode from {name}. Up and down arrows to pick the target, then 1 to 4 for FS, SS, FF, SF, or Enter for FS. Escape cancels.',
    'kb.linkSelected': 'Link {from} to {to} ({type}) selected. Delete to remove it.',
    'kb.noLinks': 'This task has no links',
    'date.format': 'Invalid date: {value} (expected YYYY-MM-DD)',
    'date.nonexistent': 'Invalid date: {value} (this day does not exist)',
    'data.notObject': 'The data must be an object { tasks, links }',
    'data.unknownKey': 'The data contains an unknown key "{key}" (expected: tasks, links)',
    'data.tasksNotArray': '"tasks" must be an array',
    'data.linksNotArray': '"links" must be an array',
    'link.invalid': 'Link {link} is invalid: {reason}',
    'task.notObject': 'Each task must be an object',
    'task.idRequired': 'Each task must have an "id" (non-empty string)',
    'task.duplicateId': 'Duplicate task id: "{id}"',
    'task.progressRange': 'Task "{id}": "progress" must be a number between 0 and 1',
    'task.error': 'Task "{id}": {detail}',
    'hierarchy.loop': 'Loop in the hierarchy around "{id}"',
    'task.parentUnknown': 'Task "{id}": unknown parent "{parentId}"',
    'task.startRequired': 'Task "{id}": "start" is required',
    'task.milestoneEnd': 'Task "{id}": a milestone must end the day it starts',
    'task.endRequired': 'Task "{id}": "end" is required',
    'task.endBeforeStart': 'Task "{id}": the end is before the start',
    'task.unknown': 'Unknown task: "{id}"',
    'resize.group': 'a group cannot be resized',
    'resize.milestone': 'a milestone cannot be resized',
    'resize.startAfterEnd': 'the start cannot come after the end',
    'resize.endBeforeStart': 'the end cannot come before the start',
    'resize.blocked': 'resizing blocked by a dependency',
    'progress.group': 'the progress of a group is computed',
    'dates.group': 'the dates of a group are computed',
    'dates.endBeforeStart': 'the end is before the start',
    'update.blocked': 'change blocked by a dependency',
    'add.startRequired': '"start" is required (YYYY-MM-DD)',
    'add.refUnknown': 'unknown reference task: "{id}"',
    'parent.unknown': 'unknown parent: "{id}"',
    'link.duplicateId': 'duplicate link id: "{id}"',
    'move.intoSelf': 'a task cannot be moved into itself or into one of its descendants',
    'move.beforeId': 'beforeId must be a child of the new parent',
    'move.linkForbidden': 'the move would create a forbidden link between a group and one of its descendants',
    'move.cycle': 'the move would create a cycle',
    'move.impossible': 'this move is not possible here',
    'link.sourceUnknown': 'unknown source task: "{id}"',
    'link.targetUnknown': 'unknown target task: "{id}"',
    'link.typeUnknown': 'unknown link type: "{type}"',
    'link.lagInteger': 'the lag must be an integer',
    'link.self': 'a task cannot be linked to itself',
    'link.groupDescendant': 'forbidden link between a group and one of its descendants',
    'link.exists': 'this link already exists',
    'link.cycle': 'this link would create a cycle',
    'constraint.type.SNET': 'Start no earlier than',
    'constraint.type.SNLT': 'Start no later than',
    'constraint.type.FNET': 'Finish no earlier than',
    'constraint.type.FNLT': 'Finish no later than',
    'constraint.type.MSO': 'Must start on',
    'constraint.type.MFO': 'Must finish on',
    'constraint.text': '{type}: {date}',
    'constraint.violated': 'not met',
    'constraint.title': 'Date constraint',
    'constraint.kind': 'Type',
    'constraint.none': 'None',
    'constraint.date': 'Date',
    'constraint.apply': 'Apply',
    'constraint.remove': 'Remove',
    'ui.constraint': 'Date constraint (no earlier / no later than…)',
    'a11y.constraint': 'constraint: {text}',
    'a11y.constraintViolated': 'constraint not met',
    'a11y.constraintChanged': 'Constraint changed: {name}',
    'task.constraint': 'Task "{id}": "constraint" must be an object { type, date }',
    'task.constraintType': 'Task "{id}": unknown constraint type "{type}"',
    'task.constraintGroup': 'Task "{id}": a group cannot have a constraint',
    'constraint.group': 'a constraint cannot be set on a group',
    'constraint.type': 'unknown constraint type: "{type}"',
    'constraint.spec': 'the constraint must be an object { type, date } or null',
    'calendar.workingDays': 'invalid workingDays: give at least one day, an integer from 0 (Sunday) to 6 (Saturday)',
    'calendar.lagUnit': 'lagUnit must be "working" or "calendar"',
    'calendar.holiday': 'Invalid holiday: give a "YYYY-MM-DD" date or { date, name }',
    'calendar.noWorkingDay': 'No working day found in the next 10 years: check the calendar',
    'calendar.year': 'Invalid year: {year}',
    'a11y.calendarChanged': 'Calendar changed',
    readonly: 'the chart is read-only',
    'export.pdfUnavailable': 'PDF export unavailable: {detail}',
    'export.loadFailed': 'Unable to load {url}',
  },
};

export const BUILTIN_LOCALES = { fr: FR, en: EN };

function pluralRules(code) {
  try {
    return new Intl.PluralRules(code);
  } catch {
    return new Intl.PluralRules('fr');
  }
}

// `locale` : 'fr' | 'en' | { code, base?, messages?, months? } (langue ajoutée ou complétée).
export function createI18n(locale = 'fr') {
  const spec = typeof locale === 'string' ? { code: locale } : locale;
  const code = spec.code ?? 'fr';
  const base = BUILTIN_LOCALES[spec.base ?? code] ?? FR;
  const chain = [spec.messages ?? {}, base.messages, FR.messages];
  const months = spec.months ?? base.months;
  const plural = pluralRules(code);

  const lookup = (key) => {
    for (const messages of chain) if (messages[key] !== undefined) return messages[key];
    return undefined;
  };

  const i18n = {
    code,
    months,
    t(key, params = {}) {
      let template;
      if (params.count !== undefined) {
        template = lookup(`${key}.${plural.select(params.count)}`) ?? lookup(`${key}.other`);
      }
      template ??= lookup(key);
      if (template === undefined) return key;
      return template.replace(/\{(\w+)\}/g, (_, name) => {
        const value = params[name];
        if (value && typeof value === 'object' && value.code) return i18n.t(value.code, value.params ?? {});
        return value === undefined || value === null ? '' : String(value);
      });
    },
    // Traduit un résultat { ok: false, code, params, reason } ou une erreur GanttError ; sinon texte brut.
    localize(result) {
      if (result?.code) return i18n.t(result.code, result.params ?? {});
      return result?.reason ?? result?.message ?? String(result);
    },
  };
  return i18n;
}

const FR_I18N = createI18n('fr');

export class GanttError extends Error {
  constructor(code, params = {}) {
    super(FR_I18N.t(code, params));
    this.code = code;
    this.params = params;
  }
}

export function fail(code, params = {}) {
  return { ok: false, reason: FR_I18N.t(code, params), code, params };
}

export function failFrom(error) {
  const out = { ok: false, reason: error.message };
  if (error.code) {
    out.code = error.code;
    out.params = error.params;
  }
  return out;
}
