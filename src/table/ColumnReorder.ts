/**
 * ColumnReorder - Handles column drag-and-drop reordering
 *
 * Allows users to drag column headers to reorder columns in the table.
 *
 * Features:
 * - Drag column headers to reorder
 * - Visual drop indicator showing insertion point
 * - Movement threshold to distinguish drag from click
 * - Works alongside resize handles (doesn't conflict)
 */

import type { ColumnLayout } from './ColumnLayout';

/**
 * Options for configuring the ColumnReorder
 */
export interface ColumnReorderOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string | undefined;
  /** Movement threshold in pixels to start drag (default: 5) */
  dragThreshold?: number | undefined;
  /**
   * Late-bound accessor for the currently pinned columns. Used to keep a drop
   * out of the pinned block (see {@link clampUnpinnedIndex}); when omitted,
   * no clamping is applied.
   */
  getPinnedColumns?: (() => readonly string[]) | undefined;
  /**
   * Keep the dragged column mounted until the returned release is called,
   * from the press on its drag handle to the drop. `TableContainer` passes its
   * column window controller's.
   *
   * @internal
   */
  holdColumn?: ((column: string) => () => void) | undefined;
  /**
   * Late-bound accessor for the table's column layout. With it, a drop is
   * found from the layout and the header scroll rather than from header
   * rects: a pinned header is sticky, and the unpinned headers scrolled
   * beneath it have rects under the pointer too, later in DOM order.
   * `TableContainer` passes its own; without one, drops go by header rects.
   *
   * @internal
   */
  getLayout?: (() => ColumnLayout) | undefined;
}

/**
 * Callback invoked when columns are reordered.
 *
 * @param newOrder - The full presented order after the drop.
 * @param movedColumn - The column that was dragged. Derivable from `newOrder`
 *   only ambiguously (a single move looks like a rotation of everything
 *   between the two positions), so it is passed explicitly for announcements.
 */
export type ReorderCallback = (newOrder: string[], movedColumn: string) => void;

/**
 * Clamp an insertion index so an unpinned column cannot land inside the
 * pinned block.
 *
 * Pinned columns are assumed to occupy the leading positions of the presented
 * order — the sticky `left` offsets (`ColumnLayout.pinnedPlacement`) are the
 * widths of the pinned columns before each one, which is where it sits only
 * while nothing unpinned comes between them. Dropping an unpinned column at
 * index 0 of a table with two pinned columns would put it under both.
 *
 * @param index - Desired insertion index into `columns`.
 * @param columns - The presented order the column will be spliced into, with
 *   the moved column already removed.
 * @param pinnedColumns - Currently pinned column names.
 * @returns `index` clamped to `[pinnedPrefixLength, columns.length]`.
 *
 * @example
 * ```typescript
 * clampUnpinnedIndex(0, ['id', 'name', 'qty'], ['id']); // → 1
 * ```
 */
export function clampUnpinnedIndex(
  index: number,
  columns: readonly string[],
  pinnedColumns: readonly string[],
): number {
  const pinned = new Set(pinnedColumns);
  let prefix = 0;
  while (prefix < columns.length && pinned.has(columns[prefix]!)) prefix++;
  return Math.max(prefix, Math.min(columns.length, index));
}

/**
 * ColumnReorder manages drag-and-drop column reordering for a header row.
 *
 * @example
 * ```typescript
 * const reorder = new ColumnReorder(
 *   headerRowEl,
 *   (newOrder) => actions.setColumnOrder(newOrder),
 *   { classPrefix: 'dt' }
 * );
 *
 * // After headers are added:
 * reorder.refresh();
 *
 * // Later, clean up
 * reorder.destroy();
 * ```
 */
export class ColumnReorder {
  private dropIndicator: HTMLElement | null = null;
  private isDragging = false;
  private isPotentialDrag = false;
  private draggedHeader: HTMLElement | null = null;
  private draggedColumn: string | null = null;
  private startX = 0;
  private startY = 0;
  /** The pointer's latest x, for a drop position recomputed on scroll. */
  private lastClientX = 0;
  private dropIndex = -1;
  private destroyed = false;
  private enabled = true;

