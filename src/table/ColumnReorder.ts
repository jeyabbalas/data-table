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

/**
 * Options for configuring the ColumnReorder
 */
export interface ColumnReorderOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
  /** Movement threshold in pixels to start drag (default: 5) */
  dragThreshold?: number;
}

/**
 * Callback invoked when columns are reordered
 */
export type ReorderCallback = (newOrder: string[]) => void;

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
 * // After headers are created/refreshed:
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
  private dropIndex = -1;
  private destroyed = false;
  private enabled = true;

  private readonly classPrefix: string;
  private readonly dragThreshold: number;

  // Bound event handlers for proper cleanup
  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseUp: (e: MouseEvent) => void;

  // Map of header elements to their mousedown handlers
  private headerHandlers = new Map<HTMLElement, (e: MouseEvent) => void>();

  constructor(
    private headerRow: HTMLElement,
    private onReorder: ReorderCallback,
    options: ColumnReorderOptions = {}
  ) {
    this.classPrefix = options.classPrefix ?? 'dt';
    this.dragThreshold = options.dragThreshold ?? 5;

    // Bind document-level handlers
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);

    // Create drop indicator element
    this.createDropIndicator();
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
   * Show the drop indicator at a position
   */
  private showDropIndicator(x: number): void {
    if (!this.dropIndicator || !this.headerRow) return;

    // Find the header-row element (the direct container of column headers)
    const headerRowInner = this.headerRow.querySelector(`.${this.classPrefix}-header-row`);
    const container = headerRowInner ?? this.headerRow;

    // Ensure indicator is in the correct container
    if (this.dropIndicator.parentNode !== container) {
      container.appendChild(this.dropIndicator);
    }

    // Position relative to the container
    const containerRect = container.getBoundingClientRect();
    this.dropIndicator.style.left = `${x - containerRect.left}px`;
    this.dropIndicator.style.display = 'block';
  }

  /**
   * Hide the drop indicator
   */
  private hideDropIndicator(): void {
    if (this.dropIndicator) {
      this.dropIndicator.style.display = 'none';
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

    // Don't start drag if clicking on resize handle or sort button
    if (
      target.closest(`.${this.classPrefix}-col-resize-handle`) ||
      target.closest(`.${this.classPrefix}-col-sort-btn`) ||
      target.closest('button')
    ) {
      return;
    }

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
    this.draggedHeader = header;
    this.draggedColumn = columnName;

    // Add class to show grabbing cursor immediately
    document.body.classList.add(`${this.classPrefix}-column-potential-drag`);

    // Prevent text selection during potential drag
    event.preventDefault();

    // Add document-level listeners
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  /**
   * Handle mouse move during drag
   */
  private handleMouseMove(event: MouseEvent): void {
    if (this.destroyed) return;

    event.preventDefault();

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

    // Add visual feedback
    document.body.classList.add(`${this.classPrefix}-column-dragging`);
    this.draggedHeader?.classList.add(`${this.classPrefix}-col-header--dragging`);
  }

  /**
   * Update the drop position based on mouse X coordinate
   */
  private updateDropPosition(clientX: number): void {
    if (!this.headerRow || !this.draggedColumn) return;

    const headers = this.getHeaderElements();
    if (headers.length === 0) return;

    // Find the drop position
    let dropX = 0;
    let newDropIndex = 0;

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const rect = header.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;

      if (clientX < midpoint) {
        dropX = rect.left;
        newDropIndex = i;
        break;
      }

      // After the last column
      if (i === headers.length - 1) {
        dropX = rect.right;
        newDropIndex = headers.length;
      }
    }

    // Update drop indicator
    this.dropIndex = newDropIndex;
    this.showDropIndicator(dropX);
  }

  /**
   * Handle mouse up to end drag
   */
  private handleMouseUp(event: MouseEvent): void {
    if (this.destroyed) return;

    event.preventDefault();

    // Remove document listeners
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);

    if (this.isDragging) {
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

    // Get current column order
    const headers = this.getHeaderElements();
    const currentOrder = headers.map((h) => h.getAttribute('data-column')!).filter(Boolean);

    // Calculate new order
    const draggedIndex = currentOrder.indexOf(this.draggedColumn);
    if (draggedIndex !== -1 && this.dropIndex !== -1 && this.dropIndex !== draggedIndex && this.dropIndex !== draggedIndex + 1) {
      // Remove from current position
      const newOrder = [...currentOrder];
      newOrder.splice(draggedIndex, 1);

      // Calculate adjusted insert index (account for removal)
      let insertIndex = this.dropIndex;
      if (draggedIndex < this.dropIndex) {
        insertIndex--;
      }

      // Insert at new position
      newOrder.splice(insertIndex, 0, this.draggedColumn);

      // Notify callback
      this.onReorder(newOrder);
    }

    this.resetDragState();
  }

  /**
   * Reset all drag state
   */
  private resetDragState(): void {
    // Remove visual feedback
    document.body.classList.remove(`${this.classPrefix}-column-dragging`);
    document.body.classList.remove(`${this.classPrefix}-column-potential-drag`);
    this.draggedHeader?.classList.remove(`${this.classPrefix}-col-header--dragging`);
    this.hideDropIndicator();

    // Reset state
    this.isDragging = false;
    this.isPotentialDrag = false;
    this.draggedHeader = null;
    this.draggedColumn = null;
    this.dropIndex = -1;
  }

  // =========================================
  // Header Management
  // =========================================

  /**
   * Get all column header elements in order
   */
  private getHeaderElements(): HTMLElement[] {
    if (!this.headerRow) return [];

    const headerRowInner = this.headerRow.querySelector(`.${this.classPrefix}-header-row`);
    const container = headerRowInner ?? this.headerRow;

    return Array.from(container.querySelectorAll(`.${this.classPrefix}-col-header`));
  }

  /**
   * Attach mousedown handlers to headers
   */
  private attachHandlers(): void {
    const headers = this.getHeaderElements();

    for (const header of headers) {
      // Skip if already attached
      if (this.headerHandlers.has(header)) continue;

      // Create handler for this header
      const handler = (e: MouseEvent) => this.handleMouseDown(e);
      header.addEventListener('mousedown', handler);
      this.headerHandlers.set(header, handler);

      // Disable native drag
      header.setAttribute('draggable', 'false');
    }
  }

  /**
   * Detach mousedown handlers from headers
   */
  private detachHandlers(): void {
    for (const [header, handler] of this.headerHandlers) {
      header.removeEventListener('mousedown', handler);
    }
    this.headerHandlers.clear();
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
    this.attachHandlers();
  }

  /**
   * Disable column reordering
   */
  disable(): void {
    this.enabled = false;
    this.detachHandlers();
    this.resetDragState();
  }

  /**
   * Refresh handlers after headers are recreated
   */
  refresh(): void {
    if (this.destroyed) return;

    // Detach old handlers
    this.detachHandlers();

    // Attach to new headers if enabled
    if (this.enabled) {
      this.attachHandlers();
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

    // End any in-progress drag
    this.resetDragState();

    // Remove document listeners
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);

    // Detach all handlers
    this.detachHandlers();

    // Remove drop indicator
    if (this.dropIndicator && this.dropIndicator.parentNode) {
      this.dropIndicator.parentNode.removeChild(this.dropIndicator);
    }
    this.dropIndicator = null;
  }
}
