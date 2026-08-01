/**
 * KeyboardNavigator — grid keyboard navigation controller.
 *
 * Owns the keydown listener on the table root and translates keystrokes into
 * state mutations via StateActions. Extracted from TableContainer so that the
 * keyboard logic lives in one cohesive unit and can be tested in isolation.
 *
 * Handles: arrow navigation across the header row and the body, Home/End (and
 * Ctrl variants), PageUp/PageDown, Escape to clear the cursor, Enter to toggle
 * sort (header) or row selection (body), F2 to enter the header cell's
 * buttons, and Ctrl+Z/Y/C.
 *
 * `Tab` is deliberately absent. Intercepting it is what made the grid a
 * WCAG 2.1.2 keyboard trap (issue #84): the listener is bubble-phase on the
 * root, so it swallowed Tab from every descendant and the boundary cases
 * returned with the default already suppressed. Tab now always does what the
 * browser says — `.dt-grid` is one tab stop you step into and out of, and
 * the tab order no longer grows with the column count.
 *
 * The invariant that keeps it that way: **a branch that does not act on a
 * key must not move focus either.** Moving DOM focus is as good as
 * preventing the default — reclaiming `.dt-grid` on a Tab keydown hands the
 * browser a different starting point, and sequential navigation then walks
 * straight back into the grid's first tabbable descendant. So
 * {@link KeyboardNavigator.claimGridFocus} is called from the individual
 * action paths rather than once up front. Unhandled keys are correct by
 * construction, not by enumerating them.
 *
 * Defers to any open ModalHost dialog/panel so modal focus traps are not
 * interfered with.
 */

import type { StateActions } from '../core/Actions';
import { isAnyModalOpen } from '../core/ModalHost';
import type { TableState } from '../core/State';
import type { WorkerBridge } from '../data/WorkerBridge';
import { copyRowsToClipboard } from '../export/Clipboard';
import type { ColumnHeader } from './ColumnHeader';
import type { TableBody } from './TableBody';

/**
 * Row index that means "the column-header row" in `state.focusedCell`.
 *
 * The cursor has to span the header and the body with exactly one active
 * position, because `aria-activedescendant` can only name one element. Using a
 * sentinel row keeps the publicly-exported `TableState` shape unchanged; every
 * consumer that indexes rows (row pool, selection, virtual scroller) treats a
 * negative index as "no such row" and skips it.
 */
export const HEADER_ROW_INDEX = -1;

/** Construction options for {@link KeyboardNavigator}. */
export interface KeyboardNavigatorOptions {
  /**
   * Element the keydown listener is attached to. Bubble-phase, so it sees
   * keystrokes from every descendant of the table root.
   */
  rootElement: HTMLElement;
  /**
   * The `role="grid"` element that owns focus. Escape from controls mode
   * returns focus here. Defaults to `rootElement` when omitted.
   */
  gridElement?: HTMLElement | undefined;
  /** Body horizontal-scroll container (for horizontal cell scroll). */
  bodyScroll: HTMLElement;
  /** Reactive state for the grid. */
  state: TableState;
  /** State mutation surface. */
  actions: StateActions;
  /** Late-bound accessor for the TableBody (may be recreated on data loads). */
  getTableBody: () => TableBody | null;
  /**
   * Late-bound accessor for the live ColumnHeader instances — `render()`
   * destroys and rebuilds them, so they cannot be captured at construction.
   * Without it, header-row navigation and F2 controls mode are inert.
   */
  getColumnHeaders?: (() => ColumnHeader[]) | undefined;
  /** Optional bridge for clipboard copy; when absent, Ctrl+C is a no-op. */
  getBridge?: () => WorkerBridge | undefined;
}

/**
 * WCAG-oriented keyboard navigation controller for the table grid: arrow
 * keys, Home / End, Ctrl+Home / End, PageUp / PageDown, Enter to sort
 * (header) or select (body), F2 to reach the per-column buttons, and
 * Ctrl/Cmd+C to copy the selection.
 * Composed by {@link TableContainer}; reach for it directly only when
 * assembling a custom container shell.
 */
export class KeyboardNavigator {
  private readonly rootElement: HTMLElement;
  private readonly gridElement: HTMLElement;
  private readonly bodyScroll: HTMLElement;
  private readonly state: TableState;
  private readonly actions: StateActions;
  private readonly getTableBody: () => TableBody | null;
  private readonly getColumnHeaders: (() => ColumnHeader[]) | undefined;
  private readonly getBridge: (() => WorkerBridge | undefined) | undefined;

