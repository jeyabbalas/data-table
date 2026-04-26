/**
 * State Serialization / Deserialization
 *
 * Converts between the live reactive TableState (Signals, Maps, Dates)
 * and the JSON-serializable SessionSnapshot for persistence.
 */

import type { AnnotationStore } from '../annotations/AnnotationStore';
import { normalizeColumnHeaderTooltip } from '../core/columnHeaderTooltip';
import { batch } from '../core/Signal';
import type { TableState, HiddenColumnInfo } from '../core/State';
import type { ColumnHeaderTooltipContent } from '../core/types';
import type { UndoManager, StateSnapshot } from '../core/UndoManager';
import type { VectorColumnDef } from '../derived/types';
import type { FilterPresetManager } from '../filters/FilterPresets';
import type { Filter } from '../filters/FilterTypes';
import { serializeFilter, deserializeFilter } from './SessionStore';
import type { SessionSnapshot, SerializedStateSnapshot, VectorValuePoolEntry } from './types';
import { SNAPSHOT_VERSION, isPooledVectorRef } from './types';

// ── StateSnapshot serialization (undo/redo stacks) ────────────────────

/** Convert a runtime StateSnapshot to a JSON-safe SerializedStateSnapshot. */
export function serializeStateSnapshot(snap: StateSnapshot): SerializedStateSnapshot {
  return {
    filters: snap.filters.map(serializeFilter),
    sortColumns: snap.sortColumns.map((s) => ({ ...s })),
    visibleColumns: [...snap.visibleColumns],
    columnOrder: [...snap.columnOrder],
    columnWidths: Object.fromEntries(snap.columnWidths),
    pinnedColumns: [...snap.pinnedColumns],
    hiddenColumnInfo: Object.fromEntries(
      Array.from(snap.hiddenColumnInfo.entries()).map(([k, v]) => [k, { ...v }]),
    ),
    // Deep copy for IndexedDB independence (vector values need their own array).
    // Array.from works on both plain arrays and TypedArrays.
    derivedColumns: snap.derivedColumns.map((d) => {
      if (d.kind === 'expression') return { ...d };
      return {
        ...d,
        values: Array.from(d.values as ArrayLike<unknown>),
      } as typeof d;
    }),
  };
}

/**
 * Convert a SerializedStateSnapshot back to a runtime StateSnapshot.
 *
 * Validates all fields against validColumns — stale column references
 * are silently dropped, matching restoreStateFromSnapshot behavior.
 * Derived column names from the entry itself are added to the valid set
 * so that references to derived columns aren't stripped as stale.
 */
