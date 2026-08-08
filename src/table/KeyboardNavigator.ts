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
 * buttons, Shift+F2 to enter column layout mode (resize and reorder), and
 * Ctrl+Z/Y/C.
 *
 * Column layout mode (issue #87) is the answer to the two per-column controls
 * that have no focus stop: the resize separator and the drag handle. It is a
 * modal gesture rather than two more stops — inside it the arrow keys resize,
 * Shift+arrow moves the column, Home/End hit the width bounds, Backspace
 * resets, Enter commits and Escape restores both width and position. Nothing
 * becomes focusable, so the tab-stop census does not move.
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
import { type Strings, defaultStrings } from '../core/Strings';
import type { WorkerBridge } from '../data/WorkerBridge';
import { copyRowsToClipboard } from '../export/Clipboard';
import type { ColumnHeader } from './ColumnHeader';
import { clampUnpinnedIndex } from './ColumnReorder';
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

/**
 * Pixels one arrow-key press resizes by in column layout mode.
 *
 * Big enough that crossing the 50–500 range is ~28 presses rather than ~450,
 * small enough to land on a width you meant. `Home` / `End` cover the ends.
 */
const LAYOUT_RESIZE_STEP = 16;

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
  /**
   * Write a transient message to a polite live region. Column layout mode is
   * invisible without it — a width or a new position is not something the
   * cursor announces on its own. `TableContainer.announce` is the wiring.
   */
  announce?: ((message: string) => void) | undefined;
  /** Resolved i18n strings for the live-region announcements. Defaults to English. */
  messages?: Strings | undefined;
}

