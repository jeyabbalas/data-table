/**
 * Auto-Save
 *
 * Subscribes to all persistent state signals and debounces writes
 * to a SessionStore, preventing rapid saves during drag operations.
 */

import type { TableState } from '../core/State';
import type { SessionStore } from './SessionStore';
import { snapshotFromState } from './serialization';

const DEFAULT_DEBOUNCE_MS = 1000;

export class AutoSave {
  private unsubscribes: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private state: TableState,
    private store: SessionStore,
    private debounceMs: number = DEFAULT_DEBOUNCE_MS,
  ) {}

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

    const snapshot = snapshotFromState(this.state);
    this.store.save(snapshot);
  }
}