export function deserializeStateSnapshot(
  s: SerializedStateSnapshot,
  validColumns: Set<string>,
  hydratedPool?: Map<string, unknown[]>,
): StateSnapshot {
  // Expand valid set with derived column names from this snapshot entry
  const effectiveValid = new Set(validColumns);
  if (s.derivedColumns) {
    for (const d of s.derivedColumns) effectiveValid.add(d.name);
  }

  const filters = s.filters
    .map(deserializeFilter)
    .filter(
      (f): f is Filter => f !== null && (f.type === 'raw-sql' || effectiveValid.has(f.column)),
    );

  const sortColumns = s.sortColumns.filter((sc) => effectiveValid.has(sc.column));

  let visibleColumns = s.visibleColumns.filter((c) => effectiveValid.has(c));
  if (visibleColumns.length === 0) {
    visibleColumns = [...effectiveValid];
  }

  const columnOrder = s.columnOrder.filter((c) => effectiveValid.has(c));

  const columnWidths = new Map<string, number>();
  for (const [col, width] of Object.entries(s.columnWidths)) {
    if (effectiveValid.has(col)) columnWidths.set(col, width);
  }

  const pinnedColumns = s.pinnedColumns.filter((c) => effectiveValid.has(c));

  const hiddenColumnInfo = new Map<string, HiddenColumnInfo>();
  for (const [col, info] of Object.entries(s.hiddenColumnInfo)) {
    if (effectiveValid.has(col)) {
      hiddenColumnInfo.set(col, {
        column: info.column,
        leftNeighbor:
          info.leftNeighbor && effectiveValid.has(info.leftNeighbor) ? info.leftNeighbor : null,
        rightNeighbor:
          info.rightNeighbor && effectiveValid.has(info.rightNeighbor) ? info.rightNeighbor : null,
      });
    }
  }

  // Restore derived columns — resolve pool references (v4+) or deep-copy inline values (pre-v4)
  const derivedColumns = s.derivedColumns
    ? s.derivedColumns.map((d) => {
        if (d.kind === 'expression') return { ...d };
        if (isPooledVectorRef(d)) {
          // Pool reference: share the hydrated array (safe — vector values are never mutated in place)
          const values = hydratedPool?.get(d._poolRef);
          if (!values)
            return {
              kind: 'vector' as const,
              name: d.name,
              vectorType: d.vectorType,
              values: [] as unknown[],
            } as VectorColumnDef;
          return {
            kind: 'vector' as const,
            name: d.name,
            vectorType: d.vectorType,
            values,
          } as VectorColumnDef;
        }
        // Inline values (pre-v4 backward compat): deep copy for IndexedDB independence
        return {
          ...d,
          values: Array.from(d.values as ArrayLike<unknown>),
        } as typeof d;
      })
    : [];

  return {
    filters,
    sortColumns,
    visibleColumns,
    columnOrder,
    columnWidths,
    pinnedColumns,
    hiddenColumnInfo,
    derivedColumns,
  };
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
export function snapshotFromState(
  state: TableState,
  undoManager?: UndoManager,
  presetManager?: FilterPresetManager,
  annotationStore?: AnnotationStore,
): SessionSnapshot {
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
    derivedColumns: state.derivedColumns.get().map((d) => {
      if (d.kind === 'expression') return { ...d };
      return { ...d, values: Array.from(d.values as ArrayLike<unknown>) } as typeof d;
    }),
  };

  if (undoManager) {
    const { undoStack, redoStack } = undoManager.getStacks();

    // Build a vector value pool to deduplicate vector column values across
    // stack entries. captureSnapshot() shares array references for unchanged
    // vector columns, so reference identity detects duplicates efficiently.
    const seenArrays = new Map<ArrayLike<unknown>, string>();
    const pool: Record<string, VectorValuePoolEntry> = {};

    const serializeWithPool = (snap: StateSnapshot): SerializedStateSnapshot => ({
      filters: snap.filters.map(serializeFilter),
      sortColumns: snap.sortColumns.map((s) => ({ ...s })),
      visibleColumns: [...snap.visibleColumns],
      columnOrder: [...snap.columnOrder],
      columnWidths: Object.fromEntries(snap.columnWidths),
      pinnedColumns: [...snap.pinnedColumns],
      hiddenColumnInfo: Object.fromEntries(
        Array.from(snap.hiddenColumnInfo.entries()).map(([k, v]) => [k, { ...v }]),
      ),
      derivedColumns: snap.derivedColumns.map((d) => {
        if (d.kind === 'expression') return { ...d };
        const vec = d;
        const valuesRef = vec.values as ArrayLike<unknown>;
        const existingKey = seenArrays.get(valuesRef);
        if (existingKey) {
          return {
            kind: 'vector' as const,
            name: vec.name,
            vectorType: vec.vectorType,
            _poolRef: existingKey,
          };
        }
        const key = `vp_${Object.keys(pool).length}`;
        pool[key] = { vectorType: vec.vectorType, values: Array.from(valuesRef) };
        seenArrays.set(valuesRef, key);
        return {
          kind: 'vector' as const,
          name: vec.name,
          vectorType: vec.vectorType,
          _poolRef: key,
        };
      }),
    });

    snapshot.undoStack = undoStack.map(serializeWithPool);
    snapshot.redoStack = redoStack.map(serializeWithPool);
    if (Object.keys(pool).length > 0) {
      snapshot.vectorValuePool = pool;
    }
  }

  if (presetManager) {
    const presets = presetManager.getPresets();
    if (presets.length > 0) {
      snapshot.filterPresets = presets;
    }
  }

  if (annotationStore && annotationStore.count() > 0) {
    snapshot.annotations = annotationStore.toJSON();
  }

  // Capture the severity filter only when the user has toggled at least one
  // severity off — the all-true default stays implicit so untouched snapshots
  // remain identical to pre-fix saves.
  if (annotationStore) {
    const filter = annotationStore.getSeverityFilter();
    if (!filter.error || !filter.warning || !filter.info) {
      snapshot.annotationSeverityFilter = filter;
    }
  }

  const tooltips = state.columnHeaderTooltips.get();
  if (tooltips.size > 0) {
    snapshot.columnHeaderTooltips = Object.fromEntries(tooltips);
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
  presetManager?: FilterPresetManager,
  annotationStore?: AnnotationStore,
): void {
  const schemaColumns = state.schema.get();
  if (schemaColumns.length === 0) return;

  const validColumns = new Set(schemaColumns.map((c) => c.name));

  // Expand valid set with derived column names from snapshot so their
  // references in filters, sorts, pins, etc. are not stripped as stale.
  // (Matches the logic in deserializeStateSnapshot for undo/redo entries.)
  if (snapshot.derivedColumns && snapshot.derivedColumns.length > 0) {
    for (const d of snapshot.derivedColumns) validColumns.add(d.name);
  }

  const allColumnNames = schemaColumns.map((c) => c.name);

  // Filters: deserialize and drop stale column references.
  // Raw SQL filters use synthetic column keys that aren't in the schema —
  // they must bypass column validation to survive session restore.
  const filters = snapshot.filters
    .map(deserializeFilter)
    .filter((f): f is Filter => f !== null && (f.type === 'raw-sql' || validColumns.has(f.column)));

  // Sort: drop stale column references
  const sortColumns = snapshot.sortColumns.filter((s) => validColumns.has(s.column));

  // Visible columns: filter to valid; fallback to all if empty
  let visibleColumns = snapshot.visibleColumns.filter((c) => validColumns.has(c));
  if (visibleColumns.length === 0) {
    visibleColumns = allColumnNames;
  }

  // Column order: filter to valid, then insert any schema columns that
  // weren't in the snapshot at their schema index (rather than always
  // appending to the end). This keeps system columns like __rowid__ —
  // which live at schema index 0 — at the leftmost position when a
  // pre-Phase-1 snapshot restores against a post-Phase-1 schema.
  const restoredOrder = snapshot.columnOrder.filter((c) => validColumns.has(c));
  const orderSet = new Set(restoredOrder);
  for (let i = 0; i < allColumnNames.length; i++) {
    const col = allColumnNames[i];
    if (orderSet.has(col)) continue;
    const insertAt = Math.min(i, restoredOrder.length);
    restoredOrder.splice(insertAt, 0, col);
    orderSet.add(col);
  }

  // Column widths: Record → Map, skip stale columns
  const columnWidths = new Map<string, number>();
  for (const [col, width] of Object.entries(snapshot.columnWidths)) {
    if (validColumns.has(col)) {
      columnWidths.set(col, width);
    }
  }

  // Column header tooltips: Record → Map. Each entry is normalized via the
  // shared helper so legacy string entries (in-flight Phase 5 IDB state) and
  // structured object entries deserialize through one code path. Malformed
  // fields drop; entries that normalize to null are omitted.
  const columnHeaderTooltips = new Map<string, ColumnHeaderTooltipContent>();
  if (snapshot.columnHeaderTooltips) {
    for (const [col, raw] of Object.entries(snapshot.columnHeaderTooltips)) {
      if (!validColumns.has(col)) continue;
      const normalized = normalizeColumnHeaderTooltip(raw);
      if (normalized !== null) columnHeaderTooltips.set(col, normalized);
    }
  }

  // Pinned columns: filter to valid
  const pinnedColumns = snapshot.pinnedColumns.filter((c) => validColumns.has(c));

  // Hidden column info: Record → Map, skip stale columns, nullify dangling neighbors
  const hiddenColumnInfo = new Map<string, HiddenColumnInfo>();
  for (const [col, info] of Object.entries(snapshot.hiddenColumnInfo)) {
    if (validColumns.has(col)) {
      hiddenColumnInfo.set(col, {
        column: info.column,
        leftNeighbor:
          info.leftNeighbor && validColumns.has(info.leftNeighbor) ? info.leftNeighbor : null,
        rightNeighbor:
          info.rightNeighbor && validColumns.has(info.rightNeighbor) ? info.rightNeighbor : null,
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
    state.columnHeaderTooltips.set(columnHeaderTooltips);
  });

  // Restore derivedColumns signal if present in snapshot.
  // NOTE: This only sets the signal. The caller (loadData) must recreate
  // the DuckDB VIEW and helper tables via DerivedColumnManager.restoreColumns().
  if (snapshot.derivedColumns && snapshot.derivedColumns.length > 0) {
    state.derivedColumns.set(
      snapshot.derivedColumns.map((d) => {
        if (d.kind === 'expression') return { ...d };
        return { ...d, values: Array.from(d.values as ArrayLike<unknown>) } as typeof d;
      }),
    );
  }

  // Restore undo/redo stacks if present
  if (undoManager && snapshot.undoStack) {
    // Pre-hydrate vector value pool: .slice() each entry once for IndexedDB
    // independence, then share the reference across all restored snapshots
    // (safe because vector values arrays are never mutated in place).
    let hydratedPool: Map<string, unknown[]> | undefined;
    if (snapshot.vectorValuePool) {
      hydratedPool = new Map();
      for (const [key, entry] of Object.entries(snapshot.vectorValuePool)) {
        hydratedPool.set(key, entry.values.slice());
      }
    }
    const deserialized = {
      undoStack: snapshot.undoStack.map((s) =>
        deserializeStateSnapshot(s, validColumns, hydratedPool),
      ),
      redoStack: (snapshot.redoStack ?? []).map((s) =>
        deserializeStateSnapshot(s, validColumns, hydratedPool),
      ),
    };
    undoManager.loadStacks(deserialized.undoStack, deserialized.redoStack);
  }

  // Restore filter presets if present
  if (presetManager && snapshot.filterPresets && snapshot.filterPresets.length > 0) {
    presetManager.loadPresets(snapshot.filterPresets);
  }

  // Restore annotations if present. A corrupt blob (e.g. from a manual edit
  // of IndexedDB) must not block session restore for the rest of the state —
  // match the "silently drop stale references" posture used above.
  if (annotationStore && snapshot.annotations) {
    try {
      annotationStore.loadJSON(snapshot.annotations, 'replace');
    } catch {
      // Leave the store empty on any parse/shape failure.
    }
  }

  // Restore severity filter after loadJSON so the renderer reapply triggered
  // by loadJSON sees the right filter on the first paint. Same silent-failure
  // posture: a malformed stored value must not block the rest of the restore.
  if (annotationStore && snapshot.annotationSeverityFilter) {
    try {
      annotationStore.setSeverityFilter(snapshot.annotationSeverityFilter);
    } catch {
      // Leave the filter at all-true on any failure.
    }
  }
}
