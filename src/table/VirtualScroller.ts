/**
 * Windowed scroller for rendering large row counts without blowing up the DOM.
 *
 * Owns the scroll container and calculates the visible row range plus a
 * configurable buffer; row rendering is delegated to the parent component
 * (e.g. `TableBody`). `createDataTable()` composes one internally — reach
 * for `VirtualScroller` on `/advanced` only when building a custom table
 * shell that needs the same virtualization behaviour.
 */

/**
 * Options for configuring the VirtualScroller
 */
export interface VirtualScrollerOptions {
  /** Fixed height per row in pixels */
  rowHeight: number;
  /** Number of buffer rows above/below viewport (default: 5) */
  bufferRows?: number | undefined;
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string | undefined;
  /**
   * External scroll container to use for scroll events.
   * If provided, VirtualScroller won't create its own scroll container.
   * This enables unified scrolling where both horizontal and vertical
   * scrollbars appear on a single outer container.
   */
  externalScrollContainer?: HTMLElement | undefined;
  /**
   * Caps the physical height (in px) written to the scroll spacer
   * (default: 15,000,000). Raising it past ~17.8M px breaks Firefox, which
   * saturates element heights at ≈17,895,697 px. Primarily a test hook —
   * tests inject small values to exercise scroll-space compression at
   * human scale.
   */
  maxVirtualHeight?: number | undefined;
}

/**
 * Represents the currently visible range of rows
 */
export interface VisibleRange {
  /** First visible row index (inclusive) */
  start: number;
  /** Last visible row index (exclusive) */
  end: number;
  /**
   * Physical Y offset in px at which the viewport container is positioned
   * inside the (possibly height-capped) content element. Equals
   * `start * rowHeight` whenever the dataset fits under the cap.
   */
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
 * Default cap for the physical spacer height, in pixels.
 *
 * Browsers silently saturate element heights: Blink/WebKit at ≈33,554,431 px,
 * Gecko at ≈17,895,697 px. 15,000,000 px keeps a 16% margin under the
 * tightest engine and stays below 2²⁴ (the float32 1-px-quantization band).
 * Datasets up to `15,000,000 / rowHeight` rows (468,750 at the default
 * 32 px) fit under the cap and keep the exact uncompressed behavior.
 */
const DEFAULT_MAX_VIRTUAL_HEIGHT = 15_000_000;

/**
 * Fixed-row-height virtual scroller — emits a `VisibleRange` whenever the
 * viewport crosses a row boundary so the host renders only the rows that are
 * actually on screen. Composed internally by {@link TableBody}; reach for
 * the class on `/advanced` when building a custom row renderer.
 *
 * **Scroll-space compression:** the physical spacer height is capped at
 * `maxVirtualHeight` (default 15,000,000 px) because browsers silently clamp
 * element heights. Below the cap the scroller behaves exactly as if the
 * spacer were `totalRows * rowHeight` tall. Above it, a dual-mode mapping
 * translates physical scroll positions into virtual ones: small deltas
 * (wheel, trackpad, keyboard — at most one viewport height per event) move
 * the virtual position linearly for native feel, while large deltas
 * (scrollbar thumb drags, programmatic jumps) map proportionally across the
 * full range, with exact reconciliation at the top and bottom edges.
 *
 * @example
 * import { VirtualScroller } from '@jeyabbalas/data-table/advanced';
 *
 * const scroller = new VirtualScroller(container, { rowHeight: 32 });
 * scroller.setTotalRows(10_000);
 *
 * scroller.onScroll((range) => {
 *   // Render rows from range.start to range.end
 *   // Position container at range.offsetY
 * });
 *
 * // Later:
 * scroller.destroy();
 *
 * @see VirtualScrollerOptions
 * @see VisibleRange
 * @see ScrollCallback
 */
export class VirtualScroller {
  private scrollContainer: HTMLElement | null;
  private contentContainer: HTMLElement;
  private viewportContainer: HTMLElement;
  private widthSpacer: HTMLElement;
  private scrollSource: HTMLElement; // Element to listen for scroll events (parent or self)
  private totalRows = 0;
  private currentRange: VisibleRange = { start: 0, end: 0, offsetY: 0 };
  private scrollCallbacks = new Set<ScrollCallback>();
  private destroyed = false;
  /** V = totalRows * rowHeight (float64 — exact for any plausible row count) */
  private virtualHeight = 0;
  /** min(virtualHeight, maxVirtualHeight) — the height actually written to the spacer */
  private physicalHeight = 0;
  /** virtualHeight > maxVirtualHeight (arithmetic only — never measured) */
  private compressionActive = false;
  /** Virtual-space scroll anchor; meaningful only while compression is active */
  private virtualScrollTop = 0;
  /** Physical scrollTop at the last anchor update — the delta baseline */
  private lastPhysicalScrollTop = 0;

