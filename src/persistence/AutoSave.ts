/**
 * Auto-Save
 *
 * Subscribes to all persistent state signals and debounces writes
 * to a SessionStore, preventing rapid saves during drag operations.
 *
 * When an UndoManager is provided, its undo/redo stacks are serialized
 * and persisted alongside the table state so they survive browser refreshes.
 */

import type { TableState } from '../core/State';
import type { UndoManager } from '../core/UndoManager';
import type { SessionStore } from './SessionStore';
import { snapshotFromState } from './serialization';

const DEFAULT_DEBOUNCE_MS = 1000;

export interface AutoSaveOptions {
  debounceMs?: number;
  undoManager?: UndoManager;
}

export class AutoSave {
  private unsubscribes: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private debounceMs: number;
  private undoManager: UndoManager | undefined;

  constructor(
    private state: TableState,
    private store: SessionStore,
    options: AutoSaveOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.undoManager = options.undoManager;
  }

  /** Subscribe to all persistent state signals and begin auto-saving. */
  enable(): void {
    if (this.destroyed) return;
    // Prevent duplicate subscriptions
    this.disable();

    const signals = [
      this.state.filters,
      this.state.sortColumns,
      this.state.visibleColumns,
      this.state.columnOrder,
      this.state.columnWidths,
      this.state.pinnedColumns,
      this.state.hiddenColumnInfo,
    ];

    for (const signal of signals) {
      this.unsubscribes.push(signal.subscribe(() => this.scheduleSave()));
    }

    // Subscribe to undo/redo stack changes so stacks are saved even when
    // an undo/redo happens to produce the same state (equality guards skip
    // signal notifications, but the stacks themselves have changed).
    if (this.undoManager) {
      this.unsubscribes.push(
        this.undoManager.canUndoSignal.subscribe(() => this.scheduleSave()),
      );
      this.unsubscribes.push(
        this.undoManager.canRedoSignal.subscribe(() => this.scheduleSave()),
      );
    }
  }

  /** Unsubscribe from all signals and cancel any pending save. */
  disable(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
    this.clearTimer();
  }

  /** Permanently disable auto-save and clean up. */
  destroy(): void {
    this.disable();
    this.destroyed = true;
  }

  private scheduleSave(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.save();
    }, this.debounceMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private save(): void {
    if (this.destroyed) return;
    if (this.state.tableName.get() == null) return;

    const snapshot = snapshotFromState(this.state, this.undoManager);
    this.store.save(snapshot);
  }
}
