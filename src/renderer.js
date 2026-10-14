import { fromDay } from './dates.js';
import { describeTask } from './a11y.js';
import { createI18n } from './i18n.js';
import { constraintSide } from './constraints.js';
import { constraintText } from './a11y.js';
import { criticalLinkIds } from './slack.js';
import { normalizeColumns, viewRows, viewContext, EDITABLE_COLUMNS } from './view.js';

export const MIN_BAR_WIDTH = 4;
export const MIN_NAME_WIDTH = 120;
const DEFAULT_I18N = createI18n('fr');

const fmt = (n) => +n.toFixed(2);

export function roundedPath(points, radius) {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p = pts[i];
    const p1 = pts[i + 1];
    const l0 = Math.hypot(p.x - p0.x, p.y - p0.y);
    const l1 = Math.hypot(p1.x - p.x, p1.y - p.y);
    const r = Math.min(radius, l0 / 2, l1 / 2);
    if (r <= 0) {
      d += ` L${fmt(p.x)},${fmt(p.y)}`;
      continue;
    }
    const ax = p.x + ((p0.x - p.x) / l0) * r;
    const ay = p.y + ((p0.y - p.y) / l0) * r;
    const bx = p.x + ((p1.x - p.x) / l1) * r;
    const by = p.y + ((p1.y - p.y) / l1) * r;
    d += ` L${fmt(ax)},${fmt(ay)} Q${fmt(p.x)},${fmt(p.y)} ${fmt(bx)},${fmt(by)}`;
  }
  const last = pts[pts.length - 1];
  if (pts.length > 1) d += ` L${fmt(last.x)},${fmt(last.y)}`;
  return d;
}

export function routeLink(pa, ea, pb, eb, gap, rowHeight) {
  const dirA = ea === 'end' ? 1 : -1;
  const dirB = eb === 'end' ? 1 : -1; // côté d'où le lien arrive sur B
  if (dirA === dirB) {
    const xv = dirA === 1 ? Math.max(pa.x, pb.x) + gap : Math.min(pa.x, pb.x) - gap;
    return [pa, { x: xv, y: pa.y }, { x: xv, y: pb.y }, pb];
  }
  const x3 = pb.x + dirB * gap;
  if (dirA * (x3 - pa.x) >= gap) {
    return [pa, { x: x3, y: pa.y }, { x: x3, y: pb.y }, pb];
  }
  const x1 = pa.x + dirA * gap;
  const ym = pa.y + (pb.y >= pa.y ? 1 : -1) * (rowHeight / 2);
  return [pa, { x: x1, y: pa.y }, { x: x1, y: ym }, { x: x3, y: ym }, { x: x3, y: pb.y }, pb];
}

const LINK_EDGES = {
  FS: ['end', 'start'],
  SS: ['start', 'start'],
  FF: ['end', 'end'],
  SF: ['start', 'end'],
};