  private readonly classPrefix: string;
  private readonly dragThreshold: number;
  private readonly getPinnedColumns: (() => readonly string[]) | undefined;
  private readonly holdColumn: ((column: string) => () => void) | undefined;
  private readonly getLayout: (() => ColumnLayout) | undefined;
  /** Releases the hold on the dragged column, from the press to the drop. */
  private releaseHold: (() => void) | null = null;

  // Bound event handlers for proper cleanup
  private readonly boundMouseDown: (e: MouseEvent) => void;
  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseUp: (e: MouseEvent) => void;
  private readonly boundScroll: (e: Event) => void;
  private readonly boundCancel: () => void;
  private readonly boundVisibilityChange: () => void;
  /** The shadow root the table is in, while a drag listens to its scrolls. */
  private shadowScrollRoot: ShadowRoot | null = null;

  // Resolved at drag start so we can scope the drag classes to the table
  // root instead of polluting <body>.
  private dragScope: HTMLElement | null = null;

  constructor(
    private headerRow: HTMLElement,
    private onReorder: ReorderCallback,
    options: ColumnReorderOptions = {},
  ) {
    this.classPrefix = options.classPrefix ?? 'dt';
    this.dragThreshold = options.dragThreshold ?? 5;
    this.getPinnedColumns = options.getPinnedColumns;
    this.holdColumn = options.holdColumn;
    this.getLayout = options.getLayout;

    // Bind document-level handlers
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundScroll = this.handleScroll.bind(this);
    this.boundCancel = () => {
      if (!this.destroyed) this.cancelDrag();
    };
    this.boundVisibilityChange = () => {
      if (document.visibilityState === 'hidden') this.boundCancel();
    };

    // Create drop indicator element
    this.createDropIndicator();

    // One listener on the row for every header, present and future: headers
    // come and go with the columns, and a drag handle with its column's
    // controls.
    this.headerRow.addEventListener('mousedown', this.boundMouseDown);
  }

  /**
   * Resolve the table root element that should carry the drag classes.
   * Falls back to `<body>` only if no ancestor with the root class is found
   * (should not happen in normal usage, but keeps behavior safe).
   */
  private resolveDragScope(): HTMLElement {
    if (this.dragScope) return this.dragScope;
    const root = this.headerRow.closest(`.${this.classPrefix}-root`);
    this.dragScope = (root as HTMLElement) ?? document.body;
    return this.dragScope;
  }

  // =========================================
  // Drop Indicator
  // =========================================

  /**
   * Create the drop indicator element
   */
  private createDropIndicator(): void {
    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = `${this.classPrefix}-drop-indicator`;
    this.dropIndicator.style.display = 'none';
  }

  /**
   * Show the drop indicator `left` px from the start of the header row, in
   * the row's own pixels.
   */
  private showDropIndicator(left: number): void {
    if (!this.dropIndicator || !this.headerRow) return;

    // The header-row element (the direct container of column headers)
    const container = this.getRowContainer();

    // Ensure indicator is in the correct container
    if (this.dropIndicator.parentNode !== container) {
      container.appendChild(this.dropIndicator);
    }

    this.dropIndicator.style.left = `${left}px`;
    this.dropIndicator.style.display = 'block';
  }

  /**
   * Hide the drop indicator
   */
  private hideDropIndicator(): void {
    if (this.dropIndicator) {
      this.dropIndicator.style.display = 'none';
      // Out of the row too. The row outlives renders, and left in it the
      // indicator would be its last child, the place
      // `.dt-col-header:last-child` expects the last header in.
      this.dropIndicator.remove();
    }
  }

  // =========================================
  // Drag Handling
  // =========================================

