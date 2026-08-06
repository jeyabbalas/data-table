/**
 * TableBody - Renders data rows with virtual scrolling
 *
 * Integrates with VirtualScroller to efficiently render only visible rows,
 * fetches data from DuckDB via WorkerBridge, and handles row hover/selection.
 */

import type { AnnotationStore } from '../annotations/AnnotationStore';
import { maxSeverity } from '../annotations/severity';
import type { Annotation } from '../annotations/types';
import type { StateActions } from '../core/Actions';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';
import { ROWID_COLUMN, type ColumnSchema, type SortColumn, type Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import { filtersToWhereClause, quoteIdentifier } from '../filters/FilterSQL';
import type { AnnotationPopover } from './AnnotationPopover';
import { CellRenderer } from './Cell';
import { HEADER_ROW_INDEX } from './KeyboardNavigator';
import { VirtualScroller, type VisibleRange } from './VirtualScroller';

/**
 * Options for configuring the TableBody
 */
export interface TableBodyOptions {
  /** Fixed height per row in pixels (default: 32) */
  rowHeight?: number | undefined;
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string | undefined;
  /**
   * Per-instance identifier mixed into cell DOM ids so two tables on the same
   * page don't collide. Required for `aria-activedescendant` to resolve;
   * without it cells are rendered without ids.
   */
  instanceId?: string | undefined;
  /**
   * Called after every pass that materializes or recycles row elements.
   * `TableContainer` uses it to re-point `aria-activedescendant`, whose target
   * must be a live element — virtualization can destroy the cursor's cell
   * without the cursor itself changing.
   */
  onRowsRendered?: (() => void) | undefined;
  /**
   * The owning `.dt-grid` element. Used as the rescue landing spot for real
   * DOM focus when a row that holds it is about to be detached: virtualization
   * recycles rows out from under the user, and focus on a detached node falls
   * back to `<body>`, which silently ends keyboard navigation. Omit it and that
   * rescue is simply skipped.
   */
  gridElement?: HTMLElement | undefined;
  /**
   * External scroll container for unified scrolling.
   * When provided, VirtualScroller will use this container for scroll events
   * instead of creating its own scroll container.
   */
  scrollContainer?: HTMLElement | undefined;
  /**
   * Shared annotation store. When provided, the body applies
   * `dt-row--annotated` / `dt-cell--annotated` classes at render time and
   * subscribes to `change` events to keep visible rows in sync.
   */
  annotations?: AnnotationStore | undefined;
  /**
   * Shared popover singleton used to display cell-scope annotations on
   * hover / focus of an annotated cell.
   */
  annotationPopover?: AnnotationPopover | undefined;
  /** Resolved i18n strings (used for the placeholder-row label). Defaults to English. */
  messages?: Strings | undefined;
  /**
   * Rows fetched per block. Default: 128. Clamped to [16, 1024].
   *
   * Row fetches are quantized to block-aligned windows so overlapping scroll
   * positions dedupe onto the same query and an in-flight block is never
   * re-requested. 128 is roughly 3–4× a realistic viewport (~30–48 rows), so
   * the viewport spans 1–2 blocks; fetch cost on the OFFSET path is dominated
   * by the offset rather than the limit, and power-of-two alignment keeps
   * dedupe keys stable.
   */
  fetchBlockSize?: number | undefined;
  /**
   * Maximum rows kept in the in-memory row cache. Default: 2048. Rounded up
   * to whole blocks, with a floor of 4 blocks.
   *
   * 2048 rows is 16 default-size blocks (≈2–4 MB at typical row widths) —
   * enough for instant scroll-back across ±900 rows with zero queries, which
   * is the reuse role the SQL-keyed QueryCache used to (poorly) play for
   * scroll traffic.
   */
  rowCacheRows?: number | undefined;
  /**
   * Speculatively fetch one block beyond the viewport in the current scroll
   * direction while the pipeline is otherwise idle. Default: true.
   *
   * Prefetches run at 'normal' worker priority, so visible-block fetches
   * (priority 'high') always jump ahead of them in the worker queue.
   */
  prefetch?: boolean | undefined;
}

/**
 * Row data from query results
 */
export type RowData = Record<string, unknown>;

/**
 * Whether two column lists hold the same names, ignoring order.
 *
 * Used to tell a reorder (same set) from a show / hide / derived-column change
 * (different set). Rows are keyed by column name, so the former needs a
 * re-render and the latter needs a re-fetch.
 */
function sameColumnSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  for (const name of b) {
    if (!seen.has(name)) return false;
  }
  return true;
}

/**
 * Whether a rejected row fetch was aborted/cancelled rather than failed.
 *
 * Matches the bridge's local abort rejection (`QUERY_ABORTED`) and the
 * worker's cancellation response (`QUERY_CANCELLED`) by `code` rather than
 * by class so bridge test doubles behave like the real `QueryError`.
 */
function isFetchCancellation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === 'QUERY_ABORTED' || code === 'QUERY_CANCELLED';
}

/**
 * TableBody renders data rows using virtual scrolling.
 *
 * @example
 * ```typescript
 * const body = new TableBody(container, state, bridge, actions);
 * await body.initialize();
 *
 * // Later, clean up
 * body.destroy();
 * ```
 */
export class TableBody {
  private virtualScroller: VirtualScroller;
  private rowDataCache = new Map<number, RowData>();
  private currentRange: VisibleRange = { start: 0, end: 0, offsetY: 0 };
  private unsubscribes: (() => void)[] = [];
  private destroyed = false;
  private isAnimatingScroll = false;
  private scrollAnimationId: number | null = null;

  // ---- Fetch state machine ----------------------------------------------
  //
  //   IDLE         inFlightBlocks empty; every index of currentRange cached
  //                (or the range is empty)
  //   FETCHING     ≥1 visible-block fetch in flight
  //   PREFETCHING  prefetch !== null and no visible-block fetches
  //   DESTROYED    terminal
  //
  // Transitions:
  //   scroll (any state): assign range → render → reconcile (abort
  //     out-of-window blocks, top up, maybe prefetch). Never skips a render,
  //     never waits on an old fetch.
  //   block completes (epoch matches, not aborted): write cache → evict →
  //     render if it intersects the viewport → deregister → reconcile.
  //   block completes stale (epoch mismatch): dropped entirely.
  //   block aborted: rejection swallowed; deregistered in `finally`; the
  //     reconciler may legitimately re-issue the same block later as a
  //     fresh query.
  //   invalidation mid-fetch: epoch++ → abort all → clear caches → re-read
  //     the live range → placeholders → reconcile. (The filter-change
  //     scroll animation is unchanged: cache-only renders during the 300 ms
  //     animation, invalidation fires at its end.)
  //   destroy mid-fetch: guards drop late resolutions; aborts are silent.
  //   worker mirror: abort → the bridge rejects locally + posts `cancel` →
  //     the dispatcher dequeues (zero DuckDB work) or interrupts the
  //     running pending query; the eventual QUERY_CANCELLED response finds
  //     no pending request at the bridge and is dropped — no double-settle.
  //
  // Why there is no single-flight gate (the old `fetchInProgress` /
  // `pendingFetch` pair): it existed to bound DB load and serialize cache
  // writes. Load is bounded properly by the worker's serial queue plus the
  // MAX_INFLIGHT_BLOCK_FETCHES cap; write consistency by block-granular
  // dedupe (an in-flight block is never re-issued) plus the epoch guard.
  // What the gate additionally did — skip rendering, prevent cancellation,
  // and replay stale ranges — was exactly the rapid-scroll flicker bug.
  // ------------------------------------------------------------------------

  // Monotonic state identity used to drop stale block-fetch results: bumped
  // by `invalidateCacheAndRefresh()` and `destroy()`. After awaiting
  // `bridge.query`, a fetch that finds its captured epoch no longer matches
  // discards its rows instead of polluting `rowDataCache` with data for a
  // state (filters/sort/visibleColumns/tableName) that has since changed.
  // Mirrors `CrossfilterCoordinator.filterSequence` and
  // `BaseVisualization.fetchSequence`.
  private epoch = 0;
  // In-flight visible-block fetches keyed by block start index. Capped at
  // MAX_INFLIGHT_BLOCK_FETCHES; an in-flight block is never re-issued, and
  // aborting deletes the entry immediately so the reconciler can top up in
  // the same pass.
  private inFlightBlocks = new Map<number, { controller: AbortController; epoch: number }>();
  // The single speculative block fetch beyond the viewport, or null.
  private prefetch: { blockStart: number; controller: AbortController } | null = null;
  private lastScrollDirection: 1 | -1 = 1;

  // DOM element pooling for efficient rendering
  private rowPool: HTMLElement[] = [];
  private rowElementMap = new Map<number, HTMLElement>();
  private previousHoveredRow: number | null = null;
  private previousFocusedCell: { row: number; column: string } | null = null;

  // Cached column name -> 1-based presented index for aria-colindex
  private colIndexMap = new Map<string, number>();

  // Last observed visibleColumns, so a write can be classified as a reorder
  // (same set, new order — re-render) or a real change (re-fetch).
  private lastVisibleColumns: string[] = [];

  private readonly rowHeight: number;
  private readonly classPrefix: string;
  private readonly instanceId: string;
  // Resolved fetch-pipeline options — see TableBodyOptions for semantics
  // and sizing rationale. `fetchBlockSize` is clamped to [16, 1024];
  // `rowCacheRows` is rounded up to whole blocks with a 4-block floor.
  private readonly fetchBlockSize: number;
  private readonly rowCacheRows: number;
  private readonly prefetchEnabled: boolean;
  // Two in-flight block fetches: the worker executes serially anyway, so 2
  // overlaps result materialization with execution while keeping abort
  // turnaround at ≤1 running + 1 queued query.
  private static readonly MAX_INFLIGHT_BLOCK_FETCHES = 2;
  private readonly onRowsRendered: (() => void) | null;
  private readonly gridElement: HTMLElement | null;
  private readonly cellRenderer: CellRenderer;
  private readonly container: HTMLElement;
  private readonly annotations: AnnotationStore | null;
  private readonly annotationPopover: AnnotationPopover | null;
  private readonly messages: Strings;
  private unsubAnnotations: (() => void) | null = null;

