/**
 * CrossfilterCoordinator - Watches state.filters and propagates filter changes
 * to all registered visualizations, implementing the own-filter exclusion crossfilter pattern.
 */

import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { WorkerBridge } from '../data/WorkerBridge';
import type { Filter } from '../core/types';
import type { BaseVisualization } from './BaseVisualization';
import { filtersToWhereClause } from './histogram/HistogramData';

export class CrossfilterCoordinator {
  private visualizations = new Map<string, BaseVisualization>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private state: TableState,
    private actions: StateActions,
    private bridge: WorkerBridge,
    private tableName: string
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

  /** Route a visualization's onFilterChange to StateActions */
  handleFilterChange(columnName: string, filter: Filter | null): void {
    if (filter) {
      this.actions.addFilter(filter);
    } else {
      this.actions.removeFilter(columnName);
    }
    // The signal subscription triggers onFiltersChanged automatically
  }

  private async onFiltersChanged(filters: Filter[]): Promise<void> {
    // Update all visualizations in parallel
    const promises = [...this.visualizations.values()]
      .filter(viz => !viz.isDestroyed())
      .map(viz => viz.updateFilters(filters));
    await Promise.all(promises);

    // Update filtered row count
    await this.updateFilteredRowCount(filters);
  }

  private async updateFilteredRowCount(filters: Filter[]): Promise<void> {
    if (filters.length === 0) {
      this.state.filteredRows.set(this.state.totalRows.get());
      return;
    }
    const where = filtersToWhereClause(filters);
    const sql = `SELECT COUNT(*) as cnt FROM "${this.tableName}" WHERE ${where}`;
    const result = await this.bridge.query<{ cnt: number }>(sql);
    this.state.filteredRows.set(Number(result[0].cnt));
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
