/**
 * VirtualScroller - Efficient scrolling for large datasets
 *
 * Creates a scroll container that only renders visible rows plus a buffer.
 * Manages scroll position, calculates visible range, and notifies listeners
 * when the visible range changes.
 *
 * This component handles the scrolling infrastructure. Row rendering is
 * delegated to the parent component (e.g., TableBody).
 */

/**
 * Options for configuring the VirtualScroller
 */
export interface VirtualScrollerOptions {
  /** Fixed height per row in pixels */
  rowHeight: number;
  /** Number of buffer rows above/below viewport (default: 5) */
  bufferRows?: number;
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
}

/**
 * Represents the currently visible range of rows
 */
export interface VisibleRange {
  /** First visible row index (inclusive) */
  start: number;
  /** Last visible row index (exclusive) */
  end: number;
  /** Y offset in pixels for positioning the viewport container */
  offsetY: number;
}

/**
 * Callback type for scroll events
 */
export type ScrollCallback = (range: VisibleRange) => void;

/**
 * Scroll alignment options for scrollToRow
 */
export type ScrollAlign = 'start' | 'center' | 'end';

/**
 * VirtualScroller component for efficient rendering of large datasets.
 *
 * @example
 * ```typescript
 * const scroller = new VirtualScroller(container, { rowHeight: 32 });
 * scroller.setTotalRows(10000);
 *
 * scroller.onScroll((range) => {
 *   // Render rows from range.start to range.end
 *   // Position container at range.offsetY
 * });
 *
 * // Later, clean up
 * scroller.destroy();
 * ```
 */
export class VirtualScroller {
  private scrollContainer: HTMLElement;
  private contentContainer: HTMLElement;
  private viewportContainer: HTMLElement;
  private totalRows: number = 0;
  private currentRange: VisibleRange = { start: 0, end: 0, offsetY: 0 };
  private scrollCallbacks: Set<ScrollCallback> = new Set();
  private destroyed: boolean = false;

  private readonly rowHeight: number;
  private readonly bufferRows: number;
  private readonly classPrefix: string;

  // Bound event handler for cleanup
  private handleScrollBound: () => void;

  // Scroll throttling with requestAnimationFrame
  private scrollRAF: number | null = null;

  constructor(container: HTMLElement, options: VirtualScrollerOptions) {
    this.rowHeight = options.rowHeight;
    this.bufferRows = options.bufferRows ?? 5;
    this.classPrefix = options.classPrefix ?? 'dt';

    // Create DOM structure
    this.scrollContainer = this.createScrollContainer();
    this.contentContainer = this.createContentContainer();
    this.viewportContainer = this.createViewportContainer();

    // Assemble structure
    this.contentContainer.appendChild(this.viewportContainer);
    this.scrollContainer.appendChild(this.contentContainer);
    container.appendChild(this.scrollContainer);

    // Bind and attach scroll listener
    this.handleScrollBound = this.handleScroll.bind(this);
    this.scrollContainer.addEventListener('scroll', this.handleScrollBound, { passive: true });

    // Calculate initial range
    this.updateVisibleRange();
  }

  // =========================================
  // DOM Creation
  // =========================================

