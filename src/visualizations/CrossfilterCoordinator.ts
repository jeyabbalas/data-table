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

export class CrossfilterCoordinator {
  private visualizations = new Map<string, BaseVisualization>();
  private unsubscribe: (() => void) | null = null;
  private filterSequence = 0;
  private readonly concurrency: number;

  constructor(
    private state: TableState,
    private actions: StateActions,
    private bridge: WorkerBridge,
    concurrency: number = DEFAULT_VIZ_CONCURRENCY,
  ) {
    this.concurrency = Math.max(1, concurrency);
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

  /** Sync filtered row count with current filter state.
   * Call after registering all visualizations when filters may have been
   * restored from persistence before the coordinator was created. */
  syncExistingFilters(): void {
    const filters = this.state.filters.get();
    if (filters.length > 0) {
      void this.updateFilteredRowCount(filters, ++this.filterSequence);
    }
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

    const vizTasks = [...this.visualizations.entries()]
      .filter(([, viz]) => !viz.isDestroyed())
      .map(
        ([, viz]) =>
          () =>
            viz.updateFilters(filters),
      );

    // Run visualization updates and filtered row count in parallel (independent
    // queries), but cap viz fan-out so we don't queue N queries behind DuckDB's
    // single-threaded worker on wide tables.
    await Promise.all([this.runLimited(vizTasks), this.updateFilteredRowCount(filters, seq)]);
  }

  /** Run async tasks with a ceiling on simultaneous in-flight count.
   *  Semantics mirror `Promise.all(tasks.map(t => t()))`: results preserve input
   *  order, and the first rejection aborts the combined promise while sibling
   *  tasks continue to run to completion in the background. */
  private async runLimited<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let cursor = 0;
    const workerCount = Math.min(this.concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= tasks.length) return;
        results[i] = await tasks[i]();
      }
    });
    await Promise.all(workers);
    return results;
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
      this.state.filteredRows.set(Number(result[0].cnt));
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