  // Tracks the anchor currently driving the popover so pointer/focus
  // transitions between child elements inside the same cell don't retrigger
  // show().
  private currentAnnotationAnchor: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    private state: TableState,
    private bridge: WorkerBridge,
    private actions?: StateActions,
    options: TableBodyOptions = {},
  ) {
    this.container = container;
    this.rowHeight = options.rowHeight ?? 32;
    this.classPrefix = options.classPrefix ?? 'dt';
    this.instanceId = options.instanceId ?? '';
    this.onRowsRendered = options.onRowsRendered ?? null;
    this.gridElement = options.gridElement ?? null;
    this.annotations = options.annotations ?? null;
    this.annotationPopover = options.annotationPopover ?? null;
    this.messages = options.messages ?? defaultStrings;
    this.fetchBlockSize = Math.min(1024, Math.max(16, Math.floor(options.fetchBlockSize ?? 128)));
    this.rowCacheRows = Math.max(
      4 * this.fetchBlockSize,
      Math.ceil((options.rowCacheRows ?? 2048) / this.fetchBlockSize) * this.fetchBlockSize,
    );
    this.prefetchEnabled = options.prefetch ?? true;
    this.cellRenderer = new CellRenderer({ classPrefix: this.classPrefix });

    // Create virtual scroller
    this.virtualScroller = new VirtualScroller(container, {
      rowHeight: this.rowHeight,
      classPrefix: this.classPrefix,
      externalScrollContainer: options.scrollContainer,
    });

    // Delegated annotation hover/focus listeners on the scroll container.
    // Attached even when no annotations are present (bail-out is cheap) so
    // later changes that add annotations don't require re-wiring.
    if (this.annotations && this.annotationPopover) {
      container.addEventListener('pointerover', this.handleAnnotationPointerOver);
      container.addEventListener('pointerout', this.handleAnnotationPointerOut);
      container.addEventListener('focusin', this.handleAnnotationFocusIn);
      container.addEventListener('focusout', this.handleAnnotationFocusOut);
    }
  }

  // =========================================
  // Initialization
  // =========================================

  /**
   * Initialize the table body
   *
   * Sets up virtual scroller, subscribes to state changes, and performs
   * initial render.
   */
  async initialize(): Promise<void> {
    if (this.destroyed) return;

    // Build initial column index map for aria-colindex
    this.rebuildColIndexMap();
    this.lastVisibleColumns = [...this.state.visibleColumns.get()];

    // Set total rows (use filteredRows when filters are active)
    const filters = this.state.filters.get();
    const effectiveTotal =
      filters.length > 0 ? this.state.filteredRows.get() : this.state.totalRows.get();
    this.virtualScroller.setTotalRows(effectiveTotal);

    // Subscribe to state changes BEFORE the initial fetch so any state mutation
    // mid-fetch is tracked (and epoch-guarded, see `epoch`).
    this.subscribeToState();

    // Perform the initial paint + fetch if we have data. We do this BEFORE
    // subscribing to onScroll: the scroller's `onScroll(callback)` auto-fires
    // the callback synchronously when `totalRows > 0` (see
    // VirtualScroller.onScroll). Rendering and awaiting `ensureFetched()`
    // first means the visible blocks are cached (fetched and painted) by the
    // time the subscription's auto-fire runs — the auto-fire is then one
    // cheap cache-backed render plus a no-op reconcile. This is also what
    // keeps `initialize()`'s contract of resolving only after the first data
    // paint (`fetchBlock` renders before its promise settles), which
    // `TableContainer.whenBodyReady()` and the DataTable first-paint await
    // both rely on.
    if (effectiveTotal > 0) {
      this.currentRange = this.virtualScroller.getVisibleRange();
      this.renderVisibleRows();
      await this.ensureFetched();
    }

    // Subscribe to scroll events. Safe to do after the initial fetch — the
    // auto-fire is a warm no-op; subsequent user-driven scrolls go through
    // handleScroll normally (which itself renders cache-only during the
    // filter-change scroll animation).
    const unsubScroll = this.virtualScroller.onScroll((range) => this.handleScroll(range));
    this.unsubscribes.push(unsubScroll);
  }

  // =========================================
  // State Subscriptions
  // =========================================

  /**
   * Rebuild the column name -> 1-based `aria-colindex` map.
   *
   * Numbered from `columnOrder` — the presented order, including hidden
   * columns — and not from `schema`. ARIA requires `aria-colindex` to ascend
   * in DOM order within a row (a MUST), and rows render in `visibleColumns`
   * order, which is a filter over `columnOrder`. Numbering from the schema
   * made a reordered row report `3, 1, 2`. Keeping the hidden columns in the
   * numbering is deliberate: the gaps are what tell assistive tech that
   * columns are missing rather than renumbered.
   *
   * Falls back to the schema position for any column `columnOrder` does not
   * know about, so a header still carries an index during the window between
   * a schema write and the column-order write that follows it.
   */
  private rebuildColIndexMap(): void {
    this.colIndexMap.clear();
    const columnOrder = this.state.columnOrder.get();
    for (let i = 0; i < columnOrder.length; i++) {
      this.colIndexMap.set(columnOrder[i]!, i + 1);
    }
    const schema = this.state.schema.get();
    for (let i = 0; i < schema.length; i++) {
      const name = schema[i]!.name;
      if (!this.colIndexMap.has(name)) this.colIndexMap.set(name, i + 1);
    }
  }

  /**
   * Subscribe to state signals that require re-render
   */
  private subscribeToState(): void {
    // Rebuild column index map when schema changes
    const unsubSchema = this.state.schema.subscribe(() => {
      if (!this.destroyed) {
        this.rebuildColIndexMap();
      }
    });
    this.unsubscribes.push(unsubSchema);

    // …and when the presentation order changes, which is what aria-colindex
    // is numbered from. A reorder leaves the schema untouched, so without
    // this the indices stay frozen at the pre-reorder positions.
    const unsubColumnOrder = this.state.columnOrder.subscribe(() => {
      if (!this.destroyed) {
        this.rebuildColIndexMap();
      }
    });
    this.unsubscribes.push(unsubColumnOrder);

    // Re-fetch when the visible column *set* changes.
    //
    // A write that only permutes the set is a reorder, and rows are keyed by
    // column name — every value is already in the cache, so a re-render is
    // enough, and the in-flight `initialize()` fetch is not dropped by a
    // `fetchSequence` bump it did not need.
    //
    // Measured honestly: through `TableContainer` this changes no query count.
    // `render()` destroys and recreates the whole `TableBody` on any
    // `visibleColumns` write, so one keyboard column move at 266 columns costs
    // 534 DuckDB queries with or without this branch — all of them column-header
    // stats and plot queries from rebuilding 266 headers, none of them row
    // fetches. It earns its keep where a `TableBody` is driven directly, which
    // is a supported `/advanced` entry point.
    const unsubVisibleCols = this.state.visibleColumns.subscribe((columns) => {
      if (this.destroyed) return;
      const orderOnly = sameColumnSet(this.lastVisibleColumns, columns);
      this.lastVisibleColumns = [...columns];
      if (orderOnly) {
        this.renderVisibleRows();
      } else {
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubVisibleCols);

    // Re-fetch when sort changes
    const unsubSort = this.state.sortColumns.subscribe(() => {
      if (!this.destroyed) {
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubSort);

    // Re-fetch and scroll to top when filters change
    const unsubFilters = this.state.filters.subscribe((filters) => {
      if (!this.destroyed) {
        // A body cursor points at a row index the new result set may not
        // have; a header cursor is unaffected, and clearing it would yank
        // the user out of the header the moment their own filter applied.
        if (this.state.focusedCell.get()?.row !== HEADER_ROW_INDEX) {
          this.state.focusedCell.set(null);
        }
        if (filters.length === 0) {
          this.virtualScroller.setTotalRows(this.state.totalRows.get());
        }

        const scrollTop = this.virtualScroller.getScrollTop();
        if (scrollTop === 0) {
          // Already at top — refresh data instantly
          this.invalidateCacheAndRefresh();
        } else {
          // Animate scroll to top, then refresh data
          this.smoothScrollToTopAndRefresh(scrollTop);
        }
      }
    });
    this.unsubscribes.push(unsubFilters);

    // Update scroller total when filteredRows changes (only when filters active)
    const unsubFilteredRows = this.state.filteredRows.subscribe((count) => {
      if (!this.destroyed) {
        if (this.state.filters.get().length > 0) {
          this.virtualScroller.setTotalRows(count);
        }
      }
    });
    this.unsubscribes.push(unsubFilteredRows);

    // Update total rows when it changes (only when no filters active)
    const unsubTotalRows = this.state.totalRows.subscribe((total) => {
      if (!this.destroyed) {
        if (this.state.filters.get().length === 0) {
          this.virtualScroller.setTotalRows(total);
        }
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubTotalRows);

    // Re-render when pinned columns change (to update sticky styles)
    const unsubPinned = this.state.pinnedColumns.subscribe(() => {
      if (!this.destroyed) {
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubPinned);

    // Update cell widths when column widths change
    const unsubWidths = this.state.columnWidths.subscribe(() => {
      if (!this.destroyed) {
        this.updateCellWidths();
      }
    });
    this.unsubscribes.push(unsubWidths);

    // Update selection styling
    const unsubSelected = this.state.selectedRows.subscribe(() => {
      if (!this.destroyed) {
        this.updateSelectionStyles();
      }
    });
    this.unsubscribes.push(unsubSelected);

    // Update hover styling
    const unsubHover = this.state.hoveredRow.subscribe(() => {
      if (!this.destroyed) {
        this.updateHoverStyles();
      }
    });
    this.unsubscribes.push(unsubHover);

    // Update focus styling
    const unsubFocus = this.state.focusedCell.subscribe(() => {
      if (!this.destroyed) {
        this.updateFocusStyles();
      }
    });
    this.unsubscribes.push(unsubFocus);

    // Re-fetch when table name changes (e.g., derived column VIEW creation/removal)
    const unsubTableName = this.state.tableName.subscribe(() => {
      if (!this.destroyed) {
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubTableName);

    // Re-apply annotation classes whenever the store mutates. Targeted
    // DOM walk over visible rows only — no SQL re-fetch, no cache
    // invalidation. For a typical 50-row viewport this is cheap enough
    // that we don't bother diffing the payload ids.
    if (this.annotations) {
      this.unsubAnnotations = this.annotations.on('change', () => {
        if (!this.destroyed) {
          this.reapplyAnnotationsToVisibleRows();
        }
      });
    }
  }

  /**
   * Animate scroll to the top of the table, then invalidate cache and refresh.
   * Old data scrolls away during animation, then fresh data loads at position 0.
   */
  private smoothScrollToTopAndRefresh(startScrollTop: number): void {
    // Cancel any ongoing animation
    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId);
    }

    const scrollContainer = this.virtualScroller.getScrollContainer();
    const duration = 300;
    const startTime = performance.now();
    this.isAnimatingScroll = true;

    const animate = (now: number) => {
      if (this.destroyed) {
        this.isAnimatingScroll = false;
        this.scrollAnimationId = null;
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      scrollContainer.scrollTop = Math.round(startScrollTop * (1 - eased));

      if (scrollContainer.scrollTop === 0 || progress >= 1) {
        // Animation complete — refresh data at position 0
        this.scrollAnimationId = null;
        this.isAnimatingScroll = false;
        this.virtualScroller.scrollToRow(0, 'start');
        this.invalidateCacheAndRefresh();
      } else {
        this.scrollAnimationId = requestAnimationFrame(animate);
      }
    };

    this.scrollAnimationId = requestAnimationFrame(animate);
  }

  /**
   * Invalidate cache and refresh visible rows
   */
  private invalidateCacheAndRefresh(): void {
    // Bump so any in-flight block result is dropped instead of being
    // written into the just-cleared cache. Without this, an unfiltered
    // fetch started during `initialize()` could cache its rows after a
    // filter mutation and the next reconcile would see a "full" cache and
    // skip the re-fetch.
    this.epoch++;

    // Stop wasting worker time on superseded queries. The epoch guard
    // above stays belt-and-braces for anything already past its await.
    this.abortAllBlockFetches();

    // Clear data cache
    this.rowDataCache.clear();

    // Clear row element map and return all rows to pool
    for (const [, element] of this.rowElementMap) {
      this.moveFocusToGridBeforeRemoval(element);
      element.remove();
      this.returnRowToPool(element);
    }
    this.rowElementMap.clear();

    // Re-read the live range — the scroller does not re-notify on
    // offset-only changes, so a stored range could be stale here — then
    // paint immediately (placeholders, not a stale or blank viewport,
    // while the re-fetch runs) and reconcile.
    this.currentRange = this.virtualScroller.getVisibleRange();
    this.renderVisibleRows();
    void this.ensureFetched();
  }

  /** Abort every in-flight block fetch and the prefetch, clearing both. */
  private abortAllBlockFetches(): void {
    for (const [, entry] of this.inFlightBlocks) {
      entry.controller.abort();
    }
    this.inFlightBlocks.clear();
    if (this.prefetch) {
      this.prefetch.controller.abort();
      this.prefetch = null;
    }
  }

  // =========================================
  // Scroll Handling
  // =========================================

  /**
   * Handle a range change from the VirtualScroller.
   *
   * Synchronous by design: every range change paints immediately — missing
   * rows as placeholders — so the viewport position and the row content
   * rendered at it can never disagree. Fetching is reconciliation that
   * happens after the paint, never a precondition for it.
   *
   * `currentRange` is only ever assigned a scroller-originated range (this
   * callback or a `virtualScroller.getVisibleRange()` re-read); no
   * synthesized ranges exist anywhere in TableBody.
   */
  private handleScroll(range: VisibleRange): void {
    if (this.destroyed) return;

    this.lastScrollDirection = range.start >= this.currentRange.start ? 1 : -1;
    this.currentRange = range;
    this.renderVisibleRows();

    // During the filter-change scroll animation, render from cache only —
    // no fetches for intermediate positions. Invalidation fires at the
    // animation's end and reconciles from row 0.
    if (!this.isAnimatingScroll) {
      void this.ensureFetched();
    }
  }

  // =========================================
  // Data Fetching
  // =========================================

  /** First index of the fetch block containing row `index`. */
  private blockStartOf(index: number): number {
    return Math.floor(index / this.fetchBlockSize) * this.fetchBlockSize;
  }

  /**
   * Starts of the blocks intersecting `range` in which at least one row
   * index is missing from `rowDataCache`, ordered viewport-top-first.
   */
  private missingBlocks(range: VisibleRange): number[] {
    const blocks: number[] = [];
    for (let i = Math.max(0, range.start); i < range.end; i++) {
      if (!this.rowDataCache.has(i)) {
        const blockStart = this.blockStartOf(i);
        blocks.push(blockStart);
        // One miss marks the whole block — skip to the next one.
        i = blockStart + this.fetchBlockSize - 1;
      }
    }
    return blocks;
  }

  /**
   * The reconciler: compare `currentRange` against the cache and the
   * in-flight set, abort superseded work, and start whatever is missing —
   * visible blocks first, then at most one speculative prefetch when the
   * pipeline is fully idle.
   *
   * Returns a promise over the fetches STARTED IN THIS CALL (allSettled;
   * rejections are already handled inside `fetchBlock`). `initialize()`
   * awaits it to keep its resolves-after-first-paint contract; scroll
   * callers void-cast it.
   */
  private async ensureFetched(): Promise<void> {
    if (this.destroyed) return;
    if (!this.state.tableName.get()) return;
    if (this.state.visibleColumns.get().length === 0) return;

    const needed = this.missingBlocks(this.currentRange);

    // Abort in-flight blocks that no longer intersect the current range
    // padded by one block on each side. Deleting the entry here (not in the
    // fetch's own `finally`) frees the slot for the same-pass top-up below.
    const padStart = this.currentRange.start - this.fetchBlockSize;
    const padEnd = this.currentRange.end + this.fetchBlockSize;
    for (const [blockStart, entry] of this.inFlightBlocks) {
      const blockEnd = blockStart + this.fetchBlockSize;
      if (blockEnd <= padStart || blockStart >= padEnd) {
        entry.controller.abort();
        this.inFlightBlocks.delete(blockStart);
      }
    }

    // Abort the prefetch when its block became a visible need (the top-up
    // below re-issues it at high priority) or when it now points the wrong
    // way. Nulled synchronously so the prefetch check further down sees a
    // deterministic state in this same pass.
    if (this.prefetch) {
      const prefetchNowNeeded = needed.includes(this.prefetch.blockStart);
      const wrongDirection =
        this.lastScrollDirection === 1
          ? this.prefetch.blockStart < this.blockStartOf(Math.max(0, this.currentRange.start))
          : this.prefetch.blockStart > this.blockStartOf(Math.max(0, this.currentRange.end - 1));
      if (prefetchNowNeeded || wrongDirection) {
        this.prefetch.controller.abort();
        this.prefetch = null;
      }
    }

    // Top up visible-block fetches. An in-flight block is never re-issued.
    const started: Promise<void>[] = [];
    for (const blockStart of needed) {
      if (this.inFlightBlocks.size >= TableBody.MAX_INFLIGHT_BLOCK_FETCHES) break;
      if (this.inFlightBlocks.has(blockStart)) continue;
      const controller = new AbortController();
      this.inFlightBlocks.set(blockStart, { controller, epoch: this.epoch });
      started.push(this.fetchBlock(blockStart, this.epoch, controller, false));
    }

    // Prefetch: one block beyond the viewport in the last scroll direction,
    // only when nothing visible is missing or in flight.
    if (
      this.prefetchEnabled &&
      needed.length === 0 &&
      this.inFlightBlocks.size === 0 &&
      this.prefetch === null &&
      this.currentRange.end > this.currentRange.start
    ) {
      const candidate =
        this.lastScrollDirection === 1
          ? this.blockStartOf(this.currentRange.end - 1) + this.fetchBlockSize
          : this.blockStartOf(this.currentRange.start) - this.fetchBlockSize;
      if (
        candidate >= 0 &&
        candidate < this.virtualScroller.getTotalRows() &&
        !this.rowDataCache.has(candidate)
      ) {
        const controller = new AbortController();
        this.prefetch = { blockStart: candidate, controller };
        started.push(this.fetchBlock(candidate, this.epoch, controller, true));
      }
    }

    if (started.length > 0) {
      await Promise.allSettled(started);
    }
  }

  /**
   * Fetch one aligned block and write it into `rowDataCache`.
   *
   * Cache writes are keyed `blockStart + i` — valid because `buildRowQuery`
   * always emits a fully deterministic ORDER BY (see the tiebreaker note
   * there), so the block window is stable across queries.
   */
  private async fetchBlock(
    blockStart: number,
    epochAtStart: number,
    controller: AbortController,
    isPrefetch: boolean,
  ): Promise<void> {
    try {
      const tableName = this.state.tableName.get();
      if (!tableName) return;
      const visibleColumns = this.state.visibleColumns.get();
      if (visibleColumns.length === 0) return;

      const limit = Math.min(this.fetchBlockSize, this.virtualScroller.getTotalRows() - blockStart);
      if (limit <= 0) return;

      const sql = this.buildRowQuery(
        tableName,
        visibleColumns,
        this.state.sortColumns.get(),
        this.state.filters.get(),
        blockStart,
        limit,
        this.state.schema.get(),
      );

      // Scroll SQL bypasses the SQL-keyed QueryCache: `rowDataCache` is the
      // authoritative row store, invalidated in lockstep with `epoch` — a
      // second SQL-keyed copy with its own TTL/LRU would be a second
      // staleness domain, and every distinct scroll window would thrash the
      // 100-entry LRU that also holds header-stats/histogram results.
      const rows = await this.bridge.query<RowData>(sql, controller.signal, {
        cache: false,
        priority: isPrefetch ? 'normal' : 'high',
      });

      // Drop stale results — the epoch mirrors the old sequence guard. The
      // aborted check covers test doubles that resolve after an abort; the
      // real bridge rejects instead.
      if (this.destroyed || epochAtStart !== this.epoch || controller.signal.aborted) {
        return;
      }

      rows.forEach((row, i) => {
        this.rowDataCache.set(blockStart + i, row);
      });

      this.evictDistantBlocks(blockStart);

      // Promote placeholders in place when the block is (still) visible.
      if (blockStart < this.currentRange.end && blockStart + limit > this.currentRange.start) {
        this.renderVisibleRows();
      }
    } catch (error) {
      // Aborted / cancelled fetches are the expected outcome of scrolling
      // past a window or invalidating state — silent. Anything else keeps
      // today's behavior.
      if (!isFetchCancellation(error)) {
        console.error('Error fetching rows:', error);
      }
    } finally {
      // Deregister, guarded on controller identity: a block re-issued after
      // an abort must not delete its successor's entry.
      if (isPrefetch) {
        if (this.prefetch?.controller === controller) {
          this.prefetch = null;
        }
      } else if (this.inFlightBlocks.get(blockStart)?.controller === controller) {
        this.inFlightBlocks.delete(blockStart);
      }
      // Reconcile against the LIVE viewport — the replacement for the old
      // stored-pendingFetch replay, which could resurrect a stale range.
      if (!this.destroyed) {
        void this.ensureFetched();
      }
    }
  }

  /**
   * Evict whole cached blocks furthest from the live viewport until the
   * cache is back under `rowCacheRows`.
   *
   * Distance is measured from `this.currentRange` — never from a fetch's
   * own bounds, which is how the old per-row eviction managed to evict
   * currently-visible rows during races. Whole-block granularity keeps
   * surviving blocks fully populated, so `missingBlocks` never sees a
   * half-evicted block that would re-trigger fetch churn.
   *
   * Two kinds of block are exempt (a deliberate deviation from the phase
   * spec, which used the distance metric alone): blocks intersecting
   * `currentRange`, and the just-written block. Without the latter, a
   * prefetched block landing into an at-cap cache is itself the most
   * distant block — evicting it re-triggers the same prefetch from the
   * `finally` reconcile, forever. The cost is a transient overage of at
   * most the visible blocks plus one, well inside the 4-block sizing floor.
   */
  private evictDistantBlocks(justWrittenBlockStart: number): void {
    if (this.rowDataCache.size <= this.rowCacheRows) return;

    // Group cached indices by block.
    const blockRowCounts = new Map<number, number>();
    for (const index of this.rowDataCache.keys()) {
      const blockStart = this.blockStartOf(index);
      blockRowCounts.set(blockStart, (blockRowCounts.get(blockStart) ?? 0) + 1);
    }

    const candidates: number[] = [];
    for (const blockStart of blockRowCounts.keys()) {
      const blockEnd = blockStart + this.fetchBlockSize;
      const visible = blockEnd > this.currentRange.start && blockStart < this.currentRange.end;
      if (visible || blockStart === justWrittenBlockStart) continue;
      candidates.push(blockStart);
    }
    const distanceOf = (blockStart: number): number =>
      Math.min(
        Math.abs(blockStart - this.currentRange.start),
        Math.abs(blockStart + this.fetchBlockSize - this.currentRange.end),
      );
    candidates.sort((a, b) => distanceOf(b) - distanceOf(a));

    let total = this.rowDataCache.size;
    for (const blockStart of candidates) {
      if (total <= this.rowCacheRows) break;
      const blockEnd = blockStart + this.fetchBlockSize;
      for (let i = blockStart; i < blockEnd; i++) {
        this.rowDataCache.delete(i);
      }
      total -= blockRowCounts.get(blockStart) ?? 0;
    }
  }

  /**
   * Build SQL query for fetching rows.
   *
   * Always prepends the synthetic `__rowid__` column to the projection so
   * annotations (which key on rowId) can be resolved per visible-index
   * without a second query. The column is kept hidden in the grid via
   * `system: true` on its schema entry; the extra value adds negligible
   * overhead and lands in `rowDataCache` as `row['__rowid__']`.
   */
  private buildRowQuery(
    tableName: string,
    columns: string[],
    sortColumns: SortColumn[],
    filters: Filter[],
    offset: number,
    limit: number,
    schema?: ColumnSchema[],
  ): string {
    // Build schema lookup for type-aware column selection
    const schemaMap = new Map<string, ColumnSchema>();
    if (schema) {
      for (const col of schema) schemaMap.set(col.name, col);
    }

    // Quote column names; cast INTERVAL columns to VARCHAR so DuckDB
    // returns strings instead of Arrow MonthDayNano objects. Also drop any
    // accidental __rowid__ appearance in `columns` — we always prepend it
    // ourselves below (keeps the projection deterministic).
    const parts: string[] = [quoteIdentifier(ROWID_COLUMN)];
    for (const col of columns) {
      if (col === ROWID_COLUMN) continue;
      const quoted = quoteIdentifier(col);
      if (schemaMap.get(col)?.type === 'interval') {
        parts.push(`CAST(${quoted} AS VARCHAR) AS ${quoted}`);
      } else {
        parts.push(quoted);
      }
    }
    const columnList = parts.join(', ');

    let sql = `SELECT ${columnList} FROM ${quoteIdentifier(tableName)}`;

    // Add WHERE clause if filters are active
    if (filters.length > 0) {
      const whereClause = filtersToWhereClause(filters);
      if (whereClause) {
        sql += ` WHERE ${whereClause}`;
      }
    }

    // Always emit ORDER BY with __rowid__ as the final tiebreaker. DuckDB's
    // ORDER BY is non-deterministic for ties, so without a tiebreaker two
    // paginated queries over different LIMIT/OFFSET windows (which the
    // scroll path issues per aligned block as the viewport moves, see
    // `ensureFetched` + `fetchBlock`) can permute ties differently and
    // return *different* rows for the same logical positions — duplicating
    // some rows across blocks and dropping others. The cache write at
    // `rowDataCache.set(blockStart + i, row)` then holds shuffled data and
    // the user sees row contents change while scrolling. The
    // empty-sort branch also emits `ORDER BY __rowid__` so filter+scroll
    // (no user sort) is deterministic against any DuckDB parallel-scan
    // permutation. Skipped if the user already sorts on __rowid__ (they
    // own the order and don't want a redundant tail clause).
    const orderParts = sortColumns.map(
      (s) => `${quoteIdentifier(s.column)} ${s.direction.toUpperCase()}`,
    );
    if (!sortColumns.some((s) => s.column === ROWID_COLUMN)) {
      orderParts.push(`${quoteIdentifier(ROWID_COLUMN)} ASC`);
    }
    sql += ` ORDER BY ${orderParts.join(', ')}`;

    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    return sql;
  }

  // =========================================
  // Focus lifetime
  // =========================================

  /**
   * Move real DOM focus to the grid when `node` is about to leave the document
   * while holding it.
   *
   * Body cells are permanently `tabindex="-1"`, so clicking one leaves real
   * focus parked on an element the pool may recycle at any moment. When that
   * happens the browser drops focus to `<body>`, and because the keydown
   * listener lives on `.dt-root`, every subsequent arrow key is delivered
   * somewhere it can never be heard — the whole keyboard layer goes dead until
   * the user tabs back in.
   *
   * Deliberately narrow: focus moves only when `node` genuinely owns it, i.e.
   * only when the removal was going to relocate focus anyway. Broadening this
   * to "focus is somewhere in the table" would move focus out from under a
   * user who never asked for it, which is as hostile as trapping Tab.
   */
  private moveFocusToGridBeforeRemoval(node: Node): void {
    const grid = this.gridElement;
    if (!grid) return;
    // Resolve the active element against the node's own root so this keeps
    // working under a shadow root, where `document.activeElement` reports the
    // host rather than the focused descendant. Mirrors
    // `TableContainer.resolveInGrid`.
    const root = node.getRootNode();
    const active = 'activeElement' in root ? (root as Document | ShadowRoot).activeElement : null;
    if (!active || !node.contains(active)) return;
    grid.focus({ preventScroll: true });
  }

  // =========================================
  // Rendering
  // =========================================

  /**
   * Render visible rows in the viewport using DOM element pooling.
   *
   * This method uses incremental updates instead of clearing and rebuilding
   * all rows on every scroll. Rows that leave the viewport are returned to
   * a pool for reuse, and rows that enter are either taken from the pool
   * or created if the pool is empty.
   */
  private renderVisibleRows(): void {
    if (this.destroyed) return;

    const viewport = this.virtualScroller.getViewportContainer();
    const schema = this.state.schema.get();
    const visibleColumns = this.state.visibleColumns.get();
    const selectedRows = this.state.selectedRows.get();
    const hoveredRow = this.state.hoveredRow.get();
    const focusedCell = this.state.focusedCell.get();

    const newStart = this.currentRange.start;
    const newEnd = this.currentRange.end;

    // Build schema map for quick lookup
    const schemaMap = new Map<string, ColumnSchema>();
    for (const col of schema) {
      schemaMap.set(col.name, col);
    }

    // 1. Remove rows no longer visible (return to pool)
    for (const [index, element] of this.rowElementMap) {
      if (index < newStart || index >= newEnd) {
        this.moveFocusToGridBeforeRemoval(element);
        element.remove();
        this.rowElementMap.delete(index);
        this.returnRowToPool(element);
      }
    }

    // 2. Add/update rows in new range
    for (let i = newStart; i < newEnd; i++) {
      let rowEl = this.rowElementMap.get(i);
      const rowData = this.rowDataCache.get(i);

      if (!rowEl) {
        // Need a new row - get from pool or create
        if (rowData) {
          rowEl = this.getOrCreateRow(visibleColumns.length);
          this.updateRowContent(rowEl, i, rowData, visibleColumns, schemaMap);
          this.attachRowEventListeners(rowEl, i);
        } else {
          // Data not yet loaded - create placeholder
          rowEl = this.createPlaceholderRow(i);
        }
        this.rowElementMap.set(i, rowEl);
        this.insertRowInOrder(viewport, rowEl, i);
      } else if (rowData) {
        // The map can hold either a data row (visibleColumns.length cells,
        // listeners attached) or a placeholder (1 cell, no listeners,
        // `data-placeholder` marker). updateRowContent's loop is bounded by
        // min(columns, cells), so calling it on a placeholder would leave
        // columns 1..N-1 unrendered AND the row inert — the partial-render
        // bug. The marker is the durable signal — unlike the historical
        // cell-count comparison it stays unambiguous for single-column
        // tables, which are now replaced from the pool like everything else
        // instead of being promoted in place. The count check remains as a
        // second trigger so a data row with a stale cell shape is also
        // rebuilt rather than partially updated.
        if (this.isPlaceholderRow(rowEl) || rowEl.children.length !== visibleColumns.length) {
          // Bypasses `returnRowToPool` entirely, so the focus rescue has to be
          // spelled out here as well.
          this.moveFocusToGridBeforeRemoval(rowEl);
          rowEl.remove();
          rowEl = this.getOrCreateRow(visibleColumns.length);
          this.updateRowContent(rowEl, i, rowData, visibleColumns, schemaMap);
          this.attachRowEventListeners(rowEl, i);
          this.rowElementMap.set(i, rowEl);
          this.insertRowInOrder(viewport, rowEl, i);
        } else {
          // Row exists, update content if needed (e.g., after sort)
          this.updateRowContent(rowEl, i, rowData, visibleColumns, schemaMap);
        }
      } else if (!this.isPlaceholderRow(rowEl)) {
        // Data row whose cache entry is gone (evicted or invalidated while
        // the element stayed mapped): without this branch the stale painted
        // content would persist at this position indefinitely — render
        // would simply skip it. Recycle the element and show a placeholder
        // until the block fetch brings the row back.
        this.moveFocusToGridBeforeRemoval(rowEl);
        rowEl.remove();
        this.returnRowToPool(rowEl);
        rowEl = this.createPlaceholderRow(i);
        this.rowElementMap.set(i, rowEl);
        this.insertRowInOrder(viewport, rowEl, i);
      }

      // Apply selection/hover styles
      if (rowEl) {
        const selectedClass = `${this.classPrefix}-row--selected`;
        const hoverClass = `${this.classPrefix}-row--hover`;

        const selected = selectedRows.has(i);
        rowEl.classList.toggle(selectedClass, selected);
        this.setRowSelected(rowEl, selected);

        if (hoveredRow === i) {
          rowEl.classList.add(hoverClass);
        } else {
          rowEl.classList.remove(hoverClass);
        }

        // Apply the cursor ring. Cells stay `tabindex="-1"` permanently —
        // the cursor is published via `aria-activedescendant` on `.dt-grid`,
        // not by moving DOM focus, because a recycled row would take real
        // focus with it into the pool.
        const focusClass = `${this.classPrefix}-cell--focused`;
        const focusColIdx =
          focusedCell && focusedCell.row === i ? visibleColumns.indexOf(focusedCell.column) : -1;
        for (let c = 0; c < rowEl.children.length; c++) {
          (rowEl.children[c] as HTMLElement).classList.toggle(focusClass, c === focusColIdx);
        }
      }
    }

    // Keep previousFocusedCell in sync so updateFocusStyles() knows
    // which DOM element currently has the focus class after a rebuild.
    this.previousFocusedCell = focusedCell ? { ...focusedCell } : null;

    // Calculate total width from actual column widths
    const columnWidths = this.state.columnWidths.get();
    let totalWidth = 0;
    for (const colName of visibleColumns) {
      const width = columnWidths.get(colName) ?? 150;
      totalWidth += width;
    }

    // Set width for horizontal scrolling
    // Uses a width spacer element in normal flow to force correct scrollWidth
    this.virtualScroller.setContentWidth(totalWidth);

    // Also set header row width to match for scroll synchronization
    const scrollContainer = this.virtualScroller.getScrollContainer();
    const headerRow = scrollContainer
      .closest(`.${this.classPrefix}-root`)
      ?.querySelector(`.${this.classPrefix}-header-row`) as HTMLElement;
    if (headerRow) {
      headerRow.style.minWidth = `${totalWidth}px`;
    }

    this.onRowsRendered?.();
  }

  /**
   * Insert a row element in the correct position within the viewport
   */
  private insertRowInOrder(viewport: HTMLElement, rowEl: HTMLElement, index: number): void {
    // Find the correct position by looking at existing rows
    const children = Array.from(viewport.children) as HTMLElement[];
    let insertBefore: HTMLElement | null = null;

    for (const child of children) {
      const childIndex = parseInt(child.getAttribute('data-row-index') ?? '-1', 10);
      if (childIndex > index) {
        insertBefore = child;
        break;
      }
    }

    if (insertBefore) {
      viewport.insertBefore(rowEl, insertBefore);
    } else {
      viewport.appendChild(rowEl);
    }
  }

  /**
   * Get a row element from the pool or create a new one
   */
  private getOrCreateRow(columnCount: number): HTMLElement {
    let rowEl = this.rowPool.pop();

    if (rowEl) {
      // Reuse pooled row - ensure it has the right number of cells
      const currentCells = rowEl.children.length;
      if (currentCells < columnCount) {
        // Add missing cells
        for (let i = currentCells; i < columnCount; i++) {
          rowEl.appendChild(this.createCell());
        }
      } else if (currentCells > columnCount) {
        // Remove extra cells. The row itself survives, so `returnRowToPool`
        // never sees these cells — the focus rescue belongs here.
        while (rowEl.children.length > columnCount) {
          const surplus = rowEl.lastChild!;
          this.moveFocusToGridBeforeRemoval(surplus);
          rowEl.removeChild(surplus);
        }
      }

      // Clear any stale classes and ARIA attributes
      rowEl.classList.remove(
        `${this.classPrefix}-row--selected`,
        `${this.classPrefix}-row--hover`,
        `${this.classPrefix}-row--loading`,
      );
      this.setRowSelected(rowEl, false);
      rowEl.removeAttribute('aria-rowindex');
    } else {
      // Create new row
      rowEl = document.createElement('div');
      rowEl.className = `${this.classPrefix}-row`;
      rowEl.setAttribute('role', 'row');
      rowEl.setAttribute('aria-selected', 'false');
      rowEl.style.height = `${this.rowHeight}px`;

      // Create cells
      for (let i = 0; i < columnCount; i++) {
        rowEl.appendChild(this.createCell());
      }
    }

    return rowEl;
  }

  /**
   * Create one body cell.
   *
   * `role="gridcell"` (not `cell`): `cell` is only valid inside
   * `role="table"`, and the grid element above these rows is `role="grid"`.
   * `tabindex="-1"` is permanent — it makes the cell a legal
   * `aria-activedescendant` target without adding a tab stop.
   */
  private createCell(): HTMLElement {
    const cellEl = document.createElement('div');
    cellEl.className = `${this.classPrefix}-cell`;
    cellEl.setAttribute('role', 'gridcell');
    cellEl.setAttribute('tabindex', '-1');
    return cellEl;
  }

  /**
   * Stable DOM id for a body cell, keyed by absolute row index and visible
   * column index. Mirrors `TableContainer.buildCellId`, which computes the
   * same string to resolve the cursor.
   */
  private buildCellId(row: number, colIndex: number): string {
    return `${this.classPrefix}-${this.instanceId}-cell-${row}-${colIndex}`;
  }

  /**
   * Durable placeholder discriminator: the `data-placeholder` attribute is
   * set by `createPlaceholderRow` and removed by `updateRowContent`. Unlike
   * the historical cell-count comparison, it stays unambiguous for
   * single-column tables (1 placeholder cell vs 1 data cell).
   */
  private isPlaceholderRow(rowEl: HTMLElement): boolean {
    return rowEl.hasAttribute('data-placeholder');
  }

  /**
   * Return a row element to the pool for reuse
   */
  private returnRowToPool(rowEl: HTMLElement): void {
    // Skip placeholder rows (marked `data-placeholder`, one cell carrying
    // dt-cell--placeholder). Pooling them lets `getOrCreateRow` later append
    // blank cells alongside the placeholder cell — the appended cells are
    // fine, but the original placeholder cell keeps its dt-cell--placeholder
    // class and would render its column's data in tertiary text colour. GC
    // overhead is trivial: placeholders are cheap to recreate when the data
    // hasn't arrived yet.
    if (this.isPlaceholderRow(rowEl)) {
      return;
    }

    // Clone the element to remove all event listeners
    // When reused, new listeners will be attached via attachRowEventListeners
    const cleanEl = rowEl.cloneNode(true) as HTMLElement;

    // Clear stale state and ARIA attributes
    cleanEl.classList.remove(
      `${this.classPrefix}-row--selected`,
      `${this.classPrefix}-row--hover`,
      `${this.classPrefix}-row--loading`,
    );
    cleanEl.removeAttribute('aria-rowindex');
    cleanEl.setAttribute('aria-selected', 'false');

    // Clear the cursor ring and the per-(row, column) cell ids. A pooled row
    // that kept its ids would duplicate them the moment it is reused for a
    // different row — `getElementById` would then resolve
    // `aria-activedescendant` to the wrong cell.
    const focusClass = `${this.classPrefix}-cell--focused`;
    for (const child of cleanEl.children) {
      const cell = child as HTMLElement;
      cell.classList.remove(focusClass);
      cell.removeAttribute('id');
    }

    // Limit pool size to prevent memory bloat
    if (this.rowPool.length < 100) {
      this.rowPool.push(cleanEl);
    }
  }

  /**
   * Update the content of an existing row element
   */
  private updateRowContent(
    rowEl: HTMLElement,
    index: number,
    data: RowData,
    columns: string[],
    schemaMap: Map<string, ColumnSchema>,
  ): void {
    rowEl.setAttribute('data-row-index', String(index));
    // +2, not +1: under `role="grid"` the column-header row is row 1, so body
    // row 0 is aria-rowindex 2. `aria-rowcount` carries the matching +1.
    rowEl.setAttribute('aria-rowindex', String(index + 2));
    rowEl.classList.remove(`${this.classPrefix}-row--loading`);
    // Placeholders are replaced from the pool rather than updated in place
    // (see the `isPlaceholderRow` guard in `renderVisibleRows`), but strip
    // the loading/busy/placeholder markers defensively anyway: whatever the
    // element's history, from here on it IS a data row.
    rowEl.removeAttribute('aria-busy');
    rowEl.removeAttribute('data-placeholder');

    // Resolve rowId from the __rowid__ column (injected into every row
    // SELECT in buildRowQuery). DuckDB returns BIGINT as bigint or number
    // depending on the driver; Number(…) coerces safely since our row
    // counts stay well below 2^53.
    const rawRowId = data[ROWID_COLUMN];
    const rowId =
      typeof rawRowId === 'bigint'
        ? Number(rawRowId)
        : typeof rawRowId === 'number'
          ? rawRowId
          : null;
    if (rowId !== null && Number.isFinite(rowId)) {
      rowEl.setAttribute('data-row-id', String(rowId));
    } else {
      rowEl.removeAttribute('data-row-id');
    }

    // Apply row-scope annotation classes. See precedence rules (plan §
    // "Precedence rules"): the row tint reflects ONLY row-scope
    // annotations; cell / column annotations stay local.
    this.applyRowAnnotationClasses(rowEl, rowId);

    const columnWidths = this.state.columnWidths.get();
    const pinnedColumns = this.state.pinnedColumns.get();

    const root =
      this.container.closest<HTMLElement>('.' + this.classPrefix + '-root') ?? this.container;
    const baseZ = Number(getComputedStyle(root).getPropertyValue('--dt-z-pinned-col').trim()) || 20;

    // Compute pinned offsets
    const pinnedOffsets = new Map<string, { left: number; zIndex: number }>();
    let cumulativeLeft = 0;
    for (let i = 0; i < pinnedColumns.length; i++) {
      const pCol = pinnedColumns[i]!;
      pinnedOffsets.set(pCol, {
        left: cumulativeLeft,
        zIndex: baseZ + (pinnedColumns.length - i),
      });
      cumulativeLeft += columnWidths.get(pCol) ?? 150;
    }

    const cells = rowEl.children;
    for (let i = 0; i < columns.length && i < cells.length; i++) {
      const colName = columns[i]!;
      const colSchema = schemaMap.get(colName);
      const value = data[colName];
      const cellEl = cells[i] as HTMLElement;

      // Stable id so `aria-activedescendant` on `.dt-grid` can name this
      // cell. Keyed by absolute row index + visible column index, and
      // rewritten on every reuse, so a pooled element never carries a
      // stale id.
      if (this.instanceId) {
        cellEl.id = this.buildCellId(index, i);
      }

      // ARIA: 1-based column index in full schema
      const ariaColIdx = this.colIndexMap.get(colName);
      if (ariaColIdx !== undefined) {
        cellEl.setAttribute('aria-colindex', String(ariaColIdx));
      }

      // `data-column` gives the delegated pointer/focus handler a cheap
      // way to resolve a cell back to its column name without iterating
      // sibling indices.
      cellEl.setAttribute('data-column', colName);

      // Apply dynamic width
      const width = columnWidths.get(colName) ?? 150;
      cellEl.style.width = `${width}px`;

      // Apply pinned cell styles
      const offset = pinnedOffsets.get(colName);
      if (offset) {
        cellEl.style.position = 'sticky';
        cellEl.style.left = `${offset.left}px`;
        cellEl.style.zIndex = String(offset.zIndex);
        cellEl.classList.add(`${this.classPrefix}-cell--pinned`);
      } else {
        cellEl.style.position = '';
        cellEl.style.left = '';
        cellEl.style.zIndex = '';
        cellEl.classList.remove(`${this.classPrefix}-cell--pinned`);
      }

      // Apply derived cell styling (after pinned logic so both classes can coexist)
      if (colSchema?.isDerived) {
        cellEl.classList.add(`${this.classPrefix}-cell--derived`);
      } else {
        cellEl.classList.remove(`${this.classPrefix}-cell--derived`);
      }

      // CellRenderer is intentionally left untouched: it always writes the
      // formatted value into `cellEl.title`. If the cell has annotations
      // (any scope) we CLEAR the title — the AnnotationPopover is the
      // sole tooltip for annotated cells, so the native title would be a
      // duplicate. When all annotations are later removed, a subsequent
      // render restores the formatted title without any tracking state.
      this.cellRenderer.render(cellEl, value, colSchema);
      this.applyCellAnnotationClasses(cellEl, rowId, colName);
    }
  }

  /**
   * Apply row-scope annotation classes to a row element as DOM/CSS
   * markers. `.dt-row--annotated` + `.dt-row--annotation-<sev>` exist for
   * external styling hooks but no longer paint the row themselves — all
   * tint lives on cell-level classes (see `applyCellAnnotationClasses`),
   * which keeps row-scope visuals consistent with col-scope and makes the
   * row hover state immune to `.dt-row:hover`'s bg override. Filters
   * `getByRow` down to `scope === 'row'` because the byRow index also
   * holds cell-scope annotations (every cell ann is indexed into byRow /
   * byColumn / byCell), and a cell-scope ann must not tint its row.
   */
  private applyRowAnnotationClasses(rowEl: HTMLElement, rowId: number | null): void {
    const p = this.classPrefix;
    rowEl.classList.remove(
      `${p}-row--annotated`,
      `${p}-row--annotation-error`,
      `${p}-row--annotation-warning`,
      `${p}-row--annotation-info`,
    );
    if (!this.annotations || rowId === null) return;
    const anns = this.annotations.getByRow(rowId).filter((a) => a.scope === 'row');
    if (anns.length === 0) return;
    // Marker class tracks unfiltered presence; severity class falls back
    // through the hierarchy as the visual filter hides higher tiers.
    rowEl.classList.add(`${p}-row--annotated`);
    const filter = this.annotations.getSeverityFilter();
    const visible = anns.filter((a) => filter[a.severity]);
    const sev = maxSeverity(visible);
    if (sev) rowEl.classList.add(`${p}-row--annotation-${sev}`);
  }

  /**
   * Apply three cell-level annotation class families side-by-side, no
   * union propagation:
   * - `.dt-cell--row-annotated` + severity — every cell in a row with a
   *   row-scope annotation. Makes row annotations paint per cell (same
   *   visual signature as col/cell) so the left-stripe spans every cell
   *   and hover darkens each cell independently instead of losing to
   *   `.dt-row:hover`'s bg override.
   * - `.dt-cell--col-annotated` + severity — every cell in a column with
   *   a column-scope annotation.
   * - `.dt-cell--annotated` + severity — only the cell with its own
   *   cell-scope annotation at this exact `(rowId, colName)`.
   *
   * Hierarchy (cell > col > row) is enforced in CSS by source order:
   * row rules come first, col second, cell last — whichever scope
   * applies last to a given cell wins bg / stripe / hover color. The
   * same strict filters are mirrored in `resolveAnnotatedCell` so the
   * popover content matches the visible paint.
   *
   * Native-title handling: `CellRenderer.render` wrote the formatted
   * value into `cellEl.title` before this call. If ANY scope annotates
   * this cell, we clear the title — the `AnnotationPopover` is the
   * single source of truth for annotated-cell tooltips. Unannotated
   * cells keep the formatted title so hovering still reveals the
   * underlying value.
   *
   * Render-budget note: this runs once per visible cell on every render
   * (~5000 calls/render at 100 cols × 50 rows). It calls `getByRow`,
   * `getByColumn`, and `getByCell` — all O(1) on the AnnotationStore
   * indexes. If those lookups ever change complexity, scroll perf will
   * regress quietly; benchmarks live in
   * `tests/annotations/AnnotationStore.scale.test.ts`.
   */
  private applyCellAnnotationClasses(
    cellEl: HTMLElement,
    rowId: number | null,
    colName: string,
  ): void {
    const p = this.classPrefix;
    cellEl.classList.remove(
      `${p}-cell--row-annotated`,
      `${p}-cell--row-annotation-error`,
      `${p}-cell--row-annotation-warning`,
      `${p}-cell--row-annotation-info`,
      `${p}-cell--col-annotated`,
      `${p}-cell--col-annotation-error`,
      `${p}-cell--col-annotation-warning`,
      `${p}-cell--col-annotation-info`,
      `${p}-cell--annotated`,
      `${p}-cell--annotation-error`,
      `${p}-cell--annotation-warning`,
      `${p}-cell--annotation-info`,
    );
    delete cellEl.dataset['dtAnnotationCount'];
    if (!this.annotations || rowId === null) return;

    // Marker classes (`-annotated`) and the count badge track unfiltered
    // presence so the popover anchor and a11y signals don't disappear when
    // the visual filter hides a tier; the severity class is what falls
    // back through error → warning → info as flags toggle.
    const filter = this.annotations.getSeverityFilter();

    // Row-scope: `getByRow` also holds cell-scope anns at (rowId, any
    // col) via the shared index, so filter to scope === 'row' strictly.
    const rowAnns = this.annotations.getByRow(rowId).filter((a) => a.scope === 'row');
    if (rowAnns.length > 0) {
      cellEl.classList.add(`${p}-cell--row-annotated`);
      const rowSev = maxSeverity(rowAnns.filter((a) => filter[a.severity]));
      if (rowSev) cellEl.classList.add(`${p}-cell--row-annotation-${rowSev}`);
    }

    // Column-scope: same index-leak reasoning — `getByColumn` holds
    // cell-scope anns at (any row, colName) too.
    const colAnns = this.annotations.getByColumn(colName).filter((a) => a.scope === 'column');
    if (colAnns.length > 0) {
      cellEl.classList.add(`${p}-cell--col-annotated`);
      const colSev = maxSeverity(colAnns.filter((a) => filter[a.severity]));
      if (colSev) cellEl.classList.add(`${p}-cell--col-annotation-${colSev}`);
    }

    // Cell-scope: `getByCell` is a union across byRow ∪ byColumn ∪
    // byCell, so scope-filtering alone isn't enough — a cell-scope ann
    // at (rowId, OTHER col) leaks in via byRow[rowId], and one at
    // (OTHER row, colName) leaks in via byColumn[colName]. Require
    // exact rowId + column match too.
    const cellAnns = this.annotations
      .getByCell(rowId, colName)
      .filter((a) => a.scope === 'cell' && a.rowId === rowId && a.column === colName);
    if (cellAnns.length > 0) {
      cellEl.classList.add(`${p}-cell--annotated`);
      const cellSev = maxSeverity(cellAnns.filter((a) => filter[a.severity]));
      if (cellSev) cellEl.classList.add(`${p}-cell--annotation-${cellSev}`);
    }

    const total = rowAnns.length + colAnns.length + cellAnns.length;
    if (total > 0) {
      cellEl.title = '';
      cellEl.dataset['dtAnnotationCount'] = String(total);
    }
  }

  /**
   * Reapply annotation classes to every currently-visible row + cell and
   * every header. Called from the store's `change` event; avoids issuing
   * fresh SQL by reading straight from `rowDataCache` + the annotation
   * store. If the popover is currently open against an anchor whose
   * annotations disappeared, we close it — the list of annotations that
   * drove the original `show()` is no longer valid.
   *
   * Each cell is re-rendered through `cellRenderer.render` before the
   * annotation classes are reapplied. The render call restores the
   * formatted value to `cellEl.title`; `applyCellAnnotationClasses`
   * re-clears it when annotations remain. Without this re-render, removing
   * the last annotation from a cell would leave its native tooltip empty
   * until the next virtualization render swap.
   */
  private reapplyAnnotationsToVisibleRows(): void {
    if (this.destroyed || !this.annotations) return;
    const visibleColumns = this.state.visibleColumns.get();
    const schema = this.state.schema.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const col of schema) schemaMap.set(col.name, col);
    for (const [index, rowEl] of this.rowElementMap) {
      const rowData = this.rowDataCache.get(index);
      if (!rowData) continue;
      const rawRowId = rowData[ROWID_COLUMN];
      const rowId =
        typeof rawRowId === 'bigint'
          ? Number(rawRowId)
          : typeof rawRowId === 'number'
            ? rawRowId
            : null;
      this.applyRowAnnotationClasses(rowEl, rowId);
      const cells = rowEl.children;
      for (let c = 0; c < visibleColumns.length && c < cells.length; c++) {
        const cellEl = cells[c] as HTMLElement;
        const colName = visibleColumns[c]!;
        this.cellRenderer.render(cellEl, rowData[colName], schemaMap.get(colName));
        this.applyCellAnnotationClasses(cellEl, rowId, colName);
      }
    }
    // Popover auto-dismisses: its anchor may have lost its `dt-cell--annotated`
    // class, and re-reading via getByCell would be stale.
    if (this.annotationPopover?.isOpen()) {
      this.annotationPopover.hide();
    }
  }

  /**
   * Create a placeholder row for loading state
   */
  private createPlaceholderRow(index: number): HTMLElement {
    const rowEl = document.createElement('div');
    rowEl.className = `${this.classPrefix}-row ${this.classPrefix}-row--loading`;
    rowEl.setAttribute('role', 'row');
    // One cell against a grid advertising N columns is an incomplete row;
    // `aria-busy` is what tells AT to expect that and hold off announcing it
    // until the data lands. `data-placeholder` is the render pipeline's own
    // durable discriminator (`isPlaceholderRow`): renderVisibleRows replaces
    // marked rows from the pool instead of updating them in place, and
    // returnRowToPool refuses to pool them. `updateRowContent` strips both
    // attributes the moment real data lands in the element.
    rowEl.setAttribute('aria-busy', 'true');
    rowEl.setAttribute('data-placeholder', '1');
    rowEl.style.height = `${this.rowHeight}px`;
    rowEl.setAttribute('data-row-index', String(index));
    rowEl.setAttribute('aria-rowindex', String(index + 2));

    const placeholderCell = this.createCell();
    placeholderCell.classList.add(`${this.classPrefix}-cell--placeholder`);
    placeholderCell.textContent = this.messages.a11y.loadingRowLabel(index + 1);
    rowEl.appendChild(placeholderCell);

    return rowEl;
  }

  /**
   * Attach event listeners to a row element
   */
  private attachRowEventListeners(rowEl: HTMLElement, index: number): void {
    // Mouse enter (hover)
    rowEl.addEventListener('mouseenter', () => {
      if (this.actions && !this.destroyed) {
        this.actions.setHoveredRow(index);
      }
    });

    // Mouse leave (un-hover)
    rowEl.addEventListener('mouseleave', () => {
      if (this.actions && !this.destroyed) {
        this.actions.setHoveredRow(null);
      }
    });

    // Click (selection + focus)
    rowEl.addEventListener('click', (event) => {
      this.handleRowClick(index, event);

      // Set focused cell from clicked cell
      if (this.actions && !this.destroyed) {
        const cellEl = (event.target as HTMLElement).closest(`.${this.classPrefix}-cell`);
        if (cellEl && rowEl.contains(cellEl)) {
          const cellIndex = Array.from(rowEl.children).indexOf(cellEl);
          const visibleColumns = this.state.visibleColumns.get();
          if (cellIndex >= 0 && cellIndex < visibleColumns.length) {
            this.actions.setFocusedCell({
              row: index,
              column: visibleColumns[cellIndex]!,
            });
          }
        }
      }
    });
  }

  /**
   * Resolve an annotated cell to its `(rowId, colName, annotations)`
   * tuple. Accepts any of the three scope-specific classes
   * (`.dt-cell--row-annotated`, `.dt-cell--col-annotated`,
   * `.dt-cell--annotated`) so the popover opens on cells tinted by any
   * scope. The annotation list is composed via three strict per-scope
   * filters — mirrors `applyCellAnnotationClasses` — to avoid the
   * `getByCell` index-union leaking anns from cells that don't actually
   * match this `(rowId, colName)`. Anns are concatenated row → column
   * → cell so `AnnotationPopover.populate`'s sections render
   * broadest-to-most-specific top-down.
   */
  private resolveAnnotatedCell(
    anchor: HTMLElement,
  ): { rowId: number; colName: string; anns: Annotation[] } | null {
    if (!this.annotations) return null;
    const p = this.classPrefix;
    const hasAny =
      anchor.classList.contains(`${p}-cell--annotated`) ||
      anchor.classList.contains(`${p}-cell--col-annotated`) ||
      anchor.classList.contains(`${p}-cell--row-annotated`);
    if (!hasAny) return null;
    const rowEl = anchor.parentElement;
    if (!rowEl) return null;
    const rowIdAttr = rowEl.getAttribute('data-row-id');
    if (rowIdAttr === null) return null;
    const rowId = Number(rowIdAttr);
    if (!Number.isFinite(rowId)) return null;
    const colName = anchor.getAttribute('data-column');
    if (!colName) return null;

    const rowAnns = this.annotations.getByRow(rowId).filter((a) => a.scope === 'row');
    const colAnns = this.annotations.getByColumn(colName).filter((a) => a.scope === 'column');
    const cellAnns = this.annotations
      .getByCell(rowId, colName)
      .filter((a) => a.scope === 'cell' && a.rowId === rowId && a.column === colName);
    const anns = [...rowAnns, ...colAnns, ...cellAnns];
    if (anns.length === 0) return null;
    return { rowId, colName, anns };
  }

  /**
   * Find the annotated-cell ancestor of `target`, if any. Matches any of
   * the three scope-specific class families so row-, column-, and
   * cell-scope tints all trigger the popover.
   */
  private findAnnotatedCell(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const p = this.classPrefix;
    const cell = target.closest(
      `.${p}-cell--annotated, .${p}-cell--col-annotated, .${p}-cell--row-annotated`,
    );
    return cell as HTMLElement | null;
  }

  /**
   * Delegated pointerover handler — opens the popover when the pointer
   * enters an annotated cell. Uses `pointerover` (bubbles) instead of
   * `pointerenter` (doesn't bubble) so a single listener on the viewport
   * covers every cell without per-cell wiring, which matters because
   * virtualization recreates cells on every scroll.
   */
  private handleAnnotationPointerOver = (event: PointerEvent): void => {
    if (this.destroyed || !this.annotationPopover) return;
    const cell = this.findAnnotatedCell(event.target);
    if (!cell) return;
    if (cell === this.currentAnnotationAnchor) return;
    const resolved = this.resolveAnnotatedCell(cell);
    if (!resolved) return;
    this.currentAnnotationAnchor = cell;
    this.annotationPopover.show(cell, resolved.anns);
  };

  /**
   * Delegated pointerout handler — schedules a grace-period hide when the
   * pointer truly leaves an annotated cell. `relatedTarget` check prevents
   * firing on internal transitions between cell children.
   */
  private handleAnnotationPointerOut = (event: PointerEvent): void => {
    if (this.destroyed || !this.annotationPopover) return;
    if (!this.currentAnnotationAnchor) return;
    const related = event.relatedTarget as Node | null;
    if (related && this.currentAnnotationAnchor.contains(related)) return;
    this.currentAnnotationAnchor = null;
    this.annotationPopover.scheduleGraceHide();
  };

  /**
   * Delegated focusin handler — keyboard-triggered popover show.
   */
  private handleAnnotationFocusIn = (event: FocusEvent): void => {
    if (this.destroyed || !this.annotationPopover) return;
    const cell = this.findAnnotatedCell(event.target);
    if (!cell) return;
    if (cell === this.currentAnnotationAnchor) return;
    const resolved = this.resolveAnnotatedCell(cell);
    if (!resolved) return;
    this.currentAnnotationAnchor = cell;
    this.annotationPopover.show(cell, resolved.anns);
  };

  /**
   * Delegated focusout handler — schedules dismissal when focus leaves an
   * annotated cell.
   */
  private handleAnnotationFocusOut = (event: FocusEvent): void => {
    if (this.destroyed || !this.annotationPopover) return;
    if (!this.currentAnnotationAnchor) return;
    const related = event.relatedTarget as Node | null;
    if (related && this.currentAnnotationAnchor.contains(related)) return;
    this.currentAnnotationAnchor = null;
    this.annotationPopover.scheduleGraceHide();
  };

  /**
   * Handle row click for selection
   */
  private handleRowClick(index: number, event: MouseEvent): void {
    if (!this.actions || this.destroyed) return;

    // Determine selection mode based on modifier keys
    let mode: 'replace' | 'toggle' | 'range' = 'replace';

    if (event.shiftKey) {
      mode = 'range';
    } else if (event.ctrlKey || event.metaKey) {
      mode = 'toggle';
    }

    this.actions.selectRow(index, mode);
  }

  // =========================================
  // Style Updates
  // =========================================

  /**
   * Write `aria-selected` on a row.
   *
   * Unselected rows carry `"false"` rather than nothing: inside a `role="grid"`
   * an *absent* `aria-selected` reads as "this row is not selectable at all",
   * which is wrong for rows that answer to click / ctrl-click / shift-click
   * (`selectRow` supports `replace` / `toggle` / `range`).
   *
   * Skips a write that would not change anything — this runs for every row on
   * every scroll frame, and even a no-op `setAttribute` still produces a
   * mutation record for anything observing the grid. Mirrors
   * `TableContainer.syncActiveDescendant`.
   */
  private setRowSelected(rowEl: HTMLElement, selected: boolean): void {
    const value = selected ? 'true' : 'false';
    if (rowEl.getAttribute('aria-selected') !== value) {
      rowEl.setAttribute('aria-selected', value);
    }
  }

  /**
   * Update selection styles on visible rows using O(1) element lookup
   */
  private updateSelectionStyles(): void {
    const selectedRows = this.state.selectedRows.get();
    const selectedClass = `${this.classPrefix}-row--selected`;

    // Use rowElementMap for O(1) lookups instead of querySelectorAll
    for (const [index, rowEl] of this.rowElementMap) {
      const selected = selectedRows.has(index);
      rowEl.classList.toggle(selectedClass, selected);
      this.setRowSelected(rowEl, selected);
    }
  }

  /**
   * Update hover styles using O(1) element lookup
   */
  private updateHoverStyles(): void {
    const hoveredRow = this.state.hoveredRow.get();
    const hoverClass = `${this.classPrefix}-row--hover`;

    // Remove hover from previously hovered row (O(1) lookup)
    if (this.previousHoveredRow !== null && this.previousHoveredRow !== hoveredRow) {
      const prevRowEl = this.rowElementMap.get(this.previousHoveredRow);
      if (prevRowEl) {
        prevRowEl.classList.remove(hoverClass);
      }
    }

    // Add hover to newly hovered row (O(1) lookup)
    if (hoveredRow !== null) {
      const rowEl = this.rowElementMap.get(hoveredRow);
      if (rowEl) {
        rowEl.classList.add(hoverClass);
      }
    }

    this.previousHoveredRow = hoveredRow;
  }

  /**
   * Update focus styles using O(1) element lookup.
   * Removes dt-cell--focused from the previously focused cell (if visible)
   * and adds it to the newly focused cell (if visible).
   */
  private updateFocusStyles(): void {
    const focusedCell = this.state.focusedCell.get();
    const focusClass = `${this.classPrefix}-cell--focused`;
    const visibleColumns = this.state.visibleColumns.get();

    // Remove from previous
    if (this.previousFocusedCell) {
      const prevRowEl = this.rowElementMap.get(this.previousFocusedCell.row);
      if (prevRowEl) {
        const prevColIdx = visibleColumns.indexOf(this.previousFocusedCell.column);
        if (prevColIdx >= 0 && prevColIdx < prevRowEl.children.length) {
          (prevRowEl.children[prevColIdx] as HTMLElement).classList.remove(focusClass);
        }
      }
    }

    // Add to current
    if (focusedCell) {
      const rowEl = this.rowElementMap.get(focusedCell.row);
      if (rowEl) {
        const colIdx = visibleColumns.indexOf(focusedCell.column);
        if (colIdx >= 0 && colIdx < rowEl.children.length) {
          (rowEl.children[colIdx] as HTMLElement).classList.add(focusClass);
        }
      }
    }

    this.previousFocusedCell = focusedCell ? { ...focusedCell } : null;
  }

  /**
   * Update cell widths when column widths change
   */
  private updateCellWidths(): void {
    const visibleColumns = this.state.visibleColumns.get();
    const columnWidths = this.state.columnWidths.get();

    // Update cell widths for all visible rows
    for (const [, rowEl] of this.rowElementMap) {
      const cells = rowEl.children;
      for (let i = 0; i < visibleColumns.length && i < cells.length; i++) {
        const colName = visibleColumns[i]!;
        const width = columnWidths.get(colName) ?? 150;
        (cells[i] as HTMLElement).style.width = `${width}px`;
      }
    }

    // Update total content width
    let totalWidth = 0;
    for (const colName of visibleColumns) {
      const width = columnWidths.get(colName) ?? 150;
      totalWidth += width;
    }
    this.virtualScroller.setContentWidth(totalWidth);

    // Update header row width
    const scrollContainer = this.virtualScroller.getScrollContainer();
    const headerRow = scrollContainer
      .closest(`.${this.classPrefix}-root`)
      ?.querySelector(`.${this.classPrefix}-header-row`) as HTMLElement;
    if (headerRow) {
      headerRow.style.minWidth = `${totalWidth}px`;
    }
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Get the virtual scroller instance
   */
  getVirtualScroller(): VirtualScroller {
    return this.virtualScroller;
  }

  /**
   * Get current visible range
   */
  getVisibleRange(): VisibleRange {
    return this.currentRange;
  }

  /**
   * Force a refresh of the table body
   */
  refresh(): void {
    if (this.destroyed) return;
    this.invalidateCacheAndRefresh();
  }

  /**
   * Scroll to a specific row
   */
  scrollToRow(index: number, align: 'start' | 'center' | 'end' = 'start'): void {
    this.virtualScroller.scrollToRow(index, align);
  }

  /**
   * Check if the table body has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Test-only DOM invariant check: every viewport child's `data-row-index`
   * is strictly ascending and the set exactly covers
   * `[currentRange.start, currentRange.end)`. The viewport contains only
   * row elements (the width spacer is a sibling, see VirtualScroller), so
   * children can be checked directly. No production-path cost.
   *
   * @internal
   */
  __verifyDomOrderForTests(): boolean {
    const children = Array.from(this.virtualScroller.getViewportContainer().children);
    const expectedCount = Math.max(0, this.currentRange.end - this.currentRange.start);
    if (children.length !== expectedCount) return false;
    for (let i = 0; i < children.length; i++) {
      const indexAttr = children[i]!.getAttribute('data-row-index');
      if (indexAttr === null || Number(indexAttr) !== this.currentRange.start + i) {
        return false;
      }
    }
    return true;
  }

  /**
   * Destroy the table body and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Abort in-flight block fetches first so the worker stops paying for
    // superseded queries; their rejections are swallowed inside
    // `fetchBlock`'s catch (QUERY_ABORTED is silent by design).
    this.abortAllBlockFetches();
    // Belt-and-braces: `fetchBlock` already bails on `this.destroyed`, but
    // bumping the epoch keeps this consistent with the guard pattern used
    // by `CrossfilterCoordinator` / `BaseVisualization` and covers any
    // future post-await write paths added inside `fetchBlock`.
    this.epoch++;

    // Cancel any ongoing scroll animation
    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId);
    }

    // Detach delegated annotation listeners
    this.container.removeEventListener('pointerover', this.handleAnnotationPointerOver);
    this.container.removeEventListener('pointerout', this.handleAnnotationPointerOut);
    this.container.removeEventListener('focusin', this.handleAnnotationFocusIn);
    this.container.removeEventListener('focusout', this.handleAnnotationFocusOut);
    if (this.unsubAnnotations) {
      this.unsubAnnotations();
      this.unsubAnnotations = null;
    }
    this.currentAnnotationAnchor = null;

    // Unsubscribe from all state subscriptions
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];

    // Clear caches and pools
    this.rowDataCache.clear();
    this.rowElementMap.clear();
    this.rowPool = [];

    // Destroy virtual scroller. It detaches the whole row subtree in one go,
    // so a cell holding real focus (from a click) has to be rescued first —
    // `TableContainer.render()` destroys and rebuilds the body on every
    // schema / visibleColumns change, and dropping focus to `<body>` there
    // would silently kill the keyboard layer.
    this.moveFocusToGridBeforeRemoval(this.virtualScroller.getViewportContainer());
    this.virtualScroller.destroy();
  }
}