export function computeLayout(model, ts, metrics, state = {}) {
  const i18n = state.i18n ?? DEFAULT_I18N;
  const labels = {
    name: i18n.t('ui.name'),
    start: i18n.t('ui.start'),
    end: i18n.t('ui.end'),
    duration: i18n.t('ui.duration'),
    addTask: i18n.t('ui.addTask'),
    addBelow: i18n.t('ui.addBelow'),
    remove: i18n.t('ui.remove'),
    move: i18n.t('ui.move'),
    constraint: i18n.t('ui.constraint'),
    wbs: i18n.t('ui.wbs'),
    progress: i18n.t('ui.progress'),
    slack: i18n.t('ui.slack'),
  };
  const { rowHeight, barHeight, dateColWidth, indent, linkGap, linkRadius } = metrics;
  // Bande des repères et zones sous l'échelle de temps, seulement s'il y en a.
  const markersIn = model.markers ?? [];
  const zonesIn = model.zones ?? [];
  const scaleHeight = metrics.headerHeight;
  const bandHeight = markersIn.length || zonesIn.length ? (metrics.annotationHeight ?? 20) : 0;
  const headerHeight = scaleHeight + bandHeight;
  const durationColWidth = metrics.durationColWidth ?? 56;
  // Colonnes : le nom prend la largeur restante du tableau (au moins MIN_NAME_WIDTH).
  const columns = state.columns ?? normalizeColumns();
  const ctx = viewContext(model, i18n);
  const colWidth = (c) => {
    switch (c.id) {
      case 'start':
      case 'end':
        return dateColWidth;
      case 'duration':
        return durationColWidth;
      case 'wbs':
        return metrics.wbsColWidth ?? 48;
      case 'progress':
        return metrics.progressColWidth ?? 88;
      case 'slack':
        return metrics.slackColWidth ?? 64;
      default:
        return c.width ?? 100;
    }
  };
  const others = columns.slice(1).reduce((sum, c) => sum + colWidth(c), 0);
  const nameW = Math.max(MIN_NAME_WIDTH, (state.tableWidth ?? metrics.tableWidth) - others);
  const tableWidth = nameW + others;
  metrics = { ...metrics, tableWidth };
  let cx = 0;
  const tableColumns = columns.map((c) => {
    const w = c.id === 'name' ? nameW : colWidth(c);
    const col = {
      id: c.id,
      label: c.builtin ? labels[c.id] : c.label,
      x: cx,
      width: w,
      editable: EDITABLE_COLUMNS.includes(c.id),
      sort: state.sort?.column === c.id ? state.sort.dir : null,
      sortTitle: i18n.t('ui.sortBy', { column: c.builtin ? labels[c.id] : c.label }),
      spec: c,
    };
    cx += w;
    return col;
  });
  // `frozenRows` : ordre des lignes figé (pendant un glissement, pour qu'un tri ne fasse pas sauter les lignes).
  const rowsInfo = state.frozenRows ?? viewRows(model, { sort: state.sort ?? null, filter: state.filter ?? null, columns, ctx });
  const width = tableWidth + ts.totalWidth;
  const addRow = state.showAdd ? { y: headerHeight + rowsInfo.length * rowHeight, alt: rowsInfo.length % 2 === 1 } : null;
  const height = headerHeight + (rowsInfo.length + (addRow ? 1 : 0)) * rowHeight;

  const shift = (cell) => ({ ...cell, x: cell.x + tableWidth });
  const cells = ts.headerCells();
  const header = { top: cells.top.map(shift), bottom: cells.bottom.map(shift) };
  const weekends = ts.weekendRects().map(shift);
  const gridLines = header.bottom.map((c) => c.x);
  const today =
    state.today !== undefined && state.today >= ts.originDay && state.today <= ts.endDay
      ? { x: tableWidth + ts.dayToX(state.today) + ts.pixelsPerDay / 2 }
      : null;

  // Chemin critique et marges, seulement s'ils sont affichés.
  const slack = state.showCritical ? model.slack() : null;
  const criticalLinks = slack ? criticalLinkIds(model, slack) : new Set();
  const rows = [];
  const bars = [];
  const tableRows = [];
  rowsInfo.forEach(({ id, depth }, i) => {
    const t = model.getTask(id);
    const group = model.isGroup(id);
    const rowTop = headerHeight + i * rowHeight;
    const y = rowTop + (rowHeight - barHeight) / 2;
    const alt = i % 2 === 1;
    const selected = state.selectedId === id;
    let kind = 'task';
    let x;
    let w;
    if (group) {
      kind = 'group';
    } else if (t.milestone) {
      kind = 'milestone';
    }
    if (kind === 'milestone') {
      w = barHeight;
      x = tableWidth + ts.dayToX(t.start) + ts.pixelsPerDay / 2 - w / 2;
    } else {
      x = tableWidth + ts.dayToX(t.start);
      w = Math.max(ts.barWidth(t.start, t.end), MIN_BAR_WIDTH);
    }
    const progress = model.progressOf(id);
    const sl = slack?.get(id) ?? null;
    // Trait de marge : de la fin de la barre à la fin au plus tard, pour une tâche non terminée qui a de la marge.
    const slackLine = sl && sl.total > 0 && progress < 1
      ? {
          x1: kind === 'milestone' ? x + w : tableWidth + ts.dayToX(t.end) + ts.pixelsPerDay,
          x2: tableWidth + ts.dayToX(sl.lateEnd) + ts.pixelsPerDay,
          y: y + barHeight + 3,
          title: i18n.t('slack.title', { count: sl.total, free: sl.free }),
        }
      : null;
    const startLabel = fromDay(t.start);
    const endLabel = fromDay(t.end);
    rows.push({ id, y: rowTop, alt, group });
    bars.push({
      id,
      kind,
      x,
      y,
      width: w,
      height: barHeight,
      progress,
      progressWidth: kind === 'milestone' ? 0 : w * progress,
      handleWidth: Math.min(6, w / 3),
      name: t.name,
      label: `${t.name} (${startLabel} → ${endLabel})`,
      className: t.className,
      collapsed: group && t.collapsed,
      selected,
      critical: sl?.critical ?? false,
      slack: slackLine,
    });
    tableRows.push({
      id,
      index: i,
      label: describeTask(model, id, depth, i18n, sl),
      constrained: !group && model.constraintOf(id) !== null,
      y: rowTop,
      depth,
      name: t.name,
      startLabel,
      endLabel,
      durationLabel: i18n.t('ui.durationValue', { n: model.durationDays(id) }),
      cells: tableColumns.slice(1).map((c) => ({ id: c.id, text: cellText(c.spec, id, ctx) })),
      group,
      collapsed: group && t.collapsed,
      alt,
      selected,
    });
  });

  // Contraintes de dates : un repère par tâche visible, sur la date de la contrainte.
  const violated = new Set(model.violations().map((v) => v.id));
  const constraints = [];
  for (const bar of bars) {
    const c = model.constraintOf(bar.id);
    bar.violated = violated.has(bar.id);
    if (!c) continue;
    const side = constraintSide(c.type);
    const x = tableWidth + ts.dayToX(c.date) + (side === 'end' ? ts.pixelsPerDay : 0);
    const text = constraintText(model, bar.id, i18n);
    constraints.push({
      id: bar.id,
      type: c.type,
      side,
      x,
      y: bar.y,
      height: bar.height,
      violated: bar.violated,
      title: bar.violated ? `${text} — ${i18n.t('constraint.violated')}` : text,
    });
  }

  const planning = model.planning;
  const planningEnd = planning.direction === 'backward' && planning.end !== null
    ? { x: tableWidth + ts.dayToX(planning.end) + ts.pixelsPerDay, label: i18n.t('planning.endLabel') }
    : null;

  // Repères (ligne au milieu du jour) et zones (du début du premier jour à la fin du dernier), dans l'échelle visible.
  const inView = (a, b) => b >= ts.originDay && a <= ts.endDay;
  const markers = markersIn.filter((m) => inView(m.date, m.date)).map((m) => ({
    id: m.id,
    x: tableWidth + ts.dayToX(m.date) + ts.pixelsPerDay / 2,
    label: m.label,
    color: m.color,
    className: m.className,
    title: i18n.t('marker.title', { label: m.label || i18n.t('marker.untitled'), date: fromDay(m.date) }),
  }));
  const zones = zonesIn.filter((z) => inView(z.start, z.end)).map((z) => {
    const start = Math.max(z.start, ts.originDay);
    const end = Math.min(z.end, ts.endDay);
    return {
      id: z.id,
      x: tableWidth + ts.dayToX(start),
      width: ts.barWidth(start, end),
      label: z.label,
      color: z.color,
      className: z.className,
      title: i18n.t('zone.title', { label: z.label || i18n.t('zone.untitled'), start: fromDay(z.start), end: fromDay(z.end) }),
    };
  });

  const barById = new Map(bars.map((b) => [b.id, b]));
  // Repli : un lien vers une tâche repliée part de son groupe visible. Filtre : un lien vers une tâche masquée est masqué.
  const filtering = state.filter !== null && state.filter !== undefined && state.filter !== '';
  const visibleBar = (id) => {
    if (filtering) return barById.get(id) ?? null;
    let cur = id;
    while (cur !== null && !barById.has(cur)) cur = model.getTask(cur).parentId;
    return cur === null ? null : barById.get(cur);
  };
  const anchor = (bar, edge) => ({ x: edge === 'start' ? bar.x : bar.x + bar.width, y: bar.y + bar.height / 2 });

  const links = [];
  for (const link of model.links) {
    const a = visibleBar(link.from);
    const b = visibleBar(link.to);
    if (!a || !b || a === b) continue;
    const [ea, eb] = LINK_EDGES[link.type];
    const points = routeLink(anchor(a, ea), ea, anchor(b, eb), eb, linkGap, rowHeight);
    links.push({
      id: link.id,
      type: link.type,
      fromId: a.id,
      toId: b.id,
      points,
      d: roundedPath(points, linkRadius),
      selected: state.selectedLinkId === link.id,
      critical: criticalLinks.has(link.id),
    });
  }

  return {
    width,
    height,
    metrics,
    rowHeight,
    headerHeight,
    scaleHeight,
    bandHeight,
    markers,
    zones,
    labels,
    header,
    rows,
    rowsInfo,
    weekends,
    gridLines,
    addRow,
    constraints,
    planningEnd,
    today,
    bars,
    links,
    table: { width: tableWidth, nameW, columns: tableColumns, dateColWidth, durationColWidth, indent, rows: tableRows },
  };
}