  private readonly rowHeight: number;
  private readonly bufferRows: number;
  private readonly classPrefix: string;
  private readonly useExternalScroller: boolean;
  /** Physical spacer height cap in px; see {@link VirtualScrollerOptions.maxVirtualHeight} */
  private readonly maxVirtualHeight: number;

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
    this.maxVirtualHeight = options.maxVirtualHeight ?? DEFAULT_MAX_VIRTUAL_HEIGHT;

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

    // Seed the delta baseline before the first range calculation so a
    // pre-scrolled external container doesn't register as a huge first delta.
    this.lastPhysicalScrollTop = this.scrollSource.scrollTop;

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
   *
   * Repositions the viewport whenever the range OR its offset changed;
   * notifies callbacks only when start/end changed (preserves the host's
   * fetch-dedupe semantics — compressed-mode boundary snaps can move
   * `offsetY` without changing the row range).
   */
  private updateVisibleRange(): void {
    const newRange = this.calculateVisibleRange();

    const rangeChanged =
      newRange.start !== this.currentRange.start || newRange.end !== this.currentRange.end;
    const offsetChanged = newRange.offsetY !== this.currentRange.offsetY;

    if (rangeChanged || offsetChanged) {
      this.currentRange = newRange;
      this.updateViewportPosition();
    }
    if (rangeChanged) {
      this.notifyScrollCallbacks();
    }
  }

