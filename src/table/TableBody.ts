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
import {
  BOX_OVERHEAD_PX,
  ColumnWindowModel,
  MIN_OVERSCAN_COLUMNS,
  buildColumnIndexMap,
  pinnedOffsets,
  resolveColumnWidth,
  resolvePinnedCount,
  type ColumnWindow,
  type PinnedOffset,
} from './ColumnWindow';
import { HEADER_ROW_INDEX } from './KeyboardNavigator';
import { VirtualScroller, type VisibleRange } from './VirtualScroller';

/**
 * Everything one render pass needs, computed once at the top of the pass and
 * threaded down instead of re-derived per row or per cell.
 *
 * The window in particular is read from here and never from
 * `this.columnWindow` inside the loop: the field is assigned from this same
 * object before the loop starts, so a pass can never straddle two windows.
 */
interface RenderPass {
  columns: readonly string[];
  schemaMap: Map<string, ColumnSchema>;
  columnWidths: ReadonlyMap<string, number>;
  win: ColumnWindow;
  pinned: Map<string, PinnedOffset>;
  /** `annotations.count() > 0` — see {@link TableBody.ANNOTATED_ATTR}. */
  annotationsActive: boolean;
}

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
  // Runtime safety valve for the __rowid__ range fast path: flipped (once,
  // with a console.warn) if a fast-path result ever violates the dense-rowid
  // premise; every subsequent fetch then uses OFFSET pagination. The flag's
  // false→true transition is also the warn-once gate. See fetchBlock.
  private rowidFastPathDisabled = false;

  // DOM element pooling for efficient rendering
  private rowPool: HTMLElement[] = [];
  private rowElementMap = new Map<number, HTMLElement>();
  /**
   * Listener lifetime for each live row, keyed by the element itself.
   *
   * A row's `mouseenter` / `mouseleave` / `click` handlers close over its row
   * index, so reusing an element for a different row means replacing them —
   * and they are anonymous, so `removeEventListener` cannot reach them. One
   * `AbortController` per row detaches all three at once. Weak so a row that
   * falls out of both the map and the pool takes its entry with it.
   */
  private rowListeners = new WeakMap<HTMLElement, AbortController>();
  private previousHoveredRow: number | null = null;
  /**
   * The element currently carrying the cursor ring.
   *
   * The *element*, not the `(row, column)` it was drawn for. Re-deriving it
   * would mean resolving the old cursor through the current window, and a row
   * repainted in place for a moved window of the same size resolves it to a
   * different column's cell — or to nothing at all, which strands the ring on
   * whatever cell used to hold it. Holding the reference makes the removal
   * exact regardless of what moved in between, and costs one field.
   */
  private focusedCellEl: HTMLElement | null = null;

  // Cached column name -> 1-based presented index for aria-colindex
  private colIndexMap = new Map<string, number>();

  // Last observed visibleColumns, so a write can be classified as a reorder
  // (same set, new order — re-render) or a real change (re-fetch).
  private lastVisibleColumns: string[] = [];

  // ---- Column window ------------------------------------------------------
  //
  // Prefix sums + the window arithmetic. The model is pure; everything DOM
  // about the window lives here.
  private readonly columnWindowModel = new ColumnWindowModel();
  // The window the currently rendered rows were built for. Assigned once per
  // pass, from the same local the pass threads down.
  private columnWindow: ColumnWindow = {
    start: 0,
    end: 0,
    pinnedCount: 0,
    leftSpacerPx: 0,
    rightSpacerPx: 0,
    pinnedWidthPx: 0,
    totalWidthPx: 0,
    pinnedPrefixViolated: false,
  };
  // column name -> index into visibleColumns. Replaces the per-lookup
  // `visibleColumns.indexOf` calls, which were O(N) on the focus path.
  private visibleIndexMap = new Map<string, number>();
  private visibleIndexSource: readonly string[] | null = null;
  // The element whose `scrollLeft` the window is computed from, and the offset
  // the current window was computed at. `-1` is "never computed", which no
  // real offset can be.
  private readonly columnScrollSource: HTMLElement;
  private lastScrollLeft = -1;
  private horizontalScrollRAF: number | null = null;
  // Watches the scroll container's box, because the window depends on its
  // width as much as on the scroll offset. `-1` is "never measured".
  private readonly columnResizeObserver: ResizeObserver;
  private lastClientWidth = -1;
  // Re-entrancy guard for the width path: `updateCellWidths` can re-render,
  // and a render notifies its host, which is free to write column widths.
  // `widthUpdatePending` records a write that arrived while the guard was up,
  // so it is replayed rather than lost.
  private inWidthUpdate = false;
  private widthUpdatePending = false;
  /**
   * How many times {@link TableBody.updateCellWidths} will replay a width
   * write that arrived from inside its own re-render.
   *
   * A host writing a width from `onRowsRendered` is legitimate and converges
   * in one extra pass: the replay renders its width, and the render's own
   * notification produces no new write. A host that writes a *different*
   * width every time never converges, and the replay used to be a tail call
   * — so it recursed until the stack overflowed. Four replays on top of the
   * first pass is well past any honest case, and small enough that the
   * pathological one costs five renders and a warning instead of a crash.
   */
  private static readonly MAX_WIDTH_UPDATE_REPLAYS = 4;

  /**
   * Marks a row that was painted while the annotation store held something.
   *
   * The per-cell annotation pass runs ~14 `classList.remove` per cell and is
   * pure overhead for the overwhelmingly common case of no annotations at all.
   * Skipping it needs one guard beyond "the store is empty": a row painted
   * while annotations existed still carries their classes, and pooling does
   * not scrub them, so it has to get one more stripping pass after the store
   * empties — including if it spends that transition sitting in the pool.
   * This attribute is that memory.
   */
  private static readonly ANNOTATED_ATTR = 'data-ann-painted';
  /** `data-window="P:W"` — a **structure** signature, never a position one. */
  private static readonly WINDOW_ATTR = 'data-window';

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

    // Horizontal scroll drives the column window. A second listener on the
    // same element rather than a hook into the scroller's own: `VirtualScroller`
    // is deliberately ignorant of columns, and its `onScroll` fires only when
    // the *row* range moves — which a purely horizontal scroll never does.
    // Attached here and not in `initialize()` so a body driven directly
    // through `/advanced`, which may never be initialized, still tracks the
    // window.
    this.columnScrollSource = this.virtualScroller.getScrollContainer();
    this.columnScrollSource.addEventListener('scroll', this.handleHorizontalScroll, {
      passive: true,
    });

    // The window is a function of `scrollLeft` **and** `clientWidth`, so a
    // viewport that grows without scrolling has to recompute too. Collapse a
    // sidebar, maximize the window, or reveal a tab panel that was
    // `display: none` at mount, and without this the extra width is bare
    // right-spacer until something happens to scroll — and a cursor moved
    // into it lands on a cell that does not exist, so `aria-activedescendant`
    // is dropped and the cursor goes silent.
    this.columnResizeObserver = new ResizeObserver(this.handleViewportResize);
    this.columnResizeObserver.observe(this.columnScrollSource);

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
   * The numbering rule — and why it is `columnOrder` and not `schema` — lives
   * on {@link buildColumnIndexMap}, which `TableContainer` calls for the
   * header row from the same two signals. Deliberately one definition: the
   * header and the cells beneath it have to report the same index per column.
   */
  private rebuildColIndexMap(): void {
    this.colIndexMap = buildColumnIndexMap(this.state.columnOrder.get(), this.state.schema.get());
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

  /**
   * Handle a horizontal scroll: recompute the column window, once per frame.
   *
   * Mirrors `VirtualScroller.handleScroll` — one rAF in flight, every event in
   * between dropped — because the two run off the same element and the same
   * event storm, and a second throttling policy on the same stream is just a
   * second thing to get wrong.
   *
   * The `scrollLeft` comparison is what makes vertical scrolling free: this
   * listener fires on every wheel tick, and a vertical-only scroll leaves
   * `scrollLeft` alone, so it costs one property read and returns. Wired to
   * this instance as a field so `removeEventListener` in `destroy()` gets the
   * same reference.
   */
  private readonly handleHorizontalScroll = (): void => {
    if (this.destroyed) return;
    if (this.columnScrollSource.scrollLeft === this.lastScrollLeft) return;
    if (this.horizontalScrollRAF !== null) return;

    this.horizontalScrollRAF = requestAnimationFrame(() => {
      this.horizontalScrollRAF = null;
      if (this.destroyed) return;
      this.refreshColumnWindow();
    });
  };

  /**
   * Recompute the column window when the viewport's *width* changes.
   *
   * Keyed on `clientWidth` alone: a height change moves the row range, which
   * is `VirtualScroller`'s business, and recomputing a window that cannot
   * have moved would put a binary search on every vertical resize frame.
   * `refreshColumnWindow` is already a no-op when the window did not move, so
   * the observer's initial delivery costs one comparison.
   */
  private readonly handleViewportResize = (): void => {
    if (this.destroyed) return;
    const width = this.columnScrollSource.clientWidth;
    if (width === this.lastClientWidth) return;
    this.lastClientWidth = width;
    this.refreshColumnWindow();
  };

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
   * Whether the unsorted/unfiltered `__rowid__` range fast path applies.
   * The single decision point shared by `buildRowQuery` (SQL shape) and
   * `fetchBlock` (cache keying + density valve) so the two can never
   * disagree about which shape a query used.
   */
  private useRowidFastPath(sortColumns: SortColumn[], filters: Filter[]): boolean {
    return filters.length === 0 && sortColumns.length === 0 && !this.rowidFastPathDisabled;
  }

  /**
   * Fetch one aligned block and write it into `rowDataCache`.
   *
   * Cache keying: the fast path keys by each row's own `__rowid__` (which
   * the density valve has just proven equals the positional index); the
   * OFFSET path keys by `blockStart + i` — valid because `buildRowQuery`
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

      const sortColumns = this.state.sortColumns.get();
      const filters = this.state.filters.get();
      const usedFastPath = this.useRowidFastPath(sortColumns, filters);
      const sql = this.buildRowQuery(
        tableName,
        visibleColumns,
        sortColumns,
        filters,
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
          return await this.fetchBlock(blockStart, epochAtStart, controller, isPrefetch);
        }
        for (const row of rows) {
          this.rowDataCache.set(Number(row[ROWID_COLUMN]), row);
        }
      } else {
        rows.forEach((row, i) => {
          this.rowDataCache.set(blockStart + i, row);
        });
      }

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

    // FAST PATH — no filters, no user sort: fetch the window by a range
    // predicate on the dense synthetic __rowid__ instead of LIMIT/OFFSET.
    //
    // Premise (verified at the call sites cited): every loader materializes
    // __rowid__ densely as `row_number() OVER () - 1` (0..N-1 — parquet.ts,
    // csv.ts, json.ts), and the derived-column VIEW preserves exactly the
    // base rows (`base t LEFT JOIN helper h ON t.__rowid__ = h.__rowid__`,
    // DerivedColumnManager). With no WHERE and no user sort, positional
    // index ≡ __rowid__, so the range predicate returns exactly the OFFSET
    // window — but as a zonemap-prunable scan (~ms at any scroll depth)
    // instead of a top-(offset+limit) sort that grows with depth. The code
    // that could break the premise is the table-rebuild path in
    // worker/loaders/common.ts; fetchBlock's density valve turns any
    // violation into slow-but-correct OFFSET pagination, never wrong rows.
    //
    // Sorted/filtered fetches keep LIMIT/OFFSET below — there is no closed
    // form for "position k" under an arbitrary ORDER BY/WHERE. They still
    // gain block dedupe, cancellation, priority, and the larger row cache.
    // Keyset pagination for sorted mode is deliberate future work.
    if (this.useRowidFastPath(sortColumns, filters)) {
      sql += ` WHERE ${quoteIdentifier(ROWID_COLUMN)} >= ${offset}`;
      sql += ` AND ${quoteIdentifier(ROWID_COLUMN)} < ${offset + limit}`;
      // Scan order is not guaranteed, even for a single index range.
      sql += ` ORDER BY ${quoteIdentifier(ROWID_COLUMN)} ASC`;
      sql += ` LIMIT ${limit}`; // defensive cap only
      return sql;
    }

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
    const selectedRows = this.state.selectedRows.get();
    const hoveredRow = this.state.hoveredRow.get();
    const focusedCell = this.state.focusedCell.get();

    const newStart = this.currentRange.start;
    const newEnd = this.currentRange.end;

    // The window is computed ONCE, here, and published to `this.columnWindow`
    // from the same local the pass carries down. Nothing inside the loop reads
    // the field — that ordering rule is what makes it impossible for a pass to
    // straddle two windows.
    const pass = this.beginRenderPass();
    this.columnWindow = pass.win;

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
          rowEl = this.getOrCreateRow(pass.win);
          this.updateRowContent(rowEl, i, rowData, pass);
          this.attachRowEventListeners(rowEl, i);
        } else {
          // Data not yet loaded - create placeholder
          rowEl = this.createPlaceholderRow(i);
        }
        this.rowElementMap.set(i, rowEl);
        this.insertRowInOrder(viewport, rowEl, i);
      } else if (rowData) {
        // The map can hold either a data row (a full windowed structure,
        // listeners attached) or a placeholder (1 cell, no listeners,
        // `data-placeholder` marker). `updateRowContent` writes cells by
        // position within the structure, so calling it on a placeholder would
        // leave most columns unrendered AND the row inert — the partial-render
        // bug. The marker is the durable signal — unlike the historical
        // cell-count comparison it stays unambiguous for single-column
        // tables, which are replaced from the pool like everything else
        // instead of being promoted in place. `rowMatchesWindow` is the second
        // trigger, so a data row built for a different window shape is rebuilt
        // rather than partially updated.
        if (this.isPlaceholderRow(rowEl) || !this.rowMatchesWindow(rowEl, pass.win)) {
          // Detach, pool, take one back. Almost always the *same* element,
          // reshaped in place by `getOrCreateRow` — which matters because a
          // window that changes size does so for every mounted row at once,
          // and dropping each one on the floor would allocate a full row per
          // row per reshape. `returnRowToPool` declines placeholders, so those
          // are still replaced rather than recycled.
          this.moveFocusToGridBeforeRemoval(rowEl);
          rowEl.remove();
          this.returnRowToPool(rowEl);
          rowEl = this.getOrCreateRow(pass.win);
          this.updateRowContent(rowEl, i, rowData, pass);
          this.attachRowEventListeners(rowEl, i);
          this.rowElementMap.set(i, rowEl);
          this.insertRowInOrder(viewport, rowEl, i);
        } else {
          // Row exists, update content if needed (e.g., after sort)
          this.updateRowContent(rowEl, i, rowData, pass);
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
      }
    }

    // The cursor ring is two targeted toggles, not a loop over every cell of
    // every row. Cells stay `tabindex="-1"` permanently — the cursor is
    // published via `aria-activedescendant` on `.dt-grid`, not by moving DOM
    // focus, because a recycled row would take real focus with it into the
    // pool. `applyFocusRing` also re-syncs `focusedCellEl`, so a later
    // `updateFocusStyles` still knows which element carries the class.
    this.applyFocusRing(focusedCell);

    // Scroll geometry, from the same rounded widths the window arithmetic is
    // built on — so the body, the header's `minWidth` and `setContentWidth`
    // cannot disagree about where the content ends.
    this.applyContentWidth(pass.win.totalWidthPx);

    this.onRowsRendered?.();
  }

  /**
   * Gather everything a render pass needs, once.
   *
   * Replaces three per-row costs: the `getComputedStyle` read, the pinned
   * offset map, and the schema map. `--dt-z-pinned-col` is an inherited custom
   * property, so reading it off `.dt-root` is both correct and invariant
   * across rows.
   */
  private beginRenderPass(): RenderPass {
    const columns = this.state.visibleColumns.get();
    const columnWidths = this.state.columnWidths.get();

    const schemaMap = new Map<string, ColumnSchema>();
    for (const col of this.state.schema.get()) schemaMap.set(col.name, col);

    this.syncVisibleIndexMap(columns);
    const win = this.computeColumnWindow(columns, columnWidths);

    const root =
      this.container.closest<HTMLElement>('.' + this.classPrefix + '-root') ?? this.container;
    const baseZ = Number(getComputedStyle(root).getPropertyValue('--dt-z-pinned-col').trim()) || 20;

    return {
      columns,
      schemaMap,
      columnWidths,
      win,
      pinned: pinnedOffsets(
        columns,
        columnWidths,
        win.pinnedCount,
        baseZ,
        this.state.pinnedColumns.get(),
      ),
      annotationsActive: (this.annotations?.count() ?? 0) > 0,
    };
  }

  /**
   * The window to render at the body's current horizontal scroll offset.
   *
   * `clientWidth` is `0` in jsdom and before the first layout — precisely what
   * `MIN_OVERSCAN_COLUMNS` exists for: the pixel band collapses to nothing and
   * the column floor takes over, so an unmeasured viewport renders a small
   * bounded window rather than an empty one.
   *
   * Callers must have called {@link syncVisibleIndexMap} for `columns` first —
   * {@link extendWindowToFocus} resolves the cursor's column through that map.
   */
  private computeColumnWindow(
    columns: readonly string[],
    columnWidths: ReadonlyMap<string, number>,
  ): ColumnWindow {
    const win = this.columnWindowModel.compute({
      visibleColumns: columns,
      columnWidths,
      pinnedColumns: this.state.pinnedColumns.get(),
      scrollLeft: this.columnScrollSource.scrollLeft,
      viewportWidth: this.columnScrollSource.clientWidth,
      boxOverheadPx: BOX_OVERHEAD_PX,
    });
    return this.extendWindowToFocus(win);
  }

  /**
   * Widen the window so the cursor's column is rendered — when it is close.
   *
   * The cursor is published as `aria-activedescendant`, which has to name an
   * element that exists. `scrollFocusedCellIntoView` normally scrolls the
   * cursor into the window before this ever matters, so the case left is the
   * frame where a cursor move and its scroll have not yet agreed — plus the
   * `/advanced` path, where a host can set `focusedCell` without scrolling at
   * all.
   *
   * Clamped to the overscan budget on purpose: a cursor parked 900 columns
   * from the viewport must not drag 900 cells into the DOM, which is the whole
   * thing windowing exists to prevent. Past the budget the ring simply is not
   * mounted — `syncActiveDescendant` resolves the id against the grid and
   * drops the attribute when it finds nothing, which is the correct ARIA
   * answer for a cursor that is scrolled out of view.
   */
  private extendWindowToFocus(win: ColumnWindow): ColumnWindow {
    const focused = this.state.focusedCell.get();
    if (!focused) return win;
    // A header cursor's target is a `ColumnHeader`, which is always built.
    // Widening the *body* window for it mounts up to ten columns of cells in
    // every row for a ring the body can never draw — and changes `end`, so
    // every mounted row reshapes each time a header cursor crosses the
    // boundary.
    if (focused.row === HEADER_ROW_INDEX) return win;
    const idx = this.visibleIndexMap.get(focused.column);
    // Pinned columns are always rendered, so a cursor on one needs nothing.
    if (idx === undefined || idx < win.pinnedCount) return win;

    const budget = MIN_OVERSCAN_COLUMNS;
    let start = win.start;
    let end = win.end;
    if (idx < start) {
      if (start - idx > budget) return win;
      start = idx;
    } else if (idx >= end) {
      if (idx + 1 - end > budget) return win;
      end = idx + 1;
    } else {
      return win;
    }

    const n = this.columnWindowModel.size();
    return {
      ...win,
      start,
      end,
      leftSpacerPx: this.columnWindowModel.spanPx(win.pinnedCount, start),
      rightSpacerPx: this.columnWindowModel.spanPx(end, n),
    };
  }

  /** Rebuild `name -> visibleColumns index` when the array identity changes. */
  private syncVisibleIndexMap(columns: readonly string[]): void {
    if (this.visibleIndexSource === columns) return;
    this.visibleIndexMap.clear();
    for (let i = 0; i < columns.length; i++) this.visibleIndexMap.set(columns[i]!, i);
    this.visibleIndexSource = columns;
  }

  /**
   * Publish the horizontal content extent to the scroller and the header.
   *
   * One function rather than two duplicated blocks: `setContentWidth`'s
   * argument and `headerRow.style.minWidth` have to be the same number, and
   * two copies of the same summation is exactly how they would drift.
   */
  private applyContentWidth(totalWidthPx: number): void {
    this.virtualScroller.setContentWidth(totalWidthPx);
    const headerRow = this.virtualScroller
      .getScrollContainer()
      .closest(`.${this.classPrefix}-root`)
      ?.querySelector<HTMLElement>(`.${this.classPrefix}-header-row`);
    if (headerRow) headerRow.style.minWidth = `${totalWidthPx}px`;
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
   * A row element shaped for `win`, from the pool or freshly built.
   *
   * **The structural invariant, for any prior tenancy of a pooled element:**
   * children are exactly `[P cells][left spacer][W cells][right spacer]` —
   * `P + W + 2` of them, with the spacers at indices `P` and `P + W + 1`.
   * Every read of a row's DOM assumes it, so this is the one place that
   * establishes it.
   */
  private getOrCreateRow(win: ColumnWindow): HTMLElement {
    const pinnedCount = win.pinnedCount;
    const windowSize = win.end - win.start;
    const rowEl = this.rowPool.pop();

    if (!rowEl) {
      const created = document.createElement('div');
      created.className = `${this.classPrefix}-row`;
      created.setAttribute('role', 'row');
      created.setAttribute('aria-selected', 'false');
      created.style.height = `${this.rowHeight}px`;
      for (let i = 0; i < pinnedCount; i++) created.appendChild(this.createCell());
      created.appendChild(this.createSpacer('left'));
      for (let i = 0; i < windowSize; i++) created.appendChild(this.createCell());
      created.appendChild(this.createSpacer('right'));
      this.stampWindow(created, pinnedCount, windowSize);
      return created;
    }

    this.reshapeRow(rowEl, pinnedCount, windowSize);

    // Clear any stale classes and ARIA attributes
    rowEl.classList.remove(
      `${this.classPrefix}-row--selected`,
      `${this.classPrefix}-row--hover`,
      `${this.classPrefix}-row--loading`,
    );
    this.setRowSelected(rowEl, false);
    rowEl.removeAttribute('aria-rowindex');
    return rowEl;
  }

  /**
   * Bring a pooled row's structure to `P` pinned cells and `W` window cells.
   *
   * The old shape grew and shrank at the end of the row, which would append
   * past the right spacer and consume it on a shrink. It also cannot be a
   * plain child-count check: pinning a column while the window narrows by one
   * leaves `children.length` identical with the left spacer one position off.
   * So the row carries its own `P:W` signature, and a mismatch detaches both
   * spacers, resizes the cell run, and re-inserts them.
   *
   * Moving a cell between positions is safe because `updateRowContent`
   * unconditionally rewrites every attribute of every cell it touches.
   */
  private reshapeRow(rowEl: HTMLElement, pinnedCount: number, windowSize: number): void {
    const stamp = this.parseWindowStamp(rowEl);
    const wantedChildren = pinnedCount + windowSize + 2;
    if (
      stamp !== null &&
      stamp.pinnedCount === pinnedCount &&
      stamp.windowSize === windowSize &&
      rowEl.children.length === wantedChildren
    ) {
      return;
    }

    const leftSpacer =
      rowEl.querySelector<HTMLElement>('[data-col-spacer="left"]') ?? this.createSpacer('left');
    const rightSpacer =
      rowEl.querySelector<HTMLElement>('[data-col-spacer="right"]') ?? this.createSpacer('right');
    leftSpacer.remove();
    rightSpacer.remove();

    // Whatever is left is the cell run; size it to P + W.
    const wantedCells = pinnedCount + windowSize;
    while (rowEl.children.length < wantedCells) rowEl.appendChild(this.createCell());
    while (rowEl.children.length > wantedCells) {
      // The row itself survives, so `returnRowToPool` never sees these cells —
      // the focus rescue belongs here.
      const surplus = rowEl.lastChild!;
      this.moveFocusToGridBeforeRemoval(surplus);
      rowEl.removeChild(surplus);
    }

    rowEl.insertBefore(leftSpacer, rowEl.children[pinnedCount] ?? null);
    rowEl.appendChild(rightSpacer);
    this.stampWindow(rowEl, pinnedCount, windowSize);
  }

  /**
   * Whether `rowEl` already has the structure `win` needs.
   *
   * Compares the parsed `P` and `end − start` — **never** the raw window
   * position. A window that moves at constant size is every horizontal scroll
   * step, and keying the replace decision on position would rebuild every
   * visible row on every scroll frame, which is precisely the cost this whole
   * change exists to remove.
   */
  private rowMatchesWindow(rowEl: HTMLElement, win: ColumnWindow): boolean {
    const stamp = this.parseWindowStamp(rowEl);
    if (stamp === null) return false;
    const windowSize = win.end - win.start;
    return (
      stamp.pinnedCount === win.pinnedCount &&
      stamp.windowSize === windowSize &&
      rowEl.children.length === win.pinnedCount + windowSize + 2
    );
  }

  private stampWindow(rowEl: HTMLElement, pinnedCount: number, windowSize: number): void {
    rowEl.setAttribute(TableBody.WINDOW_ATTR, `${pinnedCount}:${windowSize}`);
  }

  private parseWindowStamp(rowEl: HTMLElement): { pinnedCount: number; windowSize: number } | null {
    const raw = rowEl.getAttribute(TableBody.WINDOW_ATTR);
    if (raw === null) return null;
    const colon = raw.indexOf(':');
    if (colon < 0) return null;
    const pinnedCount = Number(raw.slice(0, colon));
    const windowSize = Number(raw.slice(colon + 1));
    if (!Number.isInteger(pinnedCount) || !Number.isInteger(windowSize)) return null;
    return { pinnedCount, windowSize };
  }

  /**
   * A column spacer: the width of the columns a row does not render.
   *
   * `aria-hidden` is what actually keeps it out of the accessibility tree, so
   * `role="row"` still satisfies `aria-required-children`. `role="presentation"`
   * is inert alongside it — an `aria-hidden` node is not exposed at all — but
   * it is harmless, it is what the design calls for, and it says out loud to
   * anything walking the DOM that this element is not a cell.
   */
  private createSpacer(side: 'left' | 'right'): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.classPrefix}-col-spacer`;
    el.setAttribute('role', 'presentation');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-col-spacer', side);
    el.style.flex = '0 0 0px';
    return el;
  }

  /** Every rendered data cell of a row, spacers excluded. */
  private bodyCellsOf(rowEl: HTMLElement): HTMLElement[] {
    const cells: HTMLElement[] = [];
    for (const child of Array.from(rowEl.children)) {
      if (child.classList.contains(`${this.classPrefix}-cell`)) cells.push(child as HTMLElement);
    }
    return cells;
  }

  /**
   * Where the cell for absolute visible-column index `absIdx` sits among a
   * row's children, under the currently rendered window.
   *
   * `[P cells][left spacer][W cells][right spacer]`, so a pinned column keeps
   * its own index and a windowed one is offset past the pinned run and the
   * left spacer.
   */
  private childIndexOf(absIdx: number): number {
    const win = this.columnWindow;
    return absIdx < win.pinnedCount ? absIdx : absIdx - win.start + win.pinnedCount + 1;
  }

  /**
   * The rendered cell at `(row, column)`, or `null` when it is not mounted.
   *
   * The `data-column` check is not belt-and-braces: a row built for an older
   * window would resolve `childIndexOf` to some other column's cell, and
   * silently ringing the wrong cell is worse than not ringing one.
   */
  private cellElement(row: number, column: string): HTMLElement | null {
    const rowEl = this.rowElementMap.get(row);
    if (!rowEl || this.isPlaceholderRow(rowEl)) return null;
    const absIdx = this.visibleIndexMap.get(column);
    if (absIdx === undefined) return null;
    const child = rowEl.children[this.childIndexOf(absIdx)];
    if (!(child instanceof HTMLElement)) return null;
    return child.getAttribute('data-column') === column ? child : null;
  }

  /**
   * Move the cursor ring from wherever it was to wherever it now belongs.
   *
   * One lookup, not a walk over every cell of every rendered row: the ring
   * comes off the element that has it (remembered) and goes onto the element
   * that should (resolved). An unmounted target is a no-op — a cursor can
   * legitimately point at a row virtualization has recycled, or at a column
   * the horizontal window has scrolled past.
   *
   * Remove-then-add, so the case where both resolve to the *same* element —
   * a pooled cell repainted at the cursor's new position — still ends ringed.
   */
  private applyFocusRing(focusedCell: { row: number; column: string } | null): void {
    const focusClass = `${this.classPrefix}-cell--focused`;
    this.focusedCellEl?.classList.remove(focusClass);
    const next = focusedCell ? this.cellElement(focusedCell.row, focusedCell.column) : null;
    next?.classList.add(focusClass);
    this.focusedCellEl = next;
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
   * Return a row element to the pool for reuse.
   *
   * The element itself, scrubbed in place. This used to pool
   * `rowEl.cloneNode(true)` — the only way to shed anonymous listeners before
   * `AbortController` — which deep-copied every cell, every text node and
   * every attribute of a row that was about to be overwritten wholesale, then
   * threw the original away. At a 24-column window that is ~50 nodes copied
   * per recycled row on every scroll frame, to produce an element
   * indistinguishable from the one discarded. Aborting the row's listener
   * lifetime does the same job in O(1) and keeps element identity stable,
   * which is what lets the cursor ring be tracked by element at all.
   *
   * Callers detach the row first: every one of them does `remove()` before
   * pooling, and an attached element in the pool would be re-inserted
   * somewhere else on reuse.
   */
  private returnRowToPool(rowEl: HTMLElement): void {
    // Skip placeholder rows (marked `data-placeholder`, one cell carrying
    // dt-cell--placeholder). A placeholder carries no `data-window` stamp, so
    // pooling one sends `getOrCreateRow` into `reshapeRow`'s mismatch path:
    // both spacers get created and the cell run is *grown* from whatever the
    // element already holds — pooling recycles a row's own cells, it neither
    // clones nor rebuilds them — so the single placeholder cell survives as the
    // first cell of the `P + W` run. The cells appended after it are fine; the
    // survivor keeps its dt-cell--placeholder class, which neither `paintCell`
    // nor `CellRenderer.render` strips, and would render the run's leading
    // column in tertiary text colour. GC overhead is trivial: placeholders are
    // cheap to recreate when the data hasn't arrived yet.
    if (this.isPlaceholderRow(rowEl)) {
      return;
    }

    // Drop the handlers bound to the row index this element used to show.
    this.rowListeners.get(rowEl)?.abort();
    this.rowListeners.delete(rowEl);

    // The ring is scrubbed below, so the remembered element must go too —
    // otherwise `applyFocusRing` would keep pointing at a cell that no longer
    // carries the class. Cells are direct children, so this is exact.
    if (this.focusedCellEl?.parentElement === rowEl) this.focusedCellEl = null;

    // Clear stale state and ARIA attributes
    rowEl.classList.remove(
      `${this.classPrefix}-row--selected`,
      `${this.classPrefix}-row--hover`,
      `${this.classPrefix}-row--loading`,
    );
    rowEl.removeAttribute('aria-rowindex');
    rowEl.setAttribute('aria-selected', 'false');

    // Clear the cursor ring and the per-(row, column) cell ids. A pooled row
    // that kept its ids would duplicate them the moment it is reused for a
    // different row — `getElementById` would then resolve
    // `aria-activedescendant` to the wrong cell. The two spacers are walked
    // along with the cells: they carry neither, so both calls are no-ops on
    // them and skipping them would cost more than it saves.
    const focusClass = `${this.classPrefix}-cell--focused`;
    for (const child of rowEl.children) {
      const cell = child as HTMLElement;
      cell.classList.remove(focusClass);
      cell.removeAttribute('id');
    }

    // Limit pool size to prevent memory bloat
    if (this.rowPool.length < 100) {
      this.rowPool.push(rowEl);
    }
  }

  /**
   * Update the content of an existing row element
   */
  private updateRowContent(
    rowEl: HTMLElement,
    index: number,
    data: RowData,
    pass: RenderPass,
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

    // A row painted while the store held something has to be stripped once
    // after it empties, even if it spent that transition in the pool. See
    // ANNOTATED_ATTR.
    const annotationPass = pass.annotationsActive || rowEl.hasAttribute(TableBody.ANNOTATED_ATTR);
    if (pass.annotationsActive) rowEl.setAttribute(TableBody.ANNOTATED_ATTR, '1');
    else rowEl.removeAttribute(TableBody.ANNOTATED_ATTR);

    const { win } = pass;
    const children = rowEl.children;
    const windowSize = win.end - win.start;

    // The pinned prefix, always rendered wherever the window sits, then the
    // window itself, offset past that prefix and the left spacer.
    //
    // The missing-child guards are defensive only: `renderVisibleRows`
    // establishes the structure through `getOrCreateRow` and re-checks it with
    // `rowMatchesWindow` before reaching here. A direct caller can still hand
    // over a shorter element, and that should render what fits rather than
    // throw partway.
    for (let abs = 0; abs < win.pinnedCount; abs++) {
      const child = children[abs];
      if (!child) break;
      this.paintCell(child as HTMLElement, abs, index, data, rowId, pass, annotationPass);
    }
    for (let abs = win.start; abs < win.end; abs++) {
      const child = children[abs - win.start + win.pinnedCount + 1];
      if (!child) break;
      this.paintCell(child as HTMLElement, abs, index, data, rowId, pass, annotationPass);
    }

    // Spacers last, so a structural mistake above shows up as a missing cell
    // rather than as a silently mis-sized gap. Never rounded here: the prefix
    // sums already rounded every width they added, so these are exact.
    //
    // Matched by role, not just by position, for the same reason the cell
    // loops above tolerate a short row: on a row that is structurally wrong,
    // `children[pinnedCount]` is a real data cell, and writing a spacer's
    // `flex` onto it would collapse or stretch one column's content by the
    // width of every column standing behind the spacer. `updateCellWidths`
    // has always checked; this path had not.
    const leftSpacer = children[win.pinnedCount] as HTMLElement | undefined;
    if (leftSpacer?.hasAttribute('data-col-spacer')) {
      leftSpacer.style.flex = `0 0 ${win.leftSpacerPx}px`;
    }
    const rightSpacer = children[win.pinnedCount + windowSize + 1] as HTMLElement | undefined;
    if (rightSpacer?.hasAttribute('data-col-spacer')) {
      rightSpacer.style.flex = `0 0 ${win.rightSpacerPx}px`;
    }
  }

  /**
   * Write one cell: identity, ARIA, geometry, pinning, and content.
   *
   * `absIdx` is the position in the **full** `visibleColumns` array, never the
   * child index — cell ids are keyed absolute so `TableContainer`'s
   * `visibleColumns.indexOf`-derived `aria-activedescendant` target keeps
   * resolving with no container-side change.
   */
  private paintCell(
    cellEl: HTMLElement,
    absIdx: number,
    rowIndex: number,
    data: RowData,
    rowId: number | null,
    pass: RenderPass,
    annotationPass: boolean,
  ): void {
    const colName = pass.columns[absIdx];
    if (colName === undefined) return;
    const colSchema = pass.schemaMap.get(colName);

    // Stable id so `aria-activedescendant` on `.dt-grid` can name this
    // cell. Keyed by absolute row index + absolute visible column index, and
    // rewritten on every reuse, so a pooled element never carries a stale id.
    if (this.instanceId) {
      cellEl.id = this.buildCellId(rowIndex, absIdx);
    }

    // ARIA: 1-based column index in full schema. Absolute, with gaps where
    // columns are absent — which is exactly what the ARIA grid pattern
    // prescribes for a partially rendered row.
    const ariaColIdx = this.colIndexMap.get(colName);
    if (ariaColIdx !== undefined) {
      cellEl.setAttribute('aria-colindex', String(ariaColIdx));
    }

    // `data-column` gives the delegated pointer/focus handler a cheap
    // way to resolve a cell back to its column name without iterating
    // sibling indices.
    cellEl.setAttribute('data-column', colName);

    // Apply dynamic width, resolved through the same helper the prefix sums
    // use so a cell and the spacer standing in for its neighbours cannot
    // disagree — including about a width the model refused.
    cellEl.style.width = `${resolveColumnWidth(pass.columnWidths.get(colName))}px`;

    // Apply pinned cell styles
    const offset = pass.pinned.get(colName);
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
    this.cellRenderer.render(cellEl, data[colName], colSchema);
    if (annotationPass) {
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
   * Render-budget note: this runs once per *rendered* cell of every pass with
   * annotations to paint (`paintCell` gates it on `annotationPass`), so the
   * count is `(pinnedCount + windowSize) × visible rows` — bounded by the
   * window, not by the column count. At a 1,200 px viewport over default
   * 150 px columns, 8 columns are visible and `MIN_OVERSCAN_COLUMNS = 10`
   * binds on each side (1,500 px per side beats the 1,200 px that
   * `OVERSCAN_VIEWPORTS = 1` asks for), so the window is 8 + 10 + 10 = 28 and
   * 50 rows cost 1,400 calls — the same 1,400 at 1,000 columns as at 100,
   * where the pre-windowing body paid 5,000 for the 100-column case alone. It
   * calls `getByRow`, `getByColumn`, and `getByCell` — all O(1) on the
   * AnnotationStore indexes. If those lookups ever change complexity, scroll
   * perf will regress quietly; benchmarks live in
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
    const schema = this.state.schema.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const col of schema) schemaMap.set(col.name, col);
    const active = this.annotations.count() > 0;
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
      // Every cell resolved by its own `data-column`, never by pairing
      // `visibleColumns[c]` with `children[c]`: a windowed row's children are
      // a pinned prefix, two spacers and a slice, so the positional pairing
      // would re-render each cell with a neighbouring column's value.
      //
      // This is the full strip pass the per-cell early return relies on — it
      // runs unconditionally on every store change, including the transition
      // to empty, which is the transition the early return cannot see.
      for (const cellEl of this.bodyCellsOf(rowEl)) {
        const colName = cellEl.getAttribute('data-column');
        if (colName === null) continue;
        this.cellRenderer.render(cellEl, rowData[colName], schemaMap.get(colName));
        this.applyCellAnnotationClasses(cellEl, rowId, colName);
      }
      if (active) rowEl.setAttribute(TableBody.ANNOTATED_ATTR, '1');
      else rowEl.removeAttribute(TableBody.ANNOTATED_ATTR);
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
   * Attach event listeners to a row element, under a fresh lifetime.
   *
   * All three handlers close over `index`, so a pooled element reused for a
   * different row must not keep the old ones. They hang off one
   * `AbortController` per row; `returnRowToPool` aborts it.
   */
  private attachRowEventListeners(rowEl: HTMLElement, index: number): void {
    // Defensive: every path here comes through `getOrCreateRow`, and every
    // element that gets there was aborted on its way into the pool. A second
    // live set on one element would double every hover and every click.
    this.rowListeners.get(rowEl)?.abort();
    const controller = new AbortController();
    this.rowListeners.set(rowEl, controller);
    const { signal } = controller;

    // Mouse enter (hover)
    rowEl.addEventListener(
      'mouseenter',
      () => {
        if (this.actions && !this.destroyed) {
          this.actions.setHoveredRow(index);
        }
      },
      { signal },
    );

    // Mouse leave (un-hover)
    rowEl.addEventListener(
      'mouseleave',
      () => {
        if (this.actions && !this.destroyed) {
          this.actions.setHoveredRow(null);
        }
      },
      { signal },
    );

    // Click (selection + focus)
    rowEl.addEventListener(
      'click',
      (event) => {
        this.handleRowClick(index, event);

        // Set focused cell from clicked cell. Resolved by the cell's own
        // `data-column`, not by its position among the row's children — those
        // now include two spacers and cover only the rendered window. A click
        // that lands on a spacer resolves to no `.dt-cell` at all and is
        // correctly ignored by the guard below.
        if (this.actions && !this.destroyed) {
          const cellEl = (event.target as HTMLElement).closest<HTMLElement>(
            `.${this.classPrefix}-cell`,
          );
          if (cellEl && rowEl.contains(cellEl)) {
            const column = cellEl.getAttribute('data-column');
            if (column !== null) {
              this.actions.setFocusedCell({ row: index, column });
            }
          }
        }
      },
      { signal },
    );
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
    this.syncVisibleIndexMap(this.state.visibleColumns.get());
    this.applyFocusRing(this.state.focusedCell.get());
  }

  /**
   * Update cell widths when column widths change.
   *
   * Runs 60×/s during a resize drag, so it stays incremental: rendered cells
   * are re-sized by their own `data-column` (spacers skipped, and only the
   * rendered window exists to visit), both spacers are re-derived from the
   * refreshed prefix sums, and the content extent is republished from the same
   * numbers.
   *
   * Widening a column *can* push the window's boundaries — the columns after
   * it move right, and some of them off screen. That case cannot be patched
   * incrementally (the rows hold cells for the old window), so it falls back
   * to a full re-render. Reaching it takes a wide column and a viewport-sized
   * change, so the drag path stays on the incremental branch.
   */
  private updateCellWidths(): void {
    // A render notifies the host (`onRowsRendered`), and a host is entitled to
    // write column widths from there — so the re-render branch below can
    // re-enter this method. Record the write instead of dropping it: a
    // discarded one would leave the body painting the old width while
    // `TableContainer.updateColumnWidths`, a separate subscription, moved the
    // header — which is precisely the header/body disagreement this phase
    // exists to remove. The outer call replays it once after it unwinds; a
    // host that writes on *every* render still terminates, having had its
    // last write honoured.
    if (this.inWidthUpdate) {
      this.widthUpdatePending = true;
      return;
    }

    // Bounded, not recursive. The re-render branch notifies `onRowsRendered`,
    // a host is entitled to write a width from there, and replaying that write
    // re-enters this method from the top with the guard already down — so the
    // old tail call was an unbounded recursion, not the "replayed once" the
    // comment claimed. A host that writes a changing width on every render
    // rode it to a stack overflow.
    for (let replay = 0; replay <= TableBody.MAX_WIDTH_UPDATE_REPLAYS; replay++) {
      const columns = this.state.visibleColumns.get();
      const columnWidths = this.state.columnWidths.get();
      this.syncVisibleIndexMap(columns);
      const win = this.computeColumnWindow(columns, columnWidths);

      const previous = this.columnWindow;
      if (
        win.start !== previous.start ||
        win.end !== previous.end ||
        win.pinnedCount !== previous.pinnedCount
      ) {
        this.inWidthUpdate = true;
        this.widthUpdatePending = false;
        try {
          this.renderVisibleRows();
        } finally {
          this.inWidthUpdate = false;
        }
        // No nested write, or the body is gone: this pass was the last one.
        if (!this.widthUpdatePending || this.destroyed) {
          this.widthUpdatePending = false;
          return;
        }
        this.widthUpdatePending = false;
        continue;
      }

      this.columnWindow = win;
      const windowSize = win.end - win.start;

      for (const [, rowEl] of this.rowElementMap) {
        if (this.isPlaceholderRow(rowEl)) continue;
        for (const cellEl of this.bodyCellsOf(rowEl)) {
          const colName = cellEl.getAttribute('data-column');
          if (colName === null) continue;
          cellEl.style.width = `${resolveColumnWidth(columnWidths.get(colName))}px`;
        }
        const children = rowEl.children;
        const leftSpacer = children[win.pinnedCount] as HTMLElement | undefined;
        if (leftSpacer?.hasAttribute('data-col-spacer')) {
          leftSpacer.style.flex = `0 0 ${win.leftSpacerPx}px`;
        }
        const rightSpacer = children[win.pinnedCount + windowSize + 1] as HTMLElement | undefined;
        if (rightSpacer?.hasAttribute('data-col-spacer')) {
          rightSpacer.style.flex = `0 0 ${win.rightSpacerPx}px`;
        }
      }

      this.applyContentWidth(win.totalWidthPx);
      return;
    }

    // Out of replays. The last render honoured the host's second-to-last
    // write, so the DOM is coherent — it is the host's newest width that is
    // not painted, and only until whatever writes it next comes round. Say so
    // rather than recursing: a silent stop here reads as "the width did not
    // take" with nothing pointing at the loop that caused it.
    this.widthUpdatePending = false;
    console.warn(
      `TableBody: a column width write from onRowsRendered moved the column window ` +
        `${TableBody.MAX_WIDTH_UPDATE_REPLAYS} times in a row; abandoning the replay. ` +
        'Write column widths conditionally — a host that writes a new width on every ' +
        'render can never converge.',
    );
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
   * Recompute the column window and re-render the body if it moved.
   *
   * Synchronous: when this returns, the DOM matches the current `scrollLeft`.
   * That is the whole reason it is public. The browser does not dispatch
   * `scroll` until after the current task, so code that *writes* `scrollLeft`
   * — keyboard navigation, the filter-change scroll pin, the scroll restore
   * after a re-render — would otherwise leave a frame in which the rows on
   * screen belong to the previous offset. At 1,000 columns that frame is a
   * blank body.
   *
   * Cheap when nothing moved: one binary search over cached prefix sums and a
   * three-field comparison, no DOM work at all. Safe to call unconditionally
   * after any programmatic scroll.
   *
   * @example
   * ```typescript
   * bodyScroll.scrollLeft = targetLeft;
   * body.refreshColumnWindow(); // cells for the new offset exist now
   * ```
   */
  refreshColumnWindow(): void {
    if (this.destroyed) return;

    const columns = this.state.visibleColumns.get();
    this.syncVisibleIndexMap(columns);
    const win = this.computeColumnWindow(columns, this.state.columnWidths.get());
    // Record the offset this answer was computed at, whatever the answer is:
    // the scroll listener skips work while `scrollLeft` still matches it.
    this.lastScrollLeft = this.columnScrollSource.scrollLeft;

    const current = this.columnWindow;
    if (
      win.start === current.start &&
      win.end === current.end &&
      win.pinnedCount === current.pinnedCount
    ) {
      return;
    }

    // Deliberately not `this.columnWindow = win` first: the field means "the
    // window the mounted rows were built for" — `childIndexOf` and
    // `getColumnWindow` read it as exactly that — and `renderVisibleRows`
    // recomputes it and publishes it from the local its pass threads down. An
    // assignment here would describe rows nothing has reshaped yet, and be
    // overwritten a moment later anyway.
    //
    // Not "one writer": `updateCellWidths` is the second. It publishes only on
    // the branch where `start`/`end`/`pinnedCount` already compared equal, so
    // it refreshes the spacer and extent fields of a window whose structure the
    // mounted rows already have — it can never move what is mounted.
    this.renderVisibleRows();
  }

  /**
   * The column window the rendered rows were built for.
   *
   * A copy: the live window is replaced wholesale on every pass, and handing
   * out the object itself would let a caller hold something that silently
   * stops describing the DOM.
   *
   * @example
   * ```typescript
   * const win = body.getColumnWindow();
   * // rows render visibleColumns[0, win.pinnedCount) then [win.start, win.end)
   * const rendered = win.pinnedCount + (win.end - win.start);
   * ```
   */
  getColumnWindow(): ColumnWindow {
    return { ...this.columnWindow };
  }

  /**
   * Where `column` sits on the horizontal content axis, in px, or `null` when
   * it is not a visible column.
   *
   * Reads the same cached prefix sums the window and the spacers are built
   * from, so a caller that scrolls to `left` lands exactly where the body drew
   * the column — which is what keyboard navigation needs and what a private
   * `for` loop over `columnWidths` kept getting subtly wrong (it summed raw
   * widths; the body sums rounded ones).
   *
   * @example
   * ```typescript
   * const span = body.getColumnSpan('price');
   * if (span) bodyScroll.scrollLeft = span.left - body.getPinnedWidthPx();
   * ```
   */
  getColumnSpan(column: string): { left: number; width: number } | null {
    const columns = this.state.visibleColumns.get();
    this.syncVisibleIndexMap(columns);
    this.columnWindowModel.sync(columns, this.state.columnWidths.get(), BOX_OVERHEAD_PX);
    const index = this.visibleIndexMap.get(column);
    if (index === undefined) return null;
    return {
      left: this.columnWindowModel.columnLeftPx(index),
      width: this.columnWindowModel.columnWidthPx(index),
    };
  }

  /**
   * Total width of the leading pinned run — where unpinned content starts, and
   * the width of the sticky band covering it.
   *
   * Summed over `visibleColumns[0, pinnedCount)` rather than over
   * `pinnedColumns`, because `hideColumn` leaves a hidden column in
   * `pinnedColumns` and counting it overstates the band by a full column.
   */
  getPinnedWidthPx(): number {
    const columns = this.state.visibleColumns.get();
    this.columnWindowModel.sync(columns, this.state.columnWidths.get(), BOX_OVERHEAD_PX);
    const { pinnedCount } = resolvePinnedCount(columns, this.state.pinnedColumns.get());
    return this.columnWindowModel.spanPx(0, pinnedCount);
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

    // Detach the column-window scroll listener and drop its pending frame.
    // The scroll container outlives this body when it is external
    // (`TableContainer` owns `.dt-body-scroll` and rebuilds the body into it),
    // so an undetached listener would fire against a destroyed instance for as
    // long as the table lives.
    this.columnScrollSource.removeEventListener('scroll', this.handleHorizontalScroll);
    this.columnResizeObserver.disconnect();
    if (this.horizontalScrollRAF !== null) {
      cancelAnimationFrame(this.horizontalScrollRAF);
      this.horizontalScrollRAF = null;
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
    this.columnWindowModel.reset();
    this.visibleIndexMap.clear();
    this.visibleIndexSource = null;
    this.lastScrollLeft = -1;
    this.lastClientWidth = -1;
    this.focusedCellEl = null;

    // Destroy virtual scroller. It detaches the whole row subtree in one go,
    // so a cell holding real focus (from a click) has to be rescued first —
    // `TableContainer.render()` destroys and rebuilds the body on every
    // schema / visibleColumns change, and dropping focus to `<body>` there
    // would silently kill the keyboard layer.
    this.moveFocusToGridBeforeRemoval(this.virtualScroller.getViewportContainer());
    this.virtualScroller.destroy();
  }
}
