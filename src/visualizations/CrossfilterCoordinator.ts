/**
 * CrossfilterCoordinator - Watches state.filters and propagates filter changes
 * to all registered visualizations, including the source that emitted the filter.
 *
 * Composed by `createDataTable()` for you. Use directly only when building a
 * custom pipeline of `BaseVisualization` instances outside the facade.
 *
 * @example
 * import { CrossfilterCoordinator } from '@jeyabbalas/data-table/advanced';
 *
 * const coord = new CrossfilterCoordinator(state, actions, bridge);
 * coord.register('age', ageHistogram);
 * coord.register('country', countryValueCounts);
 * // later:
 * coord.destroy();
 *
 * @see VisualizationRegistry
 * @see InteractionManager
 */

import type { StateActions } from '../core/Actions';
import { runLimited } from '../core/concurrency';
import type { TableState } from '../core/State';
import type { Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import { filtersToWhereClause, quoteIdentifier } from '../filters/FilterSQL';
import type { BaseVisualization } from './BaseVisualization';

/** Default max number of visualization queries in flight at once.
 *  DuckDB-WASM runs single-threaded in one worker, so fanning out 20+ queries
 *  on a wide table just queues them behind each other and blocks interactive
 *  queries. A small cap (4) keeps the worker fed without head-of-line blocking. */
const DEFAULT_VIZ_CONCURRENCY = 4;

/**
 * Request handed to a {@link FilterFanOutScheduler} in place of a coordinator's
 * own per-registration fan-out.
 */
export interface FilterFanOutRequest {
  /** The filter array being broadcast. */
  filters: Filter[];
  /** The coordinator's monotonic filter sequence for this cycle. */
  sequence: number;
  /** Column names with a live (non-destroyed) registration, in registration order. */
  columns: string[];
  /**
   * Perform the coordinator's normal per-column update. Resolves when it
   * settles. Calling it for a column that is no longer registered (or whose
   * registration has been destroyed) is a no-op.
   */
  refresh: (columnName: string) => Promise<void>;
}

/**
 * Optional hook that takes over a coordinator's per-registration fan-out on
 * filter change. When supplied, `refreshOnFilters` is called *instead of*
 * iterating registrations: the scheduler decides which entries refresh now
 * (typically only the visible ones) and which are deferred.
 *
 * The coordinator still performs each update through `request.refresh`, so the
 * destroyed / stale-sequence guards stay with the coordinator — a scheduler
 * only ever chooses *which* columns and *when*. Awaiting `refreshOnFilters`
 * gates nothing else: `updateFilteredRowCount` and `onFilterCycleComplete`
 * (the public `filterChange` contract) run on their own path.
 *
 * @example
 * ```ts
 * import type { FilterFanOutScheduler } from '@jeyabbalas/data-table/advanced';
 *
 * // Refresh only what the user can see; leave the rest for scroll-into-view.
 * const visibleOnly: FilterFanOutScheduler = {
 *   async refreshOnFilters({ columns, refresh }) {
 *     await Promise.all(columns.filter(isOnScreen).map(refresh));
 *   },
 * };
 *
 * const coord = new CrossfilterCoordinator(state, actions, bridge, 4, {
 *   vizScheduler: visibleOnly,
 * });
 * ```
 */
export interface FilterFanOutScheduler {
  refreshOnFilters(request: FilterFanOutRequest): Promise<void>;
}

/**
 * Optional hooks the facade can pass into the coordinator. `onFilterCycleComplete`
 * fires at the trailing edge of every filter cycle, *after* the async row-count
 * query has settled — that's the contract the public `filterChange` event
 * relies on so its `filteredRowCount` payload is never stale.
 */
export interface CrossfilterCoordinatorOptions {
  onFilterCycleComplete?: (filters: Filter[]) => void;
  /**
   * See {@link FilterFanOutScheduler}. Absent (the standalone `/advanced`
   * composition) = today's fan-out over every registered visualization.
   */
  vizScheduler?: FilterFanOutScheduler;
}

/**
 * Coordinates filter rebroadcasting across all column-header visualizations
 * on a table. Composed by the facade; rarely needed directly. Bounds in-flight
 * fan-out via a small concurrency cap so DuckDB-WASM (single-threaded) stays
 * responsive on wide tables.
 */
export class CrossfilterCoordinator {
  private visualizations = new Map<string, BaseVisualization>();
  private unsubscribe: (() => void) | null = null;
  private filterSequence = 0;
  private readonly concurrency: number;
  private readonly options: CrossfilterCoordinatorOptions;

  constructor(
    private state: TableState,
    private actions: StateActions,
    private bridge: WorkerBridge,
    concurrency: number = DEFAULT_VIZ_CONCURRENCY,
    options: CrossfilterCoordinatorOptions = {},
  ) {
    this.concurrency = Math.max(1, concurrency);
    this.options = options;
    this.unsubscribe = state.filters.subscribe((filters) => void this.onFiltersChanged(filters));
  }

  /** Register a visualization for crossfilter updates */
  register(columnName: string, viz: BaseVisualization): void {
    this.visualizations.set(columnName, viz);
  }

  /** Unregister a visualization */
  unregister(columnName: string): void {
    this.visualizations.delete(columnName);
  }

  /** Sync filtered row count with current filter state. Returns a promise
   * that resolves once the row-count query settles (or immediately when
   * there are no filters in state). The facade awaits this during `loadData`
   * so `loadComplete` doesn't fire while the count query is still in flight.
   *
   * Call after registering all visualizations when filters may have been
   * restored from persistence before the coordinator was created. */
  syncExistingFilters(): Promise<void> {
    const filters = this.state.filters.get();
    if (filters.length === 0) return Promise.resolve();
    const seq = ++this.filterSequence;
    return this.updateFilteredRowCount(filters, seq).then(() => {
      if (seq !== this.filterSequence) return;
      this.options.onFilterCycleComplete?.(filters);
    });
  }

  /** Route a visualization's onFilterChange to StateActions */
  handleFilterChange(columnName: string, filter: Filter | null): void {
    if (filter) {
      this.actions.addFilter(filter);
    } else {
      this.actions.removeFilter(columnName);
    }
  }

  private async onFiltersChanged(filters: Filter[]): Promise<void> {
    const seq = ++this.filterSequence;

    // Run visualization updates and filtered row count in parallel (independent
    // queries), but cap viz fan-out so we don't queue N queries behind DuckDB's
    // single-threaded worker on wide tables.
    await Promise.all([
      this.fanOutToVisualizations(filters, seq),
      this.updateFilteredRowCount(filters, seq),
    ]);

    // Trailing-edge hook: fires *after* state.filteredRows has settled so the
    // public `filterChange` event payload carries an up-to-date count. Skip
    // when a newer filter cycle has already started — the latest cycle will
    // emit its own event and we don't want a stale snapshot to overwrite it.
    if (seq !== this.filterSequence) return;
    this.options.onFilterCycleComplete?.(filters);
  }

  /**
   * Push `filters` to the registered visualizations for one cycle.
   *
   * With a {@link FilterFanOutScheduler} attached, the scheduler owns the
   * decision of which registrations refresh now and which are deferred (it
   * typically refreshes only what is on screen and marks the rest stale), so
   * this coordinator hands it the live column list and a `refresh` callback
   * instead of iterating registrations itself. Without one, every live
   * registration is refreshed through the bounded pool — the historical
   * behavior, which standalone `/advanced` compositions rely on.
   */
  private fanOutToVisualizations(filters: Filter[], seq: number): Promise<unknown> {
    const live = [...this.visualizations.entries()].filter(([, viz]) => !viz.isDestroyed());

    const scheduler = this.options.vizScheduler;
    if (scheduler) {
      const request: FilterFanOutRequest = {
        filters,
        sequence: seq,
        columns: live.map(([columnName]) => columnName),
        refresh: (columnName) => this.refreshColumn(columnName, filters),
      };
      return scheduler.refreshOnFilters(request);
    }

    return runLimited(
      live.map(
        ([, viz]) =>
          () =>
            viz.updateFilters(filters),
      ),
      this.concurrency,
    );
  }

  /** The per-column update a fan-out performs. No-op for a column that has
   *  been unregistered or destroyed since the cycle started. */
  private refreshColumn(columnName: string, filters: Filter[]): Promise<void> {
    const viz = this.visualizations.get(columnName);
    if (!viz || viz.isDestroyed()) return Promise.resolve();
    return viz.updateFilters(filters);
  }

  private async updateFilteredRowCount(filters: Filter[], seq: number): Promise<void> {
    if (filters.length === 0) {
      this.state.filteredRows.set(this.state.totalRows.get());
      return;
    }
    const tableName = this.state.tableName.get();
    if (!tableName) return;
    try {
      const where = filtersToWhereClause(filters);
      const sql = `SELECT COUNT(*) as cnt FROM ${quoteIdentifier(tableName)} WHERE ${where}`;
      const result = await this.bridge.query<{ cnt: number }>(sql);
      // Only apply if this is still the latest filter change
      if (seq !== this.filterSequence) return;
      this.state.filteredRows.set(Number(result[0]!.cnt));
    } catch (error) {
      console.error('[CrossfilterCoordinator] Failed to update filtered row count:', error);
    }
  }

  /** Clean up signal subscription and clear registrations */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.visualizations.clear();
  }
}