  /**
   * Create the scroll container (has overflow:auto)
   */
  private createScrollContainer(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.classPrefix}-virtual-scroll`;
    return el;
  }

  /**
   * Create the content container (spacer for total height)
   */
  private createContentContainer(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.classPrefix}-virtual-content`;
    return el;
  }

  /**
   * Create the viewport container (contains visible rows)
   */
  private createViewportContainer(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.classPrefix}-virtual-viewport`;
    return el;
  }

  // =========================================
  // Scroll Handling
  // =========================================

  /**
   * Handle scroll events with requestAnimationFrame throttling
   *
   * This prevents scroll event storms during fast scrolling by ensuring
   * we only update once per animation frame (~60fps).
   */
  private handleScroll(): void {
    if (this.destroyed) return;

    // Throttle with requestAnimationFrame
    if (this.scrollRAF !== null) return;

    this.scrollRAF = requestAnimationFrame(() => {
      this.scrollRAF = null;
      if (!this.destroyed) {
        this.updateVisibleRange();
      }
    });
  }

  /**
   * Calculate and update the visible range
   */
  private updateVisibleRange(): void {
    const newRange = this.calculateVisibleRange();

    // Only notify if range actually changed
    if (
      newRange.start !== this.currentRange.start ||
      newRange.end !== this.currentRange.end
    ) {
      this.currentRange = newRange;
      this.updateViewportPosition();
      this.notifyScrollCallbacks();
    }
  }

  /**
   * Calculate the visible range based on current scroll position
   */
  private calculateVisibleRange(): VisibleRange {
    if (this.totalRows === 0) {
      return { start: 0, end: 0, offsetY: 0 };
    }

    const scrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.scrollContainer.clientHeight;

    // Handle case where viewport hasn't been measured yet
    if (viewportHeight === 0) {
      return { start: 0, end: 0, offsetY: 0 };
    }

    // Calculate raw range (without buffer)
    const rawStart = Math.floor(scrollTop / this.rowHeight);
    const rawEnd = Math.ceil((scrollTop + viewportHeight) / this.rowHeight);

    // Apply buffer (clamp to valid range)
    const start = Math.max(0, rawStart - this.bufferRows);
    const end = Math.min(this.totalRows, rawEnd + this.bufferRows);

    // Calculate Y offset for viewport positioning
    const offsetY = start * this.rowHeight;

    return { start, end, offsetY };
  }

  /**
   * Update the viewport container's position
   */
  private updateViewportPosition(): void {
    this.viewportContainer.style.transform = `translateY(${this.currentRange.offsetY}px)`;
  }

  /**
   * Notify all scroll callbacks
   */
  private notifyScrollCallbacks(): void {
    for (const callback of this.scrollCallbacks) {
      callback(this.currentRange);
    }
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Set the total number of rows
   *
   * Updates the content container height and recalculates visible range.
   */
  setTotalRows(count: number): void {
    if (this.destroyed) return;

    this.totalRows = count;

    // Update content height for scrollbar
    const totalHeight = count * this.rowHeight;
    this.contentContainer.style.height = `${totalHeight}px`;

    // Recalculate visible range
    this.updateVisibleRange();
  }

  /**
   * Get the current visible range
   */
  getVisibleRange(): VisibleRange {
    return { ...this.currentRange };
  }

  /**
   * Get the total number of rows
   */
  getTotalRows(): number {
    return this.totalRows;
  }

  /**
   * Scroll to a specific row
   *
   * @param index - Row index to scroll to
   * @param align - Where to position the row in the viewport (default: 'start')
   */
  scrollToRow(index: number, align: ScrollAlign = 'start'): void {
    if (this.destroyed) return;

    // Clamp index to valid range
    const clampedIndex = Math.max(0, Math.min(this.totalRows - 1, index));
    const rowTop = clampedIndex * this.rowHeight;
    const viewportHeight = this.scrollContainer.clientHeight;

    let scrollTop: number;
    switch (align) {
      case 'start':
        scrollTop = rowTop;
        break;
      case 'center':
        scrollTop = rowTop - (viewportHeight / 2) + (this.rowHeight / 2);
        break;
      case 'end':
        scrollTop = rowTop - viewportHeight + this.rowHeight;
        break;
    }

    // Clamp to valid scroll range
    const maxScroll = this.contentContainer.offsetHeight - viewportHeight;
    this.scrollContainer.scrollTop = Math.max(0, Math.min(maxScroll, scrollTop));
  }

  /**
   * Subscribe to scroll events
   *
   * @param callback - Function to call when visible range changes
   * @returns Unsubscribe function
   */
  onScroll(callback: ScrollCallback): () => void {
    this.scrollCallbacks.add(callback);

    // Immediately call with current range if we have rows
    if (this.totalRows > 0) {
      callback(this.currentRange);
    }

    return () => {
      this.scrollCallbacks.delete(callback);
    };
  }

  /**
   * Get the viewport container element
   *
   * This is where rows should be rendered.
   */
  getViewportContainer(): HTMLElement {
    return this.viewportContainer;
  }

  /**
   * Get the scroll container element
   */
  getScrollContainer(): HTMLElement {
    return this.scrollContainer;
  }

  /**
   * Get the current scroll top position
   */
  getScrollTop(): number {
    return this.scrollContainer.scrollTop;
  }

  /**
   * Get the viewport height
   */
  getViewportHeight(): number {
    return this.scrollContainer.clientHeight;
  }

  /**
   * Get the row height
   */
  getRowHeight(): number {
    return this.rowHeight;
  }

  /**
   * Check if the scroller has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Force a recalculation of the visible range
   *
   * Useful when the viewport size changes.
   */
  refresh(): void {
    if (this.destroyed) return;
    this.updateVisibleRange();
  }

  /**
   * Destroy the virtual scroller and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Cancel any pending RAF
    if (this.scrollRAF !== null) {
      cancelAnimationFrame(this.scrollRAF);
      this.scrollRAF = null;
    }

    // Remove scroll listener
    this.scrollContainer.removeEventListener('scroll', this.handleScrollBound);

    // Clear callbacks
    this.scrollCallbacks.clear();

    // Remove from DOM
    if (this.scrollContainer.parentNode) {
      this.scrollContainer.parentNode.removeChild(this.scrollContainer);
    }
  }
}
