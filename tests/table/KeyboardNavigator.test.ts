/**
 * @vitest-environment jsdom
 *
 * Unit tests for the extracted KeyboardNavigator. Uses a stub TableBody
 * that satisfies the getTableBody() contract so we can exercise
 * PageUp/PageDown without mounting the full TableContainer DOM tree.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeyboardNavigator } from '@/table/KeyboardNavigator';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { ColumnSchema } from '@/core/types';
import type { TableBody } from '@/table/TableBody';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { __resetModalHostForTests, ModalHost } from '@/core/ModalHost';

const schema: ColumnSchema[] = [
  { name: 'a', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'b', type: 'text', nullable: true, originalType: 'VARCHAR' },
  { name: 'c', type: 'float', nullable: false, originalType: 'DOUBLE' },
];

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

function makeStubBody(pageRows = 10): TableBody {
  const vs = {
    getViewportHeight: () => pageRows * 32,
    getRowHeight: () => 32,
    getScrollTop: () => 0,
    scrollToRow: vi.fn(),
  };
  return {
    getVirtualScroller: () => vs,
  } as unknown as TableBody;
}

function setup(rows = 100) {
  const state = createTableState();
  state.schema.set(schema);
  initializeColumnsFromSchema(state, schema);
  state.totalRows.set(rows);
  const actions = new StateActions(state, mockBridge);

  const root = document.createElement('div');
  root.setAttribute('tabindex', '0');
  document.body.appendChild(root);
  const bodyScroll = document.createElement('div');

  const nav = new KeyboardNavigator({
    rootElement: root,
    bodyScroll,
    state,
    actions,
    getTableBody: () => makeStubBody(),
  });

  return { state, actions, root, nav };
}

function keydown(el: Element, init: KeyboardEventInit): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
}

describe('KeyboardNavigator', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    __resetModalHostForTests();
  });

  // ---- Arrow navigation ----

  it('ArrowDown with no focus enters the grid and advances one row', () => {
    // Preserves pre-extraction behavior: moveFocus with no current cell
    // starts at (0,0) and applies the delta, so ArrowDown lands at row 1.
    const { state, root, nav } = setup();
    keydown(root, { key: 'ArrowDown' });
    expect(state.focusedCell.get()).toEqual({ row: 1, column: 'a' });
    nav.destroy();
  });

  it('ArrowRight / ArrowDown advance the focused cell', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 2, column: 'a' });

    keydown(root, { key: 'ArrowRight' });
    expect(state.focusedCell.get()).toEqual({ row: 2, column: 'b' });

    keydown(root, { key: 'ArrowDown' });
    expect(state.focusedCell.get()).toEqual({ row: 3, column: 'b' });
    nav.destroy();
  });

  it('ArrowLeft clamps at column 0', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 0, column: 'a' });
    keydown(root, { key: 'ArrowLeft' });
    expect(state.focusedCell.get()).toEqual({ row: 0, column: 'a' });
    nav.destroy();
  });

  // ---- Home / End ----

  it('Home → first column, same row', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 5, column: 'c' });
    keydown(root, { key: 'Home' });
    expect(state.focusedCell.get()).toEqual({ row: 5, column: 'a' });
    nav.destroy();
  });

  it('End → last column, same row', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 5, column: 'a' });
    keydown(root, { key: 'End' });
    expect(state.focusedCell.get()).toEqual({ row: 5, column: 'c' });
    nav.destroy();
  });

  it('Ctrl+Home → row 0, first column', () => {
    const { state, actions, root, nav } = setup(50);
    actions.setFocusedCell({ row: 40, column: 'c' });
    keydown(root, { key: 'Home', ctrlKey: true });
    expect(state.focusedCell.get()).toEqual({ row: 0, column: 'a' });
    nav.destroy();
  });

  it('Ctrl+End → last row, last column', () => {
    const { state, root, nav } = setup(50);
    keydown(root, { key: 'End', ctrlKey: true });
    expect(state.focusedCell.get()).toEqual({ row: 49, column: 'c' });
    nav.destroy();
  });

  // ---- PageUp / PageDown ----

  it('PageDown moves by one viewport of rows', () => {
    const { state, actions, root, nav } = setup(100);
    actions.setFocusedCell({ row: 0, column: 'a' });
    keydown(root, { key: 'PageDown' });
    // makeStubBody has pageRows=10
    expect(state.focusedCell.get()).toEqual({ row: 10, column: 'a' });
    nav.destroy();
  });

  // ---- Tab walk ----

  it('Tab advances left-to-right, row by row', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 0, column: 'c' });
    keydown(root, { key: 'Tab' });
    expect(state.focusedCell.get()).toEqual({ row: 1, column: 'a' });
    nav.destroy();
  });

  it('Shift+Tab reverses', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 1, column: 'a' });
    keydown(root, { key: 'Tab', shiftKey: true });
    expect(state.focusedCell.get()).toEqual({ row: 0, column: 'c' });
    nav.destroy();
  });

  // ---- Escape ----

  it('Escape clears focus', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 2, column: 'b' });
    keydown(root, { key: 'Escape' });
    expect(state.focusedCell.get()).toBeNull();
    nav.destroy();
  });

  // ---- Enter → row selection ----

  it('Enter on a focused cell toggles row selection', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 3, column: 'b' });

    keydown(root, { key: 'Enter' });
    expect(state.selectedRows.get().has(3)).toBe(true);

    keydown(root, { key: 'Enter' });
    expect(state.selectedRows.get().has(3)).toBe(false);

    nav.destroy();
  });

  it('Enter with no focused cell is a no-op', () => {
    const { state, root, nav } = setup();
    keydown(root, { key: 'Enter' });
    expect(state.selectedRows.get().size).toBe(0);
    nav.destroy();
  });

  // ---- Modal guard ----

  it('keystrokes are ignored while a ModalHost is open', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 5, column: 'a' });

    // Open a ModalHost-managed panel
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const host = new ModalHost();
    host.open({
      mode: 'panel',
      element: panel,
      trapFocus: false,
      restoreFocus: false,
    });

    keydown(root, { key: 'ArrowDown' });
    // focus should not move while modal is open
    expect(state.focusedCell.get()).toEqual({ row: 5, column: 'a' });

    host.close();
    host.destroy();
    nav.destroy();
  });

  // ---- destroy ----

  it('destroy detaches the keydown listener', () => {
    const { state, actions, root, nav } = setup();
    actions.setFocusedCell({ row: 0, column: 'a' });
    nav.destroy();
    keydown(root, { key: 'ArrowDown' });
    // Still at the original cell — listener is gone
    expect(state.focusedCell.get()).toEqual({ row: 0, column: 'a' });
  });

  // ---- Phase 8: undo/redo/copy shortcut wiring ----

  describe('Phase 8 — undo / redo / copy shortcuts', () => {
    it('Cmd/Ctrl+Z routes to actions.undo()', () => {
      const { actions, root, nav } = setup();
      const undo = vi.spyOn(actions, 'undo').mockResolvedValue(true);
      keydown(root, { key: 'z', ctrlKey: true });
      expect(undo).toHaveBeenCalledTimes(1);

      keydown(root, { key: 'z', metaKey: true });
      expect(undo).toHaveBeenCalledTimes(2);
      nav.destroy();
    });

    it('Cmd/Ctrl+Shift+Z routes to actions.redo()', () => {
      const { actions, root, nav } = setup();
      const redo = vi.spyOn(actions, 'redo').mockResolvedValue(true);
      keydown(root, { key: 'z', ctrlKey: true, shiftKey: true });
      expect(redo).toHaveBeenCalledTimes(1);

      keydown(root, { key: 'Z', metaKey: true, shiftKey: true });
      expect(redo).toHaveBeenCalledTimes(2);
      nav.destroy();
    });

    it('Ctrl+Y routes to actions.redo() (Windows convention)', () => {
      const { actions, root, nav } = setup();
      const redo = vi.spyOn(actions, 'redo').mockResolvedValue(true);
      keydown(root, { key: 'y', ctrlKey: true });
      expect(redo).toHaveBeenCalledTimes(1);
      nav.destroy();
    });

    it('Ctrl/Cmd+C is a no-op when no rows are selected', () => {
      const { state, root, nav } = setup();
      // No rows selected.
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'c',
        ctrlKey: true,
        cancelable: true,
      });
      root.dispatchEvent(event);
      expect(state.selectedRows.get().size).toBe(0);
      // Default not prevented when there's no selection — the browser
      // still receives the keystroke for native copy of the URL bar etc.
      expect(event.defaultPrevented).toBe(false);
      nav.destroy();
    });

    it('Ctrl/Cmd+C with selection prevents default and triggers copy path', () => {
      const { state, actions, root } = setup();
      const root2 = root;
      // Set up nav with a getBridge stub so the copy path runs.
      const bodyScroll = document.createElement('div');
      const getBridge = vi.fn(() => mockBridge);
      const nav = new KeyboardNavigator({
        rootElement: root2,
        bodyScroll,
        state,
        actions,
        getTableBody: () => makeStubBody(),
        getBridge,
      });

      state.selectedRows.set(new Set([0, 1, 2]));
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'c',
        ctrlKey: true,
        cancelable: true,
      });
      root2.dispatchEvent(event);

      // Default IS prevented when there's a selection — async copy fired.
      expect(event.defaultPrevented).toBe(true);
      expect(getBridge).toHaveBeenCalled();
      nav.destroy();
    });

    it('native browser undo (Cmd+Z) inside a child input is NOT hijacked', () => {
      const { actions, root, nav } = setup();
      const undo = vi.spyOn(actions, 'undo').mockResolvedValue(true);

      // A modal-hosted input — the modal-open guard short-circuits.
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      const input = document.createElement('input');
      modal.appendChild(input);
      document.body.appendChild(modal);
      input.focus();

      keydown(root, { key: 'z', ctrlKey: true });
      // Document-active-element is inside the dialog → grid yields.
      expect(undo).not.toHaveBeenCalled();
      nav.destroy();
    });
  });
});
