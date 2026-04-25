/**
 * Auto-Save
 *
 * Subscribes to all persistent state signals and debounces writes
 * to a SessionStore, preventing rapid saves during drag operations.
 *
 * When an UndoManager is provided, its undo/redo stacks are serialized
 * and persisted alongside the table state so they survive browser refreshes.
 *
 * @example
 * import { AutoSave, SessionStore } from '@jeyabbalas/data-table';
 *
 * const store = new SessionStore();
 * await store.open();
 *
 * const save = new AutoSave(state, store, {
 *   debounceMs: 500,
 *   onError: (err) => console.warn('save failed', err.code, err.message),
 * });
 * // later:
 * save.destroy();
 */

import type { TableState } from '../core/State';
import type { UndoManager } from '../core/UndoManager';
import type { FilterPresetManager } from '../filters/FilterPresets';
import type { AnnotationStore } from '../annotations/AnnotationStore';
import type { SessionStore } from './SessionStore';
import { snapshotFromState } from './serialization';
import { PersistenceError } from '../core/errors';

const DEFAULT_DEBOUNCE_MS = 1000;

export interface AutoSaveOptions {
  debounceMs?: number;
  undoManager?: UndoManager;
  presetManager?: FilterPresetManager;
  annotationStore?: AnnotationStore;
  /**
   * Invoked when a snapshot save fails (e.g., IndexedDB quota exceeded,
   * transaction aborted). If omitted, save failures are swallowed —
   * the facade wires this to emit an `error` event with `source: 'persistence'`.
   */
  onError?: (error: PersistenceError) => void;
}

export class AutoSave {
  private unsubscribes: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private debounceMs: number;
  private undoManager: UndoManager | undefined;
  private presetManager: FilterPresetManager | undefined;
  private annotationStore: AnnotationStore | undefined;
  private boundOnVisibilityChange: (() => void) | null = null;
  private boundOnBeforeUnload: (() => void) | null = null;
  private onError: ((error: PersistenceError) => void) | undefined;

  constructor(
    private state: TableState,
    private store: SessionStore,
    options: AutoSaveOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.undoManager = options.undoManager;
    this.presetManager = options.presetManager;
    this.annotationStore = options.annotationStore;
    this.onError = options.onError;
  }

  /** Subscribe to all persistent state signals and begin auto-saving. */
  enable(): void {
    if (this.destroyed) return;
    // Idempotent: repeated enable() calls without an intervening disable()
    // are a no-op. A prior disable() + re-enable() could race on in-flight
    // signal notifications; leaving existing subscriptions in place avoids
    // that window.
    if (this.unsubscribes.length > 0) return;

    const signals = [
      this.state.filters,
      this.state.sortColumns,
      this.state.visibleColumns,
      this.state.columnOrder,
      this.state.columnWidths,
      this.state.pinnedColumns,
      this.state.hiddenColumnInfo,
      this.state.derivedColumns,
      this.state.columnHeaderTooltips,
    ];

    for (const signal of signals) {
      this.unsubscribes.push(signal.subscribe(() => this.scheduleSave()));
    }

    // Subscribe to preset changes
    if (this.presetManager) {
      this.unsubscribes.push(
        this.presetManager.presets.subscribe(() => this.scheduleSave()),
      );
    }

    // Subscribe to annotation-store changes. The store's `on('change', …)`
    // API returns a plain unsubscribe function matching our signal contract.
    if (this.annotationStore) {
      this.unsubscribes.push(
        this.annotationStore.on('change', () => this.scheduleSave()),
      );
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

    // If the undo/redo stacks already have entries (e.g., restored from a
    // previous session), schedule an immediate save so the stacks are
    // re-persisted even if the user refreshes without making any new changes.
    if (this.undoManager && (this.undoManager.canUndo || this.undoManager.canRedo)) {
      this.scheduleSave();
    }

    // Flush pending saves on page hide / unload so refreshes don't lose state.
    // The IDB transaction is enqueued synchronously inside saveSync(); browsers
    // preserve in-flight IDB transactions across lifecycle events.
    this.boundOnVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this.flushPendingSave();
      }
    };
    this.boundOnBeforeUnload = () => this.flushPendingSave();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundOnVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.boundOnBeforeUnload);
    }
  }

  /** Unsubscribe from all signals and flush any pending save. */
  disable(): void {
    // Flush any pending debounced save before tearing down. Without this,
    // a beforeunload handler that triggers destroy() (and therefore
    // disable()) ahead of AutoSave's own flushPendingSave handler would
    // silently drop in-flight state. That happens whenever a consumer
    // registers `window.addEventListener('beforeunload', …)` synchronously
    // at module load — its handler runs before createDataTable's async
    // init reaches enable() and wires up AutoSave's own flush.
    // Safe in every call site: loadData calls disable() before resetTableState
    // so the flush captures fully-settled pre-load state; clearSession's
    // subsequent IDB delete runs after this sync put (same-store
    // transactions serialise) so the net result is still deleted.
    this.flushPendingSave();

    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
    this.clearTimer();

    if (this.boundOnVisibilityChange && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundOnVisibilityChange);
    }
    if (this.boundOnBeforeUnload && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.boundOnBeforeUnload);
    }
    this.boundOnVisibilityChange = null;
    this.boundOnBeforeUnload = null;
  }

  /**
   * If a debounced save is pending, execute it immediately and synchronously.
   * Uses SessionStore.saveSync() to enqueue the IDB write without yielding
   * to the microtask queue — critical during beforeunload/visibilitychange
   * where an async await may be skipped by the browser during page teardown.
   */
  flushPendingSave(): void {
    if (this.timer !== null) {
      this.clearTimer();
      this.saveSync();
    }
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

    const snapshot = snapshotFromState(this.state, this.undoManager, this.presetManager, this.annotationStore);
    try {
      const result = this.store.save(snapshot) as unknown as Promise<void> | void;
      if (result && typeof (result as Promise<void>).then === 'function') {
        (result as Promise<void>).catch((cause) => {
          this.reportError(cause);
        });
      }
    } catch (cause) {
      this.reportError(cause);
    }
  }

  /**
   * Synchronous save for page lifecycle handlers.
   * Uses SessionStore.saveSync() to avoid async yield during page teardown.
   */
  private saveSync(): void {
    if (this.destroyed) return;
    if (this.state.tableName.get() == null) return;

    const snapshot = snapshotFromState(this.state, this.undoManager, this.presetManager, this.annotationStore);
    try {
      this.store.saveSync(snapshot);
    } catch (cause) {
      this.reportError(cause);
    }
  }

  private reportError(cause: unknown): void {
    if (!this.onError) return;
    const err =
      cause instanceof PersistenceError
        ? cause
        : new PersistenceError(
            cause instanceof Error ? cause.message : String(cause),
            { code: 'SAVE_FAILED', cause },
          );
    this.onError(err);
  }
}
