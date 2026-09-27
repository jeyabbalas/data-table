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
import type { Signal } from '../core/Signal';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';
import { ROWID_COLUMN, type ColumnSchema, type SortColumn, type Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import type { AnnotationPopover } from './AnnotationPopover';
import { CellRenderer } from './Cell';
import { type ColumnLayout, getColumnLayout } from './ColumnLayout';
import { HEADER_ROW_INDEX } from './KeyboardNavigator';
import { buildRowColumnsQuery, buildRowQuery } from './rowQuery';
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
   * The columns to render in each row, when not every visible one:
   * `TableContainer` passes its column window controller's mounted columns.
   * A row then holds a cell for each of them, and a spacer as wide as each
   * run of columns between two of them. Without it, every row holds every
   * visible column.
   *
   * @internal
   */
  mountedColumns?: Pick<Signal<readonly string[]>, 'get' | 'subscribe'> | undefined;
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
 * What a data row holds, left to right: a cell for each column it renders,
 * and a spacer as wide as each run of columns between two of them, or after
 * the last. Built once per render pass and shared by every row built from it,
 * so a row that already has it needs nothing done.
 */
interface RowShape {
  /** The layout its offsets come from. */
  readonly layout: ColumnLayout;
  /** The column list it was built from: the mounted columns, or `visibleColumns`. */
  readonly source: readonly string[];
  /** The columns it has a cell for, in layout order. */
  readonly columns: readonly string[];
  /** Each child's slot: a column's name for a cell, a width in px for a spacer. */
  readonly slots: readonly (string | number)[];
  /**
   * The slots without the spacers' widths. Two shapes with the same structure
   * differ only in spacer widths, which a column resize changes.
   */
  readonly structure: string;
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
 * Column granularity of a row fetch. Around the columns rows render, a fetch
 * selects a run that far again either side, rounded out to multiples of this,
 * so that a scroll of a few columns keeps selecting the same columns, and the
 * rows fetched already keep covering the view.
 */
const FETCH_COLUMN_STEP = 16;

/** The columns a block fetch selects, besides `__rowid__`, which every row has. */
interface FetchColumns {
  /** In layout order, for the `SELECT` list. */
  readonly names: readonly string[];
  readonly set: ReadonlySet<string>;
}

/** Whether rows fetched with `fetched` hold a value for every column in `columns`. */
function holdsAll(fetched: ReadonlySet<string> | undefined, columns: readonly string[]): boolean {
  if (!fetched) return false;
  for (const column of columns) {
    if (column !== ROWID_COLUMN && !fetched.has(column)) return false;
  }
  return true;
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
  // The columns each cached block holds, by block start. Its rows hold values
  // for those only: when rows render a column their block lacks, the block
  // reads it, and until then those cells are pending.
  private blockColumns = new Map<number, ReadonlySet<string>>();
  private lastScrollDirection: 1 | -1 = 1;
  // Runtime safety valve for the __rowid__ range fast path: flipped (once,
  // with a console.warn) if a fast-path result ever violates the dense-rowid
  // premise; every subsequent fetch then uses OFFSET pagination. The flag's
  // false→true transition is also the warn-once gate. See fetchBlock.
  private rowidFastPathDisabled = false;

  // DOM element pooling for efficient rendering
  private rowPool: HTMLElement[] = [];
  private rowElementMap = new Map<number, HTMLElement>();

  // Which columns rows render, and the shape each data row was last built to.
  // The shape is rebuilt when the columns or the layout change, and a row
  // whose shape differs is reconciled to the new one (see shapeRow).
  private readonly mountedColumns: Pick<Signal<readonly string[]>, 'get' | 'subscribe'> | null;
  private cachedShape: RowShape | null = null;
  private readonly rowShapes = new WeakMap<HTMLElement, RowShape>();

  // A render in progress, and another asked for during it (see renderVisibleRows)
  private rendering = false;
  private renderAgain = false;

  // Column name → schema entry, rebuilt when the schema changes
  private schemaMapCache: { schema: ColumnSchema[]; map: Map<string, ColumnSchema> } | null = null;
  private previousHoveredRow: number | null = null;
  private previousFocusedCell: { row: number; column: string } | null = null;

  // `--dt-z-pinned-col`, read at most once per render pass: reading it
  // forces a style recalculation, and `updateRowContent` runs per row.
  private pinnedZBaseCache: number | null = null;

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
    this.mountedColumns = options.mountedColumns ?? null;
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
   * Subscribe to state signals that require re-render
   */
  private subscribeToState(): void {
    // Re-render when the visible columns change, and read only what the rows
    // now lack. Rows are keyed by column name, so every value fetched stays
    // right through a hide, a show or a move, and the rows already cached
    // read a column shown by `__rowid__` (see `fetchBlock`) rather than
    // fetching again, which on a sorted or filtered table would sort or
    // filter it all again. A change that brings a new relation (a derived
    // column added, edited or removed) changes `tableName` too, which
    // refetches everything.
    const unsubVisibleCols = this.state.visibleColumns.subscribe(() => {
      if (this.destroyed) return;
      this.renderVisibleRows();
      if (!this.isAnimatingScroll) void this.ensureFetched();
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

    // Re-render when pinned columns change, to update the sticky styles.
    // From the cache: pinning moves no data, so there is nothing to refetch.
    const unsubPinned = this.state.pinnedColumns.subscribe(() => {
      if (!this.destroyed) {
        this.renderVisibleRows();
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

    // Re-render when the columns to render change, then fetch the rows
    // again if they were fetched without some of them.
    if (this.mountedColumns) {
      const unsubMounted = this.mountedColumns.subscribe(() => {
        if (!this.destroyed) {
          this.renderVisibleRows();
          if (!this.isAnimatingScroll) void this.ensureFetched();
        }
      });
      this.unsubscribes.push(unsubMounted);
    }

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
    this.blockColumns.clear();

    // Clear row element map and return all rows to pool. Cleared before the
    // rows go: moving focus off one can set off a render, which must find
    // none of them.
    const rows = [...this.rowElementMap.values()];
    this.rowElementMap.clear();
    for (const element of rows) {
      this.moveFocusToGridBeforeRemoval(element);
      element.remove();
      this.returnRowToPool(element);
    }

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
   * index is missing from `rowDataCache`, or which were fetched without one
   * of `columns`, ordered viewport-top-first.
   */
  private missingBlocks(range: VisibleRange, columns: readonly string[]): number[] {
    const blocks: number[] = [];
    const start = Math.max(0, range.start);
    for (
      let blockStart = this.blockStartOf(start);
      blockStart < range.end;
      blockStart += this.fetchBlockSize
    ) {
      let complete = holdsAll(this.blockColumns.get(blockStart), columns);
      const end = Math.min(range.end, blockStart + this.fetchBlockSize);
      for (let i = Math.max(start, blockStart); complete && i < end; i++) {
        if (!this.rowDataCache.has(i)) complete = false;
      }
      if (!complete) blocks.push(blockStart);
    }
    return blocks;
  }

  /**
   * What a fetch of the block at `blockStart` can skip: when every row of the
   * block is cached, their `__rowid__`s, and the columns in `columns` they
   * lack. `null` when a row is missing, and the block has to be fetched
   * whole.
   */
  private columnTopUp(
    blockStart: number,
    columns: FetchColumns,
  ): { rowids: number[]; missing: string[] } | null {
    const fetched = this.blockColumns.get(blockStart);
    if (!fetched) return null;
    const end = Math.min(blockStart + this.fetchBlockSize, this.virtualScroller.getTotalRows());
    const rowids: number[] = [];
    for (let i = blockStart; i < end; i++) {
      const row = this.rowDataCache.get(i);
      const id = row ? Number(row[ROWID_COLUMN]) : Number.NaN;
      if (!Number.isSafeInteger(id)) return null;
      rowids.push(id);
    }
    const missing = columns.names.filter((column) => !fetched.has(column));
    return rowids.length > 0 && missing.length > 0 ? { rowids, missing } : null;
  }

  /**
   * Put the columns a top-up read into the block's cached rows, matched by
   * `__rowid__`, and drop the ones `columns` no longer has, so that a block
   * holds about one fetch's columns however far it is swept. A row the read
   * did not return is dropped too, and so fetched again with its block.
   */
  private mergeColumns(
    blockStart: number,
    rows: RowData[],
    missing: readonly string[],
    columns: FetchColumns,
  ): void {
    const byId = new Map<number, RowData>();
    for (const row of rows) byId.set(Number(row[ROWID_COLUMN]), row);
    const end = blockStart + this.fetchBlockSize;
    for (let i = blockStart; i < end; i++) {
      const cached = this.rowDataCache.get(i);
      if (!cached) continue;
      const fresh = byId.get(Number(cached[ROWID_COLUMN]));
      if (!fresh) {
        this.rowDataCache.delete(i);
        continue;
      }
      for (const key of Object.keys(cached)) {
        if (key !== ROWID_COLUMN && !columns.set.has(key)) delete cached[key];
      }
      for (const key of missing) cached[key] = fresh[key];
    }
    this.blockColumns.set(blockStart, columns.set);
  }

  /**
   * The columns a block fetch selects now: the ones rows render, and around
   * each run of them as many again either side, rounded out to multiples of
   * {@link FETCH_COLUMN_STEP}.
   *
   * Every visible column when rows render every visible column. With a column
   * window, a 1,000-column table's block selects some hundred columns rather
   * than all of them, and converting a block to JavaScript objects, most of a
   * fetch's time, shrinks with it.
   */
  private fetchColumns(): FetchColumns {
    const layout = getColumnLayout(this.state);
    const n = layout.columns.length;
    const picked = new Set<number>();
    // The pinned block as it is; every other run of adjacent columns widened.
    const unpinned: number[] = [];
    for (const column of this.rowShape().columns) {
      const index = layout.indexOf(column);
      if (index < layout.pinnedCount) picked.add(index);
      else unpinned.push(index);
    }
    for (let i = 0; i < unpinned.length;) {
      let j = i + 1;
      while (j < unpinned.length && unpinned[j] === unpinned[j - 1]! + 1) j++;
      const start = unpinned[i]!;
      const end = unpinned[j - 1]! + 1;
      const pad = end - start;
      const from = Math.max(
        layout.pinnedCount,
        Math.floor((start - pad) / FETCH_COLUMN_STEP) * FETCH_COLUMN_STEP,
      );
      const to = Math.min(n, Math.ceil((end + pad) / FETCH_COLUMN_STEP) * FETCH_COLUMN_STEP);
      for (let k = from; k < to; k++) picked.add(k);
      i = j;
    }
    const names: string[] = [];
    for (const index of [...picked].sort((a, b) => a - b)) {
      const name = layout.columns[index]!;
      if (name !== ROWID_COLUMN) names.push(name);
    }
    return { names, set: new Set(names) };
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

    // The columns rows render, and the ones a fetch started now selects.
    const rendered = this.rowShape().columns;
    const columns = this.fetchColumns();
    const needed = this.missingBlocks(this.currentRange, rendered);

    // Abort in-flight blocks that no longer intersect the current range
    // padded by one block on each side. Deleting the entry here (not in the
    // fetch's own `finally`) frees the slot for the same-pass top-up below.
    // A fetch that will land without columns rows render now is left to land:
    // aborting it during a sideways fling starved the view of every fetch,
    // and reading the columns it lacks afterwards is cheap (see fetchBlock).
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
      started.push(this.fetchBlock(blockStart, this.epoch, controller, false, columns));
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
        (!this.rowDataCache.has(candidate) || !holdsAll(this.blockColumns.get(candidate), rendered))
      ) {
        const controller = new AbortController();
        this.prefetch = { blockStart: candidate, controller };
        started.push(this.fetchBlock(candidate, this.epoch, controller, true, columns));
      }
    }

    if (started.length > 0) {
      await Promise.allSettled(started);
    }
  }

  /**
   * Whether the unsorted/unfiltered `__rowid__` range fast path applies.
   * `fetchBlock` asks once per fetch and passes the answer to
   * `buildRowQuery` (SQL shape), so the SQL and the cache keying + density
   * valve can never disagree about which shape a query used.
   */
  private useRowidFastPath(sortColumns: SortColumn[], filters: Filter[]): boolean {
    return filters.length === 0 && sortColumns.length === 0 && !this.rowidFastPathDisabled;
  }

  /**
   * Fetch one aligned block, selecting `columns`, and write it into
   * `rowDataCache`.
   *
   * When every row of the block is cached already, only the columns in
   * `columns` it lacks are read, by `__rowid__` (see {@link columnTopUp}):
   * fetching a sorted or filtered block again repeats its sort and `OFFSET`,
   * which clipping the columns does nothing for. Otherwise the fetched rows
   * replace any cached for the block. Either way the block ends up holding
   * `columns`, and no more.
   *
   * Cache keying: the fast path keys by each row's own `__rowid__` (which
   * the density valve has just proven equals the positional index); the
   * OFFSET path keys by `blockStart + i` — valid because `buildRowQuery`
   * (rowQuery.ts) always emits a fully deterministic ORDER BY (see the
   * tiebreaker note there), so the block window is stable across queries.
   */
  private async fetchBlock(
    blockStart: number,
    epochAtStart: number,
    controller: AbortController,
    isPrefetch: boolean,
    columns: FetchColumns,
  ): Promise<void> {
    try {
      const tableName = this.state.tableName.get();
      if (!tableName) return;
      if (this.state.visibleColumns.get().length === 0) return;

      const limit = Math.min(this.fetchBlockSize, this.virtualScroller.getTotalRows() - blockStart);
      if (limit <= 0) return;

      const topUp = this.columnTopUp(blockStart, columns);
      if (topUp) {
        const read = await this.bridge.query<RowData>(
          buildRowColumnsQuery({
            tableName,
            columns: topUp.missing,
            rowids: topUp.rowids,
            schema: this.state.schema.get(),
          }),
          controller.signal,
          { cache: false, priority: isPrefetch ? 'normal' : 'high' },
        );
        if (this.destroyed || epochAtStart !== this.epoch || controller.signal.aborted) return;
        this.mergeColumns(blockStart, read, topUp.missing, columns);
        if (blockStart < this.currentRange.end && blockStart + limit > this.currentRange.start) {
          this.renderVisibleRows();
        }
        return;
      }

      const sortColumns = this.state.sortColumns.get();
      const filters = this.state.filters.get();
      const usedFastPath = this.useRowidFastPath(sortColumns, filters);
      const sql = buildRowQuery({
        tableName,
        columns: [...columns.names],
        sortColumns,
        filters,
        offset: blockStart,
        limit,
        schema: this.state.schema.get(),
        rowidFastPath: usedFastPath,
      });

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

      if (usedFastPath) {
        // Density valve: the fast path is only correct while __rowid__ is
        // dense 0..N-1. A short window or an out-of-range rowid means the
        // premise broke somewhere — disable the fast path permanently for
        // this instance (the false→true flip below is also the warn-once
        // gate) and re-issue THIS block via OFFSET on the same controller.
        // Bounded recursion: with the flag set, the retry cannot re-enter
        // this branch. Nothing is cached from the violating result.
        let dense = rows.length === limit;
        if (dense) {
          for (const row of rows) {
            const rowid = Number(row[ROWID_COLUMN]);
            if (!Number.isInteger(rowid) || rowid < blockStart || rowid >= blockStart + limit) {
              dense = false;
              break;
            }
          }
        }
        if (!dense) {
          this.rowidFastPathDisabled = true;
          console.warn(
            'TableBody: __rowid__ range fast path returned an inconsistent window ' +
              `(block ${blockStart}, expected ${limit} rows, got ${rows.length}); ` +
              'falling back to OFFSET pagination.',
          );
          // `await` is load-bearing: a bare `return promise` would run this
          // call's `finally` (deregister + reconcile) while the retry is
          // still in flight, and the reconciler would double-issue the
          // block. With `await`, the retry's own finally deregisters first
          // and this one's identity guard turns into a no-op.
          return await this.fetchBlock(blockStart, epochAtStart, controller, isPrefetch, columns);
        }
        for (const row of rows) {
          this.rowDataCache.set(Number(row[ROWID_COLUMN]), row);
        }
      } else {
        rows.forEach((row, i) => {
          this.rowDataCache.set(blockStart + i, row);
        });
      }
      this.blockColumns.set(blockStart, columns.set);

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
      this.blockColumns.delete(blockStart);
      total -= blockRowCounts.get(blockStart) ?? 0;
    }
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
   *
   * A render asked for while one is running runs after it rather than inside
   * it. One can be: a pass that removes the element holding focus moves focus
   * to the grid, and the column window controller hears of that focus.
   */
  private renderVisibleRows(): void {
    if (this.destroyed) return;
    if (this.rendering) {
      this.renderAgain = true;
      return;
    }
    this.rendering = true;
    try {
      do {
        this.renderAgain = false;
        this.renderPass();
      } while (this.renderAgain && !this.destroyed);
    } finally {
      this.rendering = false;
    }
  }

  /** One pass of {@link renderVisibleRows}. */
  private renderPass(): void {
    this.pinnedZBaseCache = null;

    const viewport = this.virtualScroller.getViewportContainer();
    const shape = this.rowShape();
    const selectedRows = this.state.selectedRows.get();
    const hoveredRow = this.state.hoveredRow.get();
    const focusedCell = this.state.focusedCell.get();

    const newStart = this.currentRange.start;
    const newEnd = this.currentRange.end;
    const schemaMap = this.schemaMap();

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
          rowEl = this.getOrCreateRow();
          this.shapeRow(rowEl, shape);
          this.updateRowContent(rowEl, i, rowData, schemaMap);
          this.attachRowEventListeners(rowEl, i);
        } else {
          // Data not yet loaded - create placeholder
          rowEl = this.createPlaceholderRow(i);
        }
        this.rowElementMap.set(i, rowEl);
        this.insertRowInOrder(viewport, rowEl, i);
      } else if (rowData) {
        // The map can hold either a data row (a cell per rendered column,
        // listeners attached) or a placeholder (1 cell, no listeners,
        // `data-placeholder` marker). A placeholder is replaced from the pool,
        // never filled in place: it has no listeners, and its one cell is the
        // loading label. The marker is the durable signal — unlike the
        // historical cell-count comparison it stays unambiguous for
        // single-column tables.
        if (this.isPlaceholderRow(rowEl)) {
          // Bypasses `returnRowToPool` entirely, so the focus rescue has to be
          // spelled out here as well.
          this.moveFocusToGridBeforeRemoval(rowEl);
          rowEl.remove();
          rowEl = this.getOrCreateRow();
          this.shapeRow(rowEl, shape);
          this.updateRowContent(rowEl, i, rowData, schemaMap);
          this.attachRowEventListeners(rowEl, i);
          this.rowElementMap.set(i, rowEl);
          this.insertRowInOrder(viewport, rowEl, i);
        } else {
          // A data row built for other columns is reshaped in place, which
          // keeps the cells of the columns it still renders, and so the one
          // holding focus. Then its content is refreshed (e.g., after sort).
          this.shapeRow(rowEl, shape);
          this.updateRowContent(rowEl, i, rowData, schemaMap);
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
        const focusColumn = focusedCell && focusedCell.row === i ? focusedCell.column : null;
        for (const cell of rowEl.children) {
          cell.classList.toggle(
            focusClass,
            focusColumn !== null && cell.getAttribute('data-column') === focusColumn,
          );
        }
      }
    }

    // Keep previousFocusedCell in sync so updateFocusStyles() knows
    // which DOM element currently has the focus class after a rebuild.
    this.previousFocusedCell = focusedCell ? { ...focusedCell } : null;

    const totalWidth = getColumnLayout(this.state).totalWidth;

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
   * Get a row element from the pool or create a new one. A pooled row keeps
   * its cells, for {@link shapeRow} to reuse; a new one has none.
   */
  private getOrCreateRow(): HTMLElement {
    let rowEl = this.rowPool.pop();

    if (rowEl) {
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
    }

    return rowEl;
  }

  /** Column name → schema entry for the current schema. */
  private schemaMap(): Map<string, ColumnSchema> {
    const schema = this.state.schema.get();
    if (this.schemaMapCache?.schema !== schema) {
      this.schemaMapCache = { schema, map: new Map(schema.map((col) => [col.name, col])) };
    }
    return this.schemaMapCache.map;
  }

  /**
   * The shape data rows take in this render pass: a cell for each column to
   * render, in layout order, with a spacer standing in for each run of
   * columns between two of them and after the last.
   *
   * The columns are the mounted ones when a column window controller supplies
   * them, and every visible column otherwise. A trailing spacer keeps the
   * last cell a row renders from being its last child unless its column is
   * the last one: `.dt-cell:last-child` drops the right border.
   */
  private rowShape(): RowShape {
    const layout = getColumnLayout(this.state);
    const source = this.mountedColumns?.get() ?? this.state.visibleColumns.get();
    const cached = this.cachedShape;
    if (cached && cached.layout === layout && cached.source === source) return cached;

    // By layout index, so the order is the layout's whatever `source` says,
    // and a column that is no longer visible is left out.
    const indices: number[] = [];
    for (const column of source) {
      const index = layout.indexOf(column);
      if (index >= 0) indices.push(index);
    }
    indices.sort((a, b) => a - b);

    const slots: (string | number)[] = [];
    const columns: string[] = [];
    let x = 0;
    let previous = -1;
    for (const index of indices) {
      if (index === previous) continue;
      previous = index;
      const left = layout.leftAt(index);
      if (left > x) slots.push(left - x);
      slots.push(layout.columns[index]!);
      columns.push(layout.columns[index]!);
      x = left + layout.widthAt(index);
    }
    if (layout.totalWidth > x) slots.push(layout.totalWidth - x);

    const shape: RowShape = {
      layout,
      source,
      columns,
      slots,
      structure: JSON.stringify(slots.map((slot) => (typeof slot === 'number' ? 0 : slot))),
    };
    this.cachedShape = shape;
    return shape;
  }

  /**
   * Make a data row's children match `shape`: a cell for each of its columns
   * and a spacer for each gap, in order.
   *
   * A cell keeps its column. Cells of columns the shape still has stay in
   * place, and everything else is built or taken out around them, so a
   * scroll never detaches a cell that stays mounted: detaching the one
   * holding focus would drop focus to `<body>`. A new column order moves the
   * cells it has to, but never the one holding focus. Cells of columns the
   * shape no longer has, and spacers, are reused for the new ones;
   * {@link updateRowContent} then fills them.
   */
  private shapeRow(rowEl: HTMLElement, shape: RowShape): void {
    const built = this.rowShapes.get(rowEl);
    if (built === shape) return;
    this.rowShapes.set(rowEl, shape);

    const children = Array.from(rowEl.children) as HTMLElement[];
    if (built?.structure === shape.structure && children.length === shape.slots.length) {
      // The same cells in the same places: only spacer widths can differ.
      for (let i = 0; i < children.length; i++) {
        const slot = shape.slots[i]!;
        if (typeof slot === 'number') children[i]!.style.width = `${slot}px`;
      }
      return;
    }

    const wanted = new Set<string>();
    for (const slot of shape.slots) if (typeof slot === 'string') wanted.add(slot);
    const kept = new Map<string, HTMLElement>();
    const freeCells: HTMLElement[] = [];
    const freeSpacers: HTMLElement[] = [];
    for (const child of children) {
      const column = this.isSpacer(child) ? null : child.getAttribute('data-column');
      if (column !== null && wanted.has(column) && !kept.has(column)) {
        kept.set(column, child);
        continue;
      }
      this.moveFocusToGridBeforeRemoval(child);
      child.remove();
      if (this.isSpacer(child)) freeSpacers.push(child);
      else freeCells.push(child);
    }

    // What the row is to hold, in order: the kept cells, and freed cells and
    // spacers reused for the rest.
    const nodes = shape.slots.map((slot): HTMLElement => {
      if (typeof slot === 'number') {
        const spacer = freeSpacers.pop() ?? this.createSpacer();
        spacer.style.width = `${slot}px`;
        return spacer;
      }
      const cell = kept.get(slot);
      if (cell) return cell;
      const fresh = freeCells.pop() ?? this.createCell();
      fresh.setAttribute('data-column', slot);
      return fresh;
    });

    // Put each node next to its neighbour, working out from one that stays
    // where it is: the cell holding focus, or else the first kept cell. A
    // node already beside its neighbour is not touched, so a scroll moves no
    // kept cell. A reorder moves the kept cells it has to, and never the one
    // holding focus, which moving would blur.
    const root = rowEl.getRootNode();
    const active = 'activeElement' in root ? (root as Document | ShadowRoot).activeElement : null;
    let anchor = active ? nodes.findIndex((node) => node.contains(active)) : -1;
    if (anchor < 0) anchor = nodes.findIndex((node) => node.parentNode === rowEl);
    if (anchor < 0) {
      rowEl.append(...nodes);
      return;
    }
    for (let i = anchor - 1; i >= 0; i--) {
      if (nodes[i]!.nextSibling !== nodes[i + 1]) rowEl.insertBefore(nodes[i]!, nodes[i + 1]!);
    }
    for (let i = anchor + 1; i < nodes.length; i++) {
      const previous = nodes[i - 1]!;
      if (previous.nextSibling !== nodes[i]) rowEl.insertBefore(nodes[i]!, previous.nextSibling);
    }
  }

  /**
   * A spacer: as wide as the columns between two cells a row renders, which
   * it stands in for. Hidden from assistive tech, which learns where each
   * cell is from its `aria-colindex`.
   */
  private createSpacer(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.classPrefix}-col-spacer`;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  private isSpacer(el: Element): boolean {
    return el.classList.contains(`${this.classPrefix}-col-spacer`);
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
    // dt-cell--placeholder). Pooling them would let `shapeRow` later reuse
    // the placeholder cell for a column, and it keeps its
    // dt-cell--placeholder class, which would render its column's data in
    // tertiary text colour. GC overhead is trivial: placeholders are cheap to
    // recreate when the data hasn't arrived yet.
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
   * Make a cell sticky at its pinned column's offset, or undo that.
   *
   * Only a cell that was pinned carries sticky styles to clear (a pooled row
   * keeps its classes and styles together), so an unpinned cell without the
   * class is left untouched: this runs for every cell on every resize step.
   */
  private applyPinnedCellStyle(cellEl: HTMLElement, column: string): void {
    const placement = getColumnLayout(this.state).pinnedPlacement(column);
    const pinnedClass = `${this.classPrefix}-cell--pinned`;
    if (placement) {
      cellEl.style.position = 'sticky';
      cellEl.style.left = `${placement.left}px`;
      cellEl.style.zIndex = String(this.pinnedZBase() + placement.zOffset);
      cellEl.classList.add(pinnedClass);
    } else if (cellEl.classList.contains(pinnedClass)) {
      cellEl.style.position = '';
      cellEl.style.left = '';
      cellEl.style.zIndex = '';
      cellEl.classList.remove(pinnedClass);
    }
  }

  /** `--dt-z-pinned-col` from the table root, cached for the render pass. */
  private pinnedZBase(): number {
    if (this.pinnedZBaseCache === null) {
      const root =
        this.container.closest<HTMLElement>('.' + this.classPrefix + '-root') ?? this.container;
      this.pinnedZBaseCache =
        Number(getComputedStyle(root).getPropertyValue('--dt-z-pinned-col').trim()) || 20;
    }
    return this.pinnedZBaseCache;
  }

  /**
   * Update the content of an existing row element
   */
  private updateRowContent(
    rowEl: HTMLElement,
    index: number,
    data: RowData,
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

    const layout = getColumnLayout(this.state);

    // The columns the row's block was fetched with. A cell of any other has
    // no value yet: it is pending until the block is fetched again with it.
    const fetched = this.blockColumns.get(this.blockStartOf(index));
    let pending = false;

    // Each cell's column is its `data-column`, which `shapeRow` set; spacers
    // have none.
    for (const child of rowEl.children) {
      const colName = child.getAttribute('data-column');
      if (colName === null) continue;
      const colSchema = schemaMap.get(colName);
      const cellEl = child as HTMLElement;

      // Stable id so `aria-activedescendant` on `.dt-grid` can name this
      // cell. Keyed by absolute row index + the column's position among the
      // visible columns (not the cell's position in the row, which only
      // coincides while a row holds every visible column), and rewritten on
      // every reuse, so a pooled element never carries a stale id.
      if (this.instanceId) {
        cellEl.id = this.buildCellId(index, layout.indexOf(colName));
      }

      // ARIA: 1-based position in the presented order, hidden columns
      // included — see `ColumnLayout.ariaColIndex`.
      const ariaColIdx = layout.ariaColIndex(colName);
      if (ariaColIdx !== undefined) {
        cellEl.setAttribute('aria-colindex', String(ariaColIdx));
      }

      cellEl.style.width = `${layout.widthOf(colName)}px`;
      this.applyPinnedCellStyle(cellEl, colName);

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
      if (this.renderCellValue(cellEl, data, colName, colSchema, fetched)) pending = true;
      this.applyCellAnnotationClasses(cellEl, rowId, colName);
    }
    // Hold assistive tech off a row still missing some of its values, as a
    // placeholder row does.
    if (pending) rowEl.setAttribute('aria-busy', 'true');
  }

  /**
   * Render one cell's value from its row's data, or leave it empty and
   * pending when the row was fetched without its column: `undefined` there
   * means "not fetched", not NULL.
   *
   * @returns whether the cell is pending.
   */
  private renderCellValue(
    cellEl: HTMLElement,
    data: RowData,
    colName: string,
    colSchema: ColumnSchema | undefined,
    fetched: ReadonlySet<string> | undefined,
  ): boolean {
    const pendingClass = `${this.classPrefix}-cell--pending`;
    if (colName !== ROWID_COLUMN && fetched !== undefined && !fetched.has(colName)) {
      cellEl.textContent = '';
      cellEl.removeAttribute('title');
      // A cell reused from another column may carry what CellRenderer wrote
      // there, and a selector for NULLs would count it.
      cellEl.classList.remove(`${this.classPrefix}-cell--null`, `${this.classPrefix}-cell--number`);
      cellEl.classList.add(pendingClass);
      return true;
    }
    cellEl.classList.remove(pendingClass);
    this.cellRenderer.render(cellEl, data[colName], colSchema);
    return false;
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
   * Each cell is re-rendered through `renderCellValue` before the
   * annotation classes are reapplied. The render call restores the
   * formatted value to `cellEl.title`; `applyCellAnnotationClasses`
   * re-clears it when annotations remain. Without this re-render, removing
   * the last annotation from a cell would leave its native tooltip empty
   * until the next virtualization render swap. A cell whose row was fetched
   * without its column stays pending, not NULL.
   */
  private reapplyAnnotationsToVisibleRows(): void {
    if (this.destroyed || !this.annotations) return;
    const schemaMap = this.schemaMap();
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
      const fetched = this.blockColumns.get(this.blockStartOf(index));
      for (const cell of rowEl.children) {
        const colName = cell.getAttribute('data-column');
        if (colName === null) continue;
        const cellEl = cell as HTMLElement;
        this.renderCellValue(cellEl, rowData, colName, schemaMap.get(colName), fetched);
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
        const column = cellEl && rowEl.contains(cellEl) ? cellEl.getAttribute('data-column') : null;
        if (column !== null && this.state.visibleColumns.get().includes(column)) {
          this.actions.setFocusedCell({ row: index, column });
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

    // Remove from previous
    if (this.previousFocusedCell) {
      const prevRowEl = this.rowElementMap.get(this.previousFocusedCell.row);
      if (prevRowEl) {
        this.cellFor(prevRowEl, this.previousFocusedCell.column)?.classList.remove(focusClass);
      }
    }

    // Add to current
    if (focusedCell) {
      const rowEl = this.rowElementMap.get(focusedCell.row);
      if (rowEl) {
        this.cellFor(rowEl, focusedCell.column)?.classList.add(focusClass);
      }
    }

    this.previousFocusedCell = focusedCell ? { ...focusedCell } : null;
  }

  /**
   * The cell showing `column` in a rendered row, found by its `data-column`
   * rather than its position: nothing outside `updateRowContent` may assume
   * a row holds every visible column, in order. `null` for a placeholder row,
   * whose one cell belongs to no column.
   */
  private cellFor(rowEl: HTMLElement, column: string): HTMLElement | null {
    for (const cell of rowEl.children) {
      if (cell.getAttribute('data-column') === column) return cell as HTMLElement;
    }
    return null;
  }

  /**
   * Update cell widths when column widths change
   *
   * In place, without re-rendering content: this runs on every step of a
   * resize drag. A width moves every column after it, so spacers are resized
   * too. Which columns rows render does not change here: when a width moves
   * the column window, the controller has published the new columns, and
   * the rows have been rendered for them, before this runs.
   */
  private updateCellWidths(): void {
    const layout = getColumnLayout(this.state);
    this.pinnedZBaseCache = null;

    const shape = this.rowShape();

    // Update cell widths for all visible rows. A pinned column's width also
    // moves every later pinned column's sticky offset.
    for (const [, rowEl] of this.rowElementMap) {
      if (!this.isPlaceholderRow(rowEl)) this.shapeRow(rowEl, shape);
      for (const cell of rowEl.children) {
        const colName = cell.getAttribute('data-column');
        if (colName === null) continue;
        (cell as HTMLElement).style.width = `${layout.widthOf(colName)}px`;
        this.applyPinnedCellStyle(cell as HTMLElement, colName);
      }
    }

    // Update total content width
    const totalWidth = layout.totalWidth;
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
    this.blockColumns.clear();
    this.rowElementMap.clear();
    this.rowPool = [];

    // Destroy virtual scroller. It detaches the whole row subtree in one go,
    // so a cell holding real focus (from a click) has to be rescued first —
    // `TableContainer.render()` destroys and rebuilds the body when the
    // schema or the table changes, and dropping focus to `<body>` there
    // would silently kill the keyboard layer.
    this.moveFocusToGridBeforeRemoval(this.virtualScroller.getViewportContainer());
    this.virtualScroller.destroy();
  }
}
