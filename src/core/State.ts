/**
 * Core State Store
 *
 * Centralized reactive state management for the data table using signals.
 * Provides type-safe state containers for all table data, UI state, and configuration.
 */

import type { DerivedColumnDef } from '../derived/types';
import { createSignal, computed, batch, type Signal, type Computed } from './Signal';
import type { ColumnSchema, Filter, SortColumn, ColumnHeaderTooltipContent } from './types';

/** Metadata for a hidden column — tracks neighbors at hide time for intelligent restore */
export interface HiddenColumnInfo {
  column: string;
  leftNeighbor: string | null;
  rightNeighbor: string | null;
}

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
  /** Original table name before any VIEW was created */
  baseTableName: Signal<string | null>;
  /** Ordered list of derived column definitions */
  derivedColumns: Signal<DerivedColumnDef[]>;

  // Filters
  /** Active filters applied to the data */
  filters: Signal<Filter[]>;
  /** Number of rows matching current filters (updated after queries) */
  filteredRows: Signal<number>;
  /** Filters grouped by column name (computed from filters signal) */
  filtersByColumn: Computed<Map<string, Filter[]>>;

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
  /** Metadata for hidden columns — tracks neighbors at hide time for intelligent restore */
  hiddenColumnInfo: Signal<Map<string, HiddenColumnInfo>>;
  /** App-controlled column-header tooltip overrides, rendered as a styled popover. */
  columnHeaderTooltips: Signal<Map<string, ColumnHeaderTooltipContent>>;

  // Selection
  /** Set of selected row indices */
  selectedRows: Signal<Set<number>>;

  // UI
  /** Currently hovered row index */
  hoveredRow: Signal<number | null>;
  /** Currently hovered column name */
  hoveredColumn: Signal<string | null>;
  /** Currently focused cell for keyboard navigation */
  focusedCell: Signal<{ row: number; column: string } | null>;
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
  const filters = createSignal<Filter[]>([]);
  const filtersByColumn = computed(() => {
    const map = new Map<string, Filter[]>();
    for (const f of filters.get()) {
      const existing = map.get(f.column);
      if (existing) {
        existing.push(f);
      } else {
        map.set(f.column, [f]);
      }
    }
    return map;
  }, [filters]);

  return {
    // Data
    tableName: createSignal<string | null>(null),
    schema: createSignal<ColumnSchema[]>([]),
    totalRows: createSignal<number>(0),
    baseTableName: createSignal<string | null>(null),
    derivedColumns: createSignal<DerivedColumnDef[]>([]),

    // Filters
    filters,
    filteredRows: createSignal<number>(0),
    filtersByColumn,

    // Sorting
    sortColumns: createSignal<SortColumn[]>([]),

    // Columns
    visibleColumns: createSignal<string[]>([]),
    columnOrder: createSignal<string[]>([]),
    columnWidths: createSignal<Map<string, number>>(new Map()),
    pinnedColumns: createSignal<string[]>([]),
    hiddenColumnInfo: createSignal<Map<string, HiddenColumnInfo>>(new Map()),
    columnHeaderTooltips: createSignal<Map<string, ColumnHeaderTooltipContent>>(new Map()),

    // Selection
    selectedRows: createSignal<Set<number>>(new Set()),

    // UI
    hoveredRow: createSignal<number | null>(null),
    hoveredColumn: createSignal<string | null>(null),
    focusedCell: createSignal<{ row: number; column: string } | null>(null),
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
  state.baseTableName.set(null);
  state.derivedColumns.set([]);
  state.filters.set([]);
  state.filteredRows.set(0);
  state.sortColumns.set([]);
  state.visibleColumns.set([]);
  state.columnOrder.set([]);
  state.columnWidths.set(new Map());
  state.pinnedColumns.set([]);
  state.hiddenColumnInfo.set(new Map());
  state.columnHeaderTooltips.set(new Map());
  state.selectedRows.set(new Set());
  state.hoveredRow.set(null);
  state.hoveredColumn.set(null);
  state.focusedCell.set(null);
}

/**
 * Hold the values {@link resetTableState} resets, and return a function
 * that sets them back in one batch: for a load that is turned away after the
 * reset, before it changes any table. Hover is left as the reset made it, as
 * the pointer has moved on.
 *
 * @param state - The TableState to capture
 * @returns A function that puts the captured values back
 */