  /**
   * Map a physical scrollTop into virtual scroll space (compressed mode only)
   *
   * Updates the virtual anchor exactly once per range recalculation: small
   * deltas (at most one viewport height — wheel, trackpad momentum frames,
   * arrow/PageDown) move the anchor linearly for native feel at any scale;
   * large deltas (scrollbar thumb drags, Home/End, programmatic jumps) map
   * proportionally across the full range. The top/bottom branches reconcile
   * the two spaces exactly at the edges.
   *
   * This is one of only two places allowed to read `scrollHeight` (the other
   * is compressed-mode `scrollToRow`): the measured extent self-corrects
   * engines that clamp below the cap (e.g. Chrome at high zoom); jsdom
   * reports 0 and falls back to the requested `physicalHeight`.
   */
  private resolveCompressedScrollTop(scrollTop: number, viewportHeight: number): number {
    const measuredHeight = this.scrollSource.scrollHeight;
    const physicalExtent = measuredHeight > 0 ? measuredHeight : this.physicalHeight;
    const maxScroll = Math.max(0, physicalExtent - viewportHeight);
    const maxVirtualScrollTop = Math.max(0, this.virtualHeight - viewportHeight);
    const delta = scrollTop - this.lastPhysicalScrollTop;

    let virtualTop: number;
    if (maxScroll <= 0) {
      virtualTop = 0;
    } else if (scrollTop <= 0) {
      // Top reconciliation — MANDATORY: without it, linear drift traps the
      // user above row 0 (scrollTop can't go below 0, so no more scroll
      // events would ever fire to close the gap).
      virtualTop = 0;
    } else if (scrollTop >= maxScroll - 1) {
      // Bottom reconciliation (−1 tolerates fractional scrollTop on hidpi)
      virtualTop = maxVirtualScrollTop;
    } else if (Math.abs(delta) <= viewportHeight) {
      // LINEAR: per-event deltas below one viewport height track physical
      // motion 1:1
      virtualTop = Math.max(0, Math.min(maxVirtualScrollTop, this.virtualScrollTop + delta));
    } else {
      // PROPORTIONAL: divide BEFORE multiplying — scrollTop * maxVirtualScrollTop
      // can exceed 2^53 at 50M rows
      virtualTop = (scrollTop / maxScroll) * maxVirtualScrollTop;
    }

    this.virtualScrollTop = virtualTop;
    this.lastPhysicalScrollTop = scrollTop;
    return virtualTop;
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

    // Below the height cap the physical position IS the virtual position
    const virtualScrollTop = this.compressionActive
      ? this.resolveCompressedScrollTop(scrollTop, viewportHeight)
      : scrollTop;

    // Calculate raw range (without buffer)
    const rawStart = Math.floor(virtualScrollTop / this.rowHeight);
    const rawEnd = Math.ceil((virtualScrollTop + viewportHeight) / this.rowHeight);

    // Apply buffer (clamp to valid range). The `min(…, end)` term is a
    // deliberate latent-bug fix: without it, a totalRows shrink under a live
    // scrollTop can produce start > end, which becomes a negative LIMIT in
    // TableBody.buildRowQuery.
    const end = Math.min(this.totalRows, rawEnd + this.bufferRows);
    const start = Math.max(0, Math.min(rawStart - this.bufferRows, end));

    // Physical Y offset for viewport positioning. Identity mode:
    // scrollTop === virtualScrollTop, so offsetY = start * rowHeight exactly.
    // Compressed-mode boundary proofs:
    // - scrollTop = 0 → virtualTop = 0, start = 0 → offsetY = 0: row 0 at top.
    // - scrollTop = maxScroll → virtualTop = maxVTop → rawEnd = N → end = N;
    //   the last row's physical bottom = scrollTop − virtualTop + N*H
    //   = (P − vh) − (V − vh) + V = P — exactly the spacer's bottom edge,
    //   which coincides with the viewport's bottom edge at max scroll.
    // - Between row-boundary crossings, linear deltas change scrollTop and
    //   virtualTop by the same amount → offsetY unchanged → no corrective
    //   repaint (native scroll shifts the already-painted rows; no shimmer).
    const offsetY = scrollTop - virtualScrollTop + start * this.rowHeight;

    return { start, end, offsetY };
  }

