// Contraintes de dates d'une tâche : { type, date } avec date = numéro de jour.
//   SNET : début au plus tôt    SNLT : début au plus tard    MSO : doit commencer le
//   FNET : fin au plus tôt      FNLT : fin au plus tard      MFO : doit finir le
export const CONSTRAINT_TYPES = ['SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO'];

const SIDE = { SNET: 'start', SNLT: 'start', MSO: 'start', FNET: 'end', FNLT: 'end', MFO: 'end' };

export const constraintSide = (type) => SIDE[type];

// Date effective d'une contrainte, utilisée pour la comparer aux dates de la tâche. Avec un calendrier, une date non
// travaillée est ramenée sur un jour travaillé : vers l'avant pour un début, vers l'arrière pour une fin.
export function effectiveDate(calendar, type, date) {
  switch (type) {
    case 'SNET':
    case 'MSO':
      return calendar.nextWorking(date);
    case 'FNET':
    case 'MFO':
      return calendar.prevWorking(date);
    default:
      return date;
  }
}

// Les contraintes sont indicatives : elles ne déplacent jamais une tâche, elles sont seulement signalées quand elles ne sont pas respectées.
export function isViolated(calendar, type, date, start, end) {
  const target = effectiveDate(calendar, type, date);
  switch (type) {
    case 'SNET':
      return start < target;
    case 'SNLT':
      return start > target;
    case 'MSO':
      return start !== target;
    case 'FNET':
      return end < target;
    case 'FNLT':
      return end > target;
    case 'MFO':
      return end !== target;
    default:
      return false;
  }
}
