/**
 * Core State Store
 *
 * Centralized reactive state management for the data table using signals.
 * Provides type-safe state containers for all table data, UI state, and configuration.
 */

import { createSignal, type Signal } from './Signal';
import type { ColumnSchema, Filter, SortColumn } from './types';

/**
 * TableState interface - all reactive state for a data table instance
 */
export interface TableState {
  // Data
  /** The name of the DuckDB table containing the data */
  tableName: Signal<string | null>;
  /** Column schema information */
  schema: Signal<ColumnSchema[]>;
  /** Total number of rows in the table */
  totalRows: Signal<number>;

  // Filters
  /** Active filters applied to the data */
  filters: Signal<Filter[]>;
  /** Number of rows matching current filters (updated after queries) */
  filteredRows: Signal<number>;

  // Sorting
  /** Columns to sort by, in order of priority */
  sortColumns: Signal<SortColumn[]>;

  // Columns
  /** Names of currently visible columns */
  visibleColumns: Signal<string[]>;
  /** Order of columns as displayed */
  columnOrder: Signal<string[]>;
  /** Custom widths for columns (column name -> width in pixels) */
  columnWidths: Signal<Map<string, number>>;
  /** Names of columns pinned to the left */
  pinnedColumns: Signal<string[]>;

  // Selection
  /** Set of selected row indices */
  selectedRows: Signal<Set<number>>;

  // UI
  /** Currently hovered row index */
  hoveredRow: Signal<number | null>;
  /** Currently hovered column name */
  hoveredColumn: Signal<string | null>;
}

/**
 * Create a new TableState with default values
 *
 * All signals are initialized to empty/null states. Use initializeColumnsFromSchema()
 * after loading data to set up column-related state.
 *
 * @returns A new TableState instance with all signals initialized
 *
 * @example
 * ```typescript
 * const state = createTableState();
 * state.tableName.subscribe(name => console.log('Table:', name));
 * state.tableName.set('my_data');
 * ```
 */
export function createTableState(): TableState {
  return {
    // Data
    tableName: createSignal<string | null>(null),
    schema: createSignal<ColumnSchema[]>([]),
    totalRows: createSignal<number>(0),

    // Filters
    filters: createSignal<Filter[]>([]),
    filteredRows: createSignal<number>(0),

    // Sorting
    sortColumns: createSignal<SortColumn[]>([]),

    // Columns
    visibleColumns: createSignal<string[]>([]),
    columnOrder: createSignal<string[]>([]),
    columnWidths: createSignal<Map<string, number>>(new Map()),
    pinnedColumns: createSignal<string[]>([]),

    // Selection
    selectedRows: createSignal<Set<number>>(new Set()),

    // UI
    hoveredRow: createSignal<number | null>(null),
    hoveredColumn: createSignal<string | null>(null),
  };
}

/**
 * Reset table state to initial values
 *
 * Useful when loading new data or clearing the table.
 * All signals are reset to their default empty/null values.
 *
 * @param state - The TableState to reset
 *
 * @example
 * ```typescript
 * resetTableState(state);
 * // Now load new data...
 * ```
 */
export function resetTableState(state: TableState): void {
  state.tableName.set(null);
  state.schema.set([]);
  state.totalRows.set(0);
  state.filters.set([]);
  state.filteredRows.set(0);
  state.sortColumns.set([]);
  state.visibleColumns.set([]);
  state.columnOrder.set([]);
  state.columnWidths.set(new Map());
  state.pinnedColumns.set([]);
  state.selectedRows.set(new Set());
  state.hoveredRow.set(null);
  state.hoveredColumn.set(null);
}

/**
 * Initialize column-related state from a schema
 *
 * Sets up the schema, visibleColumns, and columnOrder based on the provided
 * column schema. This should be called after loading data.
 *
 * @param state - The TableState to initialize
 * @param schema - The column schema from the loaded data
 *
 * @example
 * ```typescript
 * const schema = await detectSchema(tableName, bridge);
 * initializeColumnsFromSchema(state, schema);
 * ```
 */
export function initializeColumnsFromSchema(
  state: TableState,
  schema: ColumnSchema[]
): void {
  const columnNames = schema.map((col) => col.name);
  state.schema.set(schema);
  state.visibleColumns.set(columnNames);
  state.columnOrder.set(columnNames);
  state.columnWidths.set(new Map());
  state.pinnedColumns.set([]);
}