  private readonly keydownHandler: (e: KeyboardEvent) => void;
  private destroyed = false;

  constructor(opts: KeyboardNavigatorOptions) {
    this.rootElement = opts.rootElement;
    this.gridElement = opts.gridElement ?? opts.rootElement;
    this.bodyScroll = opts.bodyScroll;
    this.state = opts.state;
    this.actions = opts.actions;
    this.getTableBody = opts.getTableBody;
    this.getColumnHeaders = opts.getColumnHeaders;
    this.getBridge = opts.getBridge;

    this.keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.rootElement.addEventListener('keydown', this.keydownHandler);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.rootElement.removeEventListener('keydown', this.keydownHandler);
  }

  // =========================================
  // Key dispatch
  // =========================================

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.destroyed) return;

    // Defer to any open ModalHost-managed dialog/panel, or any descendant
    // of a role="dialog" (covers non-migrated modals too). The modal owns
    // its keystrokes; the grid must not steal them.
    if (isAnyModalOpen()) return;
    const active = document.activeElement;
    if (active instanceof Element && active.closest('[role="dialog"]')) return;

    // Controls mode owns the keyboard while focus sits on a header button.
    if (this.handleControlsModeKey(e)) return;

    const focused = this.state.focusedCell.get();
    const onHeader = focused?.row === HEADER_ROW_INDEX;

    // The listener is bubble-phase on the table root, so keystrokes from the
    // filter bar and the hidden-columns gutter reach it too. Those controls
    // own their own keys — Space on "Clear all filters" must clear filters,
    // not sort whichever column the cursor happens to sit on. Only Escape
    // and the undo/redo/copy shortcuts stay table-wide.
    if (!this.cursorKeysApply(active)) {
      this.handleShortcut(e);
      return;
    }

    // Arrow navigation (no modifier)
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      switch (e.key) {
        case 'ArrowUp':
          this.moveFocus(-1, 0);
          break;
        case 'ArrowDown':
          this.moveFocus(1, 0);
          break;
        case 'ArrowLeft':
          this.moveFocus(0, -1);
          break;
        case 'ArrowRight':
          this.moveFocus(0, 1);
          break;
      }
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      const visibleColumns = this.state.visibleColumns.get();
      if (visibleColumns.length === 0) return;

      // After length-check above, [0] is non-null.
      const firstCol = visibleColumns[0]!;
      if (e.ctrlKey || e.metaKey) {
        this.setFocusAbsolute(this.firstBodyRow(), firstCol);
      } else {
        this.setFocusAbsolute(focused?.row ?? this.firstBodyRow(), firstCol);
      }
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      const visibleColumns = this.state.visibleColumns.get();
      if (visibleColumns.length === 0) return;

      const lastCol = visibleColumns[visibleColumns.length - 1]!;
      if (e.ctrlKey || e.metaKey) {
        this.setFocusAbsolute(this.lastBodyRow(), lastCol);
      } else {
        this.setFocusAbsolute(focused?.row ?? this.firstBodyRow(), lastCol);
      }
      return;
    }

    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const body = this.getTableBody();
      if (!body) return;
      const vs = body.getVirtualScroller();
      const pageRows = Math.max(1, Math.floor(vs.getViewportHeight() / vs.getRowHeight()));
      const delta = e.key === 'PageUp' ? -pageRows : pageRows;
      // A page jump is a body-scrolling gesture. PageUp near the top of the
      // data should stop at row 0, not overshoot into the sticky header —
      // the header row is a cursor position you step onto with ArrowUp.
      this.moveFocus(delta, 0, { enterHeaderRow: false });
      return;
    }

    // F2 on a header cell hands real DOM focus to its first button —
    // the APG "actionable cell" gesture. Body cells have no controls.
    if (e.key === 'F2' && onHeader && focused) {
      if (this.enterControlsMode(focused.column)) {
        e.preventDefault();
      }
      return;
    }

    // Enter / Space on a header cell toggles sort; Shift/Ctrl/Meta adds to
    // the multi-sort stack, mirroring Shift+click.
    if (onHeader && focused && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
      e.preventDefault();
      this.claimGridFocus();
      const header = this.findHeader(focused.column);
      if (header) {
        header.activateSort(e.shiftKey || e.metaKey || e.ctrlKey);
      }
      return;
    }

    // Enter on a focused body cell toggles row selection. Using 'toggle' mode
    // means keyboard users can build up a selection without Shift+click.
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (focused) {
        e.preventDefault();
        this.claimGridFocus();
        this.actions.selectRow(focused.row, 'toggle');
      }
      return;
    }

    this.handleShortcut(e);
  }

  /**
   * Escape and undo / redo / copy. Split out of the cursor keys because
   * these stay table-wide: they should keep working from the filter bar and
   * the hidden-columns gutter, where the cursor keys deliberately do not.
   *
   * Escape belongs here rather than with the cursor keys. Dismissing the
   * cursor is a "get me out of here" gesture — it was table-wide before the
   * grid restructure, and gating it behind {@link cursorKeysApply} silently
   * stopped it working from the filter bar and the hidden-columns gutter.
   */
  private handleShortcut(e: KeyboardEvent): void {
    // Escape → drop the cursor. Only claims the event when there is a cursor
    // to drop, so a stray Escape still reaches whatever else wants it.
    if (e.key === 'Escape') {
      if (this.state.focusedCell.get()) {
        e.preventDefault();
        e.stopPropagation();
        this.claimGridFocus();
        this.actions.clearFocusedCell();
      }
      return;
    }

    // Ctrl+Z / Cmd+Z → undo
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void this.actions.undo();
      return;
    }

    // Ctrl+Shift+Z / Cmd+Shift+Z → redo
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
      e.preventDefault();
      void this.actions.redo();
      return;
    }

    // Ctrl+Y → redo (Windows convention)
    if (e.key === 'y' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      void this.actions.redo();
      return;
    }

    // Ctrl+C / Cmd+C → copy selected rows (deferred to native text copy
    // when the user has made a text selection).
    if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const selectedRows = this.state.selectedRows.get();
      if (selectedRows.size === 0) return;
      const textSelection = window.getSelection();
      if (textSelection && textSelection.toString().length > 0) return;
      e.preventDefault();
      void this.copySelectedRows();
    }
  }

  /**
   * Whether the cursor keys belong to this keystroke.
   *
   * `false` when focus sits on a control that lives under the table root but
   * outside the grid — the filter bar, the hidden-columns gutter. Those own
   * their own Enter and Space.
   *
   * `document.body` (or nothing) focused means no other element is competing,
   * which in a browser only happens for synthetic events, since the listener
   * only ever sees keydowns targeted inside the root.
   */
  private cursorKeysApply(active: Element | null): boolean {
    if (!active || active === document.body) return true;
    if (this.gridElement.contains(active)) return true;
    return !this.rootElement.contains(active);
  }

  /**
   * Take DOM focus back to `.dt-grid` before acting on a cursor key.
   *
   * `aria-activedescendant` only describes the cursor while the element that
   * declares it holds focus, and a click parks focus on whatever inert cell
   * or scroll container it hit. Reclaiming lazily — on the first cursor
   * keystroke rather than on the click — leaves pointer interactions alone,
   * including the annotation and tooltip popovers that open on `focusin` and
   * dismiss on `focusout`.
   */
  private claimGridFocus(): void {
    const active = document.activeElement;
    if (active === this.gridElement) return;
    if (active instanceof Element && this.gridElement.contains(active)) {
      this.gridElement.focus({ preventScroll: true });
    }
  }

  // =========================================
  // Controls mode (F2)
  // =========================================

  /**
   * The header controls that currently hold real DOM focus, and where in
   * that header's control list focus sits — or `null` when focus is not on
   * one.
   *
   * Controls mode is *derived* here rather than stored in a field. A stored
   * flag has to be cleared on every path that can move focus off the button
   * — a click elsewhere, Tab, a re-render, a modal restoring focus — and
   * each missed path desyncs the state machine in a user-visible way:
   * `Space` sorting the cursor's column instead of pressing the focused
   * button, `Enter` toggling row selection, `Ctrl+Z` silently dropping the
   * mode. `document.activeElement` cannot desync, and deriving makes
   * click-focus and F2 the same state for free — which is also what lets
   * `ModalHost`'s focus-restore path behave.
   */
  private activeControls(): {
    header: ColumnHeader;
    controls: HTMLElement[];
    index: number;
  } | null {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !this.gridElement.contains(el)) return null;
    // The grid itself is never one of its headers' controls, and it is what
    // holds focus for the whole of arrow-key navigation — bail before
    // walking 266 headers on every cursor keystroke.
    if (el === this.gridElement) return null;
    for (const header of this.getColumnHeaders?.() ?? []) {
      // `contains()` before `getControls()`. This runs on every keystroke,
      // and `getControls()` resolves computed style per control — asking all
      // 266 headers of issue #84's table would be ~1,600 style resolutions
      // per key press.
      if (!header.getElement().contains(el)) continue;
      const controls = header.getControls();
      const index = controls.indexOf(el);
      return index >= 0 ? { header, controls, index } : null;
    }
    return null;
  }

  /**
   * Move real DOM focus onto the first button of a column header.
   *
   * Returns `false` (and stays out of controls mode) when the header has no
   * reachable control — at narrow container widths the responsive rules hide
   * the pin and drag buttons outright, and the hide button is disabled when
   * only one column is left.
   */
  private enterControlsMode(column: string): boolean {
    const header = this.findHeader(column);
    const controls = header?.getControls() ?? [];
    const first = controls[0];
    if (!first) return false;
    first.focus({ preventScroll: true });
    return true;
  }

  /**
   * Return focus to the grid, which is all that leaving controls mode means
   * now that the mode is derived from where focus sits.
   */
  private exitControlsMode(): void {
    this.gridElement.focus({ preventScroll: true });
  }

  /**
   * Handle a keystroke while a column-header control holds real DOM focus.
   *
   * That control owns the keyboard: Left/Right cycle the buttons, Escape
   * exits, Up/Down exit and move the cursor, and the Ctrl/Cmd shortcuts are
   * serviced here. Everything else — Enter, Space, Tab — is left entirely
   * alone so the browser performs its default: activating the focused
   * button, or walking focus out of the grid.
   *
   * @returns `true` when the caller should stop processing this event.
   */
  private handleControlsModeKey(e: KeyboardEvent): boolean {
    const active = this.activeControls();
    if (!active) return false;
    const { controls, index } = active;

    // Undo / redo / copy keep working — they were table-wide before F2
    // existed and a header button is no reason to drop them. Serviced here
    // instead of falling through to the grid handler, which would pull DOM
    // focus off the button and drop the user out of controls mode.
    if (e.ctrlKey || e.metaKey) {
      this.handleShortcut(e);
      return true;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.exitControlsMode();
      return true;
    }

    // Up / down leave controls mode and move the cursor instead of falling
    // through to the browser, which would scroll the nearest scrollable
    // ancestor out from under the user.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      this.exitControlsMode();
      return false;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      const next = (index + delta + controls.length) % controls.length;
      controls[next]!.focus({ preventScroll: true });
      return true;
    }

    return true;
  }

  private findHeader(column: string): ColumnHeader | null {
    const headers = this.getColumnHeaders?.() ?? [];
    return headers.find((h) => h.getColumn().name === column) ?? null;
  }

  // =========================================
  // Focus helpers
  // =========================================

  private getEffectiveRowCount(): number {
    const filters = this.state.filters.get();
    return filters.length > 0 ? this.state.filteredRows.get() : this.state.totalRows.get();
  }

  /** First row a cursor may occupy — body row 0, or the header if empty. */
  private firstBodyRow(): number {
    return this.getEffectiveRowCount() > 0 ? 0 : HEADER_ROW_INDEX;
  }

  /** Last row a cursor may occupy — the header when there are no rows. */
  private lastBodyRow(): number {
    return this.getEffectiveRowCount() - 1;
  }

  /**
   * Move the cursor by a relative offset.
   *
   * @param opts.enterHeaderRow - Whether the move may land on the header row.
   *   `false` for the page keys: a page jump is a body-scrolling gesture, so
   *   PageUp near the top of the data stops at row 0 rather than overshooting
   *   into the sticky header. The header stays an ArrowUp away.
   */
  private moveFocus(
    deltaRow: number,
    deltaCol: number,
    opts: { enterHeaderRow?: boolean } = {},
  ): void {
    const visibleColumns = this.state.visibleColumns.get();
    if (visibleColumns.length === 0) return;

    const current = this.state.focusedCell.get();
    let row: number;
    let colIdx: number;

    if (current) {
      row = current.row;
      colIdx = visibleColumns.indexOf(current.column);
      if (colIdx < 0) colIdx = 0;
    } else {
      row = 0;
      colIdx = 0;
    }

    // HEADER_ROW_INDEX is the top of the cursor space: ArrowUp from body row 0
    // lands on the header, ArrowDown from the header lands on body row 0, and
    // with zero rows the header is the only position that exists.
    //
    // When the header is off-limits the floor is body row 0 — unless the
    // cursor already sits on the header, where holding it there is the only
    // sane reading of PageUp, or unless there are no body rows at all.
    const highest = this.lastBodyRow();
    const lowest =
      opts.enterHeaderRow === false ? Math.min(0, row, highest) : (HEADER_ROW_INDEX as number);
    row = Math.max(lowest, Math.min(highest, row + deltaRow));
    colIdx = Math.max(0, Math.min(visibleColumns.length - 1, colIdx + deltaCol));

    // colIdx is bounded by the visibleColumns length above.
    this.setFocusAbsolute(row, visibleColumns[colIdx]!);
  }

  private setFocusAbsolute(row: number, column: string): void {
    // Every cursor move funnels through here, which makes it the one place
    // that needs `.dt-grid` to hold real focus — `aria-activedescendant`
    // only describes the cursor while the element declaring it is focused,
    // and a click parks focus on whatever inert cell it hit. Claiming here
    // rather than up front in the dispatcher is what keeps branches that do
    // not move the cursor (Tab above all) from stealing focus.
    this.claimGridFocus();
    this.actions.setFocusedCell({ row, column });
    this.scrollFocusedCellIntoView(row, column);
  }

  /**
   * Ensure the focused cell is within the visible viewport — both vertically
   * (via VirtualScroller) and horizontally (via bodyScroll), skipping pinned
   * columns which are always visible via sticky positioning.
   */
  private scrollFocusedCellIntoView(row: number, column: string): void {
    const body = this.getTableBody();
    if (!body) return;

    // Vertical — the header row is sticky chrome above the scroll container,
    // so a header cursor needs the horizontal pass only.
    if (row !== HEADER_ROW_INDEX) {
      const vs = body.getVirtualScroller();
      const viewportHeight = vs.getViewportHeight();
      const rowHeight = vs.getRowHeight();
      const scrollTop = vs.getScrollTop();
      const rowTop = row * rowHeight;
      const rowBottom = rowTop + rowHeight;

      if (rowTop < scrollTop) {
        vs.scrollToRow(row, 'start');
      } else if (rowBottom > scrollTop + viewportHeight) {
        vs.scrollToRow(row, 'end');
      }
    }

    // Horizontal (skip for pinned columns — always visible)
    const pinnedColumns = this.state.pinnedColumns.get();
    if (pinnedColumns.includes(column)) return;

    const visibleColumns = this.state.visibleColumns.get();
    const columnWidths = this.state.columnWidths.get();

    let colLeft = 0;
    for (const colName of visibleColumns) {
      if (colName === column) break;
      colLeft += columnWidths.get(colName) ?? 150;
    }
    const colWidth = columnWidths.get(column) ?? 150;
    const colRight = colLeft + colWidth;

    let pinnedWidth = 0;
    for (const pinned of pinnedColumns) {
      pinnedWidth += columnWidths.get(pinned) ?? 150;
    }

    const scrollLeft = this.bodyScroll.scrollLeft;
    const viewportWidth = this.bodyScroll.clientWidth;

    const effectiveLeft = scrollLeft + pinnedWidth;
    const effectiveRight = scrollLeft + viewportWidth;

    if (colLeft < effectiveLeft) {
      this.bodyScroll.scrollLeft = colLeft - pinnedWidth;
    } else if (colRight > effectiveRight) {
      this.bodyScroll.scrollLeft = colRight - viewportWidth;
    }
  }

  private async copySelectedRows(): Promise<void> {
    const bridge = this.getBridge?.();
    if (!bridge) return;

    const selectedRows = this.state.selectedRows.get();
    if (selectedRows.size === 0) return;

    try {
      await copyRowsToClipboard(Array.from(selectedRows), this.state, bridge);
    } catch {
      // Keyboard shortcuts fail silently — copy UI lives elsewhere.
    }
  }
}