export function captureTableState(state: TableState): () => void {
  const tableName = state.tableName.get();
  const schema = state.schema.get();
  const totalRows = state.totalRows.get();
  const baseTableName = state.baseTableName.get();
  const derivedColumns = state.derivedColumns.get();
  const filters = state.filters.get();
  const filteredRows = state.filteredRows.get();
  const sortColumns = state.sortColumns.get();
  const visibleColumns = state.visibleColumns.get();
  const columnOrder = state.columnOrder.get();
  const columnWidths = state.columnWidths.get();
  const pinnedColumns = state.pinnedColumns.get();
  const hiddenColumnInfo = state.hiddenColumnInfo.get();
  const columnHeaderTooltips = state.columnHeaderTooltips.get();
  const selectedRows = state.selectedRows.get();
  const focusedCell = state.focusedCell.get();
  return () =>
    batch(() => {
      state.tableName.set(tableName);
      state.schema.set(schema);
      state.totalRows.set(totalRows);
      state.baseTableName.set(baseTableName);
      state.derivedColumns.set(derivedColumns);
      state.filters.set(filters);
      state.filteredRows.set(filteredRows);
      state.sortColumns.set(sortColumns);
      state.visibleColumns.set(visibleColumns);
      state.columnOrder.set(columnOrder);
      state.columnWidths.set(columnWidths);
      state.pinnedColumns.set(pinnedColumns);
      state.hiddenColumnInfo.set(hiddenColumnInfo);
      state.columnHeaderTooltips.set(columnHeaderTooltips);
      state.selectedRows.set(selectedRows);
      state.focusedCell.set(focusedCell);
    });
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
export function initializeColumnsFromSchema(state: TableState, schema: ColumnSchema[]): void {
  const columnNames = schema.map((col) => col.name);
  // System columns (e.g. synthetic __rowid__) stay in columnOrder and schema
  // so they remain queryable and listable in the column chooser, but are
  // excluded from the default visible set so the grid does not show them
  // unless the app explicitly opts in via showColumn().
  const visibleNames = schema.filter((col) => !col.system).map((col) => col.name);
  // Batched because `TableContainer` re-renders on `schema` alone: un-batched,
  // the schema write lands while `visibleColumns` is still the previous (on
  // first load, empty) array, and that render paints a grid advertising N
  // columns whose header row owns no `columnheader` — an
  // `aria-required-children` violation on every single load. `batch()`
  // coalesces per *signal*, not per subscriber, so this still produces two
  // renders (schema, then visibleColumns); what it buys is that the first one
  // already sees the final visible set.
  batch(() => {
    state.schema.set(schema);
    state.visibleColumns.set(visibleNames);
    state.columnOrder.set(columnNames);
    state.columnWidths.set(new Map());
    state.pinnedColumns.set([]);
    state.hiddenColumnInfo.set(new Map());
    state.columnHeaderTooltips.set(new Map());
  });
}

/**
 * `order` with the pinned columns moved to its front, each group kept in its
 * own order.
 *
 * The table assumes the pinned columns lead: their sticky offsets are the
 * widths of the pinned columns before each one, and the body mounts them as
 * the leading block wherever it is scrolled. `toggleColumnPin` and
 * `showColumn` keep them first as they go; this is for the paths that take a
 * whole order from outside, `setColumnOrder` and a restored session.
 *
 * @example
 * ```typescript
 * pinnedColumnsFirst(['a', 'b', 'c'], ['c']); // → ['c', 'a', 'b']
 * ```
 */
export function pinnedColumnsFirst(order: readonly string[], pinned: readonly string[]): string[] {
  const set = new Set(pinned);
  return [...order.filter((c) => set.has(c)), ...order.filter((c) => !set.has(c))];
}

/**
 * `columns` with each column of `order` that it lacks put back beside its old
 * neighbour: before the nearest column after it in `order` that the result
 * has, or at the end.
 *
 * How a new order of the visible columns keeps the hidden ones: each goes
 * back next to the column it was next to.
 *
 * @example
 * ```typescript
 * mergeMissingColumns(['c', 'a'], ['a', 'b', 'c']); // → ['b', 'c', 'a']
 * ```
 */
export function mergeMissingColumns(
  columns: readonly string[],
  order: readonly string[],
): string[] {
  // Linear: a restore runs this for every saved undo entry, and a quadratic
  // merge of 900 hidden columns into 100 took 300 ms each.
  const present = new Set(columns);
  // Each missing column's new right neighbour: the first column after it in
  // `order` that `columns` has, or `null` for the end.
  const before = new Map<string | null, string[]>();
  const placed = new Set<string>();
  let next: string | null = null;
  const anchors: (string | null)[] = new Array<string | null>(order.length);
  for (let k = order.length - 1; k >= 0; k--) {
    anchors[k] = next;
    if (present.has(order[k]!)) next = order[k]!;
  }
  for (let k = 0; k < order.length; k++) {
    const missing = order[k]!;
    if (present.has(missing) || placed.has(missing)) continue;
    placed.add(missing);
    const anchor = anchors[k] ?? null;
    const group = before.get(anchor);
    if (group) group.push(missing);
    else before.set(anchor, [missing]);
  }

  const merged: string[] = [];
  for (const column of columns) {
    const group = before.get(column);
    if (group) {
      merged.push(...group);
      before.delete(column);
    }
    merged.push(column);
  }
  merged.push(...(before.get(null) ?? []));
  return merged;
}

/**
 * A column order, the visible columns and the pinned columns made to agree
 * the way the column actions keep them:
 *
 * - the visible columns in `visible`'s order, which is what the table showed;
 * - every other column of `order` back beside its old neighbour
 *   ({@link mergeMissingColumns});
 * - the pinned columns first ({@link pinnedColumnsFirst}), and
 *   `pinnedColumns` in the order they are shown, which is the order
 *   `showColumn` puts a pinned column back in.
 *
 * For state that did not come from the column actions: a restored session,
 * and the undo and redo entries saved with it. A session saved before the
 * actions kept pinned columns first, and visible columns in `columnOrder`,
 * can break both rules. On state that keeps them, it changes nothing.
 */
export function consistentColumnOrder(
  visible: readonly string[],
  order: readonly string[],
  pinned: readonly string[],
): { columnOrder: string[]; visibleColumns: string[]; pinnedColumns: string[] } {
  // A name listed twice is shown once: `ColumnLayout` guards against it too.
  const shown = new Set(visible);
  const columnOrder = pinnedColumnsFirst(mergeMissingColumns([...shown], order), pinned);
  const inOrder = new Set(columnOrder);
  const isPinned = new Set(pinned);
  return {
    columnOrder,
    visibleColumns: columnOrder.filter((c) => shown.has(c)),
    pinnedColumns: [
      ...columnOrder.filter((c) => isPinned.has(c)),
      ...pinned.filter((c) => !inOrder.has(c)),
    ],
  };
}

/**
 * Return true if `name` refers to a library-synthesized system column
 * (e.g. the reserved `__rowid__`).
 */
export function isSystemColumn(schema: ColumnSchema[], name: string): boolean {
  return schema.some((c) => c.name === name && c.system === true);
}
