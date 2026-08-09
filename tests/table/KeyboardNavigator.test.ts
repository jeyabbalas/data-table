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
import { defaultStrings } from '@/core/Strings';
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

/**
 * The column-geometry half of the stub body.
 *
 * `scrollFocusedCellIntoView` asks the body where a column is rather than
 * summing `columnWidths` itself, so a stub without these silently skips the
 * whole horizontal pass. A uniform 150 px grid over `schema` is exactly what
 * the real body computes for a table whose widths were never set.
 */
const columnGeometry = {
  getColumnSpan: (column: string): { left: number; width: number } | null => {
    const index = schema.findIndex((c) => c.name === column);
    return index < 0 ? null : { left: index * 150, width: 150 };
  },
  getPinnedWidthPx: (): number => 0,
  refreshColumnWindow: (): void => {},
};

function makeStubBody(pageRows = 10): TableBody {
  const vs = {
    getViewportHeight: () => pageRows * 32,
    getRowHeight: () => 32,
    getScrollTop: () => 0,
    getVirtualScrollTop: () => 0,
    scrollToRow: vi.fn(),
  };
  return {
    getVirtualScroller: () => vs,
    ...columnGeometry,
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

  it('PageUp near the top of the data stops at row 0, not the header row', () => {
    // A page jump is a body-scrolling gesture. Overshooting into the sticky
    // header is a surprise; the header is one ArrowUp away.
    const { state, actions, root, nav } = setup(100);
    actions.setFocusedCell({ row: 3, column: 'b' });
    keydown(root, { key: 'PageUp' });
    expect(state.focusedCell.get()).toEqual({ row: 0, column: 'b' });
    nav.destroy();
  });

  it('PageUp on the header row leaves the cursor there', () => {
    // The floor cannot be a flat "body row 0" — from the header that would
    // move the cursor *down* into the data.
    const { state, actions, root, nav } = setup(100);
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
    keydown(root, { key: 'PageUp' });
    expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });
    nav.destroy();
  });

  it('PageUp with no rows at all stays on the header row', () => {
    const { state, actions, root, nav } = setup(0);
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
    keydown(root, { key: 'PageUp' });
    expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });
    nav.destroy();
  });

  // ---- Scroll-into-view (compressed mode) ----

  it('scrollFocusedCellIntoView compares against virtual scroll space, not physical', () => {
    // Above the height cap the physical scrollTop is compressed: comparing
    // row * rowHeight (virtual space) against it would wrongly re-scroll rows
    // that are already on screen. The navigator must read getVirtualScrollTop().
    const state = createTableState();
    state.schema.set(schema);
    initializeColumnsFromSchema(state, schema);
    state.totalRows.set(40_000);
    const actions = new StateActions(state, mockBridge);

    const root = document.createElement('div');
    root.setAttribute('tabindex', '0');
    document.body.appendChild(root);

    // One stable stub instance so the scrollToRow spy sees every call
    // (getTableBody: () => makeStubBody() would mint a fresh spy per call).
    const scrollToRow = vi.fn();
    const vs = {
      getViewportHeight: () => 320,
      getRowHeight: () => 32,
      getScrollTop: () => 5, // compressed physical position — must be ignored
      getVirtualScrollTop: () => 1_000_000, // rows 31,250–31,259 visible
      scrollToRow,
    };
    const body = { getVirtualScroller: () => vs, ...columnGeometry } as unknown as TableBody;

    const nav = new KeyboardNavigator({
      rootElement: root,
      bodyScroll: document.createElement('div'),
      state,
      actions,
      getTableBody: () => body,
    });

    // Row 31,255 sits inside the virtual viewport → no scroll needed. (Under
    // the old physical read, rowTop 1,000,160 > 5 + 320 would force a scroll.)
    actions.setFocusedCell({ row: 31_254, column: 'a' });
    keydown(root, { key: 'ArrowDown' });
    expect(state.focusedCell.get()).toEqual({ row: 31_255, column: 'a' });
    expect(scrollToRow).not.toHaveBeenCalled();

    // Row 100 is far above the virtual viewport → scrolls with 'start'
    actions.setFocusedCell({ row: 101, column: 'a' });
    keydown(root, { key: 'ArrowUp' });
    expect(state.focusedCell.get()).toEqual({ row: 100, column: 'a' });
    expect(scrollToRow).toHaveBeenCalledWith(100, 'start');

    nav.destroy();
  });

  // ---- Tab is never intercepted (WCAG 2.1.2, issue #84) ----
  //
  // jsdom does not implement sequential focus navigation, so we cannot press
  // Tab and watch focus travel; the end-to-end walk is verified in a real
  // browser under tests/browser/. What jsdom *can* see is the two ways the
  // grid could break that walk: calling preventDefault() on Tab, and moving
  // DOM focus during a Tab keydown. The second is what reopened #84 — a
  // focus() call is as good as preventDefault(), because the browser then
  // starts sequential navigation from the element the grid just focused.

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

    it('does not move DOM focus out of a scroll container inside the grid', () => {
      // The exact regression: the dispatcher reclaimed the grid for every key
      // that passed the cursor-key gate, Tab included. Focus went
      // .dt-header-scroll → .dt-grid before the browser ran sequential
      // navigation, which then walked back into .dt-grid's first tabbable
      // descendant — .dt-header-scroll — and looped forever.
      const state = createTableState();
      state.schema.set(schema);
      initializeColumnsFromSchema(state, schema);
      state.totalRows.set(100);
      const actions = new StateActions(state, mockBridge);

      const root = document.createElement('div');
      document.body.appendChild(root);
      const grid = document.createElement('div');
      grid.setAttribute('tabindex', '0');
      root.appendChild(grid);
      const headerScroll = document.createElement('div');
      headerScroll.setAttribute('tabindex', '0');
      grid.appendChild(headerScroll);

      const nav = new KeyboardNavigator({
        rootElement: root,
        gridElement: grid,
        bodyScroll: headerScroll,
        state,
        actions,
        getTableBody: () => makeStubBody(),
      });

      actions.setFocusedCell({ row: 0, column: 'a' });
      headerScroll.focus();
      expect(document.activeElement).toBe(headerScroll);

      for (const shiftKey of [false, true]) {
        keydown(headerScroll, { key: 'Tab', shiftKey });
        expect(document.activeElement).toBe(headerScroll);
      }

      nav.destroy();
    });

    it('does not move DOM focus for any key the grid does not act on', () => {
      // Stated as a general rule rather than a Tab special case: a branch
      // that does not act must not touch focus, so every unhandled key is
      // correct by construction instead of by enumeration.
      const state = createTableState();
      state.schema.set(schema);
      initializeColumnsFromSchema(state, schema);
      state.totalRows.set(100);
      const actions = new StateActions(state, mockBridge);

      const root = document.createElement('div');
      document.body.appendChild(root);
      const grid = document.createElement('div');
      grid.setAttribute('tabindex', '0');
      root.appendChild(grid);
      const scroller = document.createElement('div');
      scroller.setAttribute('tabindex', '0');
      grid.appendChild(scroller);

      const nav = new KeyboardNavigator({
        rootElement: root,
        gridElement: grid,
        bodyScroll: scroller,
        state,
        actions,
        getTableBody: () => makeStubBody(),
      });

      actions.setFocusedCell({ row: 0, column: 'a' });

      for (const key of ['Tab', 'a', 'F5', 'Insert', 'Shift', 'Alt', 'ContextMenu']) {
        scroller.focus();
        keydown(scroller, { key });
        expect(document.activeElement, `"${key}" moved DOM focus`).toBe(scroller);
      }

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

      const announce = vi.fn();
      const nav = new KeyboardNavigator({
        rootElement: root,
        gridElement: grid,
        bodyScroll,
        state,
        actions,
        getTableBody: () => makeStubBody(),
        getColumnHeaders: () => headers,
        announce,
      });

      const cleanup = (): void => {
        nav.destroy();
        for (const h of headers) h.destroy();
      };

      return { state, actions, root, grid, headers, nav, announce, cleanup };
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

    // ---- Click-focus and F2 are the same state ----
    //
    // Controls mode is derived from document.activeElement rather than stored,
    // so a control that got focus from a click behaves exactly like one
    // reached with F2. Storing the mode is what let these three diverge.

    it('Space on a click-focused control does not sort the cursor’s column', () => {
      const { actions, headers, cleanup } = setupWithHeaders();
      const toggleSort = vi.spyOn(actions, 'toggleSort');

      // Cursor sits on 'b'…
      actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
      // …while a click has left real focus on a control of 'a'.
      const control = headers[0]!.getControls()[0]!;
      control.focus();

      keydown(control, { key: ' ' });

      expect(toggleSort).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(control);
      cleanup();
    });

    it('Enter on a click-focused control does not toggle row selection', () => {
      const { state, actions, headers, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: 4, column: 'b' });
      const control = headers[0]!.getControls()[0]!;
      control.focus();

      keydown(control, { key: 'Enter' });

      expect(state.selectedRows.get().size).toBe(0);
      expect(document.activeElement).toBe(control);
      cleanup();
    });

    it('Ctrl+Z from a control runs undo and leaves focus on the button', () => {
      // Falling through to the grid handler is what used to drop the user out
      // of controls mode on every undo — contradicting the intent of keeping
      // the shortcut table-wide in the first place.
      const { actions, headers, cleanup } = setupWithHeaders();
      const undo = vi.spyOn(actions, 'undo').mockResolvedValue(true);
      const control = headers[0]!.getControls()[0]!;
      control.focus();

      keydown(control, { key: 'z', ctrlKey: true });

      expect(undo).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(control);
      cleanup();
    });

    it('Escape from a click-focused control returns focus to the grid', () => {
      const { headers, grid, cleanup } = setupWithHeaders();
      const control = headers[0]!.getControls()[0]!;
      control.focus();

      keydown(control, { key: 'Escape' });

      expect(document.activeElement).toBe(grid);
      cleanup();
    });

    it('Escape still clears the cursor from chrome outside the grid', () => {
      // Escape is a "get me out of here" gesture and was table-wide before
      // the grid restructure. Gating it behind the cursor-key check silently
      // stopped it working from the filter bar and the hidden-columns gutter.
      const { state, actions, root, cleanup } = setupWithHeaders();
      actions.setFocusedCell({ row: 2, column: 'b' });

      const filterBar = document.createElement('div');
      const button = document.createElement('button');
      filterBar.appendChild(button);
      root.appendChild(filterBar);
      button.focus();

      keydown(button, { key: 'Escape' });

      expect(state.focusedCell.get()).toBeNull();
      cleanup();
    });

    // ---- Column layout mode (Shift+F2) ----
    //
    // Issue #87. Resize and reorder are the two per-column operations with no
    // focus stop, on purpose: a stop whose Enter does nothing is worse than no
    // stop. They live behind a modal gesture on the header cursor instead,
    // which costs no tab stop and makes nothing focusable.

    const a11y = defaultStrings.a11y;

    /** Enter layout mode with the cursor parked on `column`. */
    function enterLayout(
      harness: ReturnType<typeof setupWithHeaders>,
      column = 'b',
    ): ReturnType<typeof setupWithHeaders> {
      harness.actions.setFocusedCell({ row: HEADER_ROW_INDEX, column });
      keydown(harness.root, { key: 'F2', shiftKey: true });
      harness.announce.mockClear();
      return harness;
    }

    describe('column layout mode', () => {
      it('Shift+F2 on a header enters the mode and announces the key map', () => {
        const { actions, root, headers, announce, cleanup } = setupWithHeaders();
        actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });

        const event = new KeyboardEvent('keydown', {
          key: 'F2',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        root.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(announce).toHaveBeenCalledWith(a11y.columnLayoutModeEntered('b'));
        expect(headers[1]!.getElement().classList.contains('dt-col-header--layout')).toBe(true);
        // …and only on the cursor's column.
        expect(headers[0]!.getElement().classList.contains('dt-col-header--layout')).toBe(false);
        cleanup();
      });

      it('Shift+F2 moves no DOM focus — the mode adds no focus stop', () => {
        // The whole point of a modal gesture over two more focus stops: real
        // focus never leaves `.dt-grid`, so the tab-stop census cannot move
        // and the resize separator never becomes a widget ARIA would then
        // require aria-valuenow/min/max on.
        const harness = setupWithHeaders();
        harness.grid.focus();
        enterLayout(harness);
        expect(document.activeElement).toBe(harness.grid);
        harness.cleanup();
      });

      it('bare F2 still enters controls mode', () => {
        const { actions, root, headers, cleanup } = setupWithHeaders();
        actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
        keydown(root, { key: 'F2' });
        expect(document.activeElement).toBe(headers[1]!.getControls()[0]);
        cleanup();
      });

      it('Left / Right resize by one step and announce the new width', () => {
        const { state, root, announce, cleanup } = enterLayout(setupWithHeaders());

        keydown(root, { key: 'ArrowRight' });
        expect(state.columnWidths.get().get('b')).toBe(166);
        expect(announce).toHaveBeenLastCalledWith(a11y.columnWidthAnnouncement('b', 166));

        keydown(root, { key: 'ArrowLeft' });
        keydown(root, { key: 'ArrowLeft' });
        expect(state.columnWidths.get().get('b')).toBe(134);

        cleanup();
      });

      it('resize clamps at the minimum and says so', () => {
        const { state, root, announce, cleanup } = enterLayout(setupWithHeaders());
        // 150 → 50 is under 7 steps; 10 proves it stops rather than wrapping.
        for (let i = 0; i < 10; i++) keydown(root, { key: 'ArrowLeft' });
        expect(state.columnWidths.get().get('b')).toBe(50);
        expect(announce).toHaveBeenLastCalledWith(a11y.columnWidthAtMinimum('b', 50));
        cleanup();
      });

      it('resize clamps at the maximum and says so', () => {
        const { state, root, announce, cleanup } = enterLayout(setupWithHeaders());
        for (let i = 0; i < 30; i++) keydown(root, { key: 'ArrowRight' });
        expect(state.columnWidths.get().get('b')).toBe(500);
        expect(announce).toHaveBeenLastCalledWith(a11y.columnWidthAtMaximum('b', 500));
        cleanup();
      });

      it('Home / End jump to the width bounds', () => {
        const { state, root, announce, cleanup } = enterLayout(setupWithHeaders());

        keydown(root, { key: 'End' });
        expect(state.columnWidths.get().get('b')).toBe(500);
        expect(announce).toHaveBeenLastCalledWith(a11y.columnWidthAtMaximum('b', 500));

        keydown(root, { key: 'Home' });
        expect(state.columnWidths.get().get('b')).toBe(50);

        cleanup();
      });

      it('Home / End do not move the cursor while the mode is open', () => {
        const { state, root, cleanup } = enterLayout(setupWithHeaders());
        keydown(root, { key: 'Home' });
        expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });
        cleanup();
      });

      it('Backspace resets the width to the default', () => {
        const { state, root, announce, cleanup } = enterLayout(setupWithHeaders());
        keydown(root, { key: 'End' });
        expect(state.columnWidths.get().has('b')).toBe(true);

        keydown(root, { key: 'Backspace' });
        // Reset means "no stored width", not "150 written down" — the same
        // thing double-clicking the resize handle does.
        expect(state.columnWidths.get().has('b')).toBe(false);
        expect(announce).toHaveBeenLastCalledWith(a11y.columnWidthAnnouncement('b', 150));
        cleanup();
      });

      it('Shift+Right moves the column one position and announces where it landed', () => {
        const { state, root, announce, cleanup } = enterLayout(setupWithHeaders(), 'a');

        keydown(root, { key: 'ArrowRight', shiftKey: true });

        expect(state.visibleColumns.get()).toEqual(['b', 'a', 'c']);
        expect(state.columnOrder.get()).toEqual(['b', 'a', 'c']);
        expect(announce).toHaveBeenLastCalledWith(a11y.columnMovedAnnouncement('a', 2, 3));
        // The cursor rides with the column, not with the position.
        expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'a' });
        cleanup();
      });

      it('Shift+Left at the first position is a no-op', () => {
        const { state, root, cleanup } = enterLayout(setupWithHeaders(), 'a');
        keydown(root, { key: 'ArrowLeft', shiftKey: true });
        expect(state.visibleColumns.get()).toEqual(['a', 'b', 'c']);
        cleanup();
      });

      it('Shift+End / Shift+Home move to the last and first positions', () => {
        const { state, root, cleanup } = enterLayout(setupWithHeaders(), 'a');

        keydown(root, { key: 'End', shiftKey: true });
        expect(state.visibleColumns.get()).toEqual(['b', 'c', 'a']);

        keydown(root, { key: 'Home', shiftKey: true });
        expect(state.visibleColumns.get()).toEqual(['a', 'b', 'c']);

        cleanup();
      });

      it('a pinned column refuses to move, the way the mouse path does', () => {
        const harness = setupWithHeaders();
        // Pinning moves the column to the head of the order as a side effect.
        harness.actions.toggleColumnPin('b');
        expect(harness.state.visibleColumns.get()).toEqual(['b', 'a', 'c']);

        const { state, root, announce, cleanup } = enterLayout(harness, 'b');
        keydown(root, { key: 'ArrowRight', shiftKey: true });

        expect(state.visibleColumns.get()).toEqual(['b', 'a', 'c']);
        expect(announce).toHaveBeenLastCalledWith(a11y.columnMoveBlockedPinned('b'));
        cleanup();
      });

      it('an unpinned column cannot be moved into the pinned block', () => {
        const harness = setupWithHeaders();
        harness.actions.toggleColumnPin('a');
        expect(harness.state.pinnedColumns.get()).toEqual(['a']);

        const { state, root, cleanup } = enterLayout(harness, 'b');
        keydown(root, { key: 'Home', shiftKey: true });

        // Every sticky `left` offset assumes the pinned columns lead.
        expect(state.visibleColumns.get()).toEqual(['a', 'b', 'c']);
        cleanup();
      });

      it('Escape restores the entry width AND the entry position', () => {
        const { state, root, announce, cleanup } = enterLayout(setupWithHeaders(), 'a');

        keydown(root, { key: 'ArrowRight' });
        keydown(root, { key: 'ArrowRight', shiftKey: true });
        expect(state.columnWidths.get().get('a')).toBe(166);
        expect(state.visibleColumns.get()).toEqual(['b', 'a', 'c']);

        keydown(root, { key: 'Escape' });

        expect(state.columnWidths.get().has('a')).toBe(false);
        expect(state.visibleColumns.get()).toEqual(['a', 'b', 'c']);
        expect(state.columnOrder.get()).toEqual(['a', 'b', 'c']);
        expect(announce).toHaveBeenLastCalledWith(a11y.columnLayoutCancelled('a'));
        cleanup();
      });

      it('Escape ends the mode without clearing the cursor', () => {
        const { state, root, headers, cleanup } = enterLayout(setupWithHeaders());
        keydown(root, { key: 'Escape' });

        expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });
        expect(headers[1]!.getElement().classList.contains('dt-col-header--layout')).toBe(false);

        // …and the next Escape gets through to the cursor.
        keydown(root, { key: 'Escape' });
        expect(state.focusedCell.get()).toBeNull();
        cleanup();
      });

      it('Enter commits and leaves the mode', () => {
        const { state, root, headers, announce, cleanup } = enterLayout(setupWithHeaders());

        keydown(root, { key: 'ArrowRight' });
        keydown(root, { key: 'Enter' });

        expect(state.columnWidths.get().get('b')).toBe(166);
        expect(announce).toHaveBeenLastCalledWith(a11y.columnLayoutCommitted('b'));
        expect(headers[1]!.getElement().classList.contains('dt-col-header--layout')).toBe(false);

        // Out of the mode, Left is a cursor key again.
        keydown(root, { key: 'ArrowLeft' });
        expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'a' });
        cleanup();
      });

      it('Shift+F2 again toggles the mode off', () => {
        const { root, headers, announce, cleanup } = enterLayout(setupWithHeaders());
        keydown(root, { key: 'F2', shiftKey: true });
        expect(announce).toHaveBeenLastCalledWith(a11y.columnLayoutCommitted('b'));
        expect(headers[1]!.getElement().classList.contains('dt-col-header--layout')).toBe(false);
        cleanup();
      });

      it('Tab is never intercepted', () => {
        const { root, cleanup } = enterLayout(setupWithHeaders());
        const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        root.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        cleanup();
      });

      it('an unhandled key changes nothing and moves no focus', () => {
        const { state, root, grid, cleanup } = enterLayout(setupWithHeaders());
        const before = state.columnWidths.get();

        const event = new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true });
        root.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(state.columnWidths.get()).toBe(before);
        expect(state.visibleColumns.get()).toEqual(['a', 'b', 'c']);
        expect(document.activeElement).not.toBe(grid);
        cleanup();
      });

      it('Ctrl+Z still reaches undo from inside the mode', () => {
        const harness = enterLayout(setupWithHeaders());
        const undo = vi.spyOn(harness.actions, 'undo').mockResolvedValue(true);
        keydown(harness.root, { key: 'z', ctrlKey: true });
        expect(undo).toHaveBeenCalledTimes(1);
        harness.cleanup();
      });

      it('moving the cursor off the column commits the gesture', () => {
        const { state, root, headers, announce, cleanup } = enterLayout(setupWithHeaders());

        keydown(root, { key: 'ArrowDown' });

        expect(state.focusedCell.get()).toEqual({ row: 0, column: 'b' });
        expect(announce).toHaveBeenLastCalledWith(a11y.columnLayoutCommitted('b'));
        expect(headers[1]!.getElement().classList.contains('dt-col-header--layout')).toBe(false);

        // The width keys are inert again.
        keydown(root, { key: 'Home' });
        expect(state.columnWidths.get().has('b')).toBe(false);
        cleanup();
      });

      it('hiding the column out from under an open gesture drops the mode', () => {
        const { state, actions, root, cleanup } = enterLayout(setupWithHeaders());
        actions.hideColumn('b');

        keydown(root, { key: 'ArrowRight' });

        // The cursor's column is gone, so the arrow key is a plain cursor move.
        expect(state.columnWidths.get().has('b')).toBe(false);
        cleanup();
      });
    });
  });
});

