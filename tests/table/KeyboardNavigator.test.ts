/**
 * @vitest-environment jsdom
 *
 * Unit tests for the extracted KeyboardNavigator. Uses a stub TableBody
 * that satisfies the getTableBody() contract so we can exercise
 * PageUp/PageDown without mounting the full TableContainer DOM tree.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HEADER_ROW_INDEX, KeyboardNavigator } from '@/table/KeyboardNavigator';
import { ColumnHeader } from '@/table/ColumnHeader';
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

  // ---- Tab is never intercepted (WCAG 2.1.2, issue #84) ----
  //
  // jsdom does not implement sequential focus navigation, so we cannot press
  // Tab and watch focus travel. The invariant that actually matters is
  // structural: the grid must never call preventDefault() on Tab, and it must
  // not grow the tab order with column count. Both are asserted directly; the
  // end-to-end walk is verified in a real browser.

  describe('Tab', () => {
    it('does not preventDefault Tab or Shift+Tab, from the root or any descendant', () => {
      const { actions, root, nav } = setup();
      actions.setFocusedCell({ row: 0, column: 'c' });

      const headerCell = document.createElement('div');
      headerCell.setAttribute('role', 'columnheader');
      headerCell.setAttribute('tabindex', '-1');
      const headerButton = document.createElement('button');
      headerButton.setAttribute('tabindex', '-1');
      headerCell.appendChild(headerButton);
      root.appendChild(headerCell);

      for (const target of [root, headerCell, headerButton]) {
        for (const shiftKey of [false, true]) {
          const event = new KeyboardEvent('keydown', {
            key: 'Tab',
            shiftKey,
            bubbles: true,
            cancelable: true,
          });
          target.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(false);
        }
      }

      nav.destroy();
    });

    it('leaves the cursor alone on Tab — it is the browser’s key, not the grid’s', () => {
      const { state, actions, root, nav } = setup();
      actions.setFocusedCell({ row: 0, column: 'c' });
      keydown(root, { key: 'Tab' });
      expect(state.focusedCell.get()).toEqual({ row: 0, column: 'c' });
      keydown(root, { key: 'Tab', shiftKey: true });
      expect(state.focusedCell.get()).toEqual({ row: 0, column: 'c' });
      nav.destroy();
    });
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

  // ---- Focus ownership ----

  describe('focus ownership', () => {
    /**
     * Mirrors the real shape: a root that hosts chrome OUTSIDE the grid (the
     * filter bar, the hidden-columns gutter) alongside the grid itself. The
     * keydown listener is on the root, so both bubble to it.
     */
    function setupWithChrome() {
      const state = createTableState();
      state.schema.set(schema);
      initializeColumnsFromSchema(state, schema);
      state.totalRows.set(100);
      const actions = new StateActions(state, mockBridge);

      const root = document.createElement('div');
      document.body.appendChild(root);
      const chromeButton = document.createElement('button');
      root.appendChild(chromeButton);
      const grid = document.createElement('div');
      grid.setAttribute('tabindex', '0');
      root.appendChild(grid);
      const bodyScroll = document.createElement('div');
      bodyScroll.setAttribute('tabindex', '0');
      grid.appendChild(bodyScroll);
      const cell = document.createElement('div');
      cell.setAttribute('tabindex', '-1');
      bodyScroll.appendChild(cell);

      const nav = new KeyboardNavigator({
        rootElement: root,
        gridElement: grid,
        bodyScroll,
        state,
        actions,
        getTableBody: () => makeStubBody(),
      });
      return { state, actions, root, grid, bodyScroll, cell, chromeButton, nav };
    }

    it('does not steal Enter or Space from chrome outside the grid', () => {
      const { state, actions, chromeButton, nav } = setupWithChrome();
      const toggleSort = vi.spyOn(actions, 'toggleSort');
      // Header cursor active — this is what made the branch fire everywhere.
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      chromeButton.focus();

      for (const key of [' ', 'Enter']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        chromeButton.dispatchEvent(event);
        // Space on "Clear all filters" must clear filters, not sort a column.
        expect(event.defaultPrevented).toBe(false);
      }
      expect(toggleSort).not.toHaveBeenCalled();
      expect(state.selectedRows.get().size).toBe(0);

      nav.destroy();
    });

    it('does not move the cursor from arrows pressed on chrome outside the grid', () => {
      const { state, actions, chromeButton, nav } = setupWithChrome();
      actions.setFocusedCell({ row: 5, column: 'b' });
      chromeButton.focus();

      keydown(chromeButton, { key: 'ArrowDown' });
      expect(state.focusedCell.get()).toEqual({ row: 5, column: 'b' });

      nav.destroy();
    });

    it('still handles undo/redo/copy from chrome outside the grid', () => {
      const { actions, chromeButton, nav } = setupWithChrome();
      const undo = vi.spyOn(actions, 'undo').mockResolvedValue(true);
      chromeButton.focus();

      keydown(chromeButton, { key: 'z', ctrlKey: true });
      expect(undo).toHaveBeenCalledTimes(1);

      nav.destroy();
    });

    it('reclaims focus onto the grid on the first cursor key after a click', () => {
      const { state, actions, grid, cell, nav } = setupWithChrome();
      actions.setFocusedCell({ row: 5, column: 'b' });

      // A click parks focus on the cell it hit. Focus is only reclaimed when
      // the user starts driving the cursor, so pointer interactions (and the
      // popovers they open on focusin/focusout) are left alone.
      cell.focus();
      expect(document.activeElement).toBe(cell);

      keydown(cell, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(grid);
      expect(state.focusedCell.get()).toEqual({ row: 6, column: 'b' });

      nav.destroy();
    });

    it('reclaims focus from a scroll container too, rather than going inert', () => {
      const { state, actions, grid, bodyScroll, nav } = setupWithChrome();
      actions.setFocusedCell({ row: 5, column: 'b' });
      bodyScroll.focus();

      // The scroll containers are tab stops so `scrollable-region-focusable`
      // passes; landing on one must not leave the keyboard dead.
      keydown(bodyScroll, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(grid);
      expect(state.focusedCell.get()).toEqual({ row: 6, column: 'b' });

      nav.destroy();
    });
  });

  // ---- Header row cursor, F2 controls mode ----

  describe('header row + controls mode', () => {
    function setupWithHeaders(rows = 100) {
      const state = createTableState();
      state.schema.set(schema);
      initializeColumnsFromSchema(state, schema);
      state.totalRows.set(rows);
      const actions = new StateActions(state, mockBridge);

      const root = document.createElement('div');
      document.body.appendChild(root);
      const grid = document.createElement('div');
      grid.setAttribute('tabindex', '0');
      root.appendChild(grid);
      const bodyScroll = document.createElement('div');

      const headers = schema.map(
        (col, i) => new ColumnHeader(col, state, actions, { cellId: `dt-t1-colheader-${i}` }),
      );
      for (const h of headers) grid.appendChild(h.getElement());

      const nav = new KeyboardNavigator({
        rootElement: root,
        gridElement: grid,
        bodyScroll,
        state,
        actions,
        getTableBody: () => makeStubBody(),
        getColumnHeaders: () => headers,
      });

      const cleanup = (): void => {
        nav.destroy();
        for (const h of headers) h.destroy();
      };

      return { state, actions, root, grid, headers, nav, cleanup };
    }

    it('ArrowUp from body row 0 lands on the header row', () => {
      const { state, actions, root, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: 0, column: 'b' });
      keydown(root, { key: 'ArrowUp' });
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });
      cleanup();
    });

    it('ArrowDown from the header row enters the body at the same column', () => {
      const { state, actions, root, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'ArrowDown' });
      expect(state.focusedCell.get()).toEqual({ row: 0, column: 'b' });
      cleanup();
    });

    it('ArrowUp on the header row stays on the header row', () => {
      const { state, actions, root, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'ArrowUp' });
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });
      cleanup();
    });

    it('Left/Right move between column headers; Home/End jump to the ends', () => {
      const { state, actions, root, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'a' });

      keydown(root, { key: 'ArrowRight' });
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });

      keydown(root, { key: 'End' });
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'c' });

      keydown(root, { key: 'Home' });
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'a' });

      cleanup();
    });

    it('with zero rows the cursor can only occupy the header row', () => {
      const { state, root, cleanup } = setupWithHeaders(0);
      keydown(root, { key: 'ArrowDown' });
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'a' });
      cleanup();
    });

    it('Enter on a header cursor toggles sort; Shift+Enter adds to multi-sort', () => {
      const { actions, root, cleanup } = setupWithHeaders();
      const toggleSort = vi.spyOn(actions, 'toggleSort');
      const addToSort = vi.spyOn(actions, 'addToSort');
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });

      keydown(root, { key: 'Enter' });
      expect(toggleSort).toHaveBeenCalledWith('b');

      keydown(root, { key: ' ', shiftKey: true });
      expect(addToSort).toHaveBeenCalledWith('b');

      cleanup();
    });

    it('Enter on a header cursor does not toggle row selection', () => {
      const { state, actions, root, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'Enter' });
      expect(state.selectedRows.get().size).toBe(0);
      cleanup();
    });

    it('F2 moves real focus to the header cell’s first control', () => {
      const { actions, root, headers, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });

      keydown(root, { key: 'F2' });

      const controls = headers[1]!.getControls();
      expect(controls.length).toBeGreaterThan(1);
      expect(document.activeElement).toBe(controls[0]);
      cleanup();
    });

    it('F2 is a no-op in the body — body cells have no controls', () => {
      const { actions, root, grid, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: 3, column: 'b' });
      grid.focus();
      keydown(root, { key: 'F2' });
      expect(document.activeElement).toBe(grid);
      cleanup();
    });

    it('Left/Right cycle the header’s controls in controls mode, wrapping', () => {
      const { actions, root, headers, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'F2' });

      const controls = headers[1]!.getControls();
      keydown(document.activeElement!, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(controls[1]);

      // Wrap backwards past the start.
      keydown(document.activeElement!, { key: 'ArrowLeft' });
      keydown(document.activeElement!, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(controls[controls.length - 1]);

      cleanup();
    });

    it('arrows in controls mode do not move the grid cursor', () => {
      const { state, actions, root, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'F2' });

      keydown(document.activeElement!, { key: 'ArrowRight' });
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });

      cleanup();
    });

    it('Escape leaves controls mode and returns focus to the grid', () => {
      const { state, actions, root, grid, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'F2' });
      expect(document.activeElement).not.toBe(grid);

      keydown(document.activeElement!, { key: 'Escape' });
      expect(document.activeElement).toBe(grid);
      // The cursor survives — Escape exits the mode, it does not clear focus.
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });

      cleanup();
    });

    it('Tab is not intercepted in controls mode', () => {
      const { actions, root, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'F2' });

      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      document.activeElement!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);

      cleanup();
    });

    it('Up/Down leave controls mode and move the cursor', () => {
      const { state, actions, root, grid, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'F2' });

      // Without this the key falls through to the browser and scrolls the
      // nearest scrollable ancestor out from under the user.
      keydown(document.activeElement!, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(grid);
      expect(state.focusedCell.get()).toEqual({ row: 0, column: 'b' });

      cleanup();
    });

    it('undo still works in controls mode', () => {
      const { actions, root, cleanup } = setupWithHeaders();
      const undo = vi.spyOn(actions, 'undo').mockResolvedValue(true);
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'F2' });

      keydown(document.activeElement!, { key: 'z', ctrlKey: true });
      expect(undo).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('controls mode drops itself when focus leaves the header', () => {
      const { state, actions, root, grid, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      keydown(root, { key: 'F2' });

      // Simulate a Tab out of the grid.
      grid.focus();
      keydown(root, { key: 'ArrowRight' });
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'c' });

      cleanup();
    });
  });
});
