/**
 * State Actions
 *
 * Provides methods to manipulate TableState. This is the command/action layer
 * that encapsulates state mutations, making it easy for UI components and
 * external code to interact with the table state.
 */

import type { TableState } from './State';
import { resetTableState, initializeColumnsFromSchema } from './State';
import type { Filter, FilterType, SortColumn } from './types';
import type { WorkerBridge } from '../data/WorkerBridge';
import { DataLoader, type DataLoaderOptions } from '../data/DataLoader';
import { detectSchema } from '../data/SchemaDetector';

/**
 * Options for loading data
 */
export interface LoadDataOptions extends DataLoaderOptions {}

/**
 * StateActions class provides methods to manipulate TableState
 */
export class StateActions {
  private loader: DataLoader;
  private lastSelectedIndex: number | null = null;

  constructor(
    private state: TableState,
    private bridge: WorkerBridge
  ) {
    this.loader = new DataLoader(bridge);
  }

  // =========================================
  // Data Loading
  // =========================================

  /**
   * Load data from a file or URL
   *
   * @param source - File object or URL string
   * @param options - Loading options (tableName, format)
   */
  async loadData(
    source: File | string,
    options: LoadDataOptions = {}
  ): Promise<void> {
    // Reset state for new data
    resetTableState(this.state);

    // Load data
    const result = await this.loader.load(source, options);

    // Detect schema
    const schema = await detectSchema(result.tableName, this.bridge);

    // Update state
    this.state.tableName.set(result.tableName);
    this.state.totalRows.set(result.rowCount);
    this.state.filteredRows.set(result.rowCount);
    initializeColumnsFromSchema(this.state, schema);
  }

  // =========================================
  // Filter Actions
  // =========================================

  /**
   * Add or update a filter
   *
   * If a filter for the same column and type exists, it will be replaced.
   */
  addFilter(filter: Filter): void {
    const current = this.state.filters.get();
    const existingIndex = current.findIndex(
      (f) => f.column === filter.column && f.type === filter.type
    );

    if (existingIndex >= 0) {
      // Replace existing filter
      const updated = [...current];
      updated[existingIndex] = filter;
      this.state.filters.set(updated);
    } else {
      this.state.filters.set([...current, filter]);
    }
  }

  /**
   * Remove filter(s) for a column
   *
   * @param column - Column name
   * @param type - Optional filter type to remove (if not specified, removes all filters for column)
   */
  removeFilter(column: string, type?: FilterType): void {
    const current = this.state.filters.get();
    const updated = current.filter((f) =>
      type ? !(f.column === column && f.type === type) : f.column !== column
    );
    this.state.filters.set(updated);
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.state.filters.set([]);
    this.state.filteredRows.set(this.state.totalRows.get());
  }

  // =========================================
  // Sort Actions
  // =========================================

  /**
   * Set sort columns directly
   */
  setSort(columns: SortColumn[]): void {
    this.state.sortColumns.set(columns);
  }

  /**
   * Toggle sort for a single column (cycles: none → asc → desc → none)
   *
   * Replaces any existing sort with the new column.
   */
  toggleSort(column: string): void {
    const current = this.state.sortColumns.get();
    const existing = current.find((s) => s.column === column);

    if (!existing) {
      // Not sorted → ascending
      this.state.sortColumns.set([{ column, direction: 'asc' }]);
    } else if (existing.direction === 'asc') {
      // Ascending → descending
      this.state.sortColumns.set([{ column, direction: 'desc' }]);
    } else {
      // Descending → no sort
      this.state.sortColumns.set([]);
    }
  }

  /**
   * Add column to multi-sort (Shift+click behavior)
   *
   * If column is already in sort, toggles its direction or removes it.
   */
  addToSort(column: string): void {
    const current = this.state.sortColumns.get();
    const existingIndex = current.findIndex((s) => s.column === column);

    if (existingIndex === -1) {
      // Add new sort column
      this.state.sortColumns.set([...current, { column, direction: 'asc' }]);
    } else {
      const updated = [...current];
      const existing = updated[existingIndex];
      if (existing.direction === 'asc') {
        // Toggle to descending
        updated[existingIndex] = { column, direction: 'desc' };
      } else {
        // Remove from sort
        updated.splice(existingIndex, 1);
      }
      this.state.sortColumns.set(updated);
    }
  }