// Texte d'une cellule hors nom.
function cellText(col, id, ctx) {
  const { model, i18n } = ctx;
  const t = model.getTask(id);
  switch (col.id) {
    case 'wbs':
      return ctx.wbs.get(id);
    case 'start':
      return fromDay(t.start);
    case 'end':
      return fromDay(t.end);
    case 'duration':
      return i18n.t('ui.durationValue', { n: model.durationDays(id) });
    case 'progress':
      return i18n.t('ui.progressValue', { p: Math.round(model.progressOf(id) * 100) });
    case 'slack':
      return i18n.t('ui.durationValue', { n: ctx.slack.get(id)?.total ?? 0 });
    default:
      try {
        const v = col.value(t);
        return v === undefined || v === null ? '' : String(v);
      } catch {
        return '';
      }
  }
}

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : String(v));
  }
  if (text !== undefined) e.textContent = text;
  return e;
}

const cls = (...names) => names.filter(Boolean).join(' ');

export function readMetrics(el) {
  const cs = getComputedStyle(el);
  const num = (name, fallback) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    rowHeight: num('--gantt-row-height', 32),
    barHeight: num('--gantt-bar-height', 18),
    headerHeight: num('--gantt-header-height', 48),
    annotationHeight: num('--gantt-annotation-height', 20),
    tableWidth: num('--gantt-table-width', 360),
    dateColWidth: num('--gantt-date-col-width', 84),
    durationColWidth: num('--gantt-duration-col-width', 56),
    wbsColWidth: num('--gantt-wbs-col-width', 48),
    progressColWidth: num('--gantt-progress-col-width', 88),
    slackColWidth: num('--gantt-slack-col-width', 64),
    indent: num('--gantt-indent', 16),
    linkGap: num('--gantt-link-gap', 10),
    linkRadius: num('--gantt-link-radius', 6),
    colWidths: {
      day: num('--gantt-col-width-day', 28),
      week: num('--gantt-col-width-week', 84),
      month: num('--gantt-col-width-month', 120),
    },
  };
}

