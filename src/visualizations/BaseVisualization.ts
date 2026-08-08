/**
 * BaseVisualization - Abstract base class for column visualizations
 *
 * Provides common functionality for all visualization types:
 * - Canvas setup with high-DPI support
 * - Mouse event handling (move, click, leave)
 * - Responsive resizing via ResizeObserver
 * - Proper cleanup on destruction
 *
 * Subclasses must implement:
 * - fetchData(): Load visualization data from DuckDB
 * - render(): Draw the visualization on canvas
 * - handleMouseMove(): Handle hover interactions
 * - handleClick(): Handle click interactions
 * - handleMouseLeave(): Handle mouse leave
 *
 * @example
 * import { BaseVisualization } from '@jeyabbalas/data-table/advanced';
 *
 * class SparkLine extends BaseVisualization {
 *   protected async fetchData() {
 *     // query this.bridge for the column's ordered values
 *     return { points: [] as number[] };
 *   }
 *   protected render(_data: { points: number[] }) {
 *     // draw on this.ctx using this.width, this.height
 *   }
 *   protected handleMouseMove(_event: MouseEvent) {}
 *   protected handleClick(_event: MouseEvent) {}
 *   protected handleMouseLeave() {}
 * }
 *
 * @see VisualizationRegistry for registering custom subclasses.
 */