  /**
   * Handle mousedown on a column header
   */
  private handleMouseDown(event: MouseEvent): void {
    if (this.destroyed || !this.enabled) return;

    const target = event.target as HTMLElement;

    // Only start drag if clicking on the drag handle
    const dragHandle = target.closest(`.${this.classPrefix}-col-drag-handle`);
    if (!dragHandle) return;

    // Find the column header
    const header = target.closest(`.${this.classPrefix}-col-header`) as HTMLElement;
    if (!header) return;

    // Get column name
    const columnName = header.getAttribute('data-column');
    if (!columnName) return;

    // Start potential drag (need to move past threshold first)
    this.isPotentialDrag = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.lastClientX = event.clientX;
    this.draggedHeader = header;
    this.draggedColumn = columnName;
    this.releaseHold?.();
    this.releaseHold = this.holdColumn?.(columnName) ?? null;

    // Add class to show grabbing cursor immediately (scoped to table root).
    this.resolveDragScope().classList.add(`${this.classPrefix}-column-potential-drag`);

    // Prevent text selection during potential drag
    event.preventDefault();

    // Add document-level listeners
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
    // A release this document never hears, made after an alt-tab in another
    // window, would leave the drag alive until the next press anywhere
    // dropped the column. Losing the window, the page or the pointer ends the
    // drag instead, without a drop.
    window.addEventListener('blur', this.boundCancel);
    document.addEventListener('visibilitychange', this.boundVisibilityChange);
    document.addEventListener('pointercancel', this.boundCancel);
  }

  /** Remove the listeners a press adds, the drag's included. */
  private stopListening(): void {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('blur', this.boundCancel);
    document.removeEventListener('visibilitychange', this.boundVisibilityChange);
    document.removeEventListener('pointercancel', this.boundCancel);
  }

  /**
   * End a press or a drag without a drop: the order stays as it was, and the
   * dragged column's hold is let go.
   */
  private cancelDrag(): void {
    this.stopListening();
    this.resetDragState();
  }

  /**
   * Handle mouse move during drag
   */
  private handleMouseMove(event: MouseEvent): void {
    if (this.destroyed) return;

    // No button held on a real move: it was let go where this document could
    // not hear it, in another window after an alt-tab. Nothing was dropped.
    // A synthetic move, as a host's test harness sends, says nothing about
    // the button: its `buttons` is 0 unless set.
    if (event.isTrusted && event.buttons === 0) {
      this.cancelDrag();
      return;
    }

    event.preventDefault();
    this.lastClientX = event.clientX;

    if (this.isPotentialDrag && !this.isDragging) {
      // Check if we've moved past the threshold
      const deltaX = Math.abs(event.clientX - this.startX);
      const deltaY = Math.abs(event.clientY - this.startY);

      if (deltaX > this.dragThreshold || deltaY > this.dragThreshold) {
        // Start actual drag
        this.startDrag();
      }
      return;
    }

    if (!this.isDragging) return;

    // Update drop position
    this.updateDropPosition(event.clientX);
  }

  /**
   * Start the actual drag operation
   */
  private startDrag(): void {
    this.isDragging = true;
    this.isPotentialDrag = false;

    // Add visual feedback (scoped to table root).
    this.resolveDragScope().classList.add(`${this.classPrefix}-column-dragging`);
    this.draggedHeader?.classList.add(`${this.classPrefix}-col-header--dragging`);

    // The headers can scroll under a pointer that stays put: a wheel or a
    // trackpad with the button held. Scroll events neither bubble nor leave a
    // shadow root, so this listens in the capture phase, on the document and
    // on the table's shadow root if it is in one.
    document.addEventListener('scroll', this.boundScroll, true);
    const root = this.headerRow.getRootNode();
    if (root instanceof ShadowRoot) {
      root.addEventListener('scroll', this.boundScroll, true);
      this.shadowScrollRoot = root;
    }
  }

  /**
   * Keep the drop position under the pointer while the headers scroll beneath
   * it. It came from the last mouse move alone, so a column dragged, wheeled
   * to somewhere far off and released without moving the pointer dropped
   * where the pointer had been before the scroll.
   */
  private handleScroll(event: Event): void {
    if (this.destroyed || !this.isDragging) return;
    // Only a scroll that can move the headers: of the header scroller or
    // another of their ancestors, or of the page. Not a sidebar's, nor the
    // body's, whose scroll reaches the headers as a header scroll anyway.
    const target = event.target;
    if (!(target instanceof Node) || !target.contains(this.headerRow)) return;
    this.updateDropPosition(this.lastClientX);
  }

  /**
   * Update the drop position based on mouse X coordinate
   */
  private updateDropPosition(clientX: number): void {
    if (!this.headerRow || !this.draggedColumn) return;

    const layout = this.getLayout?.();
    const drop = layout ? this.dropFromLayout(clientX, layout) : this.dropFromHeaders(clientX);
    if (!drop) return;

    // Update drop indicator
    this.dropIndex = drop.index;
    this.showDropIndicator(drop.left);
  }