function markerDefs(uid) {
  const defs = svgEl('defs');
  for (const [suffix, cls] of [['arrow', 'gantt-arrow'], ['arrow-critical', 'gantt-arrow gantt-arrow--critical']]) {
    const marker = svgEl('marker', {
      id: `${uid}-${suffix}`,
      markerWidth: 8,
      markerHeight: 8,
      refX: 7,
      refY: 4,
      orient: 'auto',
      markerUnits: 'userSpaceOnUse',
    });
    marker.append(svgEl('path', { class: cls, d: 'M0,0 L8,4 L0,8 z' }));
    defs.append(marker);
  }
  return defs;
}

function clipDefs(uid, layout, prefix = 'clip') {
  const defs = svgEl('defs');
  for (const col of layout.table.columns) {
    const clip = svgEl('clipPath', { id: `${uid}-${prefix}-${col.id}` });
    // Le nom s'arrête un peu avant la colonne suivante ; les autres cellules peuvent aller jusqu'au bord.
    clip.append(svgEl('rect', { x: col.x, y: 0, width: Math.max(col.width - (col.id === 'name' ? 4 : 0), 0), height: layout.height }));
    defs.append(clip);
  }
  return defs;
}

function renderGrid(layout) {
  const g = svgEl('g', { class: 'gantt-grid', 'aria-hidden': 'true' });
  const { tableWidth } = layout.metrics;
  for (const row of layout.rows) {
    g.append(svgEl('rect', {
      class: cls('gantt-row', row.alt && 'gantt-row--alt', row.group && 'gantt-row--group'),
      x: 0, y: row.y, width: layout.width, height: layout.rowHeight,
    }));
  }
  if (layout.addRow) {
    g.append(svgEl('rect', {
      class: cls('gantt-row', layout.addRow.alt && 'gantt-row--alt'),
      x: 0, y: layout.addRow.y, width: layout.width, height: layout.rowHeight, 'data-export': 'skip',
    }));
  }
  for (const w of layout.weekends) {
    const rect = svgEl('rect', {
      class: cls('gantt-weekend', w.holiday && 'gantt-holiday'),
      x: w.x, y: layout.headerHeight, width: w.width, height: layout.height - layout.headerHeight,
    });
    if (typeof w.holiday === 'string') rect.append(svgEl('title', {}, w.holiday));
    g.append(rect);
  }
  for (const z of layout.zones) {
    g.append(svgEl('rect', {
      class: colorClass('gantt-zone', z), x: z.x, y: layout.headerHeight, width: z.width, height: layout.height - layout.headerHeight,
    }));
  }
  for (const x of layout.gridLines) {
    g.append(svgEl('line', { class: 'gantt-gridline', x1: x, x2: x, y1: layout.headerHeight, y2: layout.height }));
  }
  for (const m of layout.markers) {
    g.append(svgEl('line', { class: colorClass('gantt-marker', m), x1: m.x, x2: m.x, y1: layout.headerHeight, y2: layout.height }));
  }
  if (layout.today) {
    g.append(svgEl('line', {
      class: 'gantt-today', x1: layout.today.x, x2: layout.today.x, y1: layout.headerHeight, y2: layout.height,
    }));
  }
  if (layout.planningEnd) {
    const { x, label } = layout.planningEnd;
    g.append(svgEl('line', { class: 'gantt-end-line', x1: x, x2: x, y1: layout.headerHeight, y2: layout.height }));
    g.append(svgEl('text', { class: 'gantt-end-label', x: x - 6, y: layout.headerHeight + 12, 'text-anchor': 'end' }, label));
  }
  g.append(svgEl('line', { class: 'gantt-gridline', x1: tableWidth, x2: tableWidth, y1: 0, y2: layout.height }));
  return g;
}

