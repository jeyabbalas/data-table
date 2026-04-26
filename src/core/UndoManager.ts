/**
 * Undo/Redo State History Stack
 *
 * Manages a history of StateSnapshot objects for undo/redo support.
 * The UndoManager is a pure data structure — it does not read or write
 * TableState signals. Callers capture snapshots and apply them externally.
 *
 * Two helper functions bridge between TableState and StateSnapshot:
 * - captureSnapshot(state) — reads signals into a snapshot
 * - applySnapshot(state, snapshot) — writes a snapshot back to signals
 */

import type { DerivedColumnDef, ExpressionColumnDef, VectorColumnDef } from '../derived/types';
import { createSignal, batch, type Signal } from './Signal';
import type { TableState, HiddenColumnInfo } from './State';
import type { Filter, SortColumn } from './types';

/**
 * A lightweight snapshot of user-manipulable table view state.
 *
 * Unlike SessionSnapshot (used for persistence), StateSnapshot stores
 * values in their native signal formats (Filter[] not SerializedFilter[],
 * Map not Record) and omits metadata (version, timestamp, tableName,
 * derivedColumns). Snapshots are cheap — just reading and copying
 * signal values.
 */
export interface StateSnapshot {
  filters: Filter[];
  sortColumns: SortColumn[];
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Map<string, number>;
  pinnedColumns: string[];
  hiddenColumnInfo: Map<string, HiddenColumnInfo>;
  derivedColumns: DerivedColumnDef[];
}

const DEFAULT_MAX_DEPTH = 50;

// ── Structural equality helpers (module-private) ─────────────────────

function valueEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sortColumnsEqual(a: SortColumn[], b: SortColumn[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].column !== b[i].column || a[i].direction !== b[i].direction) return false;
  }
  return true;
}

function filterEqual(a: Filter, b: Filter): boolean {
  if (a.type !== b.type || a.column !== b.column) return false;
  switch (a.type) {
    case 'range': {
      const br = b as typeof a;
      return (
        valueEqual(a.min, br.min) &&
        valueEqual(a.max, br.max) &&
        (a.maxInclusive ?? false) === (br.maxInclusive ?? false) &&
        (a.minExclusive ?? false) === (br.minExclusive ?? false)
      );
    }
    case 'point':
      return valueEqual(a.value, (b as typeof a).value);
    case 'set':
    case 'not-set': {
      const bs = b as typeof a;
      if ((a.includeNull ?? false) !== (bs.includeNull ?? false)) return false;
      if (a.values.length !== bs.values.length) return false;
      for (let i = 0; i < a.values.length; i++) {
        if (!valueEqual(a.values[i], bs.values[i])) return false;
      }
      return true;
    }
    case 'null':
    case 'not-null':
      return true;
    case 'pattern': {
      const bp = b as typeof a;
      return a.pattern === bp.pattern && a.mode === bp.mode;
    }
    case 'raw-sql': {
      const br = b as typeof a;
      return a.sql === br.sql && a.id === br.id && (a.label ?? '') === (br.label ?? '');
    }
    default:
      return false;
  }
}

function filtersEqual(a: Filter[], b: Filter[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!filterEqual(a[i], b[i])) return false;
  }
  return true;
}

function numberMapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, val] of a) {
    if (b.get(key) !== val) return false;
  }
  return true;
}

function hiddenInfoMapsEqual(
  a: Map<string, HiddenColumnInfo>,
  b: Map<string, HiddenColumnInfo>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, infoA] of a) {
    const infoB = b.get(key);
    if (!infoB) return false;
    if (
      infoA.column !== infoB.column ||
      infoA.leftNeighbor !== infoB.leftNeighbor ||
      infoA.rightNeighbor !== infoB.rightNeighbor
    )
      return false;
  }
  return true;
}

// ── Derived column equality (exported for Actions.ts) ───────────────

/**
 * Shallow equality check for derived column lists.
 * Compares by name, kind, expression (for expression cols), and
 * values.length (for vector cols). Does not deep-compare vector values
 * since the full reconciliation handles that.
 */
export function derivedColumnsEqual(a: DerivedColumnDef[], b: DerivedColumnDef[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].kind !== b[i].kind) return false;
    if (a[i].kind === 'expression' && b[i].kind === 'expression') {
      if ((a[i] as ExpressionColumnDef).expression !== (b[i] as ExpressionColumnDef).expression)
        return false;
    }
    if (a[i].kind === 'vector' && b[i].kind === 'vector') {
      const av = a[i] as VectorColumnDef;
      const bv = b[i] as VectorColumnDef;
      if (av.vectorType !== bv.vectorType) return false;
      if (av.values === bv.values) continue; // reference fast-path (common after captureSnapshot)
      if (av.values.length !== bv.values.length) return false;
      for (let j = 0; j < av.values.length; j++) {
        if (av.values[j] !== bv.values[j]) return false;
      }
    }
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────

/**
 * Capture the current TableState as a StateSnapshot.
 *
 * Creates independent copies of all mutable values so the snapshot
 * is not affected by future state mutations.
 */
export function captureSnapshot(state: TableState): StateSnapshot {
  return {
    filters: state.filters.get().map((f) => ({ ...f })),
    sortColumns: state.sortColumns.get().map((s) => ({ ...s })),
    visibleColumns: [...state.visibleColumns.get()],
    columnOrder: [...state.columnOrder.get()],
    columnWidths: new Map(state.columnWidths.get()),
    pinnedColumns: [...state.pinnedColumns.get()],
    hiddenColumnInfo: new Map(
      Array.from(state.hiddenColumnInfo.get().entries()).map(
        ([k, v]) => [k, { ...v }] as [string, HiddenColumnInfo],
      ),
    ),
    // Shallow-copy defs. Vector values arrays are never mutated in place
    // (signal is always set to a new array), so reference sharing is safe.
    derivedColumns: state.derivedColumns.get().map((d) => {
      if (d.kind === 'expression') return { ...d };
      return { ...d };
    }),
  };
}

