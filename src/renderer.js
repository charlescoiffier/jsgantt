import { fromDay } from './dates.js';
import { describeTask } from './a11y.js';

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
    });
    tableRows.push({
      id,
      index: i,
      label: describeTask(model, id, depth),
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
    addRow,
    today,
    bars,
    links,
    table: { width: tableWidth, nameW: tableWidth - 2 * dateColWidth, dateColWidth, indent, rows: tableRows },
  };
}

const NS = 'http://www.w3.org/2000/svg';

const LABELS = {
  addTask: 'Ajouter une tâche',
  addBelow: 'Ajouter une tâche en dessous',
  remove: 'Supprimer la tâche',
  move: 'Déplacer la ligne',
};

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
    tableWidth: num('--gantt-table-width', 360),
    dateColWidth: num('--gantt-date-col-width', 84),
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

function renderDefs(uid, layout) {
  const defs = svgEl('defs');
  const marker = svgEl('marker', {
    id: `${uid}-arrow`,
    markerWidth: 8,
    markerHeight: 8,
    refX: 7,
    refY: 4,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
  });
  marker.append(svgEl('path', { class: 'gantt-arrow', d: 'M0,0 L8,4 L0,8 z' }));
  const clip = svgEl('clipPath', { id: `${uid}-clip-name` });
  clip.append(svgEl('rect', { x: 0, y: 0, width: Math.max(layout.table.nameW - 4, 0), height: layout.height }));
  defs.append(marker, clip);
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
      x: 0, y: layout.addRow.y, width: layout.width, height: layout.rowHeight,
    }));
  }
  for (const w of layout.weekends) {
    g.append(svgEl('rect', {
      class: 'gantt-weekend', x: w.x, y: layout.headerHeight, width: w.width, height: layout.height - layout.headerHeight,
    }));
  }
  for (const x of layout.gridLines) {
    g.append(svgEl('line', { class: 'gantt-gridline', x1: x, x2: x, y1: layout.headerHeight, y2: layout.height }));
  }
  if (layout.today) {
    g.append(svgEl('line', {
      class: 'gantt-today', x1: layout.today.x, x2: layout.today.x, y1: layout.headerHeight, y2: layout.height,
    }));
  }
  g.append(svgEl('line', { class: 'gantt-gridline', x1: tableWidth, x2: tableWidth, y1: 0, y2: layout.height }));
  return g;
}

function renderHeader(layout) {
  const g = svgEl('g', { class: 'gantt-header', 'data-sticky': 'y', 'aria-hidden': 'true' });
  const { tableWidth } = layout.metrics;
  const half = layout.headerHeight / 2;
  g.append(svgEl('rect', {
    class: 'gantt-header-bg', x: tableWidth, y: 0, width: layout.width - tableWidth, height: layout.headerHeight,
  }));
  const addCells = (cells, y) => {
    for (const c of cells) {
      g.append(svgEl('rect', {
        class: cls('gantt-header-cell', c.weekend && 'gantt-header-cell--weekend'),
        x: c.x, y, width: c.width, height: half,
      }));
      g.append(svgEl('text', {
        class: 'gantt-header-text', x: c.x + c.width / 2, y: y + half / 2, dy: '0.35em', 'text-anchor': 'middle',
      }, c.label));
    }
  };
  addCells(layout.header.top, 0);
  addCells(layout.header.bottom, half);
  return g;
}