function renderHeader(layout, uid) {
  const g = svgEl('g', { class: 'gantt-header', 'aria-hidden': 'true' });
  const { tableWidth } = layout.metrics;
  const half = layout.scaleHeight / 2;
  g.append(svgEl('rect', {
    class: 'gantt-header-bg', x: tableWidth, y: 0, width: layout.width - tableWidth, height: layout.headerHeight,
  }));
  const addCells = (cells, y) => {
    for (const c of cells) {
      g.append(svgEl('rect', {
        class: cls('gantt-header-cell', c.weekend && 'gantt-header-cell--weekend', c.holiday && 'gantt-header-cell--holiday'),
        x: c.x, y, width: c.width, height: half,
      }));
      g.append(svgEl('text', {
        class: 'gantt-header-text', x: c.x + c.width / 2, y: y + half / 2, dy: '0.35em', 'text-anchor': 'middle',
      }, c.label));
    }
  };
  addCells(layout.header.top, 0);
  addCells(layout.header.bottom, half);
  if (layout.bandHeight) g.append(renderAnnotationBand(layout, uid));
  return g;
}

const colorClass = (prefix, a) => cls(prefix, a.color && `${prefix}--${a.color}`, a.className);
const labelWidth = (text) => Math.max(18, text.length * 6.2 + 14);

// Bande sous l'échelle : segments des zones puis étiquettes des repères (on glisse un repère, on clique pour éditer).
function renderAnnotationBand(layout, uid) {
  const g = svgEl('g', { class: 'gantt-annotations' });
  const y = layout.scaleHeight;
  const h = layout.bandHeight;
  const { tableWidth } = layout.metrics;
  g.append(svgEl('rect', { class: 'gantt-annotation-band', x: tableWidth, y, width: layout.width - tableWidth, height: h }));
  for (const z of layout.zones) {
    const seg = svgEl('g', { class: colorClass('gantt-zone-tag', z), 'data-role': 'zone', 'data-zone-id': z.id });
    seg.append(svgEl('rect', { class: 'gantt-zone-tag-bg', x: z.x + 1, y: y + 3, width: Math.max(z.width - 2, 2), height: h - 6, rx: 4 }));
    const clipId = `${uid}-zclip-${z.id}`;
    const clip = svgEl('clipPath', { id: clipId });
    clip.append(svgEl('rect', { x: z.x + 1, y, width: Math.max(z.width - 4, 0), height: h }));
    seg.append(clip);
    seg.append(svgEl('text', { class: 'gantt-zone-tag-text', x: z.x + 6, y: y + h / 2, dy: '0.35em', 'clip-path': `url(#${clipId})` }, z.label));
    seg.append(svgEl('title', {}, z.title));
    g.append(seg);
  }
  for (const m of layout.markers) {
    const w = m.label ? labelWidth(m.label) : 12;
    const tag = svgEl('g', { class: colorClass('gantt-marker-tag', m), 'data-role': 'marker', 'data-marker-id': m.id });
    tag.append(svgEl('rect', { class: 'gantt-marker-tag-bg', x: m.x - 1, y: y + 2, width: w, height: h - 4, rx: 4 }));
    if (m.label) tag.append(svgEl('text', { class: 'gantt-marker-tag-text', x: m.x + 6, y: y + h / 2, dy: '0.35em' }, m.label));
    tag.append(svgEl('title', {}, m.title));
    g.append(tag);
  }
  return g;
}

function renderLinks(layout, uid) {
  const g = svgEl('g', { class: 'gantt-links', 'aria-hidden': 'true' });
  for (const link of layout.links) {
    const group = svgEl('g', {
      class: cls('gantt-link', `gantt-link--${link.type.toLowerCase()}`, link.selected && 'is-selected', link.critical && 'gantt-link--critical'),
      'data-link-id': link.id,
    });
    group.append(svgEl('path', {
      class: 'gantt-link-hit', d: link.d, 'data-role': 'link', 'data-link-id': link.id, 'data-export': 'skip',
    }));
    group.append(svgEl('path', {
      class: 'gantt-link-path', d: link.d, 'marker-end': `url(#${uid}-${link.critical ? 'arrow-critical' : 'arrow'})`,
    }));
    g.append(group);
  }
  return g;
}

function barShape(bar) {
  const { x, y, width: w, height: h } = bar;
  if (bar.kind === 'group') {
    const n = Math.min(6, w / 4);
    const pts = `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x + w - n},${y + h * 0.55} ${x + n},${y + h * 0.55} ${x},${y + h}`;
    return svgEl('polygon', { class: 'gantt-bar gantt-bar--group', points: pts, 'data-role': 'bar', 'data-id': bar.id });
  }
  if (bar.kind === 'milestone') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const pts = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
    return svgEl('polygon', { class: 'gantt-bar gantt-bar--milestone', points: pts, 'data-role': 'bar', 'data-id': bar.id });
  }
  return svgEl('rect', { class: 'gantt-bar', x, y, width: w, height: h, 'data-role': 'bar', 'data-id': bar.id });
}

