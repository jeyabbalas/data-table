/**
 * KeyboardNavigator — grid keyboard navigation controller.
 *
 * Owns the keydown listener on the grid root element and translates keystrokes
 * into state mutations via StateActions. Extracted from TableContainer so that
 * the ~200 LOC of keyboard logic lives in one cohesive unit and can be tested
 * in isolation.
 *
 * Handles: Arrow navigation, Home/End (and Ctrl variants), PageUp/PageDown,
 * Tab/Shift+Tab cell walk, Escape to clear focus, Enter to toggle row
 * selection, Ctrl+C to copy selected rows, Ctrl+Z/Y undo-redo.
 *
 * Defers to any open ModalHost dialog/panel so modal focus traps are not
 * interfered with.
 */

import type { StateActions } from '../core/Actions';
import { isAnyModalOpen } from '../core/ModalHost';
import type { TableState } from '../core/State';
import type { WorkerBridge } from '../data/WorkerBridge';
import { copyRowsToClipboard } from '../export/Clipboard';
import type { TableBody } from './TableBody';

export interface KeyboardNavigatorOptions {
  /** Grid root element that owns focus and receives keydown events. */
  rootElement: HTMLElement;
  /** Body horizontal-scroll container (for horizontal cell scroll). */
  bodyScroll: HTMLElement;
  /** Reactive state for the grid. */
  state: TableState;
  /** State mutation surface. */
  actions: StateActions;
  /** Late-bound accessor for the TableBody (may be recreated on data loads). */
  getTableBody: () => TableBody | null;
  /** Optional bridge for clipboard copy; when absent, Ctrl+C is a no-op. */
  getBridge?: () => WorkerBridge | undefined;
}

export class KeyboardNavigator {
  private readonly rootElement: HTMLElement;
  private readonly bodyScroll: HTMLElement;
  private readonly state: TableState;
  private readonly actions: StateActions;
  private readonly getTableBody: () => TableBody | null;
  private readonly getBridge: (() => WorkerBridge | undefined) | undefined;

  private readonly keydownHandler: (e: KeyboardEvent) => void;
  private destroyed = false;

  constructor(opts: KeyboardNavigatorOptions) {
    this.rootElement = opts.rootElement;
    this.bodyScroll = opts.bodyScroll;
    this.state = opts.state;
    this.actions = opts.actions;
    this.getTableBody = opts.getTableBody;
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
      const rowCount = this.getEffectiveRowCount();
      if (visibleColumns.length === 0 || rowCount === 0) return;

      const current = this.state.focusedCell.get();
      if (e.ctrlKey || e.metaKey) {
        this.setFocusAbsolute(0, visibleColumns[0]);
      } else {
        const row = current?.row ?? 0;
        this.setFocusAbsolute(row, visibleColumns[0]);
      }
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      const visibleColumns = this.state.visibleColumns.get();
      const rowCount = this.getEffectiveRowCount();
      if (visibleColumns.length === 0 || rowCount === 0) return;

      const current = this.state.focusedCell.get();
      const lastCol = visibleColumns[visibleColumns.length - 1];
      if (e.ctrlKey || e.metaKey) {
        this.setFocusAbsolute(rowCount - 1, lastCol);
      } else {
        const row = current?.row ?? 0;
        this.setFocusAbsolute(row, lastCol);
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
      this.moveFocus(delta, 0);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      this.moveFocusTab(e.shiftKey);
      return;
    }

    if (e.key === 'Escape') {
      if (this.state.focusedCell.get()) {
        e.preventDefault();
        e.stopPropagation();
        this.actions.clearFocusedCell();
      }
      return;
    }

    // Enter on a focused cell toggles row selection. Using 'toggle' mode
    // means keyboard users can build up a selection without Shift+click.
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      const focused = this.state.focusedCell.get();
      if (focused) {
        e.preventDefault();
        this.actions.selectRow(focused.row, 'toggle');
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

  // =========================================
  // Focus helpers
  // =========================================

  private getEffectiveRowCount(): number {
    const filters = this.state.filters.get();
    return filters.length > 0 ? this.state.filteredRows.get() : this.state.totalRows.get();
  }

  private moveFocus(deltaRow: number, deltaCol: number): void {
    const visibleColumns = this.state.visibleColumns.get();
    const rowCount = this.getEffectiveRowCount();
    if (visibleColumns.length === 0 || rowCount === 0) return;

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

    row = Math.max(0, Math.min(rowCount - 1, row + deltaRow));
    colIdx = Math.max(0, Math.min(visibleColumns.length - 1, colIdx + deltaCol));

    this.setFocusAbsolute(row, visibleColumns[colIdx]);
  }

  private moveFocusTab(reverse: boolean): void {
    const visibleColumns = this.state.visibleColumns.get();
    const rowCount = this.getEffectiveRowCount();
    if (visibleColumns.length === 0 || rowCount === 0) return;

    const current = this.state.focusedCell.get();
    let row: number;
    let colIdx: number;

    if (current) {
      row = current.row;
      colIdx = visibleColumns.indexOf(current.column);
      if (colIdx < 0) colIdx = 0;
    } else {
      if (reverse) {
        this.setFocusAbsolute(rowCount - 1, visibleColumns[visibleColumns.length - 1]);
      } else {
        this.setFocusAbsolute(0, visibleColumns[0]);
      }
      return;
    }

    if (reverse) {
      colIdx--;
      if (colIdx < 0) {
        if (row > 0) {
          row--;
          colIdx = visibleColumns.length - 1;
        } else {
          return;
        }
      }
    } else {
      colIdx++;
      if (colIdx >= visibleColumns.length) {
        if (row < rowCount - 1) {
          row++;
          colIdx = 0;
        } else {
          return;
        }
      }
    }

    this.setFocusAbsolute(row, visibleColumns[colIdx]);
  }

  private setFocusAbsolute(row: number, column: string): void {
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

    const vs = body.getVirtualScroller();

    // Vertical
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
