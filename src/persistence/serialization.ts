/**
 * State Serialization / Deserialization
 *
 * Converts between the live reactive TableState (Signals, Maps, Dates)
 * and the JSON-serializable SessionSnapshot for persistence.
 */

import type { TableState, HiddenColumnInfo } from '../core/State';
import type { SessionSnapshot, SerializedStateSnapshot } from './types';
import { SNAPSHOT_VERSION } from './types';
import { serializeFilter, deserializeFilter } from './SessionStore';
import { batch } from '../core/Signal';
import type { UndoManager, StateSnapshot } from '../core/UndoManager';

// ── StateSnapshot serialization (undo/redo stacks) ────────────────────

/** Convert a runtime StateSnapshot to a JSON-safe SerializedStateSnapshot. */
export function serializeStateSnapshot(snap: StateSnapshot): SerializedStateSnapshot {
  return {
    filters: snap.filters.map(serializeFilter),
    sortColumns: snap.sortColumns.map(s => ({ ...s })),
    visibleColumns: [...snap.visibleColumns],
    columnOrder: [...snap.columnOrder],
    columnWidths: Object.fromEntries(snap.columnWidths),
    pinnedColumns: [...snap.pinnedColumns],
    hiddenColumnInfo: Object.fromEntries(
      Array.from(snap.hiddenColumnInfo.entries()).map(
        ([k, v]) => [k, { ...v }],
      ),
    ),
  };
}

/**
 * Convert a SerializedStateSnapshot back to a runtime StateSnapshot.
 *
 * Validates all fields against validColumns — stale column references
 * are silently dropped, matching restoreStateFromSnapshot behavior.
 */
export function deserializeStateSnapshot(
  s: SerializedStateSnapshot,
  validColumns: Set<string>,
): StateSnapshot {
  const filters = s.filters
    .map(deserializeFilter)
    .filter(f => validColumns.has(f.column));

  const sortColumns = s.sortColumns.filter(sc => validColumns.has(sc.column));

  let visibleColumns = s.visibleColumns.filter(c => validColumns.has(c));
  if (visibleColumns.length === 0) {
    visibleColumns = [...validColumns];
  }

  const columnOrder = s.columnOrder.filter(c => validColumns.has(c));

  const columnWidths = new Map<string, number>();
  for (const [col, width] of Object.entries(s.columnWidths)) {
    if (validColumns.has(col)) columnWidths.set(col, width);
  }

  const pinnedColumns = s.pinnedColumns.filter(c => validColumns.has(c));

  const hiddenColumnInfo = new Map<string, HiddenColumnInfo>();
  for (const [col, info] of Object.entries(s.hiddenColumnInfo)) {
    if (validColumns.has(col)) {
      hiddenColumnInfo.set(col, {
        column: info.column,
        leftNeighbor: info.leftNeighbor && validColumns.has(info.leftNeighbor) ? info.leftNeighbor : null,
        rightNeighbor: info.rightNeighbor && validColumns.has(info.rightNeighbor) ? info.rightNeighbor : null,
      });
    }
  }

  return { filters, sortColumns, visibleColumns, columnOrder, columnWidths, pinnedColumns, hiddenColumnInfo };
}

// ── Session snapshot (full table state + optional undo stacks) ────────

/**
 * Capture the current TableState as a serializable SessionSnapshot.
 *
 * Reads all relevant signals, converts Maps to Records, and serializes
 * filters (wrapping Date objects as DateWrapper markers).
 *
 * If an UndoManager is provided, its undo/redo stacks are serialized
 * and included in the snapshot for persistence across refreshes.
 */
export function snapshotFromState(state: TableState, undoManager?: UndoManager): SessionSnapshot {
  const snapshot: SessionSnapshot = {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName: state.baseTableName.get() ?? state.tableName.get(),
    filters: state.filters.get().map(serializeFilter),
    sortColumns: [...state.sortColumns.get()],
    visibleColumns: [...state.visibleColumns.get()],
    columnOrder: [...state.columnOrder.get()],
    columnWidths: Object.fromEntries(state.columnWidths.get()),
    pinnedColumns: [...state.pinnedColumns.get()],
    hiddenColumnInfo: Object.fromEntries(state.hiddenColumnInfo.get()),
    derivedColumns: state.derivedColumns.get().map(d => {
      if (d.kind === 'expression') return { ...d };
      return { ...d, values: d.values.slice() } as typeof d;
    }),
  };

  if (undoManager) {
    const { undoStack, redoStack } = undoManager.getStacks();
    snapshot.undoStack = undoStack.map(serializeStateSnapshot);
    snapshot.redoStack = redoStack.map(serializeStateSnapshot);
  }

  return snapshot;
}