function renderBars(layout, { readonly, dragId }) {
  const g = svgEl('g', { class: 'gantt-bars', 'aria-hidden': 'true' });
  for (const bar of layout.bars) {
    const group = svgEl('g', {
      class: cls('gantt-task', `gantt-task--${bar.kind}`, bar.className, bar.selected && 'is-selected',
        bar.collapsed && 'is-collapsed', dragId === bar.id && 'is-dragging', bar.violated && 'is-violated',
        bar.critical && 'is-critical'),
      'data-id': bar.id,
      'data-selectable': true,
      role: 'img',
      'aria-label': bar.label,
    });
    if (bar.slack) {
      const { x1, x2, y, title } = bar.slack;
      const line = svgEl('g', { class: 'gantt-slack', 'pointer-events': 'none' });
      line.append(svgEl('line', { class: 'gantt-slack-line', x1, x2, y1: y, y2: y }));
      line.append(svgEl('line', { class: 'gantt-slack-tick', x1: x2, x2, y1: y - 3, y2: y + 1 }));
      line.append(svgEl('title', {}, title));
      group.append(line);
    }
    group.append(barShape(bar));
    if (bar.kind === 'group') {
      // Forme alternative (pilule fine), masquée par défaut : un thème peut l'afficher à la place de l'accolade.
      const ph = bar.height * 0.4;
      const py = bar.y + (bar.height - ph) / 2;
      group.append(svgEl('rect', {
        class: 'gantt-group-pill', x: bar.x, y: py, width: bar.width, height: ph, 'data-role': 'bar', 'data-id': bar.id,
      }));
      group.append(svgEl('rect', {
        class: 'gantt-group-pill-progress', x: bar.x, y: py, width: bar.progressWidth, height: ph, 'pointer-events': 'none',
      }));
    }
    if (bar.kind === 'task' && bar.progressWidth > 0) {
      group.append(svgEl('rect', {
        class: 'gantt-progress', x: bar.x, y: bar.y, width: bar.progressWidth, height: bar.height, 'pointer-events': 'none',
      }));
    }
    group.append(svgEl('text', {
      class: 'gantt-label', x: bar.x + bar.width + 18, y: bar.y + bar.height / 2, dy: '0.35em',
    }, bar.name));
    if (!readonly) {
      const cy = bar.y + bar.height / 2;
      const skip = { 'data-export': 'skip', 'data-id': bar.id };
      if (bar.kind === 'task') {
        group.append(svgEl('rect', {
          class: 'gantt-handle', x: bar.x, y: bar.y, width: bar.handleWidth, height: bar.height,
          'data-role': 'handle-start', ...skip,
        }));
        group.append(svgEl('rect', {
          class: 'gantt-handle', x: bar.x + bar.width - bar.handleWidth, y: bar.y, width: bar.handleWidth,
          height: bar.height, 'data-role': 'handle-end', ...skip,
        }));
        group.append(svgEl('polygon', {
          class: 'gantt-handle gantt-handle--progress',
          points: `${bar.x + bar.progressWidth - 5},${bar.y + bar.height + 5} ${bar.x + bar.progressWidth + 5},${bar.y + bar.height + 5} ${bar.x + bar.progressWidth},${bar.y + bar.height - 1}`,
          'data-role': 'handle-progress', ...skip,
        }));
      }
      group.append(svgEl('circle', { class: 'gantt-anchor', cx: bar.x - 8, cy, r: 4, 'data-role': 'anchor-start', ...skip }));
      group.append(svgEl('circle', {
        class: 'gantt-anchor', cx: bar.x + bar.width + 8, cy, r: 4, 'data-role': 'anchor-end', ...skip,
      }));
    }
    g.append(group);
  }
  return g;
}

const ACTION_ICONS = {
  grip: 'M5.5 4.5h.01M10.5 4.5h.01M5.5 8h.01M10.5 8h.01M5.5 11.5h.01M10.5 11.5h.01',
  add: 'M8 3.5v9M3.5 8h9',
  constraint: 'M4.5 13.5v-10M4.5 3.5h7l-1.5 2.5 1.5 2.5h-7',
  delete: 'M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8M7 7v3.5M9 7v3.5',
};