  /**
   * How many screen pixels one of the header row's own pixels takes: 1 unless
   * an ancestor is scaled, by a `transform` or CSS `zoom`. Rects are scaled;
   * offsets, scroll positions and the layout's widths are not.
   */
  private rowScale(row: HTMLElement, rect: DOMRect): number {
    return row.offsetWidth > 0 && rect.width > 0 ? rect.width / row.offsetWidth : 1;
  }

  /**
   * The gap before the first header whose middle is past the pointer, in DOM
   * order, and where it is in the row: a header's left edge, or the last
   * one's right edge.
   */
  private dropFromHeaders(clientX: number): { index: number; left: number } | null {
    const headers = this.getHeaderElements();
    if (headers.length === 0) return null;
    const row = this.getRowContainer();
    const rowRect = row.getBoundingClientRect();
    const toRow = (x: number) => (x - rowRect.left) / this.rowScale(row, rowRect);

    for (let i = 0; i < headers.length; i++) {
      const rect = headers[i]!.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return { index: i, left: toRow(rect.left) };
      // After the last column
      if (i === headers.length - 1) return { index: headers.length, left: toRow(rect.right) };
    }
    return null;
  }

  /**
   * The gap to drop into, as an index into the layout's columns, and where it
   * is in the header row, from the layout and the header scroll.
   *
   * An unpinned column drops before or after the column under the pointer,
   * in layout coordinates, and never before the first unpinned column still
   * in view: let go on the pinned block, which stays at the left edge of the
   * viewport however far the rest has scrolled, it lands at the block's
   * edge, not among the columns scrolled out of view beneath it. The pointer
   * counts only inside the viewport, and the indicator shows where the
   * column will land, or the block's edge for a column the block half
   * covers. Pinned columns do not move, as in `endDrag`: no gap for them.
   */
  private dropFromLayout(
    clientX: number,
    layout: ColumnLayout,
  ): { index: number; left: number } | null {
    const count = layout.columns.length;
    const dragged = layout.indexOf(this.draggedColumn!);
    const { pinnedCount, pinnedWidth } = layout;
    if (count === 0 || dragged === -1 || dragged < pinnedCount) return null;

    const row = this.getRowContainer();
    const rowRect = row.getBoundingClientRect();
    const scale = this.rowScale(row, rowRect);
    const scroller = this.headerRow.closest<HTMLElement>(`.${this.classPrefix}-header-scroll`);
    const scrollLeft = scroller?.scrollLeft ?? 0;
    const viewWidth = scroller ? scroller.clientWidth : Infinity;
    // The pointer's offset into the header viewport, in the layout's pixels.
    const viewLeft = scroller
      ? scroller.getBoundingClientRect().left + scroller.clientLeft * scale
      : rowRect.left;
    const x = Math.min(Math.max((clientX - viewLeft) / scale, 0), viewWidth);

    /** The gap nearest `at` among the columns `[from, to)`, by their middles. */
    const gapAt = (at: number, from: number, to: number): number => {
      for (let i = from; i < to; i++) {
        if (at < layout.leftAt(i) + layout.widthAt(i) / 2) return i;
      }
      return to;
    };

    // The first unpinned column not wholly beneath the pinned block.
    let first = pinnedCount;
    while (
      first < count &&
      layout.leftAt(first) + layout.widthAt(first) <= pinnedWidth + scrollLeft
    ) {
      first++;
    }
    const index = Math.max(gapAt(x + scrollLeft, pinnedCount, count), first);
    return {
      index,
      left: Math.min(
        Math.max(layout.leftAt(index), scrollLeft + pinnedWidth),
        scrollLeft + viewWidth,
      ),
    };
  }

  /**
   * Handle mouse up to end drag
   */
  private handleMouseUp(event: MouseEvent): void {
    if (this.destroyed) return;

    event.preventDefault();

    // Remove document listeners
    this.stopListening();

    if (this.isDragging) {
      // Once more, against the headers as they are now: they may have moved
      // in ways no scroll event reported, such as a resize.
      this.updateDropPosition(this.lastClientX);
      this.endDrag();
    } else {
      // Was just a potential drag (click), reset
      this.resetDragState();
    }
  }