  /**
   * Update the viewport container's position
   *
   * Uses inline `top` rather than `transform: translateY(…)`: `top` resolves
   * through layout (LayoutUnit fixed-point — exact at our magnitudes), while
   * compositor transforms are float32, which quantizes to >1 px above
   * ~8.4M px. There is no transform-only frame to keep "GPU accelerated":
   * offsetY changes only when rows are also being inserted/removed, which
   * does layout anyway.
   */
  private updateViewportPosition(): void {
    this.viewportContainer.style.top = `${this.currentRange.offsetY}px`;
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
   * Updates the (height-capped) content container height and recalculates
   * the visible range, preserving the current scroll position across the
   * identity ↔ compressed boundary.
   */
  setTotalRows(count: number): void {
    if (this.destroyed) return;

    this.totalRows = count;

    const wasActive = this.compressionActive;
    this.virtualHeight = count * this.rowHeight;
    this.compressionActive = this.virtualHeight > this.maxVirtualHeight;
    this.physicalHeight = Math.min(this.virtualHeight, this.maxVirtualHeight);

    // Write the capped spacer height BEFORE recalculating the range, so a
    // real browser's measured scrollHeight reflects the new extent.
    this.contentContainer.style.height = `${this.physicalHeight}px`;

    // When using external scroll container, also set height on body container
    // This ensures the scroll container knows the total scrollable height
    if (this.useExternalScroller && this.bodyContainer) {
      this.bodyContainer.style.height = `${this.physicalHeight}px`;
    }

    if (this.compressionActive) {
      const scrollTop = this.scrollSource.scrollTop;
      const viewportHeight = this.scrollSource.clientHeight;
      const maxVirtualScrollTop = Math.max(0, this.virtualHeight - viewportHeight);
      // Re-anchor preserving position — never proportionally re-derive, which
      // would teleport a linearly-scrolled user. On the identity → compressed
      // transition the physical scrollTop WAS the virtual position. If the
      // browser later clamps scrollTop (content got shorter), its own scroll
      // event arrives with a large negative delta → proportional branch →
      // proportional landing (correct: the old position no longer exists).
      this.virtualScrollTop = wasActive
        ? Math.min(this.virtualScrollTop, maxVirtualScrollTop)
        : Math.min(scrollTop, maxVirtualScrollTop);
      this.lastPhysicalScrollTop = scrollTop;
    }

    // Recalculate visible range (sees delta = 0 → linear branch → anchor stable)
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
   * The target is computed in virtual space, so any index lands exactly even
   * above the height cap. In compressed mode, targets within about one
   * compression ratio of an exact edge get snapped by the top/bottom
   * reconciliation branches on the follow-up scroll event — the target row
   * stays fully visible (same class of clamp this method already performs).
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

    // Target position in VIRTUAL space
    let virtualTarget: number;
    switch (align) {
      case 'start':
        virtualTarget = rowTop;
        break;
      case 'center':
        virtualTarget = rowTop - viewportHeight / 2 + this.rowHeight / 2;
        break;
      case 'end':
        virtualTarget = rowTop - viewportHeight + this.rowHeight;
        break;
    }

    const maxVirtualScrollTop = Math.max(0, this.virtualHeight - viewportHeight);
    virtualTarget = Math.max(0, Math.min(maxVirtualScrollTop, virtualTarget));

    let physicalTarget: number;
    if (this.compressionActive) {
      // Same measured-extent rule as the scroll mapping (the only other
      // permitted scrollHeight read).
      const measuredHeight = this.scrollSource.scrollHeight;
      const physicalExtent = measuredHeight > 0 ? measuredHeight : this.physicalHeight;
      const maxScroll = Math.max(0, physicalExtent - viewportHeight);
      physicalTarget =
        maxVirtualScrollTop > 0 ? Math.round((virtualTarget / maxVirtualScrollTop) * maxScroll) : 0;
      // Write the anchor DIRECTLY — exactness must not depend on inverting
      // the lossy proportional map (rounding physicalTarget costs up to
      // ~half a compression ratio in virtual px if re-derived).
      this.virtualScrollTop = virtualTarget;
    } else {
      // Arithmetic clamp replaces the old contentContainer.offsetHeight
      // read — same value below the cap, and no longer trusts a
      // browser-clamped measurement.
      physicalTarget = Math.max(0, Math.min(this.physicalHeight - viewportHeight, virtualTarget));
    }

    this.scrollSource.scrollTop = physicalTarget;
    // Read BACK — the browser may clamp or round the write; both the
    // synchronous update below and the later async scroll event then see
    // delta ≈ 0 → linear branch → anchor unchanged → stable landing with no
    // suppression flag.
    this.lastPhysicalScrollTop = this.scrollSource.scrollTop;

    // Synchronously update visible range so getVisibleRange() reflects
    // the new scroll position immediately. Without this, the rAF-throttled
    // handleScroll() leaves currentRange stale until the next frame.
    this.updateVisibleRange();
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
   * Get the current scroll position in virtual space
   *
   * Virtual-space counterpart of `getScrollTop()`; identical below the
   * height cap.
   */
  getVirtualScrollTop(): number {
    return this.compressionActive ? this.virtualScrollTop : this.scrollSource.scrollTop;
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
