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
}

const DEFAULT_MAX_DEPTH = 50;

/**
 * Capture the current TableState as a StateSnapshot.
 *
 * Creates independent copies of all mutable values so the snapshot
 * is not affected by future state mutations.
 */
export function captureSnapshot(state: TableState): StateSnapshot {
  return {
    filters: state.filters.get().map(f => ({ ...f })),
    sortColumns: state.sortColumns.get().map(s => ({ ...s })),
    visibleColumns: [...state.visibleColumns.get()],
    columnOrder: [...state.columnOrder.get()],
    columnWidths: new Map(state.columnWidths.get()),
    pinnedColumns: [...state.pinnedColumns.get()],
    hiddenColumnInfo: new Map(
      Array.from(state.hiddenColumnInfo.get().entries()).map(
        ([k, v]) => [k, { ...v }] as [string, HiddenColumnInfo],
      ),
    ),
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
    state.filters.set(snapshot.filters.map(f => ({ ...f })));
    state.sortColumns.set(snapshot.sortColumns.map(s => ({ ...s })));
    state.visibleColumns.set([...snapshot.visibleColumns]);
    state.columnOrder.set([...snapshot.columnOrder]);
    state.columnWidths.set(new Map(snapshot.columnWidths));
    state.pinnedColumns.set([...snapshot.pinnedColumns]);
    state.hiddenColumnInfo.set(
      new Map(
        Array.from(snapshot.hiddenColumnInfo.entries()).map(
          ([k, v]) => [k, { ...v }] as [string, HiddenColumnInfo],
        ),
      ),
    );
  });
}

/**
 * Manages undo/redo history as two stacks of StateSnapshot objects.
 *
 * The UndoManager is decoupled from TableState — callers capture the
 * current state before mutations (via captureSnapshot) and pass it to
 * push(). On undo/redo, the returned snapshot is applied externally
 * (via applySnapshot).
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

  private updateSignals(): void {
    this.canUndoSignal.set(this.undoStack.length > 0);
    this.canRedoSignal.set(this.redoStack.length > 0);
  }
}