/**
 * WCAG-oriented keyboard navigation controller for the table grid: arrow
 * keys, Home / End, Ctrl+Home / End, PageUp / PageDown, Enter to sort
 * (header) or select (body), F2 to reach the per-column buttons, Shift+F2 to
 * resize and reorder the column, and Ctrl/Cmd+C to copy the selection.
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
  private readonly announceMessage: ((message: string) => void) | undefined;
  private readonly messages: Strings;

  private readonly keydownHandler: (e: KeyboardEvent) => void;
  private readonly focusinHandler: (e: FocusEvent) => void;
  private readonly focusoutHandler: (e: FocusEvent) => void;
  private destroyed = false;

  /**
   * The open column-layout gesture, keyed by column **name**.
   *
   * By name and not by index or by `ColumnHeader` reference: a move rewrites
   * `visibleColumns`, which re-renders the header row and destroys every
   * `ColumnHeader` instance, so anything else would be stale one keystroke
   * into the gesture. The entry width and position are not stored here either
   * — `StateActions` holds a pre-gesture snapshot and `Escape` restores from
   * it, so there is exactly one restore path.
   */
  private layout: { column: string } | null = null;

  constructor(opts: KeyboardNavigatorOptions) {
    this.rootElement = opts.rootElement;
    this.gridElement = opts.gridElement ?? opts.rootElement;
    this.bodyScroll = opts.bodyScroll;
    this.state = opts.state;
    this.actions = opts.actions;
    this.getTableBody = opts.getTableBody;
    this.getColumnHeaders = opts.getColumnHeaders;
    this.getBridge = opts.getBridge;
    this.announceMessage = opts.announce;
    this.messages = opts.messages ?? defaultStrings;

    this.keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.rootElement.addEventListener('keydown', this.keydownHandler);

    // Layout mode is the one piece of keyboard state with no DOM-focus
    // correlate, so it has to be stored — and a stored flag desyncs unless
    // every path that ends the gesture is covered. Focus moving off `.dt-grid`
    // is such a path: onto a header button (F2 controls mode, or a click), or
    // out of the grid entirely with Tab. Both commit rather than cancel —
    // walking away from a gesture reads as "I'm done", not "undo that".
    this.focusinHandler = (e: FocusEvent) => {
      if (e.target !== this.gridElement) this.exitLayoutMode('commit');
    };
    this.focusoutHandler = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (next instanceof Node && this.gridElement.contains(next)) return;
      this.exitLayoutMode('commit');
    };
    this.gridElement.addEventListener('focusin', this.focusinHandler);
    this.gridElement.addEventListener('focusout', this.focusoutHandler);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    // Drop any open gesture without touching StateActions: destroy() runs
    // during teardown, where the action layer may already be destroyed and
    // every mutator throws.
    this.layout = null;
    this.rootElement.removeEventListener('keydown', this.keydownHandler);
    this.gridElement.removeEventListener('focusin', this.focusinHandler);
    this.gridElement.removeEventListener('focusout', this.focusoutHandler);
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

    // Re-derive whether the stored layout gesture is still valid before
    // anything is allowed to consult it.
    this.validateLayoutMode();

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

    // An open column-layout gesture owns the arrow keys, Home / End,
    // Backspace, Enter and Escape. Everything else it leaves alone.
    if (this.handleLayoutModeKey(e)) return;

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
    // Shift+F2 is the sibling gesture for the two controls that deliberately
    // have no focus stop: column resize and column reorder.
    if (e.key === 'F2' && onHeader && focused) {
      const entered = e.shiftKey
        ? this.enterLayoutMode(focused.column)
        : this.enterControlsMode(focused.column);
      if (entered) {
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
  // Column layout mode (Shift+F2)
  // =========================================

  /**
   * Open a column-layout gesture on the cursor's column.
   *
   * Nothing becomes focusable: the mode is a state machine here and real DOM
   * focus stays on `.dt-grid` throughout. That is what keeps the tab-stop
   * census flat and sidesteps the ARIA rule that a focusable
   * `role="separator"` must carry `aria-valuenow` / `min` / `max`.
   *
   * @returns `false` when there is no live header for the column, in which
   *   case the keystroke is left entirely alone.
   */
  private enterLayoutMode(column: string): boolean {
    const header = this.findHeader(column);
    if (!header) return false;
    // Shift+F2 on the column already in the mode toggles it off.
    if (this.layout?.column === column) {
      this.exitLayoutMode('commit');
      return true;
    }
    this.exitLayoutMode('commit');
    this.claimGridFocus();
    this.actions.beginColumnLayoutChange();
    this.layout = { column };
    this.syncLayoutAffordance();
    this.announce(this.messages.a11y.columnLayoutModeEntered(column));
    return true;
  }

  /**
   * Close an open gesture. `'commit'` keeps the result and pushes one undo
   * entry (none at all if nothing changed); `'cancel'` restores the entry
   * width and position and pushes nothing.
   */
  private exitLayoutMode(mode: 'commit' | 'cancel'): void {
    const layout = this.layout;
    if (!layout || this.destroyed) return;
    this.layout = null;

    const a = this.messages.a11y;
    if (mode === 'cancel') {
      this.actions.cancelColumnLayoutChange();
      this.announce(a.columnLayoutCancelled(layout.column));
    } else {
      this.actions.endColumnLayoutChange();
      this.announce(a.columnLayoutCommitted(layout.column));
    }
    // After the restore, not before: cancelling rewrites the column order,
    // which rebuilds every header.
    this.syncLayoutAffordance();
  }

  /**
   * Drop a gesture the rest of the world has moved out from under.
   *
   * Runs before the stored mode is consulted on every keystroke. The gesture
   * ends when the cursor is no longer parked on its column in the header row,
   * when the column stops being visible (a hide, an undo, a data load), or
   * when real focus has landed on a header control — which is F2 controls
   * mode, and the two modes must not both think they own the arrow keys.
   */
  private validateLayoutMode(): void {
    const layout = this.layout;
    if (!layout) return;
    const focused = this.state.focusedCell.get();
    const stale =
      !focused ||
      focused.row !== HEADER_ROW_INDEX ||
      focused.column !== layout.column ||
      !this.state.visibleColumns.get().includes(layout.column) ||
      this.activeControls() !== null;
    if (stale) this.exitLayoutMode('commit');
  }

  /**
   * Handle a keystroke while a column-layout gesture is open.
   *
   * Mirrors {@link KeyboardNavigator.handleControlsModeKey}: returns `true`
   * when the caller should stop processing, `preventDefault()`s only the keys
   * it acts on, and leaves `Tab` and the Ctrl/Cmd shortcuts alone so they
   * behave exactly as they do outside the mode.
   */
  private handleLayoutModeKey(e: KeyboardEvent): boolean {
    const layout = this.layout;
    if (!layout) return false;

    // Undo / redo / copy stay table-wide, and Alt-modified keys belong to the
    // OS. Neither is a layout key.
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.exitLayoutMode('cancel');
        return true;

      case 'Enter':
        e.preventDefault();
        this.exitLayoutMode('commit');
        return true;

      case 'F2':
        // Shift+F2 toggles the mode off. Bare F2 commits and falls through to
        // the dispatcher, which enters controls mode — the two gestures stay
        // one keystroke apart.
        this.exitLayoutMode('commit');
        if (e.shiftKey) {
          e.preventDefault();
          return true;
        }
        return false;

      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const direction = e.key === 'ArrowLeft' ? -1 : 1;
        if (e.shiftKey) {
          this.moveLayoutColumn(direction);
        } else {
          this.resizeLayoutColumn(direction * LAYOUT_RESIZE_STEP);
        }
        return true;
      }

      case 'Home':
      case 'End': {
        e.preventDefault();
        const toEnd = e.key === 'End';
        if (e.shiftKey) {
          this.moveLayoutColumnToEdge(toEnd);
        } else {
          const header = this.findHeader(layout.column);
          if (header) {
            const bounds = header.getWidthBounds();
            this.applyLayoutWidth(header, toEnd ? bounds.max : bounds.min);
          }
        }
        return true;
      }

      case 'Backspace': {
        // The keyboard twin of double-clicking the resize handle.
        e.preventDefault();
        this.claimGridFocus();
        this.actions.resetColumnWidth(layout.column);
        const header = this.findHeader(layout.column);
        this.announce(
          this.messages.a11y.columnWidthAnnouncement(layout.column, header?.getWidth() ?? 150),
        );
        return true;
      }

      default:
        // Tab above all, but also ArrowUp / ArrowDown, which fall through to
        // the cursor keys and end the gesture by moving off the column.
        return false;
    }
  }

  /** Apply a width through the header so the 50–500 clamp stays in one place. */
  private applyLayoutWidth(header: ColumnHeader, px: number): void {
    this.claimGridFocus();
    const applied = header.setWidth(px);
    const { min, max } = header.getWidthBounds();
    const a = this.messages.a11y;
    const column = header.getColumn().name;
    this.announce(
      applied <= min
        ? a.columnWidthAtMinimum(column, applied)
        : applied >= max
          ? a.columnWidthAtMaximum(column, applied)
          : a.columnWidthAnnouncement(column, applied),
    );
  }

  private resizeLayoutColumn(deltaPx: number): void {
    const layout = this.layout;
    if (!layout) return;
    const header = this.findHeader(layout.column);
    if (!header) return;
    this.applyLayoutWidth(header, header.getWidth() + deltaPx);
  }

  /** Move the gesture's column one position left (-1) or right (+1). */
  private moveLayoutColumn(direction: -1 | 1): void {
    const layout = this.layout;
    if (!layout) return;
    const visible = this.state.visibleColumns.get();
    const from = visible.indexOf(layout.column);
    if (from === -1) return;
    this.moveLayoutColumnTo(from + direction);
  }

  /** `Shift+Home` / `Shift+End` — the first and last positions a move may reach. */
  private moveLayoutColumnToEdge(toEnd: boolean): void {
    const layout = this.layout;
    if (!layout) return;
    const visible = this.state.visibleColumns.get();
    if (visible.indexOf(layout.column) === -1) return;
    this.moveLayoutColumnTo(toEnd ? visible.length : 0);
  }

  /**
   * Splice the gesture's column to `desiredIndex`, clamped out of the pinned
   * block, and announce where it landed.
   *
   * Pinned columns are refused outright rather than silently working: the
   * mouse cannot drag them either (the drag handle is `pointer-events: none`
   * while pinned), and a keyboard path that works where the mouse does not is
   * a different feature, not an accessibility fix.
   */
  private moveLayoutColumnTo(desiredIndex: number): void {
    const layout = this.layout;
    if (!layout) return;
    const a = this.messages.a11y;
    const pinned = this.state.pinnedColumns.get();
    if (pinned.includes(layout.column)) {
      this.announce(a.columnMoveBlockedPinned(layout.column));
      return;
    }

    const visible = this.state.visibleColumns.get();
    const from = visible.indexOf(layout.column);
    if (from === -1) return;

    const rest = visible.filter((c) => c !== layout.column);
    const target = clampUnpinnedIndex(desiredIndex, rest, pinned);
    if (target === from) return;

    const next = [...rest];
    next.splice(target, 0, layout.column);

    this.claimGridFocus();
    this.actions.setColumnOrder(next);
    // setColumnOrder re-renders the header row, which destroys and rebuilds
    // every ColumnHeader — the affordance has to be re-applied, and the
    // column has moved out from under the cursor.
    this.syncLayoutAffordance();
    this.scrollFocusedCellIntoView(HEADER_ROW_INDEX, layout.column);
    this.announce(a.columnMovedAnnouncement(layout.column, target + 1, next.length));
  }

  /** Put the layout outline on the gesture's header, and nowhere else. */
  private syncLayoutAffordance(): void {
    const column = this.layout?.column ?? null;
    for (const header of this.getColumnHeaders?.() ?? []) {
      header.setLayoutMode(header.getColumn().name === column);
    }
  }

  private announce(message: string): void {
    this.announceMessage?.(message);
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
    // A cursor move is the other way out of column layout mode: the gesture
    // belongs to the column it opened on, so walking off it commits now
    // rather than on the next keystroke.
    this.validateLayoutMode();
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
      const scrollTop = vs.getVirtualScrollTop();
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

    // Column geometry comes from the body's own cached prefix sums — the same
    // rounded widths it draws the cells and the spacers with, so scrolling to
    // `left` lands exactly where the column is. The two O(N) loops this
    // replaced summed *raw* widths, and the pinned one summed them over
    // `pinnedColumns`, which still lists columns `hideColumn` has removed from
    // view — one hidden pinned column pushed every target 150 px too far.
    const span = body.getColumnSpan(column);
    if (!span) return;
    const colLeft = span.left;
    const colRight = colLeft + span.width;
    const pinnedWidth = body.getPinnedWidthPx();

    const scrollLeft = this.bodyScroll.scrollLeft;
    const viewportWidth = this.bodyScroll.clientWidth;

    const effectiveLeft = scrollLeft + pinnedWidth;
    const effectiveRight = scrollLeft + viewportWidth;

    if (colLeft < effectiveLeft) {
      this.bodyScroll.scrollLeft = colLeft - pinnedWidth;
    } else if (colRight > effectiveRight) {
      this.bodyScroll.scrollLeft = colRight - viewportWidth;
    } else {
      return;
    }

    // The body renders only the horizontally visible column window, and the
    // browser does not dispatch `scroll` until this task ends — so without
    // this the cell the cursor just moved to would not exist yet, and
    // `syncActiveDescendant` (which resolves it by id) would drop the cursor
    // for a frame. Synchronous by design.
    body.refreshColumnWindow();
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
