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

import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { WorkerBridge } from '../data/WorkerBridge';
import type { Filter } from '../core/types';
import type { BaseVisualization } from './BaseVisualization';
import { filtersToWhereClause, quoteIdentifier } from '../filters/FilterSQL';

export class CrossfilterCoordinator {
  private visualizations = new Map<string, BaseVisualization>();
  private unsubscribe: (() => void) | null = null;
  private filterSequence = 0;

  constructor(
    private state: TableState,
    private actions: StateActions,
    private bridge: WorkerBridge,
  ) {
    this.unsubscribe = state.filters.subscribe(filters => this.onFiltersChanged(filters));
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
      this.updateFilteredRowCount(filters, ++this.filterSequence);
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

    const vizPromises = [...this.visualizations.entries()]
      .filter(([, viz]) => !viz.isDestroyed())
      .map(([, viz]) => viz.updateFilters(filters));

    // Run visualization updates and filtered row count in parallel (independent queries)
    await Promise.all([...vizPromises, this.updateFilteredRowCount(filters, seq)]);
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
