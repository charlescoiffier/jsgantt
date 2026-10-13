import { fromDay } from './dates.js';

export const MIN_BAR_WIDTH = 4;

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
  const { rowHeight, barHeight, headerHeight, tableWidth, dateColWidth, indent, linkGap, linkRadius } = metrics;
  const rowsInfo = model.visibleRows();
  const width = tableWidth + ts.totalWidth;
  const height = headerHeight + rowsInfo.length * rowHeight;

  const shift = (cell) => ({ ...cell, x: cell.x + tableWidth });
  const cells = ts.headerCells();
  const header = { top: cells.top.map(shift), bottom: cells.bottom.map(shift) };
  const weekends = ts.weekendRects().map(shift);
  const gridLines = header.bottom.map((c) => c.x);
  const today =
    state.today !== undefined && state.today >= ts.originDay && state.today <= ts.endDay
      ? { x: tableWidth + ts.dayToX(state.today) + ts.pixelsPerDay / 2 }
      : null;

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
    const startLabel = fromDay(t.start);
    const endLabel = fromDay(t.end);
    rows.push({ id, y: rowTop, alt });
    bars.push({
      id,
      kind,
      x,
      y,
      width: w,
      height: barHeight,
      progress,
      progressWidth: kind === 'milestone' ? 0 : w * progress,
      name: t.name,
      label: `${t.name} (${startLabel} → ${endLabel})`,
      className: t.className,
      collapsed: group && t.collapsed,
      selected,
    });
    tableRows.push({
      id,
      y: rowTop,
      depth,
      name: t.name,
      startLabel,
      endLabel,
      group,
      collapsed: group && t.collapsed,
      alt,
      selected,
    });
  });

  const barById = new Map(bars.map((b) => [b.id, b]));
  const visibleBar = (id) => {
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
    });
  }

  return {
    width,
    height,
    metrics,
    rowHeight,
    headerHeight,
    header,
    rows,
    weekends,
    gridLines,
    today,
    bars,
    links,
    table: { width: tableWidth, nameW: tableWidth - 2 * dateColWidth, dateColWidth, indent, rows: tableRows },
  };
}