/**
 * Apply a StateSnapshot to a TableState.
 *
 * Sets all undoable signals from the snapshot values. Does not perform
 * schema validation (undo/redo operates within a single session where
 * the schema is stable). Uses batch() to minimize notification churn.
 */
export function applySnapshot(state: TableState, snapshot: StateSnapshot): void {
  batch(() => {
    if (!filtersEqual(state.filters.get(), snapshot.filters)) {
      state.filters.set(snapshot.filters.map((f) => ({ ...f })));
    }
    if (!sortColumnsEqual(state.sortColumns.get(), snapshot.sortColumns)) {
      state.sortColumns.set(snapshot.sortColumns.map((s) => ({ ...s })));
    }
    if (!stringArraysEqual(state.visibleColumns.get(), snapshot.visibleColumns)) {
      state.visibleColumns.set([...snapshot.visibleColumns]);
    }
    if (!stringArraysEqual(state.columnOrder.get(), snapshot.columnOrder)) {
      state.columnOrder.set([...snapshot.columnOrder]);
    }
    if (!numberMapsEqual(state.columnWidths.get(), snapshot.columnWidths)) {
      state.columnWidths.set(new Map(snapshot.columnWidths));
    }
    if (!stringArraysEqual(state.pinnedColumns.get(), snapshot.pinnedColumns)) {
      state.pinnedColumns.set([...snapshot.pinnedColumns]);
    }
    if (!hiddenInfoMapsEqual(state.hiddenColumnInfo.get(), snapshot.hiddenColumnInfo)) {
      state.hiddenColumnInfo.set(
        new Map(
          Array.from(snapshot.hiddenColumnInfo.entries()).map(
            ([k, v]) => [k, { ...v }] as [string, HiddenColumnInfo],
          ),
        ),
      );
    }
  });
}

/**
 * Manages undo/redo history as two stacks of StateSnapshot objects.
 *
 * The UndoManager is decoupled from TableState — callers capture the
 * current state before mutations (via captureSnapshot) and pass it to
 * push(). On undo/redo, the returned snapshot is applied externally
 * (via applySnapshot).
 *
 * @example
 * import { UndoManager, captureSnapshot, applySnapshot } from '@jeyabbalas/data-table/advanced';
 *
 * const mgr = new UndoManager(50);
 * // Before mutating state (e.g., in custom UI):
 * mgr.push(captureSnapshot(table.state));
 * // ...mutate state...
 * // Later:
 * const previous = mgr.undo(captureSnapshot(table.state));
 * if (previous) applySnapshot(table.state, previous);
 */
export class UndoManager {
  private undoStack: StateSnapshot[] = [];
  private redoStack: StateSnapshot[] = [];
  private maxDepth: number;

  /** Reactive signal: true when undo is available */
  readonly canUndoSignal: Signal<boolean>;
  /** Reactive signal: true when redo is available */
  readonly canRedoSignal: Signal<boolean>;

  constructor(maxDepth: number = DEFAULT_MAX_DEPTH) {
    this.maxDepth = maxDepth;
    this.canUndoSignal = createSignal(false);
    this.canRedoSignal = createSignal(false);
  }

  /** Whether the undo stack has entries */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether the redo stack has entries */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Current depth of the undo stack */
  get undoDepth(): number {
    return this.undoStack.length;
  }

  /** Current depth of the redo stack */
  get redoDepth(): number {
    return this.redoStack.length;
  }

  /**
   * Push a snapshot onto the undo stack (state BEFORE a mutation).
   * Clears the redo stack (new action invalidates redo history).
   * Enforces maxDepth by removing the oldest entry if needed.
   */
  push(snapshot: StateSnapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.updateSignals();
  }

  /**
   * Undo: pops from undo stack, pushes currentSnapshot to redo stack.
   * Returns the snapshot to restore, or null if nothing to undo.
   */
  undo(currentSnapshot: StateSnapshot): StateSnapshot | null {
    if (this.undoStack.length === 0) return null;
    const snapshot = this.undoStack.pop()!;
    this.redoStack.push(currentSnapshot);
    this.updateSignals();
    return snapshot;
  }

  /**
   * Redo: pops from redo stack, pushes currentSnapshot to undo stack.
   * Returns the snapshot to restore, or null if nothing to redo.
   */
  redo(currentSnapshot: StateSnapshot): StateSnapshot | null {
    if (this.redoStack.length === 0) return null;
    const snapshot = this.redoStack.pop()!;
    this.undoStack.push(currentSnapshot);
    this.updateSignals();
    return snapshot;
  }

  /** Clear both stacks (e.g., when loading new data) */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.updateSignals();
  }

  /** Return shallow copies of both stacks (for serialization). */
  getStacks(): { undoStack: StateSnapshot[]; redoStack: StateSnapshot[] } {
    return {
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
    };
  }

  /** Replace both stacks with deserialized data. Enforces maxDepth. */
  loadStacks(undoStack: StateSnapshot[], redoStack: StateSnapshot[]): void {
    this.undoStack =
      undoStack.length > this.maxDepth
        ? undoStack.slice(undoStack.length - this.maxDepth)
        : [...undoStack];
    this.redoStack = [...redoStack];
    this.updateSignals();
  }

  private updateSignals(): void {
    this.canUndoSignal.set(this.undoStack.length > 0);
    this.canRedoSignal.set(this.redoStack.length > 0);
  }
}
