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
  /**
   * External scroll container to use for scroll events.
   * If provided, VirtualScroller won't create its own scroll container.
   * This enables unified scrolling where both horizontal and vertical
   * scrollbars appear on a single outer container.
   */
  externalScrollContainer?: HTMLElement;
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
  private scrollContainer: HTMLElement | null;
  private contentContainer: HTMLElement;
  private viewportContainer: HTMLElement;
  private widthSpacer: HTMLElement;
  private scrollSource: HTMLElement;  // Element to listen for scroll events (parent or self)
  private totalRows: number = 0;
  private currentRange: VisibleRange = { start: 0, end: 0, offsetY: 0 };
  private scrollCallbacks: Set<ScrollCallback> = new Set();
  private destroyed: boolean = false;

  private readonly rowHeight: number;
  private readonly bufferRows: number;
  private readonly classPrefix: string;
  private readonly useExternalScroller: boolean;

  // Reference to the body container when using external scroller
  private bodyContainer: HTMLElement | null = null;

  // Bound event handler for cleanup
  private handleScrollBound: () => void;

  // Scroll throttling with requestAnimationFrame
  private scrollRAF: number | null = null;

  constructor(container: HTMLElement, options: VirtualScrollerOptions) {
    this.rowHeight = options.rowHeight;
    this.bufferRows = options.bufferRows ?? 5;
    this.classPrefix = options.classPrefix ?? 'dt';
    this.useExternalScroller = !!options.externalScrollContainer;

    if (options.externalScrollContainer) {
      // External scroll container mode:
      // - Don't create our own scroll container
      // - Use the external container for scroll events
      // - Attach content directly to the provided container (body)
      this.scrollContainer = null;
      this.scrollSource = options.externalScrollContainer;
      this.bodyContainer = container;

      // Create content and viewport containers
      this.contentContainer = this.createContentContainer();
      this.widthSpacer = this.createWidthSpacer();
      this.viewportContainer = this.createViewportContainer();

      // Assemble structure directly in body container
      this.contentContainer.appendChild(this.widthSpacer);
      this.contentContainer.appendChild(this.viewportContainer);
      container.appendChild(this.contentContainer);
    } else {
      // Legacy mode: create own scroll container
      this.scrollContainer = this.createScrollContainer();
      this.contentContainer = this.createContentContainer();
      this.widthSpacer = this.createWidthSpacer();
      this.viewportContainer = this.createViewportContainer();

      // Assemble structure
      // Width spacer is in normal flow to force horizontal scroll width
      this.contentContainer.appendChild(this.widthSpacer);
      this.contentContainer.appendChild(this.viewportContainer);
      this.scrollContainer.appendChild(this.contentContainer);
      container.appendChild(this.scrollContainer);

      // Use own scroll container for vertical scrolling
      this.scrollSource = this.scrollContainer;
    }

    // Bind and attach scroll listener to scroll source
    this.handleScrollBound = this.handleScroll.bind(this);
    this.scrollSource.addEventListener('scroll', this.handleScrollBound, { passive: true });

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

  /**
   * Create the width spacer element
   *
   * This element is in normal document flow (not absolutely positioned)
   * and forces the scroll container to have the correct horizontal scroll width.
   * Without this, the absolutely positioned viewport doesn't contribute to scrollWidth.
   */
  private createWidthSpacer(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.classPrefix}-width-spacer`;
    el.style.height = '1px';
    el.style.width = '0px';
    el.style.pointerEvents = 'none';
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

    const scrollTop = this.scrollSource.scrollTop;
    const viewportHeight = this.scrollSource.clientHeight;

    // Handle case where viewport hasn't been measured yet
    if (viewportHeight === 0) {
      return { start: 0, end: 0, offsetY: 0 };
    }

    // The visible body height is the full viewport height
    // (headerHeight adjustment removed - body scroll now only contains the body)
    const visibleBodyHeight = viewportHeight;

    // Calculate raw range (without buffer)
    const rawStart = Math.floor(scrollTop / this.rowHeight);
    const rawEnd = Math.ceil((scrollTop + visibleBodyHeight) / this.rowHeight);

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

    // When using external scroll container, also set height on body container
    // This ensures the scroll container knows the total scrollable height
    if (this.useExternalScroller && this.bodyContainer) {
      this.bodyContainer.style.height = `${totalHeight}px`;
    }

    // Recalculate visible range
    this.updateVisibleRange();
  }

  /**
   * Set the content width for horizontal scrolling
   *
   * This sets the width of the spacer element AND the content containers
   * to force the scroll container to recognize the full content width.
   *
   * @param width - Total width in pixels
   */
  setContentWidth(width: number): void {
    if (this.destroyed) return;
    const widthPx = `${width}px`;
    this.widthSpacer.style.width = widthPx;
    this.contentContainer.style.minWidth = widthPx;
    this.viewportContainer.style.minWidth = widthPx;
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
    const viewportHeight = this.scrollSource.clientHeight;

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
    this.scrollSource.scrollTop = Math.max(0, Math.min(maxScroll, scrollTop));
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
   *
   * In external mode, returns the external scroll source.
   * In legacy mode, returns the internal scroll container.
   */
  getScrollContainer(): HTMLElement {
    return this.scrollSource;
  }

  /**
   * Get the content container element
   *
   * This is the spacer element that sets the scrollable area size.
   */
  getContentContainer(): HTMLElement {
    return this.contentContainer;
  }

  /**
   * Get the current scroll top position
   */
  getScrollTop(): number {
    return this.scrollSource.scrollTop;
  }

  /**
   * Get the viewport height
   */
  getViewportHeight(): number {
    return this.scrollSource.clientHeight;
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

    // Remove scroll listener from scroll source
    this.scrollSource.removeEventListener('scroll', this.handleScrollBound);

    // Clear callbacks
    this.scrollCallbacks.clear();

    // Remove from DOM
    if (this.useExternalScroller) {
      // In external mode, we only created the content container
      if (this.contentContainer.parentNode) {
        this.contentContainer.parentNode.removeChild(this.contentContainer);
      }
    } else {
      // In legacy mode, remove the scroll container
      if (this.scrollContainer && this.scrollContainer.parentNode) {
        this.scrollContainer.parentNode.removeChild(this.scrollContainer);
      }
    }
  }
}