function renderLinks(layout, uid) {
  const g = svgEl('g', { class: 'gantt-links', 'aria-hidden': 'true' });
  for (const link of layout.links) {
    const group = svgEl('g', {
      class: cls('gantt-link', `gantt-link--${link.type.toLowerCase()}`, link.selected && 'is-selected'),
      'data-link-id': link.id,
    });
    group.append(svgEl('path', {
      class: 'gantt-link-hit', d: link.d, 'data-role': 'link', 'data-link-id': link.id, 'data-export': 'skip',
    }));
    group.append(svgEl('path', {
      class: 'gantt-link-path', d: link.d, 'marker-end': `url(#${uid}-arrow)`,
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
        bar.collapsed && 'is-collapsed', dragId === bar.id && 'is-dragging'),
      'data-id': bar.id,
      'data-selectable': true,
      role: 'img',
      'aria-label': bar.label,
    });
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
  delete: 'M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8M7 7v3.5M9 7v3.5',
};

function renderRowActions(row, table, rowHeight, uid) {
  const g = svgEl('g', { class: 'gantt-actions', 'data-export': 'skip', 'aria-hidden': 'true' });
  const w = 22;
  const x0 = table.nameW - 3 * w - 4;
  // Fond de la grappe : dégradé qui reprend la couleur réelle de la ligne (--row-bg) et estompe le nom trop long.
  const fade = 28;
  const total = 3 * w + 8 + fade;
  const gradId = `${uid}-fade-${row.index}`;
  const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 1, y2: 0 });
  const stop = (offset, opacity) => svgEl('stop', { class: 'gantt-fade-stop', offset, 'stop-opacity': opacity });
  grad.append(stop(0, 0), stop((fade / total) * 0.5, 0.6), stop(fade / total, 1), stop(1, 1));
  g.append(grad);
  g.append(svgEl('rect', {
    class: 'gantt-action-bg', x: x0 - 4 - fade, y: row.y + 1, width: total, height: rowHeight - 2, fill: `url(#${gradId})`,
  }));
  const defs = [
    ['grip', LABELS.move, 'row-grip'],
    ['add', LABELS.addBelow, 'row-add'],
    ['delete', LABELS.remove, 'row-delete'],
  ];
  defs.forEach(([icon, label, role], i) => {
    const x = x0 + i * w;
    const a = svgEl('g', { class: `gantt-action gantt-action--${icon}` });
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

function renderTable(layout, uid, readonly) {
  const { table } = layout;
  const g = svgEl('g', { class: 'gantt-table', 'data-sticky': 'x' });
  g.append(svgEl('rect', { class: 'gantt-table-bg', x: 0, y: 0, width: table.width, height: layout.height }));
  const colX = [0, table.nameW, table.nameW + table.dateColWidth];
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
    const cells = [
      ['cell-name', colX[0], table.nameW, row.name, cx + 16],
      ['cell-start', colX[1], table.dateColWidth, row.startLabel, colX[1] + 8],
      ['cell-end', colX[2], table.dateColWidth, row.endLabel, colX[2] + 8],
    ];
    for (const [role, x, w, text, tx] of cells) {
      rowGroup.append(svgEl('rect', {
        class: 'gantt-cell', x, y: row.y, width: w, height: layout.rowHeight, 'data-role': role, 'data-id': row.id,
        'data-export': 'skip',
      }));
      rowGroup.append(svgEl('text', {
        class: cls('gantt-table-text', role === 'cell-name' ? 'gantt-table-text--name' : 'gantt-table-text--date'),
        x: tx, y: cy, dy: '0.35em', role: 'gridcell',
        'clip-path': role === 'cell-name' ? `url(#${uid}-clip-name)` : undefined,
      }, text));
    }
    if (row.group) {
      rowGroup.append(svgEl('rect', {
        class: 'gantt-chevron-hit', x: cx - 6, y: row.y, width: 20, height: layout.rowHeight,
        'data-role': 'chevron', 'data-id': row.id, 'data-export': 'skip',
      }));
    }
    if (!readonly) rowGroup.append(renderRowActions(row, table, layout.rowHeight, uid));
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
    }, `+ ${LABELS.addTask}`));
    const hit = svgEl('rect', {
      class: 'gantt-add-hit', x: 0, y: layout.addRow.y, width: table.width, height: layout.rowHeight, 'data-role': 'add-task',
    });
    hit.append(svgEl('title', {}, LABELS.addTask));
    add.append(hit);
    g.append(add);
  }
  g.append(svgEl('line', { class: 'gantt-table-edge', x1: table.width, x2: table.width, y1: 0, y2: layout.height }));
  return g;
}

function renderCorner(layout) {
  const { table } = layout;
  const g = svgEl('g', { class: 'gantt-corner', 'data-sticky': 'xy' });
  g.append(svgEl('rect', { class: 'gantt-header-bg', x: 0, y: 0, width: table.width, height: layout.headerHeight }));
  const titles = [['Nom', 8], ['Début', table.nameW + 8], ['Fin', table.nameW + table.dateColWidth + 8]];
  for (const [label, x] of titles) {
    g.append(svgEl('text', { class: 'gantt-header-text gantt-header-text--table', x, y: layout.headerHeight / 2, dy: '0.35em' }, label));
  }
  g.append(svgEl('line', { class: 'gantt-table-edge', x1: table.width, x2: table.width, y1: 0, y2: layout.headerHeight }));
  return g;
}

export function renderSVG(layout, { uid = 'g0', readonly = false, dragId = null } = {}) {
  const svg = svgEl('svg', {
    class: 'gantt-svg',
    xmlns: NS,
    width: layout.width,
    height: layout.height,
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    role: 'presentation',
  });
  svg.append(
    renderDefs(uid, layout),
    renderGrid(layout),
    renderLinks(layout, uid),
    renderBars(layout, { readonly, dragId }),
    renderHeader(layout),
    renderTable(layout, uid, readonly),
    renderCorner(layout),
    svgEl('g', { class: 'gantt-overlay' }),
  );
  return svg;
}
