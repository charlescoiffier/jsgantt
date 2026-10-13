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

  function onKeyDown(e) {
    if (e.key === 'Escape' && drag) {
      drag = null;
      g.render();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && g.state.selectedLinkId && !g.readonly) {
      e.preventDefault();
      const id = g.state.selectedLinkId;
      g.state.selectedLinkId = null;
      g.commit('unlink', { id }, (m) => ({ ok: m.removeLink(id) }));
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

  // Remplacés à la Task 9 (création de liens et édition en ligne).
  function moveLink() {}
  function finishLink() {}

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
    root.removeEventListener('keydown', onKeyDown);
    root.removeEventListener('wheel', onWheel);
  };
}
