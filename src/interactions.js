import { SCALES } from './timescale.js';
import { svgEl } from './renderer.js';
import { fromDay } from './dates.js';

const DRAG_THRESHOLD = 3;

export function attachInteractions(g) {
  const root = g.scroller;
  let drag = null;
  let lastWheel = 0;

  const local = (e) => {
    const r = g.svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function showTip(text, p) {
    const overlay = g.svg.querySelector('.gantt-overlay');
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

  function onPointerMove(e) {
    if (!drag) return;
    if (drag.kind === 'link') {
      moveLink(e);
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
    if (!d.moved) return;
    const type = d.kind === 'move' ? 'move' : d.kind === 'handle-progress' ? 'progress' : 'resize';
    g.commit(type, { id: d.id }, d.mutate);
  }

  function onPointerCancel(e) {
    if (!drag) return;
    drag = null;
    try {
      root.releasePointerCapture(e.pointerId);
    } catch {
      /* capture déjà relâchée */
    }
    g.render();
  }

  function onKeyDown(e) {
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
      drag = null;
      g.render();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && g.state.selectedLinkId && !g.readonly) {
      e.preventDefault();
      const id = g.state.selectedLinkId;
      g.state.selectedLinkId = null;
      g.commit('unlink', { linkId: id }, (m) => ({ ok: m.removeLink(id) }));
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

  const LINK_TYPE = { 'end>start': 'FS', 'start>start': 'SS', 'end>end': 'FF', 'start>end': 'SF' };

  function moveLink(e) {
    const p = local(e);
    const from = g.layout.bars.find((b) => b.id === drag.fromId);
    const x1 = drag.fromEdge === 'start' ? from.x : from.x + from.width;
    const y1 = from.y + from.height / 2;
    g.svg.querySelector('.gantt-overlay').replaceChildren(
      svgEl('line', { class: 'gantt-link-draft', x1, y1, x2: p.x, y2: p.y }),
    );
    for (const n of g.svg.querySelectorAll('.is-invalid, .is-target')) n.classList.remove('is-invalid', 'is-target');
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
    const reason = g.model.checkLink({ from: drag.fromId, to: bar.id, type, lag: 0 });
    under.classList.add(reason ? 'is-invalid' : 'is-target');
    drag.target = { id: bar.id, type, reason };
  }

  function finishLink(d) {
    const target = d.target;
    if (!target) {
      g.render();
      return;
    }
    if (target.reason) {
      g.emit('invalid', { reason: target.reason });
      g.render();
      return;
    }
    g.commit('link', { from: d.fromId, to: target.id, linkType: target.type }, (m) =>
      m.addLink({ from: d.fromId, to: target.id, type: target.type, lag: 0 }));
  }

  function onDblClick(e) {
    if (g.readonly) return;
    const hit = e.target.closest?.('[data-role^="cell-"]');
    if (!hit) return;
    const id = hit.dataset.id;
    const field = hit.dataset.role.slice('cell-'.length);
    if (field !== 'name' && g.model.isGroup(id)) {
      g.emit('invalid', { reason: 'les dates d\'un groupe sont calculées' });
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
    const finish = (commit) => {
      if (done) return;
      done = true;
      root.removeEventListener('scroll', follow);
      const value = input.value.trim();
      input.remove();
      if (!commit) return;
      if (field === 'name') g.commit('rename', { id }, (m) => m.updateTask(id, { name: value }));
      else g.commit('dates', { id }, (m) => m.updateTask(id, { [field]: value }));
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') finish(true);
      else if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerCancel);
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('dblclick', onDblClick);

  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerCancel);
    root.removeEventListener('keydown', onKeyDown);
    root.removeEventListener('wheel', onWheel);
    root.removeEventListener('dblclick', onDblClick);
  };
}
