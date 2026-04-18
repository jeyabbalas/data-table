/**
 * Typed event map emitted by a {@link DataTable} instance.
 *
 * These events wrap the underlying signal-driven state so that consumers
 * of the facade don't need to import `Signal` types or know which signal
 * on `TableState` holds which piece of state.
 *
 * Use `dataTable.on(event, handler)` to subscribe; the returned function
 * unsubscribes. `dataTable.off(event, handler)` also works.
 */

import type { Filter, SortColumn, ColumnSchema } from './types';
import type { ProgressInfo } from './Progress';
import type { DerivedColumnDef } from '../derived/types';

// NOTE: defined as a `type` (not `interface`) so it satisfies
// `Record<string, unknown>` for EventEmitter. Interfaces with named
// keys in TypeScript don't auto-satisfy that constraint.
export type TableEvents = {
  /** Fired after `initialize()` completes and the worker is ready. */
  ready: { bridgeReady: true };

  /** Fired when a load operation begins. */
  loadStart: { source: string };

  /** Per-chunk progress while loading (bytes, percent, stage). */
  loadProgress: ProgressInfo;

  /** Fired after data is loaded and schema is known. */
  loadComplete: {
    tableName: string;
    rowCount: number;
    schema: ColumnSchema[];
  };

  /** Fired if a load fails. */
  loadError: { error: Error };

  /** Fired on any change to the active filter list. */
  filterChange: {
    filters: Filter[];
    filteredRowCount: number;
    totalRowCount: number;
  };

  /** Fired on sort changes. */
  sortChange: { sortColumns: SortColumn[] };

  /** Fired when the selected-row set changes. */
  selectionChange: { selectedRows: Set<number> };

  /** Fired when visibility, order, pin state, or widths change. */
  columnChange: {
    visibleColumns: string[];
    pinnedColumns: string[];
    columnOrder: string[];
  };

  /** Fired when derived columns are added, updated, or removed. */
  derivedChange: { derivedColumns: DerivedColumnDef[] };

  /** Fired whenever canUndo/canRedo changes (e.g., after any action or an undo/redo). */
  undoChange: { canUndo: boolean; canRedo: boolean };

  /** Fired on the library's own teardown, before signals are disposed. */
  destroy: Record<string, never>;
};

/** Keys of the event map. */
export type TableEventName = keyof TableEvents;
