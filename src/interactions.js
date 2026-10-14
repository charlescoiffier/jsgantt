import { SCALES } from './timescale.js';
import { svgEl } from './renderer.js';
import { fromDay } from './dates.js';
import { removeAndSelectNeighbor } from './confirm.js';

const DRAG_THRESHOLD = 3;

export function attachInteractions(g) {
  const root = g.scroller;
  let drag = null;
  let lastWheel = 0;
  let suppressClick = false; // un repère vient d'être glissé : pas d'édition au clic qui suit

  const local = (e) => {
    const r = g.svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function showTip(text, p) {
    const overlay = g.canvas.querySelector('.gantt-overlay');
    const w = text.length * 6.2 + 12;
    overlay.replaceChildren(
      svgEl('rect', { class: 'gantt-tip-bg', x: p.x + 12, y: p.y - 30, width: w, height: 20 }),
      svgEl('text', { class: 'gantt-tip-text', x: p.x + 18, y: p.y - 20, dy: '0.35em' }, text),
    );
  }

  function startDrag(kind, id, e) {
    const base = g.model.clone();
    drag = {
      kind,
      id,
      base,
      bar: g.layout.bars.find((b) => b.id === id),
      startX: e.clientX,
      moved: false,
      mutate: null,
      pointerId: e.pointerId,
    };
    root.setPointerCapture(e.pointerId);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const hit = e.target.closest?.('[data-role]');
    if (!hit) {
      if (g.state.selectedId || g.state.selectedLinkId) g.select(null, null);
      return;
    }
    const role = hit.dataset.role;
    const id = hit.dataset.id;
    g.root.querySelector('.gantt-input')?.blur(); // valide l'édition en cours avant de copier le modèle
    switch (role) {
      case 'marker': {
        if (g.readonly) break;
        // La capture du pointeur n'est prise qu'au premier déplacement : un simple clic reste un clic (édition).
        const markerId = hit.dataset.markerId;
        const m = g.model.markers.find((x) => x.id === markerId);
        drag = { kind: 'marker', id: markerId, date0: m.date, base: g.model.clone(), startX: e.clientX, moved: false, pointerId: e.pointerId };
        break;
      }
      case 'table-resize':
        // Largeur du tableau : réglage d'affichage, permis aussi en lecture seule.
        drag = { kind: 'table', startX: e.clientX, width0: g.layout.table.width, prev: g.view.tableWidth, pointerId: e.pointerId };
        root.setPointerCapture(e.pointerId);
        e.preventDefault();
        break;
      case 'chevron':
        g.commit('collapse', { id }, (m) => m.toggleCollapsed(id));
        break;
      case 'link':
        g.select(null, hit.dataset.linkId);
        break;
      case 'bar':
        g.select(id, null);
        if (!g.readonly) startDrag('move', id, e);
        break;
      case 'handle-start':
      case 'handle-end':
      case 'handle-progress':
        g.select(id, null);
        if (!g.readonly) startDrag(role, id, e);
        break;
      case 'anchor-start':
      case 'anchor-end':
        if (g.readonly) break;
        g.select(id, null);
        drag = {
          kind: 'link',
          fromId: id,
          fromEdge: role === 'anchor-start' ? 'start' : 'end',
          target: null,
          pointerId: e.pointerId,
        };
        root.setPointerCapture(e.pointerId);
        break;
      case 'row-grip':
        if (g.readonly) break;
        g.select(id, null);
        if (g.view.sort) g.refuse('reorder.sorted');
        else startReorder(id, e);
        break;
      case 'cell-name':
      case 'cell-start':
      case 'cell-end':
        g.select(id, null);
        break;
      default:
        break;
    }
  }

  function previewMutation(e) {
    const ppd = g.timescale.pixelsPerDay;
    const dx = e.clientX - drag.startX;
    const t0 = drag.base.getTask(drag.id);
    const id = drag.id;
    if (drag.kind === 'move') {
      const delta = Math.round(dx / ppd);
      drag.mutate = (m) => m.moveTask(id, delta);
    } else if (drag.kind === 'handle-start') {
      const day = t0.start + Math.round(dx / ppd);
      drag.mutate = (m) => m.resizeTask(id, 'start', day);
    } else if (drag.kind === 'handle-end') {
      const day = t0.end + Math.round(dx / ppd);
      drag.mutate = (m) => m.resizeTask(id, 'end', day);
    } else {
      const p = (local(e).x - drag.bar.x) / drag.bar.width;
      drag.mutate = (m) => m.setProgress(id, p);
    }
  }

  // Ces actions s'exécutent au clic : à l'appui, le navigateur déplace ensuite le focus et refermerait aussitôt
  // le champ ou la fenêtre qu'elles ouvrent.
  function onClick(e) {
    const hit = e.target.closest?.('[data-role]');
    if (!hit) return;
    if (hit.dataset.role === 'sort') {
      g.cycleSort(hit.dataset.col);
      return;
    }
    if (hit.dataset.role === 'col-filter') {
      g.editColumnFilter(hit.dataset.col);
      return;
    }
    if (g.readonly) return;
    const id = hit.dataset.id;
    switch (hit.dataset.role) {
      case 'marker':
        if (!suppressClick) g.editMarker(hit.dataset.markerId);
        break;
      case 'zone':
        g.editZone(hit.dataset.zoneId);
        break;
      case 'add-task':
        g.addTask();
        break;
      case 'row-add':
        g.addTask({ afterId: id });
        break;
      case 'row-props':
        g.editTask(id);
        break;
      case 'constraint':
        g.editConstraint(id);
        break;
      default:
        break;
    }
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (drag.kind === 'link') {
      moveLink(e);
      return;
    }
    if (drag.kind === 'reorder') {
      moveReorder(e);
      return;
    }
    if (drag.kind === 'marker') {
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) return;
      if (!drag.moved) root.setPointerCapture(drag.pointerId);
      drag.moved = true;
      drag.date = fromDay(drag.date0 + Math.round((e.clientX - drag.startX) / g.timescale.pixelsPerDay));
      const work = drag.base.clone();
      work.updateMarker(drag.id, { date: drag.date });
      g.render({ model: work });
      showTip(drag.date, local(e));
      return;
    }
    if (drag.kind === 'table') {
      // Aperçu sans émettre d'événement ; la vue n'est fixée qu'au relâchement.
      drag.width = Math.max(0, drag.width0 + e.clientX - drag.startX);
      g.view.tableWidth = drag.width;
      g.render();
      return;
    }
    if (!drag.moved && Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) return;
    drag.moved = true;
    previewMutation(e);
    const work = drag.base.clone();
    drag.mutate(work);
    g.render({ model: work, dragId: drag.id });
    const t = work.getTask(drag.id);
    const text = drag.kind === 'handle-progress'
      ? `${Math.round(t.progress * 100)} %`
      : `${fromDay(t.start)} → ${fromDay(t.end)}`;
    showTip(text, local(e));
  }

  function onPointerUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    try {
      root.releasePointerCapture(e.pointerId);
    } catch {
      /* capture déjà relâchée */
    }
    if (d.kind === 'link') {
      finishLink(d);
      return;
    }
    if (d.kind === 'reorder') {
      finishReorder(d);
      return;
    }
    if (d.kind === 'table') {
      if (d.width !== undefined) g.setTableWidth(g.layout.table.width);
      return;
    }
    if (d.kind === 'marker') {
      if (d.moved) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        g.updateMarker(d.id, { date: d.date });
      }
      return;
    }
    if (!d.moved) return;
    const type = d.kind === 'move' ? 'move' : d.kind === 'handle-progress' ? 'progress' : 'resize';
    g.commit(type, { id: d.id }, d.mutate);
  }

  function onPointerCancel(e) {
    if (!drag) return;
    if (drag.kind === 'table') g.view.tableWidth = drag.prev;
    drag = null;
    try {
      root.releasePointerCapture(e.pointerId);
    } catch {
      /* capture déjà relâchée */
    }
    g.render();
  }

  function onKeyDown(e) {
    // Entonnoir d'une colonne qui a le focus : Entrée ou Espace ouvre son filtre.
    const filterBtn = e.target.closest?.('[data-role="col-filter"]');
    if (filterBtn) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        g.editColumnFilter(filterBtn.dataset.col);
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !drag) {
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) g.redo();
        else g.undo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        g.redo();
        return;
      }
    }
    if (e.key === 'Escape' && drag) {
      if (drag.kind === 'table') g.view.tableWidth = drag.prev;
      drag = null;
      g.render();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !g.readonly) {
      if (g.state.selectedLinkId) {
        e.preventDefault();
        const id = g.state.selectedLinkId;
        g.state.selectedLinkId = null;
        g.commit('unlink', { linkId: id }, (m) => ({ ok: m.removeLink(id) }));
      } else if (g.state.selectedId) {
        e.preventDefault();
        // Confirmation (option confirmDelete), puis la ligne voisine est sélectionnée.
        if (g.confirmDelete) g.confirmRemoveTask(g.state.selectedId);
        else removeAndSelectNeighbor(g, g.state.selectedId);
      }
    }
  }

  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheel < 250) return;
    lastWheel = now;
    const i = SCALES.indexOf(g.scale);
    const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, i + (e.deltaY < 0 ? -1 : 1)))];
    if (next !== g.scale) g.setScale(next);
  }

  function startReorder(id, e) {
    drag = { kind: 'reorder', id, base: g.model.clone(), drop: null, pointerId: e.pointerId };
    root.setPointerCapture(e.pointerId);
    for (const n of g.canvas.querySelectorAll('.gantt-table-row')) {
      if (n.dataset.id === id) n.classList.add('is-reordering');
    }
  }

  function moveReorder(e) {
    const p = local(e);
    const { headerHeight, rowHeight } = g.layout;
    const rows = g.layout.table.rows;
    const model = drag.base;
    const left = root.scrollLeft;
    const width = g.layout.table.width;
    let drop;
    let line = null;
    let box = null;
    if (rows.length === 0 || p.y - headerHeight >= rows.length * rowHeight) {
      drop = { parentId: null, beforeId: null };
      line = headerHeight + rows.length * rowHeight;
    } else {
      const idx = Math.max(0, Math.floor((p.y - headerHeight) / rowHeight));
      const row = rows[idx];
      const frac = (p.y - headerHeight - idx * rowHeight) / rowHeight;
      const task = model.getTask(row.id);
      if (frac < 0.3) {
        drop = { parentId: task.parentId, beforeId: row.id };
        line = row.y;
      } else if (frac > 0.7) {
        const sibs = model.childrenOf(task.parentId);
        const next = sibs[sibs.findIndex((x) => x.id === row.id) + 1];
        drop = { parentId: task.parentId, beforeId: next ? next.id : null };
        const family = new Set([row.id, ...model.descendantsOf(row.id)]);
        const last = rows.filter((r) => family.has(r.id)).pop();
        line = last.y + rowHeight;
      } else {
        drop = { parentId: row.id, beforeId: null };
        box = row.y;
      }
    }
    const probe = model.clone().moveTaskTo(drag.id, drop);
    drop.valid = probe.ok;
    drop.problem = probe.ok ? null : probe;
    drag.drop = drop;
    const cls = probe.ok ? '' : ' is-invalid';
    g.canvas.querySelector('.gantt-overlay').replaceChildren(
      line !== null
        ? svgEl('line', { class: `gantt-drop-line${cls}`, x1: left + 4, x2: left + width - 4, y1: line, y2: line })
        : svgEl('rect', { class: `gantt-drop-box${cls}`, x: left + 2, y: box + 1, width: width - 4, height: rowHeight - 2 }),
    );
  }

  function finishReorder(d) {
    const drop = d.drop;
    if (!drop) {
      g.render();
      return;
    }
    if (!drop.valid) {
      g.emit('invalid', { reason: g.i18n.localize(drop.problem), code: drop.problem.code });
      g.render();
      return;
    }
    const result = g.moveTaskTo(d.id, { parentId: drop.parentId, beforeId: drop.beforeId });
    if (result.unchanged) g.render();
  }

  const LINK_TYPE = { 'end>start': 'FS', 'start>start': 'SS', 'end>end': 'FF', 'start>end': 'SF' };

  function moveLink(e) {
    const p = local(e);
    const from = g.layout.bars.find((b) => b.id === drag.fromId);
    const x1 = drag.fromEdge === 'start' ? from.x : from.x + from.width;
    const y1 = from.y + from.height / 2;
    g.canvas.querySelector('.gantt-overlay').replaceChildren(
      svgEl('line', { class: 'gantt-link-draft', x1, y1, x2: p.x, y2: p.y }),
    );
    for (const n of g.canvas.querySelectorAll('.is-invalid, .is-target')) n.classList.remove('is-invalid', 'is-target');
    const hovered = document.elementFromPoint(e.clientX, e.clientY);
    const under = hovered?.closest('g.gantt-task[data-id]');
    drag.target = null;
    if (!under || under.dataset.id === drag.fromId) return;
    const bar = g.layout.bars.find((b) => b.id === under.dataset.id);
    const overAnchor = hovered.closest('[data-role^="anchor-"]');
    const toEdge = overAnchor
      ? overAnchor.dataset.role.slice('anchor-'.length)
      : p.x < bar.x + bar.width / 2 ? 'start' : 'end';
    const type = LINK_TYPE[`${drag.fromEdge}>${toEdge}`];
    const problem = g.model.linkProblem({ from: drag.fromId, to: bar.id, type, lag: 0 });
    under.classList.add(problem ? 'is-invalid' : 'is-target');
    drag.target = { id: bar.id, type, problem };
  }

  function finishLink(d) {
    const target = d.target;
    if (!target) {
      g.render();
      return;
    }
    if (target.problem) {
      g.emit('invalid', { reason: g.i18n.localize(target.problem), code: target.problem.code });
      g.render();
      return;
    }
    g.commit('link', { from: d.fromId, to: target.id, linkType: target.type }, (m) =>
      m.addLink({ from: d.fromId, to: target.id, type: target.type, lag: 0 }));
  }

  function onDblClick(e) {
    const hit = e.target.closest?.('[data-role^="cell-"]');
    if (hit) openEditor(hit.dataset.id, hit.dataset.role.slice('cell-'.length));
  }

  function openEditor(id, field) {
    if (g.readonly || !['name', 'start', 'end'].includes(field)) return;
    let hit = null;
    for (const n of g.canvas.querySelectorAll(`[data-role="cell-${field}"]`)) {
      if (n.dataset.id === id) hit = n;
    }
    if (!hit) return;
    if (field !== 'name' && g.model.isGroup(id)) {
      g.refuse('dates.group');
      return;
    }
    const task = g.model.getTask(id);
    const rect = hit.getBoundingClientRect();
    const host = g.root.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'gantt-input';
    input.value = field === 'name' ? task.name : fromDay(task[field]);
    Object.assign(input.style, {
      position: 'absolute',
      left: `${rect.left - host.left}px`,
      top: `${rect.top - host.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    g.root.append(input);
    input.focus();
    input.select();
    const top0 = rect.top - host.top;
    const scroll0 = root.scrollTop;
    const follow = () => {
      input.style.top = `${top0 - (root.scrollTop - scroll0)}px`;
    };
    root.addEventListener('scroll', follow, { passive: true });
    let done = false;
    const finish = (commit, { refocus = false, next = null } = {}) => {
      if (done) return;
      done = true;
      root.removeEventListener('scroll', follow);
      const value = input.value.trim();
      input.remove();
      if (commit) {
        if (field === 'name') g.commit('rename', { id }, (m) => m.updateTask(id, { name: value }));
        else g.commit('dates', { id }, (m) => m.updateTask(id, { [field]: value }));
      }
      if (next) openEditor(id, next);
      else if (refocus) root.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') finish(true, { refocus: true });
      else if (ev.key === 'Escape') finish(false, { refocus: true });
      else if (ev.key === 'Tab') {
        ev.preventDefault();
        const order = g.layout.table.columns.filter((c) => c.editable).map((c) => c.id);
        const next = order[order.indexOf(field) + (ev.shiftKey ? -1 : 1)] ?? null;
        finish(true, { refocus: !next, next });
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  g.openEditor = openEditor;
  g.isDragging = () => drag !== null;
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('click', onClick);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerCancel);
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('dblclick', onDblClick);

  return () => {
    delete g.openEditor;
    delete g.isDragging;
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('click', onClick);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerCancel);
    root.removeEventListener('keydown', onKeyDown);
    root.removeEventListener('wheel', onWheel);
    root.removeEventListener('dblclick', onDblClick);
  };
}