function renderRowActions(row, table, rowHeight, uid, labels) {
  const g = svgEl('g', { class: 'gantt-actions', 'data-export': 'skip', 'aria-hidden': 'true' });
  const w = 22;
  const count = row.group ? 3 : 4;
  const x0 = table.nameW - count * w - 4;
  // Fond de la grappe : dégradé qui reprend la couleur réelle de la ligne (--row-bg) et estompe le nom trop long.
  const fade = 28;
  const total = count * w + 8 + fade;
  const gradId = `${uid}-fade-${row.index}`;
  const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 1, y2: 0 });
  const stop = (offset, opacity) => svgEl('stop', { class: 'gantt-fade-stop', offset, 'stop-opacity': opacity });
  grad.append(stop(0, 0), stop((fade / total) * 0.5, 0.6), stop(fade / total, 1), stop(1, 1));
  g.append(grad);
  g.append(svgEl('rect', {
    class: 'gantt-action-bg', x: x0 - 4 - fade, y: row.y + 1, width: total, height: rowHeight - 2, fill: `url(#${gradId})`,
  }));
  const defs = [
    ['grip', labels.move, 'row-grip'],
    ['add', labels.addBelow, 'row-add'],
    ...(row.group ? [] : [['constraint', labels.constraint, 'row-constraint']]),
    ['delete', labels.remove, 'row-delete'],
  ];
  defs.forEach(([icon, label, role], i) => {
    const x = x0 + i * w;
    const a = svgEl('g', { class: cls('gantt-action', `gantt-action--${icon}`, icon === 'constraint' && row.constrained && 'is-set') });
    a.append(svgEl('path', {
      class: 'gantt-action-icon', d: ACTION_ICONS[icon],
      transform: `translate(${x + w / 2 - 8},${row.y + rowHeight / 2 - 8})`,
    }));
    const hit = svgEl('rect', { class: 'gantt-action-hit', x, y: row.y, width: w, height: rowHeight, 'data-role': role, 'data-id': row.id });
    hit.append(svgEl('title', {}, label));
    a.append(hit);
    g.append(a);
  });
  return g;
}

function renderConstraints(layout, readonly) {
  const g = svgEl('g', { class: 'gantt-constraints', 'aria-hidden': 'true' });
  for (const c of layout.constraints) {
    const y1 = c.y - 4;
    const y2 = c.y + c.height + 4;
    const dir = c.side === 'start' ? 1 : -1;
    const marker = svgEl('g', {
      class: cls('gantt-constraint', `gantt-constraint--${c.type.toLowerCase()}`, c.violated && 'is-violated'),
      'data-id': c.id,
    });
    marker.append(svgEl('line', { class: 'gantt-constraint-line', x1: c.x, x2: c.x, y1, y2 }));
    marker.append(svgEl('polygon', { class: 'gantt-constraint-flag', points: `${c.x},${y1} ${c.x + 8 * dir},${y1 + 4} ${c.x},${y1 + 8}` }));
    const hit = svgEl('rect', {
      class: 'gantt-constraint-hit', x: c.x - 6, y: y1, width: 12, height: y2 - y1,
      'data-role': readonly ? undefined : 'constraint', 'data-id': c.id, 'data-export': 'skip',
    });
    hit.append(svgEl('title', {}, c.title));
    marker.append(hit);
    g.append(marker);
  }
  return g;
}

function renderTable(layout, uid, readonly) {
  const { table } = layout;
  const g = svgEl('g', { class: 'gantt-table' });
  g.append(svgEl('rect', { class: 'gantt-table-bg', x: 0, y: 0, width: table.width, height: layout.height }));
  for (const row of table.rows) {
    const rowGroup = svgEl('g', {
      class: cls('gantt-table-row', row.alt && 'gantt-table-row--alt', row.group && 'gantt-table-row--group',
        row.selected && 'is-selected'),
      'data-id': row.id,
      'data-selectable': true,
      id: `${uid}-row-${row.index}`,
      role: 'row',
      'aria-level': row.depth + 1,
      'aria-expanded': row.group ? String(!row.collapsed) : undefined,
      'aria-selected': String(row.selected),
      'aria-label': row.label,
    });
    rowGroup.append(svgEl('rect', { class: 'gantt-table-rowbg', x: 0, y: row.y, width: table.width, height: layout.rowHeight }));
    const cx = 8 + row.depth * table.indent;
    const cy = row.y + layout.rowHeight / 2;
    if (row.group) {
      const pts = row.collapsed
        ? `${cx},${cy - 4} ${cx + 6},${cy} ${cx},${cy + 4}`
        : `${cx - 1},${cy - 3} ${cx + 7},${cy - 3} ${cx + 3},${cy + 4}`;
      rowGroup.append(svgEl('polygon', { class: 'gantt-chevron', points: pts, 'pointer-events': 'none' }));
    }
    const texts = new Map([['name', row.name], ...row.cells.map((c) => [c.id, c.text])]);
    for (const col of table.columns) {
      const name = col.id === 'name';
      if (col.editable) {
        rowGroup.append(svgEl('rect', {
          class: 'gantt-cell', x: col.x, y: row.y, width: col.width, height: layout.rowHeight, 'data-role': `cell-${col.id}`,
          'data-id': row.id, 'data-export': 'skip',
        }));
      }
      rowGroup.append(svgEl('text', {
        class: cls('gantt-table-text', name ? 'gantt-table-text--name' : 'gantt-table-text--date', `gantt-table-text--${col.id}`),
        x: name ? cx + 16 : col.x + 8, y: cy, dy: '0.35em', role: 'gridcell',
        'clip-path': `url(#${uid}-clip-${name ? 'name' : col.id})`,
      }, texts.get(col.id)));
    }
    if (row.group) {
      rowGroup.append(svgEl('rect', {
        class: 'gantt-chevron-hit', x: cx - 6, y: row.y, width: 20, height: layout.rowHeight,
        'data-role': 'chevron', 'data-id': row.id, 'data-export': 'skip',
      }));
    }
    if (!readonly) rowGroup.append(renderRowActions(row, table, layout.rowHeight, uid, layout.labels));
    g.append(rowGroup);
  }
  if (layout.addRow && !readonly) {
    const add = svgEl('g', { class: 'gantt-add-row', 'data-export': 'skip' });
    add.append(svgEl('rect', {
      class: cls('gantt-add-bg', layout.addRow.alt && 'gantt-add-bg--alt'),
      x: 0, y: layout.addRow.y, width: table.width, height: layout.rowHeight,
    }));
    add.append(svgEl('text', {
      class: 'gantt-add-text', x: 8, y: layout.addRow.y + layout.rowHeight / 2, dy: '0.35em',
    }, `+ ${layout.labels.addTask}`));
    const hit = svgEl('rect', {
      class: 'gantt-add-hit', x: 0, y: layout.addRow.y, width: table.width, height: layout.rowHeight, 'data-role': 'add-task',
    });
    hit.append(svgEl('title', {}, layout.labels.addTask));
    add.append(hit);
    g.append(add);
  }
  g.append(svgEl('line', { class: 'gantt-table-edge', x1: table.width, x2: table.width, y1: 0, y2: layout.height }));
  g.append(resizeHandle(table.width, layout.height));
  return g;
}

