/**
 * ColumnResizer - Handles column resize interactions
 *
 * Attaches a drag handle to a column header element that allows users
 * to resize the column width by dragging.
 *
 * Features:
 * - Drag handle on right edge of column header
 * - Min/max width constraints
 * - Real-time resize feedback
 * - Cursor feedback during drag
 */

/**
 * Options for configuring the ColumnResizer
 */
export interface ColumnResizerOptions {
  /** Minimum column width in pixels (default: 50) */
  minWidth?: number;
  /** Maximum column width in pixels (default: 500) */
  maxWidth?: number;
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
}

/**
 * Callback invoked when column width changes
 */
export type ResizeCallback = (width: number) => void;

/**
 * ColumnResizer adds a resize handle to a column header element.
 *
 * @example
 * ```typescript
 * const resizer = new ColumnResizer(
 *   headerElement,
 *   (width) => actions.setColumnWidth('column', width),
 *   { minWidth: 50, maxWidth: 500 }
 * );
 *
 * // Later, clean up
 * resizer.detach();
 * ```
 */
export class ColumnResizer {
  private handle: HTMLElement | null = null;
  private isDragging = false;
  private startX = 0;
  private startWidth = 0;
  private detached = false;

  private readonly minWidth: number;
  private readonly maxWidth: number;
  private readonly classPrefix: string;

  // Bound event handlers for proper cleanup
  private readonly boundMouseDown: (e: MouseEvent) => void;
  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseUp: (e: MouseEvent) => void;

  constructor(
    private header: HTMLElement,
    private onResize: ResizeCallback,
    options: ColumnResizerOptions = {}
  ) {
    this.minWidth = options.minWidth ?? 50;
    this.maxWidth = options.maxWidth ?? 500;
    this.classPrefix = options.classPrefix ?? 'dt';

    // Bind event handlers
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);

    // Attach the resize handle
    this.attachHandle();
  }

  // =========================================
  // Handle Management
  // =========================================

  /**
   * Create and attach the resize handle to the header
   */
  private attachHandle(): void {
    if (this.detached) return;

    // Create the handle element
    this.handle = document.createElement('div');
    this.handle.className = `${this.classPrefix}-col-resize-handle`;
    this.handle.setAttribute('role', 'separator');
    this.handle.setAttribute('aria-orientation', 'vertical');
    this.handle.setAttribute('aria-label', 'Resize column');

    // Attach mouse event
    this.handle.addEventListener('mousedown', this.boundMouseDown);

    // Insert handle into header
    this.header.appendChild(this.handle);
  }

  /**
   * Detach the resize handle and clean up resources
   */
  detach(): void {
    if (this.detached) return;
    this.detached = true;

    // Stop any in-progress drag
    if (this.isDragging) {
      this.endDrag();
    }

    // Remove handle from DOM
    if (this.handle) {
      this.handle.removeEventListener('mousedown', this.boundMouseDown);
      if (this.handle.parentNode) {
        this.handle.parentNode.removeChild(this.handle);
      }
      this.handle = null;
    }
  }

  // =========================================
  // Drag Handling
  // =========================================

  /**
   * Handle mouse down on the resize handle
   */
  private handleMouseDown(event: MouseEvent): void {
    if (this.detached) return;

    // Prevent default behavior (text selection, etc.)
    event.preventDefault();

    // Stop event from bubbling to prevent header click (sort)
    event.stopPropagation();

    // Start dragging
    this.isDragging = true;
    this.startX = event.clientX;
    this.startWidth = this.header.offsetWidth;

    // Add active class to handle
    if (this.handle) {
      this.handle.classList.add(`${this.classPrefix}-col-resize-handle--active`);
    }

    // Add resize cursor to body during drag
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // Attach document-level listeners for drag continuation
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  /**
   * Handle mouse move during drag
   */
  private handleMouseMove(event: MouseEvent): void {
    if (!this.isDragging || this.detached) return;

    // Prevent default to avoid text selection
    event.preventDefault();

    // Calculate new width
    const deltaX = event.clientX - this.startX;
    let newWidth = this.startWidth + deltaX;

    // Apply constraints
    newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newWidth));

    // Immediate visual feedback - update header width directly
    this.header.style.width = `${newWidth}px`;

    // Notify callback (updates state for cells, persistence, etc.)
    this.onResize(newWidth);
  }

  /**
   * Handle mouse up to end drag
   */
  private handleMouseUp(event: MouseEvent): void {
    if (!this.isDragging) return;

    event.preventDefault();
    this.endDrag();
  }

  /**
   * End the drag operation
   */
  private endDrag(): void {
    this.isDragging = false;

    // Remove active class from handle
    if (this.handle) {
      this.handle.classList.remove(`${this.classPrefix}-col-resize-handle--active`);
    }

    // Restore cursor and user select
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Remove document-level listeners
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Check if the resizer has been detached
   */
  isDetached(): boolean {
    return this.detached;
  }

  /**
   * Check if currently dragging
   */
  isDraggingNow(): boolean {
    return this.isDragging;
  }

  /**
   * Get the handle element
   */
  getHandle(): HTMLElement | null {
    return this.handle;
  }

  /**
   * Get the min width constraint
   */
  getMinWidth(): number {
    return this.minWidth;
  }

  /**
   * Get the max width constraint
   */
  getMaxWidth(): number {
    return this.maxWidth;
  }
}