/**
 * Restore TableState from a SessionSnapshot.
 *
 * Validates all snapshot data against the current schema — columns that no
 * longer exist are silently dropped. New schema columns not present in the
 * snapshot are appended to columnOrder.
 *
 * Does NOT restore tableName (it comes from data loading, not the snapshot).
 */
export function restoreStateFromSnapshot(
  state: TableState,
  snapshot: SessionSnapshot,
  undoManager?: UndoManager,
): void {
  const schemaColumns = state.schema.get();
  if (schemaColumns.length === 0) return;

  const validColumns = new Set(schemaColumns.map((c) => c.name));
  const allColumnNames = schemaColumns.map((c) => c.name);

  // Filters: deserialize and drop stale column references
  const filters = snapshot.filters
    .map(deserializeFilter)
    .filter((f) => validColumns.has(f.column));

  // Sort: drop stale column references
  const sortColumns = snapshot.sortColumns.filter((s) =>
    validColumns.has(s.column),
  );

  // Visible columns: filter to valid; fallback to all if empty
  let visibleColumns = snapshot.visibleColumns.filter((c) =>
    validColumns.has(c),
  );
  if (visibleColumns.length === 0) {
    visibleColumns = allColumnNames;
  }

  // Column order: filter to valid, then append any new schema columns
  const restoredOrder = snapshot.columnOrder.filter((c) =>
    validColumns.has(c),
  );
  const orderSet = new Set(restoredOrder);
  for (const col of allColumnNames) {
    if (!orderSet.has(col)) {
      restoredOrder.push(col);
    }
  }

  // Column widths: Record → Map, skip stale columns
  const columnWidths = new Map<string, number>();
  for (const [col, width] of Object.entries(snapshot.columnWidths)) {
    if (validColumns.has(col)) {
      columnWidths.set(col, width);
    }
  }

  // Pinned columns: filter to valid
  const pinnedColumns = snapshot.pinnedColumns.filter((c) =>
    validColumns.has(c),
  );

  // Hidden column info: Record → Map, skip stale columns, nullify dangling neighbors
  const hiddenColumnInfo = new Map<string, HiddenColumnInfo>();
  for (const [col, info] of Object.entries(snapshot.hiddenColumnInfo)) {
    if (validColumns.has(col)) {
      hiddenColumnInfo.set(col, {
        column: info.column,
        leftNeighbor:
          info.leftNeighbor && validColumns.has(info.leftNeighbor)
            ? info.leftNeighbor
            : null,
        rightNeighbor:
          info.rightNeighbor && validColumns.has(info.rightNeighbor)
            ? info.rightNeighbor
            : null,
      });
    }
  }

  // Apply all validated values in a batch
  batch(() => {
    state.filters.set(filters);
    state.sortColumns.set(sortColumns);
    state.visibleColumns.set(visibleColumns);
    state.columnOrder.set(restoredOrder);
    state.columnWidths.set(columnWidths);
    state.pinnedColumns.set(pinnedColumns);
    state.hiddenColumnInfo.set(hiddenColumnInfo);
  });

  // Restore derivedColumns signal if present in snapshot.
  // NOTE: This only sets the signal. The caller (loadData) must recreate
  // the DuckDB VIEW and helper tables via DerivedColumnManager.restoreColumns().
  if (snapshot.derivedColumns && snapshot.derivedColumns.length > 0) {
    state.derivedColumns.set(
      snapshot.derivedColumns.map(d => {
        if (d.kind === 'expression') return { ...d };
        return { ...d, values: d.values.slice() } as typeof d;
      })
    );
  }

  // Restore undo/redo stacks if present
  if (undoManager && snapshot.undoStack) {
    const deserialized = {
      undoStack: snapshot.undoStack.map(s => deserializeStateSnapshot(s, validColumns)),
      redoStack: (snapshot.redoStack ?? []).map(s => deserializeStateSnapshot(s, validColumns)),
    };
    undoManager.loadStacks(deserialized.undoStack, deserialized.redoStack);
  }
}