function renderCorner(layout, uid, readonly) {
  const { table } = layout;
  const g = svgEl('g', { class: 'gantt-corner' });
  g.append(clipDefs(uid, layout, 'hclip'));
  g.append(svgEl('rect', { class: 'gantt-header-bg', x: 0, y: 0, width: table.width, height: layout.headerHeight }));
  const sortable = true;
  for (const col of table.columns) {
    const text = svgEl('text', {
      class: cls('gantt-header-text', 'gantt-header-text--table', col.sort && 'is-sorted'),
      x: col.x + 8, y: layout.headerHeight / 2, dy: '0.35em',
      'clip-path': `url(#${uid}-hclip-${col.id})`,
    }, col.label);
    g.append(text);
    if (col.sort) {
      // Flèche de tri : vers le haut en croissant, vers le bas en décroissant.
      const ax = col.x + col.width - 12;
      const ay = layout.headerHeight / 2;
      const pts = col.sort === 'asc' ? `${ax - 4},${ay + 2} ${ax + 4},${ay + 2} ${ax},${ay - 3}` : `${ax - 4},${ay - 2} ${ax + 4},${ay - 2} ${ax},${ay + 3}`;
      g.append(svgEl('polygon', { class: 'gantt-sort-arrow', points: pts }));
    }
    if (sortable) {
      const hit = svgEl('rect', {
        class: 'gantt-sort-hit', x: col.x, y: 0, width: col.width, height: layout.headerHeight,
        'data-role': 'sort', 'data-col': col.id, 'data-export': 'skip',
      });
      hit.append(svgEl('title', {}, col.sortTitle));
      g.append(hit);
    }
  }
  g.append(svgEl('line', { class: 'gantt-table-edge', x1: table.width, x2: table.width, y1: 0, y2: layout.headerHeight }));
  g.append(resizeHandle(table.width, layout.headerHeight));
  return g;
}

// Poignée du bord droit du tableau : glisser pour changer sa largeur.
function resizeHandle(x, height) {
  return svgEl('rect', {
    class: 'gantt-table-resize', x: x - 4, y: 0, width: 8, height, 'data-role': 'table-resize', 'data-export': 'skip',
  });
}

export function renderParts(layout, { uid = 'g0', readonly = false, dragId = null } = {}) {
  const hh = layout.headerHeight;
  const tw = layout.table.width;
  const mk = (name, w, h) => svgEl('svg', {
    class: `gantt-svg gantt-svg--${name}`,
    xmlns: NS,
    width: w,
    height: h,
    viewBox: `0 0 ${w} ${h}`,
    role: 'presentation',
  });
  // Les couches se superposent dans le même repère ; le CSS (position: sticky) fixe tableau, en-tête et coin.
  const main = mk('main', layout.width, layout.height);
  main.append(markerDefs(uid), renderGrid(layout), renderLinks(layout, uid), renderBars(layout, { readonly, dragId }), renderConstraints(layout, readonly));
  const header = mk('header', layout.width, hh);
  header.append(renderHeader(layout, uid));
  const table = mk('table', tw, layout.height);
  table.append(clipDefs(uid, layout), renderTable(layout, uid, readonly));
  const corner = mk('corner', tw, hh);
  corner.append(renderCorner(layout, uid, readonly));
  const overlay = mk('overlay', layout.width, layout.height);
  overlay.append(svgEl('g', { class: 'gantt-overlay' }));
  return { main, header, table, corner, overlay };
}