  /**
   * Clear all sorting
   */
  clearSort(): void {
    this.state.sortColumns.set([]);
  }

  // =========================================
  // Column Visibility Actions
  // =========================================

  /**
   * Hide a column
   */
  hideColumn(column: string): void {
    const visible = this.state.visibleColumns.get();
    if (visible.includes(column)) {
      this.state.visibleColumns.set(visible.filter((c) => c !== column));
    }
  }

  /**
   * Show a hidden column
   *
   * The column is inserted at its correct position based on columnOrder.
   */
  showColumn(column: string): void {
    const visible = this.state.visibleColumns.get();
    const order = this.state.columnOrder.get();

    if (!visible.includes(column) && order.includes(column)) {
      // Insert at correct position based on columnOrder
      const orderIndex = order.indexOf(column);
      const newVisible = [...visible];
      let insertIndex = 0;
      for (let i = 0; i < orderIndex; i++) {
        if (visible.includes(order[i])) {
          insertIndex++;
        }
      }
      newVisible.splice(insertIndex, 0, column);
      this.state.visibleColumns.set(newVisible);
    }
  }

  /**
   * Set the column order
   *
   * Also reorders visible columns to match the new order.
   */
  setColumnOrder(columns: string[]): void {
    this.state.columnOrder.set(columns);
    // Also reorder visible columns to match
    const visible = this.state.visibleColumns.get();
    const reorderedVisible = columns.filter((c) => visible.includes(c));
    this.state.visibleColumns.set(reorderedVisible);
  }

  /**
   * Toggle column pin status
   */
  toggleColumnPin(column: string): void {
    const pinned = this.state.pinnedColumns.get();
    if (pinned.includes(column)) {
      this.state.pinnedColumns.set(pinned.filter((c) => c !== column));
    } else {
      this.state.pinnedColumns.set([...pinned, column]);
    }
  }

  /**
   * Set column width
   */
  setColumnWidth(column: string, width: number): void {
    const widths = new Map(this.state.columnWidths.get());
    widths.set(column, width);
    this.state.columnWidths.set(widths);
  }

  // =========================================
  // Row Selection Actions
  // =========================================

  /**
   * Select a row
   *
   * @param index - Row index to select
   * @param mode - Selection mode:
   *   - 'replace': Replace selection with this row (default, normal click)
   *   - 'toggle': Toggle this row in selection (Ctrl+click)
   *   - 'range': Select range from last selected to this row (Shift+click)
   */
  selectRow(
    index: number,
    mode: 'replace' | 'toggle' | 'range' = 'replace'
  ): void {
    const current = this.state.selectedRows.get();

    switch (mode) {
      case 'replace':
        this.state.selectedRows.set(new Set([index]));
        this.lastSelectedIndex = index;
        break;

      case 'toggle': {
        const updated = new Set(current);
        if (updated.has(index)) {
          updated.delete(index);
        } else {
          updated.add(index);
        }
        this.state.selectedRows.set(updated);
        this.lastSelectedIndex = index;
        break;
      }

      case 'range':
        if (this.lastSelectedIndex === null) {
          // No previous selection, treat as replace
          this.state.selectedRows.set(new Set([index]));
          this.lastSelectedIndex = index;
        } else {
          // Select range from lastSelectedIndex to index
          const start = Math.min(this.lastSelectedIndex, index);
          const end = Math.max(this.lastSelectedIndex, index);
          const rangeSet = new Set<number>();
          for (let i = start; i <= end; i++) {
            rangeSet.add(i);
          }
          this.state.selectedRows.set(rangeSet);
        }
        break;
    }
  }

  /**
   * Clear all row selection
   */
  clearSelection(): void {
    this.state.selectedRows.set(new Set());
    this.lastSelectedIndex = null;
  }

  /**
   * Select all rows
   */
  selectAll(): void {
    const total = this.state.totalRows.get();
    const allRows = new Set<number>();
    for (let i = 0; i < total; i++) {
      allRows.add(i);
    }
    this.state.selectedRows.set(allRows);
  }

  // =========================================
  // UI State Actions
  // =========================================

  /**
   * Set hovered row
   */
  setHoveredRow(index: number | null): void {
    this.state.hoveredRow.set(index);
  }

  /**
   * Set hovered column
   */
  setHoveredColumn(column: string | null): void {
    this.state.hoveredColumn.set(column);
  }
}
