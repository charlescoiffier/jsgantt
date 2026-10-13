import { dayOfWeek, ymd, dayFromYMD } from './dates.js';

export const SCALES = ['day', 'week', 'month'];
export const DEFAULT_COL_WIDTHS = { day: 28, week: 84, month: 120 };
export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export class Timescale {
  constructor({ scale = 'week', colWidths = {}, originDay, endDay } = {}) {
    if (!SCALES.includes(scale)) throw new Error(`Échelle inconnue : "${scale}"`);
    if (!Number.isInteger(originDay) || !Number.isInteger(endDay) || endDay < originDay) {
      throw new Error('Plage de dates invalide');
    }
    this.scale = scale;
    this.originDay = originDay;
    this.endDay = endDay;
    const w = { ...DEFAULT_COL_WIDTHS, ...colWidths }[scale];
    this.pixelsPerDay = scale === 'day' ? w : scale === 'week' ? w / 7 : w / 30;
  }

  get totalWidth() {
    return (this.endDay - this.originDay + 1) * this.pixelsPerDay;
  }

  dayToX(day) {
    return (day - this.originDay) * this.pixelsPerDay;
  }

  xToDay(x) {
    return Math.floor(x / this.pixelsPerDay) + this.originDay;
  }

  barWidth(start, end) {
    return (end - start + 1) * this.pixelsPerDay;
  }

  weekendRects() {
    if (this.scale === 'month') return [];
    const rects = [];
    for (let d = this.originDay; d <= this.endDay; d++) {
      const dow = dayOfWeek(d);
      if (dow === 0 || dow === 6) rects.push({ x: this.dayToX(d), width: this.pixelsPerDay });
    }
    return rects;
  }

  headerCells() {
    const a = this.originDay;
    const b = this.endDay;
    const cell = (label, s, e, extra = {}) => {
      const cs = Math.max(s, a);
      const ce = Math.min(e, b);
      return { label, start: cs, end: ce, x: this.dayToX(cs), width: (ce - cs + 1) * this.pixelsPerDay, ...extra };
    };

    const months = [];
    let { year, month } = ymd(a);
    for (;;) {
      const start = dayFromYMD(year, month, 1);
      if (start > b) break;
      const ny = month === 11 ? year + 1 : year;
      const nm = month === 11 ? 0 : month + 1;
      months.push({ year, month, start, end: dayFromYMD(ny, nm, 1) - 1 });
      year = ny;
      month = nm;
    }

    if (this.scale === 'month') {
      const years = [];
      for (let y = ymd(a).year; y <= ymd(b).year; y++) {
        years.push(cell(String(y), dayFromYMD(y, 0, 1), dayFromYMD(y + 1, 0, 1) - 1));
      }
      return { top: years, bottom: months.map((m) => cell(MONTHS_SHORT[m.month], m.start, m.end)) };
    }

    const top = months.map((m) => cell(`${MONTHS_LONG[m.month]} ${m.year}`, m.start, m.end));
    const bottom = [];
    if (this.scale === 'day') {
      for (let d = a; d <= b; d++) {
        const dow = dayOfWeek(d);
        bottom.push(cell(String(ymd(d).day), d, d, { weekend: dow === 0 || dow === 6 }));
      }
    } else {
      for (let d = a - ((dayOfWeek(a) + 6) % 7); d <= b; d += 7) {
        bottom.push(cell(String(ymd(d).day), d, d + 6));
      }
    }
    return { top, bottom };
  }
}