  /**
   * End the drag operation and apply reordering
   */
  private endDrag(): void {
    if (!this.draggedColumn) {
      this.resetDragState();
      return;
    }

    // Get current column order: the one the drop index was taken against.
    const layout = this.getLayout?.();
    const currentOrder = layout
      ? [...layout.columns]
      : this.getHeaderElements()
          .map((h) => h.getAttribute('data-column')!)
          .filter(Boolean);

    // Calculate new order
    const draggedIndex = currentOrder.indexOf(this.draggedColumn);
    if (
      draggedIndex !== -1 &&
      this.dropIndex !== -1 &&
      this.dropIndex !== draggedIndex &&
      this.dropIndex !== draggedIndex + 1
    ) {
      // Remove from current position
      const newOrder = [...currentOrder];
      newOrder.splice(draggedIndex, 1);

      // Calculate adjusted insert index (account for removal)
      let insertIndex = this.dropIndex;
      if (draggedIndex < this.dropIndex) {
        insertIndex--;
      }

      // The drop position comes from raw header midpoints, which happily
      // point inside the pinned block. Landing there desyncs every sticky
      // `left` offset, all of which assume the pinned columns lead.
      insertIndex = clampUnpinnedIndex(insertIndex, newOrder, this.getPinnedColumns?.() ?? []);

      if (insertIndex !== draggedIndex) {
        // Insert at new position
        newOrder.splice(insertIndex, 0, this.draggedColumn);

        // Notify callback
        this.onReorder(newOrder, this.draggedColumn);
      }
    }

    this.resetDragState();
  }

  /**
   * Reset all drag state
   */
  private resetDragState(): void {
    document.removeEventListener('scroll', this.boundScroll, true);
    this.shadowScrollRoot?.removeEventListener('scroll', this.boundScroll, true);
    this.shadowScrollRoot = null;

    // Remove visual feedback (from the same scope we added it to).
    const scope = this.resolveDragScope();
    scope.classList.remove(`${this.classPrefix}-column-dragging`);
    scope.classList.remove(`${this.classPrefix}-column-potential-drag`);
    this.draggedHeader?.classList.remove(`${this.classPrefix}-col-header--dragging`);
    this.hideDropIndicator();

    // Reset state
    this.isDragging = false;
    this.isPotentialDrag = false;
    this.draggedHeader = null;
    this.draggedColumn = null;
    this.dropIndex = -1;
    this.releaseHold?.();
    this.releaseHold = null;
  }

  // =========================================
  // Header Management
  // =========================================

  /**
   * Get all column header elements in order
   */
  private getHeaderElements(): HTMLElement[] {
    if (!this.headerRow) return [];
    return Array.from(this.getRowContainer().querySelectorAll(`.${this.classPrefix}-col-header`));
  }

  /** The element the headers are laid out in: the header row, when there is one. */
  private getRowContainer(): HTMLElement {
    return (
      this.headerRow.querySelector<HTMLElement>(`.${this.classPrefix}-header-row`) ?? this.headerRow
    );
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Enable column reordering
   */
  enable(): void {
    if (this.destroyed) return;
    this.enabled = true;
  }

  /**
   * Disable column reordering
   */
  disable(): void {
    this.enabled = false;
    this.cancelDrag();
  }

  /**
   * Mark headers added since the last call as not natively draggable. The
   * press that starts a drag is heard on the header row, so a new header
   * needs nothing else.
   */
  refresh(): void {
    if (this.destroyed) return;
    for (const header of this.getHeaderElements()) {
      if (!header.hasAttribute('draggable')) header.setAttribute('draggable', 'false');
    }
  }

  /**
   * Check if currently dragging
   */
  isDraggingNow(): boolean {
    return this.isDragging;
  }

  /**
   * Check if reordering is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Destroy the reorder handler and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // End any in-progress drag, and remove document listeners
    this.cancelDrag();
    this.headerRow.removeEventListener('mousedown', this.boundMouseDown);

    // Remove drop indicator
    if (this.dropIndicator && this.dropIndicator.parentNode) {
      this.dropIndicator.parentNode.removeChild(this.dropIndicator);
    }
    this.dropIndicator = null;
  }
}