import { DataTableError, ExportError, QueryError } from '../core/errors';
import { type Strings, defaultStrings } from '../core/Strings';
import type { ColumnSchema, Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import type { ColumnStatsData } from '../statistics/ColumnStatsTypes';
import { invalidatePaletteCache, resolveScope } from './palette';
import type { ThemeChangeListener, ThemeWatcher } from './ThemeWatcher';

/**
 * Manages shared window-level event listeners for all BaseVisualization instances.
 * Attaches exactly one mouseup and one keydown listener on window, dispatching
 * to all registered instances. Removes listeners when the last instance is destroyed.
 */
class WindowListenerManager {
  private static instances = new Set<BaseVisualization>();
  private static listening = false;

  private static onMouseUp = (e: MouseEvent): void => {
    for (const instance of WindowListenerManager.instances) {
      instance.dispatchWindowMouseUp(e);
    }
  };

  private static onKeyDown = (e: KeyboardEvent): void => {
    for (const instance of WindowListenerManager.instances) {
      instance.dispatchWindowKeyDown(e);
    }
  };

  static register(instance: BaseVisualization): void {
    this.instances.add(instance);
    if (!this.listening) {
      window.addEventListener('mouseup', this.onMouseUp);
      window.addEventListener('keydown', this.onKeyDown);
      this.listening = true;
    }
  }

  static unregister(instance: BaseVisualization): void {
    this.instances.delete(instance);
    if (this.instances.size === 0 && this.listening) {
      window.removeEventListener('mouseup', this.onMouseUp);
      window.removeEventListener('keydown', this.onKeyDown);
      this.listening = false;
    }
  }

  /** Exposed for testing: number of registered instances */
  static get count(): number {
    return this.instances.size;
  }

  /** Exposed for testing: whether window listeners are attached */
  static get isListening(): boolean {
    return this.listening;
  }
}

/**
 * Options for creating a visualization
 */
export interface VisualizationOptions {
  /** Name of the DuckDB table */
  tableName: string;
  /** Bridge for executing queries */
  bridge: WorkerBridge;
  /** Current active filters */
  filters: Filter[];
  /** Callback when visualization creates/removes a filter (null = remove) */
  onFilterChange?: (filter: Filter | null) => void;
  /** Callback to update stats line on hover (null restores default) */
  onStatsChange?: (stats: string | null) => void;
  /** Callback providing computed column stats for default display (not hover) */
  onDefaultStatsChange?: (stats: ColumnStatsData) => void;
  /** Resolved i18n strings for viz-emitted stats text. Defaults to English. */
  messages?: Strings;
  /** Maximum number of histogram bins (default: 15) */
  maxBins?: number;
  /**
   * Compute distinct counts with DuckDB's HyperLogLog
   * `approx_count_distinct(col)` instead of an exact `COUNT(DISTINCT col)`.
   *
   * The facade sets this from `state.totalRows` via
   * `shouldUseApproxDistinct` (`histogram/HistogramData.ts`) — above
   * `APPROX_DISTINCT_ROW_THRESHOLD` rows the exact count is the single most
   * expensive term in the per-column stats scan.
   *
   * Absent (the default) keeps the exact count. When set, the count is a
   * genuine estimate, so the stats line renders the `~` marker and the
   * "all unique" shortcut is suppressed — see
   * `StatsFormatters.formatStatsLine2`.
   */
  useApproxDistinct?: boolean;
  /**
   * Shared per-table {@link ThemeWatcher}. When supplied, this instance
   * registers with it instead of installing its own `MutationObserver` on
   * `.dt-root` — one observer per table rather than one per column.
   *
   * Omit it (standalone `/advanced` composition) and the private observer is
   * used exactly as before.
   */
  themeWatcher?: ThemeWatcher;
  /**
   * Data captured from a previous instance of the same column via
   * {@link BaseVisualization.exportDataSnapshot}. When present, the built-in
   * visualizations hydrate from it in their constructor instead of issuing
   * their initial fetch — that is what makes a column hide/show/reorder cost
   * **zero** DuckDB queries even though the header DOM (and therefore the
   * instance) is rebuilt.
   *
   * Ignored by any subclass that does not implement
   * {@link BaseVisualization.importDataSnapshot}; such a subclass simply
   * fetches as before.
   */
  initialSnapshot?: unknown;
  /** Callback when brush is committed (column name passed) */
  onBrushCommit?: (columnName: string) => void;
  /** Callback when brush is cleared (column name passed) */
  onBrushClear?: (columnName: string) => void;
  /** Callback when selection changes (column name and hasSelection passed) */
  onSelectionChange?: (columnName: string, hasSelection: boolean) => void;
  /**
   * Callback invoked when the visualization fails to fetch, render, or
   * update filters. Receives a typed {@link DataTableError} and a context
   * describing which stage failed. The facade routes these to the
   * `error` event with `source: 'visualization'`.
   */
  onError?: (
    error: DataTableError,
    context: { columnName?: string; stage: 'fetch' | 'render' | 'filter' },
  ) => void;
}

/**
 * Abstract base class for column visualizations.
 *
 * @example
 * ```typescript
 * class Histogram extends BaseVisualization {
 *   async fetchData() {
 *     // Fetch histogram bins from DuckDB
 *   }
 *   render() {
 *     // Draw histogram bars
 *   }
 *   // ... implement mouse handlers
 * }
 * ```
 */
export abstract class BaseVisualization {
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected width = 0;
  protected height = 0;
  protected dpr: number;
  protected destroyed = false;
  protected isFilterUpdate = false;
  // Sequence token for `updateFilters` calls. Mirrors `fetchSequence` in
  // subclasses and `filterSequence` in CrossfilterCoordinator: only the
  // latest call's `finally` resets `isFilterUpdate`, so an older call that
  // resolves mid-overlap can't flip the flag while a newer call is still
  // mid-await.
  private filterUpdateSequence = 0;

  // Tracks the initial `fetchData()` call subclasses kick off in their
  // constructor (`SharedHistogramBase`, `ValueCounts` reassign this
  // immediately after `super(...)`). Surfaced via `waitForData()` so the
  // facade can gate `loadComplete` on first-paint readiness. Subclasses
  // with no eager fetch leave it `Promise.resolve()` — "ready immediately".
  protected dataPromise: Promise<void> = Promise.resolve();

  /** Resolved i18n statistics strings; English defaults when no `messages` supplied. */
  protected get statsMessages(): Strings['statistics'] {
    return (this.options.messages ?? defaultStrings).statistics;
  }

  // Bound event handlers for proper cleanup
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseLeave: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private resizeObserver: ResizeObserver;
  private colorSchemeObserver: MutationObserver | null = null;
  private themeListener: ThemeChangeListener | null = null;

  constructor(
    protected container: HTMLElement,
    protected column: ColumnSchema,
    protected options: VisualizationOptions,
  ) {
    // Device pixel ratio for crisp rendering on high-DPI displays
    this.dpr = window.devicePixelRatio || 1;

    // Create canvas element
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new ExportError('Failed to get 2D rendering context', {
        code: 'CANVAS_UNAVAILABLE',
      });
    }
    this.ctx = ctx;

    // Style canvas to fill container
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';

    // Add to container
    container.appendChild(this.canvas);

    // Bind event handlers
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseLeave = this.onMouseLeave.bind(this);
    this.boundClick = this.onClick.bind(this);
    this.boundMouseDown = this.onMouseDown.bind(this);

    // Setup resize observer for responsive sizing
    this.resizeObserver = new ResizeObserver(this.handleResize.bind(this));
    this.resizeObserver.observe(container);

    // Watch the owning `.dt-root` for runtime dark/light toggles so the
    // canvas repaints with freshly-resolved CSS variables. Without this the
    // brush overlay and selection highlights keep their pre-toggle rgba.
    this.setupColorSchemeWatcher();

    // Register with shared window listener manager
    WindowListenerManager.register(this);

    // Initial size setup and interaction
    this.updateSize();
    this.setupInteraction();
  }

  /**
   * Arrange to `render()` whenever `data-dt-color-scheme` flips on the
   * nearest `.dt-root`. Palette resolution happens inside `render()`, so the
   * single re-render is enough to pick up the new theme.
   *
   * Two paths, same observable behavior:
   *
   * - `options.themeWatcher` supplied (the facade's path) — register with the
   *   table's one shared observer. It retires the palette caches itself
   *   before notifying, so N columns cost 1 observer and 1 palette resolve
   *   per flip instead of N and N.
   * - No watcher (standalone `/advanced` composition) — install a private
   *   observer, as before. It retires the caches on its own, so a lone
   *   visualization outside a DataTable stays correct across a flip.
   */
  private setupColorSchemeWatcher(): void {
    const watcher = this.options.themeWatcher;
    if (watcher) {
      this.themeListener = () => {
        if (!this.destroyed) this.render();
      };
      watcher.register(this.themeListener);
      return;
    }

    if (typeof MutationObserver === 'undefined') return;
    const scope = resolveScope(this.canvas);
    // `resolveScope` falls back to the canvas itself when no `.dt-root`
    // ancestor exists; that fallback has no attribute to watch, so skip it.
    if (scope === (this.canvas as unknown as HTMLElement)) return;
    this.colorSchemeObserver = new MutationObserver(() => {
      if (this.destroyed) return;
      invalidatePaletteCache();
      this.render();
    });
    this.colorSchemeObserver.observe(scope, {
      attributes: true,
      attributeFilter: ['data-dt-color-scheme'],
    });
  }

  // =========================================
  // Abstract Methods - Implement in Subclasses
  // =========================================

  /**
   * Fetch data needed for this visualization from DuckDB.
   * Called when the visualization is created and when filters change.
   */
  abstract fetchData(): Promise<void>;

  /**
   * Render the visualization on the canvas.
   * Called after data fetch and on resize.
   */
  abstract render(): void;

  /**
   * Handle mouse movement over the visualization.
   * @param x - X coordinate relative to canvas (0 to width)
   * @param y - Y coordinate relative to canvas (0 to height)
   */
  protected abstract handleMouseMove(x: number, y: number): void;

  /**
   * Handle click on the visualization.
   * @param x - X coordinate relative to canvas
   * @param y - Y coordinate relative to canvas
   * @param event - Optional MouseEvent for detecting modifier keys
   */
  protected abstract handleClick(x: number, y: number, event?: MouseEvent): void;

  /**
   * Handle mouse leaving the visualization.
   * Used to clear hover states.
   */
  protected abstract handleMouseLeave(): void;

  /**
   * Handle mouse down on the visualization.
   * Used for brush/drag interactions.
   * @param x - X coordinate relative to canvas
   * @param y - Y coordinate relative to canvas
   */
  protected abstract handleMouseDown(x: number, y: number): void;

  /**
   * Handle mouse up on the visualization.
   * Used for completing brush/drag interactions.
   * @param x - X coordinate relative to canvas
   * @param y - Y coordinate relative to canvas
   */
  protected abstract handleMouseUp(x: number, y: number): void;

  /**
   * Handle keyboard events for the visualization.
   * Used for canceling brush with Escape, etc.
   * @param key - The key that was pressed
   */
  protected abstract handleKeyDown(key: string): void;

  // =========================================
  // Canvas Sizing
  // =========================================

  /**
   * Update canvas dimensions to match container.
   * Accounts for device pixel ratio for crisp rendering.
   */
  protected updateSize(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    // Set canvas size accounting for device pixel ratio
    // This makes the canvas high-resolution on Retina displays
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);

    // Scale context so drawing operations use logical pixels
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * Handle container resize
   */
  private handleResize(): void {
    if (this.destroyed) return;
    this.updateSize();
    this.render();
  }

  // =========================================
  // Mouse Event Handling
  // =========================================

  /**
   * Set up mouse event listeners on the canvas
   */
  private setupInteraction(): void {
    this.canvas.addEventListener('mousemove', this.boundMouseMove);
    this.canvas.addEventListener('mouseleave', this.boundMouseLeave);
    this.canvas.addEventListener('click', this.boundClick);
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
  }

  /**
   * Translate mouse event to canvas coordinates and forward to handler
   */
  private onMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.handleMouseMove(x, y);
  }

  /**
   * Forward mouse leave event to handler
   */
  private onMouseLeave(_e: MouseEvent): void {
    if (this.destroyed) return;
    this.handleMouseLeave();
  }

  /**
   * Translate click event to canvas coordinates and forward to handler
   */
  private onClick(e: MouseEvent): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.handleClick(x, y, e);
  }

  /**
   * Translate mousedown event to canvas coordinates and forward to handler
   */
  private onMouseDown(e: MouseEvent): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.handleMouseDown(x, y);
  }

  /**
   * Called by WindowListenerManager to dispatch window mouseup events.
   * Translates coordinates relative to this instance's canvas.
   */
  dispatchWindowMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.handleMouseUp(x, y);
  }

  /**
   * Called by WindowListenerManager to dispatch window keydown events.
   */
  dispatchWindowKeyDown(e: KeyboardEvent): void {
    if (this.destroyed) return;
    this.handleKeyDown(e.key);
  }

  // =========================================
  // Utility Methods
  // =========================================

  /**
   * Clear the entire canvas
   */
  protected clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Format a number with locale-specific formatting
   */
  protected formatNumber(value: number): string {
    return value.toLocaleString();
  }

  /**
   * Get the column this visualization represents
   */
  getColumn(): ColumnSchema {
    return this.column;
  }

  /**
   * Check if the visualization has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Resolves once the visualization's initial `fetchData()` settles. The
   * facade awaits this during `loadData` so a consumer chaining `addFilter`
   * after `await createDataTable` doesn't race the unfiltered first fetch.
   *
   * Subclasses that don't fetch in their constructor return a pre-resolved
   * promise. Resolves on success, rejection (observable via
   * `options.onError`), and post-destroy. Never hangs.
   */
  public waitForData(): Promise<void> {
    return this.dataPromise;
  }

  /**
   * Capture this visualization's fetched data so it can outlive the
   * instance. Returned values are treated as opaque by the caller and are
   * only ever handed back to {@link importDataSnapshot} on a **new instance
   * of the same class, for the same column**.
   *
   * The default returns `null` — "I have nothing worth keeping", which makes
   * a re-created instance fetch as before. All five built-ins override it.
   *
   * Column header DOM is rebuilt wholesale on every hide / show / pin /
   * reorder, so a visualization instance cannot survive one. This pair is
   * what lets its *data* survive instead.
   *
   * @example
   * ```ts
   * const snapshot = viz.exportDataSnapshot();
   * viz.destroy();
   * // …header rebuilt…
   * const next = new Histogram(freshContainer, column, { ...options, initialSnapshot: snapshot });
   * // `next` renders immediately and issues no query.
   * ```
   */
  public exportDataSnapshot(): unknown | null {
    return null;
  }

  /**
   * Adopt a snapshot produced by {@link exportDataSnapshot} and reflect it —
   * an implementation is expected to leave the instance fully rendered, as
   * though its fetch had just landed.
   *
   * @param snapshot - opaque value previously returned by
   *   {@link exportDataSnapshot} on an instance of the same class.
   * @returns `true` when the snapshot was recognized and adopted. `false`
   *   (the default) means "not supported / not usable", and the caller
   *   falls back to a normal fetch — so an unrecognized or corrupt snapshot
   *   degrades to today's behavior rather than to an empty chart.
   *
   * @example
   * ```ts
   * class SparkLine extends BaseVisualization {
   *   private points: number[] = [];
   *   override exportDataSnapshot() { return this.points.length ? { points: this.points } : null; }
   *   override importDataSnapshot(s: unknown) {
   *     const snap = s as { points?: number[] } | null;
   *     if (!snap?.points) return false;
   *     this.points = snap.points;
   *     this.render();
   *     return true;
   *   }
   * }
   * ```
   */
  public importDataSnapshot(snapshot: unknown): boolean {
    void snapshot;
    return false;
  }

  /**
   * The eager-first-load idiom, factored so every built-in shares it: hydrate
   * from `options.initialSnapshot` when one was supplied and accepted,
   * otherwise fetch.
   *
   * Subclasses call this from **their own** constructor body
   * (`this.dataPromise = this.hydrateOrFetch()`), never from an intermediate
   * base's — a base-class constructor runs before the subclass's field
   * initializers, so anything it wrote into a subclass field would be
   * overwritten by `= null` a moment later.
   */
  protected hydrateOrFetch(): Promise<void> {
    const snapshot = this.options.initialSnapshot;
    if (snapshot !== undefined && snapshot !== null && this.importDataSnapshot(snapshot)) {
      return Promise.resolve();
    }
    return this.fetchData();
  }

  /**
   * Update filters on a live visualization and re-fetch data.
   * Used by CrossfilterCoordinator to push new filter arrays
   * without recreating the visualization.
   */
  public async updateFilters(filters: Filter[]): Promise<void> {
    if (this.destroyed) return;
    const seq = ++this.filterUpdateSequence;
    this.options = { ...this.options, filters };
    this.isFilterUpdate = true;
    try {
      await this.fetchData();
    } catch (err) {
      const typed =
        err instanceof DataTableError
          ? err
          : new QueryError(err instanceof Error ? err.message : String(err), {
              code: 'QUERY_RUNTIME',
              cause: err,
            });
      this.options.onError?.(typed, {
        columnName: this.column.name,
        stage: 'filter',
      });
    } finally {
      // Only the latest call resets the shared flag. An older call's `finally`
      // running while a newer call is still mid-await would otherwise flip
      // `isFilterUpdate` to false and corrupt subclasses' post-await checks
      // (e.g. the `syncVisualStateFromFilter` gate in Histogram/ValueCounts).
      if (seq === this.filterUpdateSequence) {
        this.isFilterUpdate = false;
      }
    }
  }

  // =========================================
  // Lifecycle
  // =========================================

  /**
   * Destroy the visualization and clean up all resources.
   * Must be called when the visualization is no longer needed.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Remove event listeners from canvas
    this.canvas.removeEventListener('mousemove', this.boundMouseMove);
    this.canvas.removeEventListener('mouseleave', this.boundMouseLeave);
    this.canvas.removeEventListener('click', this.boundClick);
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);

    // Unregister from shared window listener manager
    WindowListenerManager.unregister(this);

    // Stop observing resize (optional chaining in case constructor failed partially)
    this.resizeObserver?.disconnect();

    // Stop watching the root for color-scheme flips — whichever of the two
    // paths `setupColorSchemeWatcher` took.
    if (this.themeListener) {
      this.options.themeWatcher?.unregister(this.themeListener);
      this.themeListener = null;
    }
    this.colorSchemeObserver?.disconnect();
    this.colorSchemeObserver = null;

    // Remove canvas from DOM
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