describe('KeyboardNavigator — a header the column window has scrolled away', () => {
  // The header row renders a window, and the extension that keeps the cursor's
  // own header mounted is clamped. A pointer scroll moves the window without
  // moving the cursor, so the cursor can name a column with no element — and
  // every gesture that needs one used to do nothing, silently, while
  // `aria-keyshortcuts="Shift+F2"` on every header went on advertising it.
  //
  // Modelled as a one-column window over the three-column fixture: `mounted`
  // is whatever `scrollLeft` says, and the navigator's own
  // `scrollFocusedCellIntoView` is what has to move it.
  function setupWindowed() {
    const state = createTableState();
    state.schema.set(schema);
    initializeColumnsFromSchema(state, schema);
    state.totalRows.set(100);
    const actions = new StateActions(state, mockBridge);

    const root = document.createElement('div');
    root.setAttribute('tabindex', '0');
    document.body.appendChild(root);
    const grid = document.createElement('div');
    root.appendChild(grid);

    const bodyScroll = document.createElement('div');
    // One 150 px column visible at a time.
    Object.defineProperty(bodyScroll, 'clientWidth', { value: 150, configurable: true });

    const headers = schema.map(
      (col, i) => new ColumnHeader(col, state, actions, { cellId: `dt-t1-colheader-${i}` }),
    );

    /** The mounted window: the single column at the current offset. */
    const mounted = (): ColumnHeader[] => {
      const index = Math.round(bodyScroll.scrollLeft / 150);
      const header = headers[index];
      return header ? [header] : [];
    };
    // Only mounted headers are in the DOM, the way the real row works.
    const syncDom = (): void => {
      grid.replaceChildren(...mounted().map((h) => h.getElement()));
    };
    syncDom();

    const nav = new KeyboardNavigator({
      rootElement: root,
      gridElement: grid,
      bodyScroll,
      state,
      actions,
      getTableBody: () => makeStubBody(),
      getColumnHeaders: mounted,
      refreshColumnWindow: syncDom,
      announce: vi.fn(),
    });

    return {
      state,
      actions,
      root,
      bodyScroll,
      headers,
      nav,
      cleanup: (): void => {
        nav.destroy();
        for (const h of headers) h.destroy();
        root.remove();
      },
    };
  }

  it('sorts on Enter after scrolling the cursor column back', () => {
    const { state, actions, root, bodyScroll, nav, cleanup } = setupWindowed();
    void nav;
    // Cursor on 'c', window parked on 'a'. Nothing for the cursor to act on.
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'c' });
    bodyScroll.scrollLeft = 0;

    keydown(root, { key: 'Enter' });

    expect(state.sortColumns.get().map((s) => s.column)).toEqual(['c']);
    cleanup();
  });

  it('opens F2 controls mode after scrolling the cursor column back', () => {
    const { actions, root, bodyScroll, nav, cleanup } = setupWindowed();
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'c' });
    bodyScroll.scrollLeft = 0;

    keydown(root, { key: 'F2' });

    // Real DOM focus is inside 'c''s header, which only exists because the
    // gesture scrolled it back.
    expect(nav.activeControls()).not.toBeNull();
    expect(document.activeElement?.closest('[data-column="c"]')).not.toBeNull();
    cleanup();
  });

  it('opens a Shift+F2 layout gesture after scrolling the cursor column back', () => {
    const { actions, root, bodyScroll, headers, cleanup } = setupWindowed();
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'c' });
    bodyScroll.scrollLeft = 0;

    keydown(root, { key: 'F2', shiftKey: true });

    expect(headers[2]!.getElement().classList.contains('dt-col-header--layout')).toBe(true);
    cleanup();
  });

  it('keeps resizing when a scroll takes the gesture out of the window', () => {
    const { actions, root, bodyScroll, headers, cleanup } = setupWindowed();
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'c' });
    keydown(root, { key: 'F2', shiftKey: true });
    const before = headers[2]!.getWidth();

    // A pointer scroll: the window moves, the cursor does not, and the gesture
    // stays open because it is tracked as state rather than as focus.
    bodyScroll.scrollLeft = 0;

    keydown(root, { key: 'ArrowRight' });

    // Before the fix this was a silent no-op — no width write, no
    // announcement, and the key consumed.
    expect(headers[2]!.getWidth()).toBeGreaterThan(before);
    cleanup();
  });
});
