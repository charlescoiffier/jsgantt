// Contraintes de dates d'une tâche : { type, date } avec date = numéro de jour.
//   SNET : début au plus tôt    SNLT : début au plus tard    MSO : doit commencer le
//   FNET : fin au plus tôt      FNLT : fin au plus tard      MFO : doit finir le
export const CONSTRAINT_TYPES = ['SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO'];

const SIDE = { SNET: 'start', SNLT: 'start', MSO: 'start', FNET: 'end', FNLT: 'end', MFO: 'end' };

export const constraintSide = (type) => SIDE[type];

// Borne inférieure que la planification impose au début (ou à la fin) ; null si la contrainte ne pousse pas la tâche.
// Une date non travaillée est ramenée sur un jour travaillé : vers l'avant pour un début, vers l'arrière pour une fin.
export function pushTarget(calendar, type, date) {
  switch (type) {
    case 'SNET':
    case 'MSO':
      return calendar.nextWorking(date);
    case 'FNET':
    case 'MFO':
      return calendar.prevWorking(date);
    default:
      return null;
  }
}

export function isViolated(calendar, type, date, start, end) {
  switch (type) {
    case 'SNLT':
      return start > date;
    case 'FNLT':
      return end > date;
    case 'SNET':
      return start < pushTarget(calendar, type, date);
    case 'FNET':
      return end < pushTarget(calendar, type, date);
    case 'MSO':
      return start !== pushTarget(calendar, type, date);
    case 'MFO':
      return end !== pushTarget(calendar, type, date);
    default:
      return false;
  }
}
