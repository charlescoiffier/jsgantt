import { rowNav, treeKey, structureMove, cycleLinks, linkTypeForKey } from './keynav.js';

const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'];

export function attachKeyboard(g) {
  const root = g.scroller;
  let linkMode = null; // { fromId, targetId }

  const say = (m) => g.say?.(m);
  const nameOf = (id) => g.model.getTask(id)?.name || g.t('a11y.untitled');

  function selectRow(id) {
    g.select(id, null);
    g.reveal(id);
  }

  function markLinkMode() {
    for (const n of g.canvas.querySelectorAll('.is-link-source, .is-target, .is-invalid')) {
      n.classList.remove('is-link-source', 'is-target', 'is-invalid');
    }
    if (!linkMode) return;
    for (const n of g.canvas.querySelectorAll('g.gantt-task')) {
      if (n.dataset.id === linkMode.fromId) n.classList.add('is-link-source');
      if (n.dataset.id === linkMode.targetId) {
        const problem = g.model.linkProblem({ from: linkMode.fromId, to: linkMode.targetId, type: 'FS', lag: 0 });
        n.classList.add(problem ? 'is-invalid' : 'is-target');
      }
    }
  }

  function endLinkMode() {
    linkMode = null;
    markLinkMode();
  }

  function onLinkMode(e) {
    e.preventDefault();
    if (e.key === 'Escape') {
      endLinkMode();
      say(g.t('kb.linkModeCancelled'));
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const ids = g.model.visibleRows().map((r) => r.id).filter((x) => x !== linkMode.fromId);
      const next = rowNav(ids, linkMode.targetId, e.key);
      if (next === null) return;
      linkMode.targetId = next;
      g.reveal(next);
      markLinkMode();
      const problem = g.model.linkProblem({ from: linkMode.fromId, to: next, type: 'FS', lag: 0 });
      say(problem
        ? g.t('kb.targetRefused', { name: nameOf(next), reason: g.i18n.localize(problem) })
        : g.t('kb.target', { name: nameOf(next) }));
      return;
    }
    const type = linkTypeForKey(e.key);
    if (!type) return;
    if (!linkMode.targetId) {
      say(g.t('kb.pickTargetFirst'));
      return;
    }
    const { fromId, targetId } = linkMode;
    endLinkMode();
    g.commit('link', { from: fromId, to: targetId, linkType: type }, (m) =>
      m.addLink({ from: fromId, to: targetId, type, lag: 0 }));
  }

  function shiftDates(id, kind, delta) {
    const t = g.model.getTask(id);
    if (g.model.isGroup(id) && kind !== 'move') {
      g.refuse('dates.group');
      return;
    }
    if (kind === 'move') g.commit('move', { id }, (m) => m.moveTask(id, delta));
    else if (kind === 'end') g.commit('resize', { id }, (m) => m.resizeTask(id, 'end', t.end + delta));
    else g.commit('resize', { id }, (m) => m.resizeTask(id, 'start', t.start + delta));
    g.reveal(id);
  }

  function restructure(id, kind) {
    const to = structureMove(g.model, id, kind);
    if (!to) {
      g.refuse('move.impossible');
      return;
    }
    g.moveTaskTo(id, to);
    g.reveal(id);
  }

  function onKeyDown(e) {
    if (g.isDragging?.()) return;
    if (linkMode) {
      onLinkMode(e);
      return;
    }
    if (e.ctrlKey || e.metaKey) return; // Ctrl/Cmd + Z, Y : géré par interactions
    if (g.readonly && (!NAV_KEYS.includes(e.key) || e.altKey || e.shiftKey)) return;
    const id = g.state.selectedId;
    const key = e.key;
    const handled = () => e.preventDefault();

    // Navigation
    if (!e.altKey && !e.shiftKey) {
      if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
        handled();
        const next = rowNav(g.model.visibleRows().map((r) => r.id), id, key);
        if (next) selectRow(next);
        return;
      }
      if ((key === 'ArrowLeft' || key === 'ArrowRight') && id) {
        const act = treeKey(g.model, id, key);
        if (act) {
          handled();
          if (act.action === 'select') selectRow(act.id);
          else g.commit('collapse', { id }, (m) => m.toggleCollapsed(id));
        }
        return;
      }
      if (key === 'Escape') {
        if (g.state.selectedLinkId) g.select(id, null);
        else if (id) g.select(null, null);
        return;
      }
    }
    if (!id && !['Enter', 'F2'].includes(key)) return;

    // Dates (Alt : déplacer, Maj : fin, Alt+Maj : début)
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const d = key === 'ArrowLeft' ? -1 : 1;
      if (e.altKey && !e.shiftKey) { handled(); shiftDates(id, 'move', d); return; }
      if (e.shiftKey && !e.altKey) { handled(); shiftDates(id, 'end', d); return; }
      if (e.shiftKey && e.altKey) { handled(); shiftDates(id, 'start', d); return; }
    }
    if (e.altKey && !e.shiftKey && (key === 'PageUp' || key === 'PageDown')) {
      handled();
      shiftDates(id, 'move', key === 'PageUp' ? -7 : 7);
      return;
    }
    // Structure (Alt : monter/descendre, Alt+Maj : niveau)
    if (e.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
      handled();
      if (e.shiftKey) restructure(id, key === 'ArrowUp' ? 'outdent' : 'indent');
      else restructure(id, key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
    if (e.altKey) return;

    if (key === '+' || key === '-') {
      handled();
      const cur = g.model.getTask(id).progress;
      g.commit('progress', { id }, (m) => m.setProgress(id, cur + (key === '+' ? 0.1 : -0.1)));
      return;
    }
    if (key === 'Enter') {
      handled();
      if (g.readonly) return;
      if (e.shiftKey && id) g.addTask({ parentId: id });
      else g.addTask(id ? { afterId: id } : {});
      return;
    }
    if (key === 'F2') {
      handled();
      if (id) g.editCell(id, 'name');
      return;
    }
    const isL = key === 'l' || key === 'L';
    if (isL && !e.shiftKey) {
      handled();
      linkMode = { fromId: id, targetId: null };
      markLinkMode();
      say(g.t('kb.linkModeStart', { name: nameOf(id) }));
      return;
    }
    if (isL && e.shiftKey) {
      handled();
      const next = cycleLinks(g.model, id, g.state.selectedLinkId);
      if (next) {
        g.select(id, next);
        const l = g.model.links.find((x) => x.id === next);
        say(g.t('kb.linkSelected', { from: nameOf(l.from), to: nameOf(l.to), type: l.type }));
      } else {
        say(g.t('kb.noLinks'));
      }
    }
  }

  root.addEventListener('keydown', onKeyDown);
  return () => {
    root.removeEventListener('keydown', onKeyDown);
  };
}
