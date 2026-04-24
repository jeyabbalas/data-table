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
import type { DataTableError } from './errors';

/** Origin of an `error` event — which subsystem surfaced the failure. */
export type TableErrorSource =
  | 'load'
  | 'query'
  | 'export'
  | 'persistence'
  | 'visualization'
  | 'sql-validation'
  | 'derived-column'
  | 'listener'
  | 'unknown';

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

  /** Fired if a load fails. The `error` is always a typed DataTableError (subclass of Error). */
  loadError: { error: Error };

  /**
   * General error event. Fired for any recoverable typed error the library
   * surfaces at runtime — load failures, SQL validation, export failures,
   * persistence write failures, visualization fetch failures, etc.
   * `source` discriminates which subsystem produced the error.
   *
   * @example
   * table.on('error', ({ error, source }) => {
   *   if (error instanceof LoadError && error.code === 'PARSE_FAILED') {
   *     toast('Could not read that file.');
   *   } else if (source === 'persistence') {
   *     // IDB failures are non-fatal; degrade quietly.
   *     console.warn(error);
   *   } else {
   *     reportToSentry(error);
   *   }
   * });
   */
  error: {
    error: DataTableError;
    source: TableErrorSource;
  };

  /**
   * Non-fatal warning event. Emitted when the library continues operating
   * in a degraded mode (e.g., stylesheet missing, IndexedDB unavailable).
   *
   * @example
   * table.on('warning', ({ code, message }) => {
   *   if (code === 'STYLESHEET_MISSING') {
   *     console.warn('Forgot to import @jeyabbalas/data-table/styles?');
   *   } else if (code === 'PERSISTENCE_UNAVAILABLE') {
   *     // Running in a private window — inform the user.
   *   }
   * });
   */
  warning: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };

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

  /**
   * Fired when derived columns are added, updated, removed, or replaced.
   *
   * @property derivedColumns - The full list after the change.
   * @property kind - Which operation triggered the event.
   * @property columnName - The column that changed (omitted only for bulk
   *   reconciliation during undo/redo or session restore, where multiple
   *   columns may change in one step).
   */
  derivedChange: {
    derivedColumns: DerivedColumnDef[];
    kind: 'added' | 'removed' | 'updated' | 'replaced';
    columnName?: string;
  };

  /** Fired whenever canUndo/canRedo changes (e.g., after any action or an undo/redo). */
  undoChange: { canUndo: boolean; canRedo: boolean };

  /** Fired on the library's own teardown, before signals are disposed. */
  destroy: Record<string, never>;
};

/** Keys of the event map. */
export type TableEventName = keyof TableEvents;
