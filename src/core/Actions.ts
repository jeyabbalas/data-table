/**
 * State Actions
 *
 * Provides methods to manipulate TableState. This is the command/action layer
 * that encapsulates state mutations, making it easy for UI components and
 * external code to interact with the table state.
 */

import type { AnnotationStore } from '../annotations/AnnotationStore';
import { DataLoader, type DataLoaderOptions } from '../data/DataLoader';
import { attachCacheInvalidation } from '../data/QueryCache';
import type { WorkerBridge } from '../data/WorkerBridge';
import { DerivedColumnManager } from '../derived/DerivedColumnManager';
import type { DerivedColumnDef, DerivedColumnInfo, CompletionContext } from '../derived/types';
import { buildSelectedRowsQuery } from '../export/ExportQuery';
import type { FilterPresetManager } from '../filters/FilterPresets';
import { filtersToWhereClause, quoteIdentifier } from '../filters/FilterSQL';
import { restoreStateFromSnapshot } from '../persistence/serialization';
import type { SessionStore } from '../persistence/SessionStore';
import { normalizeColumnHeaderTooltip, tooltipContentEquals } from './columnHeaderTooltip';
import {
  ConfigurationError,
  DerivedColumnError,
  DestroyedError,
  QueryError,
  SQLValidationError,
} from './errors';
import { batch } from './Signal';
import type { TableState, HiddenColumnInfo } from './State';
import {
  resetTableState,
  initializeColumnsFromSchema,
  mergeMissingColumns,
  pinnedColumnsFirst,
} from './State';
import type {
  Filter,
  FilterType,
  RawSQLFilter,
  SortColumn,
  ColumnSchema,
  DataType,
  ColumnHeaderTooltipContent,
} from './types';
import { ROWID_COLUMN } from './types';
import { captureSnapshot, applySnapshot, derivedColumnsEqual, snapshotsEqual } from './UndoManager';
import type { StateSnapshot, UndoManager } from './UndoManager';

/** Shared empty "after" list for clearFilters' removal notification. */
const EMPTY_FILTERS: readonly Filter[] = [];

/** A derived-column change, undo, redo, reset or load in line; see `StateActions.inTurn`. */
interface Turn {
  /** It waited for the turn before it, and so counted for `isRelationChanging`. */
  waited: boolean;
  /** It ran a change through `changeRelation`, which reports its own settle. */
  changedRelation: boolean;
  ended: boolean;
}

/** Why a derived-column change asked for before a load or a clear did not apply. */
const SUPERSEDED = 'New data was loaded, or the table cleared, before the change was applied';

/**
 * The error of a replacement or removal asked for before a load or a clear:
 * the column it names is not among the derived columns that follow.
 */
function supersededError(column: string): DerivedColumnError {
  return new DerivedColumnError(SUPERSEDED, { code: 'NOT_FOUND', details: { column } });
}

/**
 * Options for {@link StateActions.getColumnValues}.
 */
export interface GetColumnValuesOptions {
  /**
   * Which rows to include:
   * - `'all'` (default) — every row in the effective table.
   * - `'filtered'` — only rows matching the currently active filters.
   * - `'selected'` — only rows in the current selection (positional indices
   *   resolved against the current filter/sort view, same semantics as the
   *   export "selected rows" scope).
   */
  scope?: 'all' | 'filtered' | 'selected';
  /** Optional cap on the number of returned values. Non-negative integer. */
  limit?: number;
  /** Optional offset applied after WHERE and ORDER BY. Non-negative integer. */
  offset?: number;
  /** Optional AbortSignal forwarded to the DuckDB worker. */
  signal?: AbortSignal;
}

/**
 * Options for loading data
 */
export interface LoadDataOptions extends DataLoaderOptions {
  /** If provided, restores saved session state after loading */
  sessionStore?: SessionStore | undefined;
  /** If provided, restores saved filter presets after loading */
  presetManager?: FilterPresetManager | undefined;
  /** If provided, restores saved annotations after loading */
  annotationStore?: AnnotationStore | undefined;
}

/**
 * StateActions class provides methods to manipulate TableState.
 *
 * Exposed on `table.actions` from `createDataTable()`. This is the write-path
 * counterpart to `table.state` (read signals). Every mutation (filter change,
 * sort, column visibility, derived column, etc.) flows through here so undo,
 * events, and persistence stay in sync.
 *
 * @example
 * const table = await createDataTable({ container, source });
 *
 * // Apply a range filter programmatically
 * table.actions.addFilter({
 *   type: 'range',
 *   column: 'age',
 *   min: 18,
 *   max: 65,
 *   maxInclusive: true,
 * });
 *
 * // Toggle sort on a column (none → asc → desc → none)
 * table.actions.toggleSort('price');
 *
 * // Add a derived column
 * await table.actions.addDerivedColumn({
 *   kind: 'expression',
 *   name: 'age_group',
 *   expression: `CASE WHEN age < 18 THEN 'minor' ELSE 'adult' END`,
 * });
 */
export class StateActions {
  private bridge: WorkerBridge;
  private loader: DataLoader;
  private lastSelectedIndex: number | null = null;
  private undoManager: UndoManager | undefined;
  private suppressUndoCapture = false;
  /** An undo or redo is waiting for its turn or running; another is dropped. */
  private undoRedoInProgress = false;
  private layoutGestureSnapshot: StateSnapshot | null = null;
  private layoutGestureActive = false;
  private onFilterRemoveCallback?: ((column: string) => void) | undefined;
  private onDerivedChangeCallback?:
    | ((payload: {
        derivedColumns: DerivedColumnDef[];
        kind: 'added' | 'removed' | 'updated' | 'replaced';
        columnName?: string | undefined;
      }) => void)
    | undefined;
  private initialSnapshot: StateSnapshot | null = null;
  private derivedManager: DerivedColumnManager | null = null;
  /** Derived-column changes awaiting DuckDB; see {@link changeRelation}. */
  private relationChanges = 0;
  /** Those of them that can leave the relation unreadable meanwhile: all but adds. */
  private unreadableRelationChanges = 0;
  private onRelationSettledCallback?: (() => void) | undefined;
  /** Callers of {@link whenRelationReadable} waiting on the changes in flight. */
  private readableWaiters: (() => void)[] = [];
  /** Turns requested and not yet ended, the running one included; see {@link inTurn}. */
  private openTurns = 0;
  /** Turns requested and not yet started. */
  private waitingTurns = 0;
  /** The last turn requested, settled either way: the next one starts after it. */
  private lastTurn: Promise<unknown> = Promise.resolve();
  /** The turn running now. Turns run one at a time. */
  private currentTurn: Turn | null = null;
  /** Counts loads and clears; a change asked for before the latest does not apply. */
  private loadEpoch = 0;
  /**
   * Loads asked for and not yet ended. An undo, redo or reset asked for
   * meanwhile is refused: it would act on the stacks and the initial state
   * the load is about to replace, or restore from a saved session.
   */
  private openLoads = 0;
  private destroyed = false;

  constructor(
    private state: TableState,
    bridge: WorkerBridge,
    undoManager?: UndoManager,
  ) {
    this.bridge = bridge;
    this.loader = new DataLoader(bridge);
    this.undoManager = undoManager;
    attachCacheInvalidation(bridge, state);
  }

  // =========================================
  // Lifecycle
  // =========================================

  /**
   * Mark this action layer as destroyed. After this call every public mutator
   * throws `DestroyedError`; result-shaped async methods
   * (add/update/replaceDerivedColumn) return `{ success: false, error: ... }`
   * with a "destroyed" message; pure getters keep working so consumers can
   * still read the last-known state during teardown. Idempotent.
   *
   * Wired by the `DataTable` facade as the very first step of `destroy()` so
   * that any in-flight async action resolving after destroy sees the flag and
   * drops its post-await state mutation.
   *
   * @internal
   */
  markDestroyed(): void {
    this.destroyed = true;
  }

  /**
   * @internal
   * For tests only — observe destroyed state.
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  private throwIfDestroyed(method: string): void {
    if (this.destroyed) {
      throw new DestroyedError(`DataTable is destroyed; cannot call actions.${method}().`);
    }
  }

  /**
   * Whether a derived-column change is waiting on DuckDB, an add included, or
   * waiting for its turn behind another (see {@link inTurn}). Charts and stats
   * panels are built only when none is: one built meanwhile would be built
   * again for the relation the changes leave. Whether reads of the relation
   * `state.tableName` names can fail meanwhile is {@link isRelationReadable}.
   *
   * @internal
   */
  isRelationChanging(): boolean {
    return this.relationChanges > 0 || this.waitingTurns > 0;
  }

  /**
   * Set a callback invoked when {@link isRelationChanging} stops holding,
   * whether the last change succeeded or failed. That is when the DuckDB work
   * of the last change in line settles, before the state update that follows
   * a successful change; or, for a last change that waited for its turn and
   * then touched nothing in DuckDB (an undo of a filter, an add refused for
   * its name), when it ends. Not between two changes in line.
   *
   * @internal
   */
  setOnRelationSettled(callback: () => void): void {
    this.throwIfDestroyed('setOnRelationSettled');
    this.onRelationSettledCallback = callback;
  }

  /**
   * Whether the relation `state.tableName` names can be read as `state.schema`
   * describes it. Not while a derived-column change that can drop or rebuild
   * what those reads select from is waiting on DuckDB: a removal, an edit or
   * a replacement, an undo or redo, a reset, a restore. An add can not, and
   * the relation stays readable while one runs. Nor does a change waiting for
   * its turn: the relation in force can be read until its DuckDB work starts.
   *
   * @internal
   */
  isRelationReadable(): boolean {
    return this.unreadableRelationChanges === 0;
  }

  /**
   * Resolves once {@link isRelationReadable} holds, at once when it does. Like
   * the callback of {@link setOnRelationSettled}, it settles before the state
   * update that follows a successful change: a caller that reads the state
   * waits a task more.
   *
   * @internal
   */
  whenRelationReadable(): Promise<void> {
    if (this.unreadableRelationChanges === 0) return Promise.resolve();
    return new Promise((resolve) => this.readableWaiters.push(resolve));
  }

  /**
   * Run a DuckDB change to the derived-column relation, counted for
   * {@link isRelationChanging} and, unless the relation `state.tableName`
   * names stays readable throughout, for {@link isRelationReadable}. Called
   * only in a turn (see {@link inTurn}), so one runs at a time.
   */
  private async changeRelation<T>(
    change: () => Promise<T>,
    { staysReadable = false }: { staysReadable?: boolean } = {},
  ): Promise<T> {
    if (this.currentTurn) this.currentTurn.changedRelation = true;
    this.relationChanges++;
    if (!staysReadable) this.unreadableRelationChanges++;
    try {
      return await change();
    } finally {
      this.relationChanges--;
      if (!staysReadable) this.unreadableRelationChanges--;
      try {
        this.notifyIfRelationSettled();
      } finally {
        if (this.unreadableRelationChanges === 0) {
          for (const resolve of this.readableWaiters.splice(0)) resolve();
        }
      }
    }
  }

  private notifyIfRelationSettled(): void {
    if (!this.isRelationChanging()) this.onRelationSettledCallback?.();
  }

  /**
   * Run `change` in its turn: once every derived-column change, undo, redo,
   * reset and load asked for before it has ended. They run one at a time, in
   * call order, and each reads and validates the state in its own turn, after
   * the one before has written its changes. With no turn open, `change`
   * starts at once, synchronously.
   *
   * Two changes running together would share the manager's list of columns
   * and the VIEW: a removal landing while an add was at its last `INSERT`
   * settled with `tableName` naming a VIEW the add had yet to create, and a
   * change wrote `schema` from a copy read before another landed.
   *
   * A turn asked for while another is open counts for
   * {@link isRelationChanging} while it waits, and not for
   * {@link isRelationReadable} until its own DuckDB work starts.
   *
   * `change` must never ask for a turn and wait for it: that turn would wait
   * for this one to end.
   */
  private inTurn<T>(change: (turn: Turn) => Promise<T>): Promise<T> {
    const waits = this.openTurns > 0;
    this.openTurns++;
    let run: Promise<T>;
    if (waits) {
      this.waitingTurns++;
      run = this.lastTurn.then(() => {
        this.waitingTurns--;
        return this.runTurn(change, true);
      });
    } else {
      run = this.runTurn(change, false);
    }
    this.lastTurn = run.catch(() => undefined);
    return run;
  }

  private async runTurn<T>(change: (turn: Turn) => Promise<T>, waited: boolean): Promise<T> {
    const turn: Turn = { waited, changedRelation: false, ended: false };
    this.currentTurn = turn;
    try {
      return await change(turn);
    } finally {
      this.endTurn(turn);
    }
  }

  /**
   * End a turn, once: the next may start. Awaiting a change ends its turn a
   * microtask after it returns, so a change that can finish without awaiting
   * (an undo of a filter) ends its own as it returns: a call made right after
   * it then starts at once, as it did before changes took turns.
   */
  private endTurn(turn: Turn): void {
    if (turn.ended) return;
    turn.ended = true;
    if (this.currentTurn === turn) this.currentTurn = null;
    this.openTurns--;
    // A turn counted for isRelationChanging while it waited. One that then
    // touched nothing in DuckDB has no settle of its own to report that.
    if (turn.waited && !turn.changedRelation) this.notifyIfRelationSettled();
  }

  // =========================================
  // Undo/Redo
  // =========================================

  /**
   * Capture state snapshot before a mutation, if undo is enabled.
   *
   * `layoutGestureActive` is checked separately from `suppressUndoCapture`
   * rather than folded into it: `toggleColumnPin` clears `suppressUndoCapture`
   * in a `finally`, which would clobber a column-layout gesture that happened
   * to be open around it.
   */
  private captureForUndo(): void {
    if (!this.undoManager || this.suppressUndoCapture || this.layoutGestureActive) return;
    this.undoManager.push(captureSnapshot(this.state));
  }

  /**
   * Set a callback invoked once for each column that loses its filter.
   * Use this to clear state that tracks a filter but does not live in the
   * signals — a chart's brush or bar selection, most obviously.
   *
   * There is one slot, and a table made by `createDataTable` fills it to
   * clear its charts' brushes and selections. Calling this on
   * `table.actions` replaces that handler, so a brush can outlive its
   * filter. To react to removed filters from a host app, listen to the
   * `filterChange` event instead.
   *
   * Fires for every path that can drop a filter: {@link StateActions.removeFilter}
   * (and so the filter chips, the filter panel, and a chart clearing its own
   * selection), {@link StateActions.clearFilters},
   * {@link StateActions.loadFilterPreset} when the preset does not carry a
   * column forward, {@link StateActions.undo} / {@link StateActions.redo},
   * {@link StateActions.resetToInitial}, and the derived-column paths that
   * retype or delete a filtered column.
   *
   * It does *not* fire when a filter is merely replaced —
   * {@link StateActions.addFilter} over an existing column, or a preset that
   * gives that column a different filter. The column still has a filter, so
   * state keyed to it is still live.
   *
   * Called synchronously, after the signals have settled: reading
   * `state.filters` from inside the callback shows the post-removal list.
   * Removing a filter from inside the callback is safe — removals are
   * idempotent, so a callback that ends up asking for the same removal again
   * (a chart clearing its brush routes back through `removeFilter`) is a
   * no-op rather than a second undo entry and a second filter cycle.
   */
  setOnFilterRemove(callback: (column: string) => void): void {
    this.throwIfDestroyed('setOnFilterRemove');
    this.onFilterRemoveCallback = callback;
  }

  /**
   * Register a callback fired for each derived-column lifecycle event
   * (add / remove / update / replace). Used by the DataTable facade to
   * emit the `derivedChange` event with the right `kind` discriminator.
   */
  setOnDerivedChange(
    callback: (payload: {
      derivedColumns: DerivedColumnDef[];
      kind: 'added' | 'removed' | 'updated' | 'replaced';
      columnName?: string | undefined;
    }) => void,
  ): void {
    this.throwIfDestroyed('setOnDerivedChange');
    this.onDerivedChangeCallback = callback;
  }

  /**
   * Emit a derived-change event with the current column list.
   *
   * The `derivedColumns` array is a fresh shallow copy so handlers
   * destructuring the payload can't mutate the signal-backed list.
   */
  private emitDerivedChange(
    kind: 'added' | 'removed' | 'updated' | 'replaced',
    columnName?: string,
  ): void {
    if (!this.onDerivedChangeCallback) return;
    this.onDerivedChangeCallback({
      derivedColumns: [...this.state.derivedColumns.get()],
      kind,
      columnName,
    });
  }

  /**
   * Notify callback for each column that lost its filter between two states.
   *
   * Compares by column, not by filter identity: a column that swapped one
   * filter for another has not lost anything a consumer keys off. Both
   * arguments are snapshots taken by the caller, so a callback that mutates
   * `state.filters` cannot make this loop skip or repeat a column.
   */
  private notifyRemovedFilters(before: readonly Filter[], after: readonly Filter[]): void {
    if (!this.onFilterRemoveCallback) return;
    const afterColumns = new Set(after.map((f) => f.column));
    for (const f of before) {
      if (!afterColumns.has(f.column)) {
        this.onFilterRemoveCallback(f.column);
      }
    }
  }

  /**
   * Undo the last undoable action. Returns true if state was restored.
   * Async because derived column changes require DuckDB VIEW reconciliation.
   *
   * Runs in its turn, after every derived-column change asked for before it
   * has landed and pushed its undo entry: an undo pressed while an add runs
   * undoes the add. Resolves `false`, restoring nothing, while another undo
   * or redo waits or runs, while a load is under way (it would undo the
   * session the load restores), and when new data is loaded before its turn.
   *
   * @throws `DestroyedError` if the table was destroyed before or during
   *   the call.
   */
  async undo(): Promise<boolean> {
    return this.undoOrRedo('undo');
  }

  /**
   * Redo the last undone action. Returns true if state was restored.
   * Async because derived column changes require DuckDB VIEW reconciliation.
   * Runs in its turn, as {@link undo} does.
   *
   * @throws `DestroyedError` if the table was destroyed before or during
   *   the call.
   */
  async redo(): Promise<boolean> {
    return this.undoOrRedo('redo');
  }

  private async undoOrRedo(step: 'undo' | 'redo'): Promise<boolean> {
    this.throwIfDestroyed(step);
    if (this.undoRedoInProgress || !this.undoManager || this.openLoads > 0) return false;
    this.undoRedoInProgress = true;
    const epoch = this.loadEpoch;
    return this.inTurn((turn) => this.applyUndoStep(step, epoch, turn));
  }

  /** The turn of an undo or redo. */
  private async applyUndoStep(step: 'undo' | 'redo', epoch: number, turn: Turn): Promise<boolean> {
    try {
      this.throwIfDestroyed(step);
      const undoManager = this.undoManager!;
      // New data cleared the stacks the step was asked of.
      if (epoch !== this.loadEpoch) return false;
      if (step === 'undo' ? !undoManager.canUndo : !undoManager.canRedo) return false;
      this.suppressUndoCapture = true;

      const prevDerived = this.state.derivedColumns.get();
      const prevFilters = this.state.filters.get();
      const current = captureSnapshot(this.state);
      const snapshot = step === 'undo' ? undoManager.undo(current) : undoManager.redo(current);
      if (!snapshot) return false;

      const derivedChanged = !derivedColumnsEqual(prevDerived, snapshot.derivedColumns);

      // Reconcile DuckDB state BEFORE applying snapshot signals.
      // This ensures VIEW exists before visibleColumns/columnOrder reference derived cols.
      if (derivedChanged) {
        await this.changeRelation(() => this.reconcileDerivedColumns(snapshot, epoch));
      }
      this.throwIfDestroyed(step);
      if (epoch !== this.loadEpoch) return false;

      // Apply view-state signals + tableName atomically in a single batch
      batch(() => {
        applySnapshot(this.state, snapshot);
        if (derivedChanged) {
          const baseTable = this.state.baseTableName.get();
          this.state.tableName.set(
            snapshot.derivedColumns.length > 0
              ? this.derivedManager!.getEffectiveTableName()
              : baseTable!,
          );
        }
      });

      this.notifyRemovedFilters(prevFilters, this.state.filters.get());
      return true;
    } finally {
      // Cleared as the step ends, not a microtask later: a second undo called
      // right after one that restored no derived column goes ahead at once.
      this.suppressUndoCapture = false;
      this.undoRedoInProgress = false;
      this.endTurn(turn);
    }
  }

  /**
   * Open a column-layout gesture: the whole of it becomes one undo entry.
   *
   * A gesture is any run of width and order changes the user reads as a single
   * action — a resize drag, or a keyboard `Shift+F2` session that resizes and
   * moves a column before committing. Captures the pre-gesture state once and
   * suppresses nested capture, so the ten `setColumnWidth` calls a drag emits
   * (or the ten `setColumnOrder` calls a keyboard move emits) do not become ten
   * undo steps. Close it with {@link StateActions.endColumnLayoutChange} or
   * {@link StateActions.cancelColumnLayoutChange}.
   *
   * Captures even when undo is disabled — the snapshot is what
   * `cancelColumnLayoutChange()` restores from, which has to work regardless.
   * Calling it twice without closing keeps the first (outermost) snapshot.
   *
   * @example
   * ```typescript
   * actions.beginColumnLayoutChange();
   * actions.setColumnWidth('price', 220);
   * actions.setColumnOrder(['price', 'name', 'qty']);
   * actions.endColumnLayoutChange(); // one Ctrl+Z undoes both
   * ```
   *
   * @throws `DestroyedError` if the table was destroyed.
   */
  beginColumnLayoutChange(): void {
    this.throwIfDestroyed('beginColumnLayoutChange');
    if (this.layoutGestureActive) return;
    this.layoutGestureSnapshot = captureSnapshot(this.state);
    this.layoutGestureActive = true;
  }

  /**
   * Commit an open column-layout gesture, pushing one undo entry.
   *
   * The entry is pushed **only if the state actually changed** — a mousedown
   * and mouseup on the resize handle with no movement in between, or a
   * `Shift+F2` the user immediately commits, leaves the undo stack alone
   * rather than adding a step that undoes to an identical state. No-op when
   * no gesture is open.
   *
   * @throws `DestroyedError` if the table was destroyed.
   */
  endColumnLayoutChange(): void {
    this.throwIfDestroyed('endColumnLayoutChange');
    const snapshot = this.layoutGestureSnapshot;
    this.layoutGestureSnapshot = null;
    this.layoutGestureActive = false;
    if (!this.undoManager || !snapshot) return;
    if (snapshotsEqual(snapshot, captureSnapshot(this.state))) return;
    this.undoManager.push(snapshot);
  }

  /**
   * Abandon an open column-layout gesture, restoring the state it opened on.
   *
   * The `Escape` half of the keyboard gesture: width **and** position go back
   * to what they were at entry, and nothing is pushed onto the undo stack —
   * a cancelled gesture never happened. No-op when no gesture is open.
   *
   * @throws `DestroyedError` if the table was destroyed.
   */
  cancelColumnLayoutChange(): void {
    this.throwIfDestroyed('cancelColumnLayoutChange');
    const snapshot = this.layoutGestureSnapshot;
    this.layoutGestureSnapshot = null;
    this.layoutGestureActive = false;
    if (!snapshot) return;
    applySnapshot(this.state, snapshot);
  }

  /**
   * Begin a column width drag sequence.
   * Captures state once at drag start for undo.
   *
   * A width drag is one flavour of column-layout gesture; this delegates so
   * the mouse path picks up the "push only if something changed" guard too.
   *
   * @throws `DestroyedError` if the table was destroyed.
   */
  beginColumnWidthChange(): void {
    this.beginColumnLayoutChange();
  }

  /**
   * End a column width drag sequence.
   * Pushes the pre-drag snapshot to the undo stack, unless the drag was a
   * no-op.
   *
   * @throws `DestroyedError` if the table was destroyed.
   */
  endColumnWidthChange(): void {
    this.endColumnLayoutChange();
  }

  /** Get the UndoManager instance, if one was provided */
  getUndoManager(): UndoManager | undefined {
    return this.undoManager;
  }

  /**
   * Reset to the original state captured at data-load time.
   * Clears all filters, sorts, column customizations, derived columns,
   * and the undo/redo stacks. Returns true if state was restored.
   *
   * Runs in its turn, after the derived-column changes asked for before it
   * (see {@link undo}). Resolves `false`, restoring nothing, while a load is
   * under way, and when new data is loaded before it has run.
   *
   * @throws `DestroyedError` if the table was destroyed before or during
   *   the call.
   */
  async resetToInitial(): Promise<boolean> {
    this.throwIfDestroyed('resetToInitial');
    if (this.openLoads > 0) return false;
    const epoch = this.loadEpoch;
    return this.inTurn((turn) => this.resetInTurn(epoch, turn));
  }

  /** The turn of {@link resetToInitial}. It ends the turn itself, as an undo does. */
  private async resetInTurn(epoch: number, turn: Turn): Promise<boolean> {
    try {
      this.throwIfDestroyed('resetToInitial');
      const initialSnapshot = this.initialSnapshot;
      if (epoch !== this.loadEpoch || !initialSnapshot) return false;
      this.suppressUndoCapture = true;
      const prevFilters = this.state.filters.get();

      // Destroy derived columns BEFORE batch (async DuckDB operation)
      const manager = this.derivedManager;
      if (manager) {
        try {
          await this.changeRelation(() => manager.destroy());
        } catch {
          /* best-effort cleanup */
        }
        this.derivedManager = null;
      }
      this.throwIfDestroyed('resetToInitial');
      if (epoch !== this.loadEpoch) return false;

      // Collect derived column names from snapshot to strip after restore.
      // The initial snapshot may include derived columns from session restore.
      const derivedNames = new Set(initialSnapshot.derivedColumns.map((d) => d.name));

      // Apply snapshot + clean up derived refs + reset tableName atomically
      batch(() => {
        applySnapshot(this.state, initialSnapshot);

        this.state.derivedColumns.set([]);
        this.state.schema.set(this.state.schema.get().filter((c) => !c.isDerived));

        const baseTableName = this.state.baseTableName.get();
        if (baseTableName) {
          this.state.tableName.set(baseTableName);
        }

        // Strip derived column names from all column arrays restored by applySnapshot
        this.stripDerivedColumnRefs(derivedNames);

        // Reset filteredRows when initial state has no filters
        if (initialSnapshot.filters.length === 0) {
          this.state.filteredRows.set(this.state.totalRows.get());
        }
      });

      this.notifyRemovedFilters(prevFilters, this.state.filters.get());
      this.undoManager?.clear();

      return true;
    } finally {
      this.suppressUndoCapture = false;
      this.endTurn(turn);
    }
  }

  // =========================================
  // Data Loading
  // =========================================

  /**
   * Load data from a file or URL
   *
   * All metadata (row count, schema) is retrieved in the worker to avoid
   * blocking the main thread with sequential queries.
   *
   * Starts once the derived-column change running now, if any, has ended. A
   * change, undo, redo or reset asked for before the call does not apply:
   * it is for the data this replaces. An undo, redo or reset asked for while
   * the load is under way resolves `false`.
   *
   * @param source - File, Blob, URL string, or raw data (ArrayBuffer for Parquet; string for CSV/JSON)
   * @param options - Loading options (tableName, format)
   */
  async loadData(
    source: File | Blob | string | ArrayBuffer,
    options: LoadDataOptions = {},
  ): Promise<void> {
    this.throwIfDestroyed('loadData');
    this.loadEpoch++;
    this.openLoads++;
    try {
      return await this.inTurn(() => this.loadDataInTurn(source, options));
    } finally {
      this.openLoads--;
    }
  }

  /**
   * Empty the table, as `DataTable.clearSession` does, in its turn: once the
   * derived-column change running now, if any, has ended, and, as for a load,
   * without applying the changes asked for before the call. Resets the state
   * and the undo stacks, forgets the initial state, and drops the derived
   * columns' VIEW and helper tables.
   *
   * @internal
   */
  async clearData(): Promise<void> {
    this.throwIfDestroyed('clearData');
    this.loadEpoch++;
    return this.inTurn(async () => {
      this.throwIfDestroyed('clearData');
      resetTableState(this.state);
      this.undoManager?.clear();
      this.initialSnapshot = null;
      const manager = this.derivedManager;
      if (manager) {
        this.derivedManager = null;
        try {
          await manager.destroy();
        } catch {
          // Swallow — nothing reads its tables any more.
        }
      }
    });
  }

  /** The turn of {@link loadData}. */
  private async loadDataInTurn(
    source: File | Blob | string | ArrayBuffer,
    options: LoadDataOptions,
  ): Promise<void> {
    this.throwIfDestroyed('loadData');
    // Reset state for new data
    resetTableState(this.state);
    this.undoManager?.clear();

    // Load data - schema is included in the result (no more blocking queries!)
    const result = await this.loader.load(source, options);
    this.throwIfDestroyed('loadData');

    // Clean up any previous derived column manager. Awaited, so that its
    // DROPs land before a restore below creates the new manager's tables:
    // a helper table is named by its column and a count that starts again at
    // 0, and the VIEW by the table name, which a load can keep.
    const previousManager = this.derivedManager;
    if (previousManager) {
      this.derivedManager = null;
      try {
        await previousManager.destroy();
      } catch {
        // Swallow — the previous manager is being replaced.
      }
      this.throwIfDestroyed('loadData');
    }

    // Update state with schema from loader result
    this.state.tableName.set(result.tableName);
    this.state.totalRows.set(result.rowCount);
    this.state.filteredRows.set(result.rowCount);
    initializeColumnsFromSchema(this.state, result.schema);

    // Store the base table name for derived column support
    this.state.baseTableName.set(result.tableName);
    this.state.derivedColumns.set([]);

    // Restore session if a store is provided and a snapshot exists
    if (options.sessionStore) {
      const snapshot = await options.sessionStore.load(result.tableName);
      this.throwIfDestroyed('loadData');
      if (snapshot) {
        restoreStateFromSnapshot(
          this.state,
          snapshot,
          this.undoManager,
          options.presetManager,
          options.annotationStore,
        );

        // Recreate derived columns (VIEW + helper tables) if snapshot has them
        if (snapshot.derivedColumns && snapshot.derivedColumns.length > 0) {
          try {
            const manager = this.ensureDerivedManager();
            const restoredSchemas = await this.changeRelation(() =>
              manager.restoreColumns(this.state.derivedColumns.get()),
            );
            this.throwIfDestroyed('loadData');

            if (restoredSchemas.length > 0) {
              // Compute values needed for the batch
              const baseSchema = this.state.schema.get().filter((c) => !c.isDerived);
              const restoredNames = new Set(restoredSchemas.map((s) => s.name));
              const allSnapshotDerived = new Set(snapshot.derivedColumns.map((d) => d.name));
              const failedNames = new Set(
                [...allSnapshotDerived].filter((n) => !restoredNames.has(n)),
              );

              // Batch all state mutations so render() sees fully settled state.
              // Without this, schema.set triggers render() before tableName
              // points to the VIEW, causing the initial fetch to fail.
              batch(() => {
                this.state.schema.set([...baseSchema, ...restoredSchemas]);
                this.state.tableName.set(manager.getEffectiveTableName());
                this.state.derivedColumns.set(
                  this.state.derivedColumns.get().filter((d) => restoredNames.has(d.name)),
                );
                this.stripDerivedColumnRefs(failedNames);
              });
            }
          } catch (err) {
            console.warn('Failed to restore derived columns:', err);
            // All derived columns failed — clean up all references from state
            const derivedNames = new Set(snapshot.derivedColumns.map((d) => d.name));
            this.state.derivedColumns.set([]);
            this.stripDerivedColumnRefs(derivedNames);
          }
        }
      }
    }

    // Capture initial state AFTER session restore (including derived columns)
    // so that resetToInitial restores to the fully loaded state
    this.initialSnapshot = captureSnapshot(this.state);
  }

  // =========================================
  // Filter Actions
  // =========================================

  /**
   * Add or update a filter
   *
   * If a filter for the same column exists, it will be replaced.
   */
  addFilter(filter: Filter): void {
    this.throwIfDestroyed('addFilter');
    this.captureForUndo();
    const current = this.state.filters.get();
    const existingIndex = current.findIndex((f) => f.column === filter.column);

    if (existingIndex >= 0) {
      // Replace existing filter
      const updated = [...current];
      updated[existingIndex] = filter;
      this.state.filters.set(updated);
    } else {
      this.state.filters.set([...current, filter]);
    }
  }

  /**
   * Remove filter(s) for a column
   *
   * Idempotent: asking to remove a filter that is not there changes nothing,
   * pushes no undo entry, and notifies no subscriber. That matters beyond
   * tidiness — a chart clearing its brush routes back through here while the
   * removal that cleared it is still unwinding, and without the guard every
   * chip click would cost a second filter cycle and leave a dead undo step.
   *
   * @param column - Column name
   * @param type - Optional filter type to remove (if not specified, removes all filters for column)
   */
  removeFilter(column: string, type?: FilterType): void {
    this.throwIfDestroyed('removeFilter');
    const before = this.state.filters.get();
    const after = before.filter((f) =>
      type ? !(f.column === column && f.type === type) : f.column !== column,
    );
    if (after.length === before.length) return;
    this.captureForUndo();
    this.state.filters.set(after);
    this.notifyRemovedFilters(before, after);
  }

  /**
   * Clear all filters
   *
   * The `filteredRows` reset is unconditional — it repairs the count whether
   * or not there was anything to clear — but the filter list is only written
   * when it actually changes, so this is idempotent in the same way
   * {@link StateActions.removeFilter} is.
   */
  clearFilters(): void {
    this.throwIfDestroyed('clearFilters');
    const before = this.state.filters.get();
    if (before.length > 0) {
      this.captureForUndo();
      this.state.filters.set([]);
    }
    this.state.filteredRows.set(this.state.totalRows.get());
    this.notifyRemovedFilters(before, EMPTY_FILTERS);
  }

  /**
   * Load a filter preset: replace all filters (and optionally sort) in one
   * undo step. Uses suppressUndoCapture + batch() so Ctrl+Z restores the
   * entire pre-load state atomically.
   *
   * Columns the preset does not carry forward have lost their filter, so they
   * are notified — outside the suppression window, since the callback may
   * legitimately want to record an undo entry of its own.
   */
  loadFilterPreset(filters: Filter[], sortColumns?: SortColumn[]): void {
    this.throwIfDestroyed('loadFilterPreset');
    const before = this.state.filters.get();
    this.captureForUndo();
    this.suppressUndoCapture = true;
    try {
      batch(() => {
        this.state.filters.set(filters);
        if (sortColumns) {
          this.state.sortColumns.set(sortColumns);
        }
      });
    } finally {
      this.suppressUndoCapture = false;
    }
    this.notifyRemovedFilters(before, this.state.filters.get());
  }

  // =========================================
  // Raw SQL Filter Actions
  // =========================================

  /**
   * Add a raw SQL filter. Does NOT re-validate — caller is responsible
   * for validation (see {@link validateSQLFilter}). Creates a RawSQLFilter
   * with a unique id and synthetic column key, appends to `state.filters`.
   * Captures an undo snapshot before mutation.
   *
   * **Trust boundary.** The `sql` string is spliced verbatim into a WHERE
   * clause when filters are evaluated (see `filterToSQL` in
   * `src/filters/FilterSQL.ts`). The library calls DuckDB to validate
   * parseability via {@link validateSQLFilter}, but does not constrain
   * semantics — any SELECT/UNION/EXISTS expression DuckDB accepts will
   * run. Treat `sql` as trusted developer input. If your end users author
   * raw SQL (e.g. through the SQL filter modal), validate at the host
   * application layer or document the data-exposure surface to them.
   *
   * @returns The filter's unique id
   */
  addRawSQLFilter(sql: string, label?: string): string {
    this.throwIfDestroyed('addRawSQLFilter');
    if (!sql.trim()) {
      throw new SQLValidationError('SQL expression must not be empty', {
        code: 'SQL_SYNTAX',
      });
    }
    const id = crypto.randomUUID();
    const filter: RawSQLFilter = {
      type: 'raw-sql',
      column: `__raw_sql_${id}__`,
      sql,
      label,
      id,
    };
    this.captureForUndo();
    const current = this.state.filters.get();
    this.state.filters.set([...current, filter]);
    return id;
  }

  /**
   * Update an existing raw SQL filter's SQL and/or label.
   * Does NOT re-validate. Finds by id, replaces in state.filters.
   * Captures undo snapshot before mutation. No-op if filter not found.
   */
  updateRawSQLFilter(id: string, sql: string, label?: string): void {
    this.throwIfDestroyed('updateRawSQLFilter');
    if (!sql.trim()) {
      throw new SQLValidationError('SQL expression must not be empty', {
        code: 'SQL_SYNTAX',
      });
    }
    const syntheticKey = `__raw_sql_${id}__`;
    const current = this.state.filters.get();
    const index = current.findIndex((f) => f.column === syntheticKey);
    if (index < 0) return;
    this.captureForUndo();
    const updated = [...current];
    updated[index] = {
      type: 'raw-sql',
      column: syntheticKey,
      sql,
      label,
      id,
    };
    this.state.filters.set(updated);
  }

  /**
   * Remove a raw SQL filter by id.
   * Captures undo snapshot before mutation.
   */
  removeRawSQLFilter(id: string): void {
    this.throwIfDestroyed('removeRawSQLFilter');
    const syntheticKey = `__raw_sql_${id}__`;
    this.removeFilter(syntheticKey);
  }

  /**
   * Get all active raw SQL filters. Convenience getter.
   */
  getRawSQLFilters(): RawSQLFilter[] {
    return this.state.filters.get().filter((f): f is RawSQLFilter => f.type === 'raw-sql');
  }

  /**
   * Validate a SQL WHERE clause fragment. Runs the SQL against DuckDB
   * and returns validity, match count, and any error message.
   * Used by the SQL filter modal's Validate button (Task 8.9).
   */
  async validateSQLFilter(
    sql: string,
    signal?: AbortSignal,
  ): Promise<{
    valid: boolean;
    matchCount?: number;
    error?: string;
  }> {
    this.throwIfDestroyed('validateSQLFilter');
    const tableName = this.state.tableName.get();
    if (!tableName) return { valid: false, error: 'No table loaded' };
    try {
      const result = await this.bridge.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM ${quoteIdentifier(tableName)} WHERE (${sql})`,
        signal,
      );
      this.throwIfDestroyed('validateSQLFilter');
      return { valid: true, matchCount: Number(result[0]?.cnt ?? 0) };
    } catch (e) {
      // Silently return for aborted requests — the caller has moved on
      if (signal?.aborted) return { valid: false, error: 'Validation cancelled' };
      // Re-throw destroy errors so callers see the lifecycle signal.
      if (e instanceof DestroyedError) throw e;
      return { valid: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Get the complete WHERE clause SQL for all active filters.
   * Convenience method for downstream apps that need the raw SQL string.
   */
  getFiltersSQL(): string {
    return filtersToWhereClause(this.state.filters.get());
  }

  // =========================================
  // Sort Actions
  // =========================================

  /**
   * Set sort columns directly
   */
  setSort(columns: SortColumn[]): void {
    this.throwIfDestroyed('setSort');
    this.captureForUndo();
    this.state.sortColumns.set(columns);
  }

  /**
   * Toggle sort for a single column (cycles: none → asc → desc → none)
   *
   * Replaces any existing sort with the new column.
   */
  toggleSort(column: string): void {
    this.throwIfDestroyed('toggleSort');
    this.captureForUndo();
    const current = this.state.sortColumns.get();
    const existing = current.find((s) => s.column === column);

    if (!existing) {
      // Not sorted → ascending
      this.state.sortColumns.set([{ column, direction: 'asc' }]);
    } else if (existing.direction === 'asc') {
      // Ascending → descending
      this.state.sortColumns.set([{ column, direction: 'desc' }]);
    } else {
      // Descending → no sort
      this.state.sortColumns.set([]);
    }
  }

  /**
   * Add column to multi-sort (Shift+click behavior)
   *
   * If column is already in sort, toggles its direction or removes it.
   */
  addToSort(column: string): void {
    this.throwIfDestroyed('addToSort');
    this.captureForUndo();
    const current = this.state.sortColumns.get();
    const existingIndex = current.findIndex((s) => s.column === column);

    if (existingIndex === -1) {
      // Add new sort column
      this.state.sortColumns.set([...current, { column, direction: 'asc' }]);
    } else {
      const updated = [...current];
      // existingIndex >= 0 from findIndex, so updated[existingIndex] is defined.
      const existing = updated[existingIndex]!;
      if (existing.direction === 'asc') {
        // Toggle to descending
        updated[existingIndex] = { column, direction: 'desc' };
      } else {
        // Remove from sort
        updated.splice(existingIndex, 1);
      }
      this.state.sortColumns.set(updated);
    }
  }

  /**
   * Clear all sorting
   */
  clearSort(): void {
    this.throwIfDestroyed('clearSort');
    this.captureForUndo();
    this.state.sortColumns.set([]);
  }

  // =========================================
  // Column Visibility Actions
  // =========================================

  /**
   * Hide a column, recording its neighbors for intelligent restore
   */
  hideColumn(column: string): void {
    this.throwIfDestroyed('hideColumn');
    const visible = this.state.visibleColumns.get();
    if (!visible.includes(column)) return;

    // Don't allow hiding the last visible column
    if (visible.length <= 1) return;

    this.captureForUndo();

    // Record neighbor info before hiding. Bounds checks above guarantee both
    // accesses are in-range; the `?? null` lambda placates noUncheckedIndexedAccess.
    const colIndex = visible.indexOf(column);
    const leftNeighbor = colIndex > 0 ? (visible[colIndex - 1] ?? null) : null;
    const rightNeighbor = colIndex < visible.length - 1 ? (visible[colIndex + 1] ?? null) : null;

    const info: HiddenColumnInfo = { column, leftNeighbor, rightNeighbor };
    const hiddenMap = new Map(this.state.hiddenColumnInfo.get());
    hiddenMap.set(column, info);
    this.state.hiddenColumnInfo.set(hiddenMap);

    // Remove from visible
    this.state.visibleColumns.set(visible.filter((c) => c !== column));
  }

  /**
   * Show a hidden column using neighbor-aware restore logic
   */
  showColumn(column: string): void {
    this.throwIfDestroyed('showColumn');
    const visible = this.state.visibleColumns.get();
    const order = this.state.columnOrder.get();

    if (visible.includes(column) || !order.includes(column)) return;

    this.captureForUndo();

    const hiddenMap = this.state.hiddenColumnInfo.get();
    const info = hiddenMap.get(column);

    let insertIndex: number;

    if (info) {
      insertIndex = this.computeRestoreIndex(visible, order, info);
    } else {
      // Fallback: use columnOrder-based positioning
      insertIndex = this.computeOrderBasedIndex(visible, order, column);
    }

    // Pinned columns lead the row, in pin order, and their sticky offsets are
    // summed on that assumption. The neighbours recorded at hide time know
    // nothing of a pin made since, so an unpinned column is kept after the
    // pinned block, and a pinned column goes back to its place in pin order
    // within it, whatever its neighbours were.
    const pinned = this.state.pinnedColumns.get();
    const pinnedLead = leadingPinnedCount(visible, pinned);
    const rank = pinned.indexOf(column);
    if (rank >= 0) {
      insertIndex = 0;
      while (insertIndex < pinnedLead && pinned.indexOf(visible[insertIndex]!) < rank) {
        insertIndex++;
      }
    } else {
      insertIndex = Math.max(insertIndex, pinnedLead);
    }

    const newVisible = [...visible];
    newVisible.splice(insertIndex, 0, column);
    const newOrder = alignOrderWithVisible(order, newVisible, column, pinned);

    batch(() => {
      this.state.visibleColumns.set(newVisible);
      this.state.columnOrder.set(newOrder);

      // Remove from hiddenColumnInfo
      if (info) {
        const updated = new Map(hiddenMap);
        updated.delete(column);
        this.state.hiddenColumnInfo.set(updated);
      }
    });
  }

  /**
   * Show all hidden columns, restoring them in columnOrder
   */
  showAllColumns(): void {
    this.throwIfDestroyed('showAllColumns');
    this.captureForUndo();
    const order = this.state.columnOrder.get();
    this.state.visibleColumns.set([...order]);
    this.state.hiddenColumnInfo.set(new Map());
  }

  /**
   * Compute restore index using columnOrder-based positioning (fallback)
   */
  private computeOrderBasedIndex(visible: string[], order: string[], column: string): number {
    const orderIndex = order.indexOf(column);
    let insertIndex = 0;
    for (let i = 0; i < orderIndex; i++) {
      // i < orderIndex < order.length, so order[i] is defined.
      if (visible.includes(order[i]!)) {
        insertIndex++;
      }
    }
    return insertIndex;
  }

  /**
   * Compute restore index using neighbor-aware logic
   */
  private computeRestoreIndex(visible: string[], order: string[], info: HiddenColumnInfo): number {
    const { leftNeighbor, rightNeighbor } = info;
    const leftIdx = leftNeighbor !== null ? visible.indexOf(leftNeighbor) : -1;
    const rightIdx = rightNeighbor !== null ? visible.indexOf(rightNeighbor) : -1;
    const leftVisible = leftIdx !== -1;
    const rightVisible = rightIdx !== -1;

    if (leftVisible && rightVisible) {
      // Both neighbors visible
      if (rightIdx === leftIdx + 1) {
        // Still adjacent — insert between them
        return rightIdx;
      }
      // Not adjacent — pick neighbor closest in columnOrder
      const colOrderIdx = order.indexOf(info.column);
      const leftOrderIdx = order.indexOf(leftNeighbor!);
      const rightOrderIdx = order.indexOf(rightNeighbor!);
      const leftDist = Math.abs(colOrderIdx - leftOrderIdx);
      const rightDist = Math.abs(colOrderIdx - rightOrderIdx);
      if (leftDist <= rightDist) {
        return leftIdx + 1; // Insert after left neighbor
      } else {
        return rightIdx; // Insert before right neighbor
      }
    }

    if (leftVisible) {
      return leftIdx + 1; // Insert after left neighbor
    }

    if (rightVisible) {
      return rightIdx; // Insert before right neighbor
    }

    // Both neighbors hidden — walk outward from columnOrder position
    const colOrderIdx = order.indexOf(info.column);
    for (let dist = 1; dist < order.length; dist++) {
      // Check right
      if (colOrderIdx + dist < order.length) {
        const candidate = order[colOrderIdx + dist]!;
        const candidateIdx = visible.indexOf(candidate);
        if (candidateIdx !== -1) {
          return candidateIdx; // Insert before this visible column
        }
      }
      // Check left
      if (colOrderIdx - dist >= 0) {
        const candidate = order[colOrderIdx - dist]!;
        const candidateIdx = visible.indexOf(candidate);
        if (candidateIdx !== -1) {
          return candidateIdx + 1; // Insert after this visible column
        }
      }
    }

    // Ultimate fallback: append at end
    return visible.length;
  }

  /**
   * Set the column order
   *
   * Also reorders visible columns to match the new order, in the same
   * update. Preserves hidden columns in columnOrder at their relative
   * positions. Pinned columns stay first, in the order given: an order that
   * puts one after an unpinned column has it moved to the pinned block, and
   * `pinnedColumns` takes the block's new order, so a pinned column hidden
   * and shown again goes back to its place in it. A name given twice counts
   * once, at its first place: the table has one header and one place for
   * it.
   */
  setColumnOrder(columns: string[]): void {
    this.throwIfDestroyed('setColumnOrder');
    this.captureForUndo();
    const pinned = this.state.pinnedColumns.get();
    // Hidden columns go back at their relative positions.
    const newOrder = pinnedColumnsFirst(
      mergeMissingColumns([...new Set(columns)], this.state.columnOrder.get()),
      pinned,
    );
    const pinnedSet = new Set(pinned);
    const newPinned = [
      ...newOrder.filter((c) => pinnedSet.has(c)),
      ...pinned.filter((c) => !newOrder.includes(c)),
    ];

    // Reorder visible columns to match
    const visible = new Set(this.state.visibleColumns.get());
    batch(() => {
      // Pinned first, as toggleColumnPin does: its subscribers read the
      // header positions before the new order re-renders them.
      if (newPinned.some((c, i) => c !== pinned[i])) this.state.pinnedColumns.set(newPinned);
      this.state.columnOrder.set(newOrder);
      this.state.visibleColumns.set(newOrder.filter((c) => visible.has(c)));
    });
  }

  /**
   * Toggle column pin status
   *
   * When pinning, moves the column to the end of the pinned group (leftmost columns).
   * When unpinning, moves the column to the first unpinned position.
   * Also updates columnOrder and visibleColumns to reflect the new position.
   */
  toggleColumnPin(column: string): void {
    this.throwIfDestroyed('toggleColumnPin');
    const pinned = this.state.pinnedColumns.get();
    const order = this.state.columnOrder.get();
    const isPinned = pinned.includes(column);

    // A name the table does not have would otherwise be pinned and spliced
    // into `columnOrder` as a phantom column, shifting the `aria-colindex` of
    // every column after it. One that is pinned all the same (a stale entry)
    // is only unpinned.
    if (!order.includes(column)) {
      if (!isPinned) return;
      this.captureForUndo();
      this.state.pinnedColumns.set(pinned.filter((c) => c !== column));
      return;
    }

    this.captureForUndo();

    // Suppress undo capture for the internal setColumnOrder call. Batched so
    // subscribers see the pinned set and the order that goes with it
    // together: notified one write at a time, the `pinnedColumns`
    // subscribers ran while the newly pinned column still sat outside the
    // pinned block.
    this.suppressUndoCapture = true;
    try {
      batch(() => {
        if (isPinned) {
          // Unpinning: remove from pinned, move to first unpinned position
          const newPinned = pinned.filter((c) => c !== column);
          this.state.pinnedColumns.set(newPinned);

          // Reorder: place column immediately after the remaining pinned columns
          const newOrder = order.filter((c) => c !== column);
          const insertIndex = newPinned.length; // right after the last pinned column
          newOrder.splice(insertIndex, 0, column);
          this.setColumnOrder(newOrder);
        } else {
          // Pinning: add to pinned, move to end of pinned group
          const newPinned = [...pinned, column];
          this.state.pinnedColumns.set(newPinned);

          // Reorder: place column after the previously-pinned columns (at end of pinned group)
          const newOrder = order.filter((c) => c !== column);
          const insertIndex = pinned.length; // after existing pinned columns
          newOrder.splice(insertIndex, 0, column);
          this.setColumnOrder(newOrder);
        }
      });
    } finally {
      this.suppressUndoCapture = false;
    }
  }

  /**
   * Set column width
   */
  setColumnWidth(column: string, width: number): void {
    this.throwIfDestroyed('setColumnWidth');
    const widths = new Map(this.state.columnWidths.get());
    widths.set(column, width);
    this.state.columnWidths.set(widths);
  }

  /**
   * Reset column width to default
   */
  resetColumnWidth(column: string): void {
    this.throwIfDestroyed('resetColumnWidth');
    this.captureForUndo();
    const widths = new Map(this.state.columnWidths.get());
    widths.delete(column);
    this.state.columnWidths.set(widths);
  }

  /**
   * Set or clear an app-controlled tooltip rendered as a styled popover on
   * the column-header name span.
   *
   * `content` may be:
   * - A `ColumnHeaderTooltipContent` object with optional `title`,
   *   `description`, and `items[]` (label/value rows; value can be a string
   *   or a string array for chip-style enums).
   * - A plain string, treated as a description-only shorthand
   *   (`{ description: string }`).
   * - `null` (or any input that normalizes to empty) to clear the override.
   *
   * Every text field is rendered via `.textContent` — HTML is NOT supported
   * by design, eliminating the XSS surface. Malformed items (missing label,
   * non-string non-array value) are silently dropped.
   *
   * Does not participate in undo/redo (app-authored metadata, same as
   * `setColumnWidth`). Persists in the session snapshot alongside
   * `columnWidths`. Setting an unknown column name is silently accepted;
   * the override takes visible effect once a header for that column renders.
   *
   * @example
   * ```ts
   * // Plain string shorthand — renders as description-only.
   * table.actions.setColumnHeaderTooltip('age', 'Age in completed years');
   *
   * // Structured content with title, description, and items.
   * table.actions.setColumnHeaderTooltip('payment_type', {
   *   title: 'Payment method',
   *   description: 'How the rider paid for the trip.',
   *   items: [
   *     { label: 'Allowed values', value: ['Credit card', 'Cash', 'No charge'] },
   *     { label: 'Source', value: 'TLC schema v1.0' },
   *   ],
   * });
   *
   * // Clear.
   * table.actions.setColumnHeaderTooltip('age', null);
   * ```
   */
  setColumnHeaderTooltip(
    column: string,
    content: string | ColumnHeaderTooltipContent | null,
  ): void {
    this.throwIfDestroyed('setColumnHeaderTooltip');
    const next = normalizeColumnHeaderTooltip(content);
    const map = this.state.columnHeaderTooltips.get();
    const current = map.get(column) ?? null;
    if (tooltipContentEquals(current, next)) return;
    const newMap = new Map(map);
    if (next === null) newMap.delete(column);
    else newMap.set(column, next);
    this.state.columnHeaderTooltips.set(newMap);
  }

  /**
   * Get the app-controlled tooltip content for a column header, or `null`
   * if unset. Always returns the normalized object form, even when the
   * setter was called with the string shorthand.
   */
  getColumnHeaderTooltip(column: string): ColumnHeaderTooltipContent | null {
    return this.state.columnHeaderTooltips.get().get(column) ?? null;
  }

  // =========================================
  // Derived Column Helpers
  // =========================================

  /**
   * Remove all state references to the given column names.
   * Used when derived columns fail to restore or are reset.
   * Caller must handle derivedColumns signal and schema separately.
   */
  private stripDerivedColumnRefs(names: Set<string>): void {
    if (names.size === 0) return;
    batch(() => {
      this.state.filters.set(this.state.filters.get().filter((f) => !names.has(f.column)));
      this.state.sortColumns.set(this.state.sortColumns.get().filter((s) => !names.has(s.column)));
      this.state.visibleColumns.set(this.state.visibleColumns.get().filter((c) => !names.has(c)));
      this.state.columnOrder.set(this.state.columnOrder.get().filter((c) => !names.has(c)));
      this.state.pinnedColumns.set(this.state.pinnedColumns.get().filter((c) => !names.has(c)));
      const widths = new Map(this.state.columnWidths.get());
      const hidden = new Map(this.state.hiddenColumnInfo.get());
      for (const name of names) {
        widths.delete(name);
        hidden.delete(name);
      }
      // Nullify neighbor refs pointing to removed columns
      for (const [key, info] of hidden) {
        if (names.has(info.leftNeighbor ?? '') || names.has(info.rightNeighbor ?? '')) {
          hidden.set(key, {
            ...info,
            leftNeighbor: names.has(info.leftNeighbor ?? '') ? null : info.leftNeighbor,
            rightNeighbor: names.has(info.rightNeighbor ?? '') ? null : info.rightNeighbor,
          });
        }
      }
      this.state.columnWidths.set(widths);
      this.state.hiddenColumnInfo.set(hidden);
    });
  }

  // =========================================
  // Derived Column Actions
  // =========================================

  /** Lazily create the DerivedColumnManager */
  private ensureDerivedManager(): DerivedColumnManager {
    if (!this.derivedManager) {
      const baseTableName = this.state.baseTableName.get();
      if (!baseTableName) {
        throw new ConfigurationError('Cannot create derived columns before data is loaded', {
          code: 'BRIDGE_NOT_READY',
        });
      }
      this.derivedManager = new DerivedColumnManager(this.bridge, baseTableName, () =>
        this.state.totalRows.get(),
      );
    }
    return this.derivedManager;
  }

  /**
   * Reconcile DuckDB VIEW state after undo/redo changes derived columns.
   * Destroys the existing manager and either recreates with the snapshot's
   * derived columns, or leaves the table in base-table mode.
   */
  private async reconcileDerivedColumns(snapshot: StateSnapshot, epoch: number): Promise<void> {
    // 1. Destroy existing manager (drops VIEW + helper tables)
    if (this.derivedManager) {
      await this.derivedManager.destroy();
      this.derivedManager = null;
    }

    // 2. Create new manager, restore columns
    const restoredSchemas =
      snapshot.derivedColumns.length > 0
        ? await this.ensureDerivedManager().restoreColumns(snapshot.derivedColumns)
        : [];
    // New data asked for meanwhile: the load sets the state.
    if (epoch !== this.loadEpoch) return;

    // 3. Update schema: old derived entries out, restored ones in
    const baseSchema = this.state.schema.get().filter((c) => !c.isDerived);
    this.state.schema.set([...baseSchema, ...restoredSchemas]);

    // 4. Update derivedColumns signal (filtered to only successfully restored)
    const restoredNames = new Set(restoredSchemas.map((s) => s.name));
    this.state.derivedColumns.set(snapshot.derivedColumns.filter((d) => restoredNames.has(d.name)));

    // Bulk reconciliation (undo/redo/session restore): emit a single event
    // with no columnName since multiple columns may have changed at once.
    this.emitDerivedChange('updated');
  }

  /**
   * Push the state a derived-column change is about to update, once its
   * DuckDB work has succeeded. Captured then rather than when the change was
   * asked for: an edit made meanwhile, such as a filter added while a vector
   * add ran, has an undo entry of its own, and undoing the change keeps it.
   */
  private pushDerivedUndo(): void {
    if (this.undoManager && !this.suppressUndoCapture) {
      this.undoManager.push(captureSnapshot(this.state));
    }
  }

  /**
   * Add a derived column (expression or vector).
   * Validates name uniqueness, creates VIEW, updates state.
   *
   * Runs in its turn: derived-column changes, undo, redo, reset and loads run
   * one at a time, in call order, and an add is validated against the columns
   * the changes ahead of it leave. A second add of one name gets `already
   * exists` once the first lands. Resolves `{ success: false }` when new
   * data is loaded before the add has landed.
   */
  async addDerivedColumn(def: DerivedColumnDef): Promise<{ success: boolean; error?: string }> {
    if (this.destroyed) return { success: false, error: 'DataTable is destroyed' };
    const epoch = this.loadEpoch;
    return this.inTurn(() => this.addDerivedColumnInTurn(def, epoch));
  }

  /** The turn of {@link addDerivedColumn}. */
  private async addDerivedColumnInTurn(
    def: DerivedColumnDef,
    epoch: number,
  ): Promise<{ success: boolean; error?: string }> {
    if (this.destroyed) {
      return { success: false, error: 'DataTable is destroyed' };
    }
    if (epoch !== this.loadEpoch) return { success: false, error: SUPERSEDED };
    if (def.name === ROWID_COLUMN) {
      return {
        success: false,
        error: `Column name "${def.name}" is reserved for the synthetic row id`,
      };
    }
    // Validate name uniqueness against all columns
    const allColumnNames = this.state.schema.get().map((c) => c.name);
    if (allColumnNames.includes(def.name)) {
      return { success: false, error: `Column name "${def.name}" already exists` };
    }

    if (!def.name.trim()) {
      return { success: false, error: 'Column name cannot be empty' };
    }

    try {
      const manager = this.ensureDerivedManager();
      // An add builds a vector column's helper table under a name of its
      // own, and leaves the relation in force alone until one CREATE OR
      // REPLACE VIEW puts one with every column it had in its place: reads
      // of it go on meanwhile.
      const info = await this.changeRelation(() => manager.addColumn(def), {
        staysReadable: true,
      });

      // Drop the result if the table was destroyed or given new data during
      // the await — do not touch state and do not push to the undo stack.
      if (this.destroyed) {
        return { success: false, error: 'DataTable is destroyed' };
      }
      if (epoch !== this.loadEpoch) return { success: false, error: SUPERSEDED };

      // Push to undo stack AFTER DuckDB success, BEFORE state mutation
      this.pushDerivedUndo();

      batch(() => {
        // Switch tableName to the VIEW
        this.state.tableName.set(manager.getEffectiveTableName());

        // Add to derivedColumns list
        this.state.derivedColumns.set([...this.state.derivedColumns.get(), def]);

        // Add to schema
        const newSchemaEntry: ColumnSchema = {
          name: def.name,
          type: info.detectedType,
          nullable: true,
          originalType: info.detectedOriginalType,
          isDerived: true,
          expression: def.kind === 'expression' ? def.expression : undefined,
        };
        this.state.schema.set([...this.state.schema.get(), newSchemaEntry]);

        // Add to column visibility/order arrays
        this.state.visibleColumns.set([...this.state.visibleColumns.get(), def.name]);
        this.state.columnOrder.set([...this.state.columnOrder.get(), def.name]);
      });

      this.emitDerivedChange('added', def.name);

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Update a derived column's expression, name, or values.
   * Handles rename (updates all state references) and type change (removes stale filters).
   *
   * Runs in its turn, as {@link addDerivedColumn} does: a rename to a name an
   * add ahead of it takes gets `already exists`.
   */
  async updateDerivedColumn(
    oldName: string,
    def: DerivedColumnDef,
  ): Promise<{ success: boolean; error?: string }> {
    if (this.destroyed) return { success: false, error: 'DataTable is destroyed' };
    const epoch = this.loadEpoch;
    return this.inTurn(() => this.updateDerivedColumnInTurn(oldName, def, epoch));
  }

  /** The turn of {@link updateDerivedColumn}. */
  private async updateDerivedColumnInTurn(
    oldName: string,
    def: DerivedColumnDef,
    epoch: number,
  ): Promise<{ success: boolean; error?: string }> {
    if (this.destroyed) {
      return { success: false, error: 'DataTable is destroyed' };
    }
    if (epoch !== this.loadEpoch) return { success: false, error: SUPERSEDED };
    // Validate target is derived
    const currentSchema = this.state.schema.get();
    const oldEntry = currentSchema.find((c) => c.name === oldName);
    if (!oldEntry?.isDerived) {
      return { success: false, error: `Column "${oldName}" is not a derived column` };
    }

    // If renaming, validate new name uniqueness (excluding self)
    const isRename = oldName !== def.name;
    if (isRename) {
      if (def.name === ROWID_COLUMN) {
        return {
          success: false,
          error: `Column name "${def.name}" is reserved for the synthetic row id`,
        };
      }
      const otherNames = currentSchema.filter((c) => c.name !== oldName).map((c) => c.name);
      if (otherNames.includes(def.name)) {
        return { success: false, error: `Column name "${def.name}" already exists` };
      }
    }

    if (!def.name.trim()) {
      return { success: false, error: 'Column name cannot be empty' };
    }

    try {
      const manager = this.ensureDerivedManager();
      const info = await this.changeRelation(() => manager.updateColumn(oldName, def));

      // Drop the result if the table was destroyed or given new data during
      // the await.
      if (this.destroyed) {
        return { success: false, error: 'DataTable is destroyed' };
      }
      if (epoch !== this.loadEpoch) return { success: false, error: SUPERSEDED };

      // Push to undo stack AFTER DuckDB success, BEFORE state mutation
      this.pushDerivedUndo();

      const typeChanged = oldEntry.type !== info.detectedType;

      batch(() => {
        // Update derivedColumns list
        this.state.derivedColumns.set(
          this.state.derivedColumns.get().map((d) => (d.name === oldName ? def : d)),
        );

        // Update schema entry
        const newSchemaEntry: ColumnSchema = {
          name: def.name,
          type: info.detectedType,
          nullable: true,
          originalType: info.detectedOriginalType,
          isDerived: true,
          expression: def.kind === 'expression' ? def.expression : undefined,
        };
        this.state.schema.set(currentSchema.map((c) => (c.name === oldName ? newSchemaEntry : c)));

        if (isRename) {
          // Update all state references
          this.state.visibleColumns.set(
            this.state.visibleColumns.get().map((c) => (c === oldName ? def.name : c)),
          );
          this.state.columnOrder.set(
            this.state.columnOrder.get().map((c) => (c === oldName ? def.name : c)),
          );

          // columnWidths
          const widths = new Map(this.state.columnWidths.get());
          if (widths.has(oldName)) {
            widths.set(def.name, widths.get(oldName)!);
            widths.delete(oldName);
          }
          this.state.columnWidths.set(widths);

          // columnHeaderTooltips
          const tooltips = new Map(this.state.columnHeaderTooltips.get());
          if (tooltips.has(oldName)) {
            tooltips.set(def.name, tooltips.get(oldName)!);
            tooltips.delete(oldName);
            this.state.columnHeaderTooltips.set(tooltips);
          }

          // pinnedColumns
          this.state.pinnedColumns.set(
            this.state.pinnedColumns.get().map((c) => (c === oldName ? def.name : c)),
          );

          // hiddenColumnInfo — update entry and neighbor references
          const hiddenInfo = new Map(this.state.hiddenColumnInfo.get());
          if (hiddenInfo.has(oldName)) {
            const hInfo = hiddenInfo.get(oldName)!;
            hiddenInfo.delete(oldName);
            hiddenInfo.set(def.name, { ...hInfo, column: def.name });
          }
          for (const [key, hInfo] of hiddenInfo) {
            if (hInfo.leftNeighbor === oldName || hInfo.rightNeighbor === oldName) {
              hiddenInfo.set(key, {
                ...hInfo,
                leftNeighbor: hInfo.leftNeighbor === oldName ? def.name : hInfo.leftNeighbor,
                rightNeighbor: hInfo.rightNeighbor === oldName ? def.name : hInfo.rightNeighbor,
              });
            }
          }
          this.state.hiddenColumnInfo.set(hiddenInfo);

          // sortColumns
          this.state.sortColumns.set(
            this.state.sortColumns
              .get()
              .map((s) => (s.column === oldName ? { ...s, column: def.name } : s)),
          );

          // filters: rename or remove if type changed
          const filters = this.state.filters.get();
          if (typeChanged) {
            if (filters.some((f) => f.column === oldName)) {
              this.state.filters.set(filters.filter((f) => f.column !== oldName));
              this.onFilterRemoveCallback?.(oldName);
            }
          } else {
            this.state.filters.set(
              filters.map((f) => (f.column === oldName ? { ...f, column: def.name } : f)),
            );
          }
        } else if (typeChanged) {
          // Same name but type changed — remove stale filters
          const filters = this.state.filters.get();
          if (filters.some((f) => f.column === def.name)) {
            this.state.filters.set(filters.filter((f) => f.column !== def.name));
            this.onFilterRemoveCallback?.(def.name);
          }
        }
      });

      this.emitDerivedChange('updated', def.name);

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Replace a derived column at the same name with a new definition.
   *
   * Same-name-only — does not support renaming (use {@link updateDerivedColumn}
   * for that). Pre-flights every dependent column against the proposed new def
   * before touching DuckDB. On dependent incompatibility returns a structured
   * `DerivedColumnError` with `code: 'DEPENDENTS_INCOMPATIBLE'` whose
   * `details.dependentsAffected` names each dependent that would break and
   * `details.reasons` maps each dependent name to the DuckDB error. The
   * replacement is atomic: if any pre-flight check or the final VIEW recreate
   * fails, the column reverts to its prior definition.
   *
   * @example
   * const result = await table.actions.replaceDerivedColumn('tip_pct', {
   *   kind: 'expression',
   *   name: 'tip_pct',
   *   expression: 'CAST(tip_amount AS VARCHAR)', // breaks numeric dependents
   * });
   * if (!result.success && result.error.code === 'DEPENDENTS_INCOMPATIBLE') {
   *   const { dependentsAffected, reasons } = result.error.details!;
   *   console.log('affected:', dependentsAffected, 'reasons:', reasons);
   * }
   */
  async replaceDerivedColumn(
    name: string,
    newDef: DerivedColumnDef,
  ): Promise<
    { success: true; info: DerivedColumnInfo } | { success: false; error: DerivedColumnError }
  > {
    if (this.destroyed) {
      return {
        success: false,
        error: new DerivedColumnError('DataTable is destroyed', { code: 'DESTROYED' }),
      };
    }
    const epoch = this.loadEpoch;
    return this.inTurn(() => this.replaceDerivedColumnInTurn(name, newDef, epoch));
  }

  /** The turn of {@link replaceDerivedColumn}. */
  private async replaceDerivedColumnInTurn(
    name: string,
    newDef: DerivedColumnDef,
    epoch: number,
  ): Promise<
    { success: true; info: DerivedColumnInfo } | { success: false; error: DerivedColumnError }
  > {
    if (this.destroyed) {
      return {
        success: false,
        error: new DerivedColumnError('DataTable is destroyed', { code: 'DESTROYED' }),
      };
    }
    if (epoch !== this.loadEpoch) return { success: false, error: supersededError(name) };
    const currentSchema = this.state.schema.get();
    const oldEntry = currentSchema.find((c) => c.name === name);
    if (!oldEntry?.isDerived) {
      return {
        success: false,
        error: new DerivedColumnError(`Column "${name}" is not a derived column`, {
          code: 'NOT_FOUND',
          details: { column: name },
        }),
      };
    }

    if (newDef.name !== name) {
      return {
        success: false,
        error: new DerivedColumnError(
          `replaceDerivedColumn does not support renaming: target "${name}" vs new "${newDef.name}". Use updateDerivedColumn instead.`,
          { code: 'EXPRESSION_INVALID', details: { target: name, newName: newDef.name } },
        ),
      };
    }

    let info: DerivedColumnInfo;
    try {
      const manager = this.ensureDerivedManager();
      info = await this.changeRelation(() => manager.replaceColumn(name, newDef));
    } catch (err) {
      const typedError =
        err instanceof DerivedColumnError
          ? err
          : new DerivedColumnError(err instanceof Error ? err.message : String(err), {
              code: 'EXPRESSION_INVALID',
              cause: err,
            });
      return { success: false, error: typedError };
    }

    // Drop the result if the table was destroyed or given new data during
    // the await.
    if (this.destroyed) {
      return {
        success: false,
        error: new DerivedColumnError('DataTable is destroyed', { code: 'DESTROYED' }),
      };
    }
    if (epoch !== this.loadEpoch) return { success: false, error: supersededError(name) };

    // Push to undo stack AFTER DuckDB success, BEFORE state mutation.
    this.pushDerivedUndo();

    const typeChanged = oldEntry.type !== info.detectedType;

    batch(() => {
      this.state.derivedColumns.set(
        this.state.derivedColumns.get().map((d) => (d.name === name ? newDef : d)),
      );

      const newSchemaEntry: ColumnSchema = {
        name: newDef.name,
        type: info.detectedType,
        nullable: true,
        originalType: info.detectedOriginalType,
        isDerived: true,
        expression: newDef.kind === 'expression' ? newDef.expression : undefined,
      };
      this.state.schema.set(currentSchema.map((c) => (c.name === name ? newSchemaEntry : c)));

      if (typeChanged) {
        const filters = this.state.filters.get();
        if (filters.some((f) => f.column === name)) {
          this.state.filters.set(filters.filter((f) => f.column !== name));
          this.onFilterRemoveCallback?.(name);
        }
      }
    });

    this.emitDerivedChange('replaced', name);

    return { success: true, info };
  }

  /**
   * Remove a derived column.
   * Cleans up filters, sorts, pins, then delegates to manager.
   *
   * Runs in its turn, as {@link addDerivedColumn} does. Rejects with
   * `NOT_FOUND` when new data is loaded before the removal has landed.
   */
  async removeDerivedColumn(name: string): Promise<void> {
    this.throwIfDestroyed('removeDerivedColumn');
    const epoch = this.loadEpoch;
    return this.inTurn(() => this.removeDerivedColumnInTurn(name, epoch));
  }

  /** The turn of {@link removeDerivedColumn}. */
  private async removeDerivedColumnInTurn(name: string, epoch: number): Promise<void> {
    this.throwIfDestroyed('removeDerivedColumn');
    if (epoch !== this.loadEpoch) throw supersededError(name);
    const currentSchema = this.state.schema.get();
    const entry = currentSchema.find((c) => c.name === name);
    if (!entry?.isDerived) {
      throw new DerivedColumnError(`Column "${name}" is not a derived column`, {
        code: 'NOT_FOUND',
        details: { column: name },
      });
    }

    const manager = this.ensureDerivedManager();
    await this.changeRelation(() => manager.removeColumn(name));
    this.throwIfDestroyed('removeDerivedColumn');
    if (epoch !== this.loadEpoch) throw supersededError(name);

    // Push to undo stack AFTER DuckDB success, BEFORE state mutation
    this.pushDerivedUndo();

    batch(() => {
      // Remove from derivedColumns
      this.state.derivedColumns.set(this.state.derivedColumns.get().filter((d) => d.name !== name));

      // Remove from schema
      this.state.schema.set(currentSchema.filter((c) => c.name !== name));

      // Remove from visibleColumns
      this.state.visibleColumns.set(this.state.visibleColumns.get().filter((c) => c !== name));

      // Remove from columnOrder
      this.state.columnOrder.set(this.state.columnOrder.get().filter((c) => c !== name));

      // Remove from columnWidths
      const widths = new Map(this.state.columnWidths.get());
      widths.delete(name);
      this.state.columnWidths.set(widths);

      // Remove from columnHeaderTooltips
      const tooltips = new Map(this.state.columnHeaderTooltips.get());
      if (tooltips.delete(name)) {
        this.state.columnHeaderTooltips.set(tooltips);
      }

      // Remove from pinnedColumns
      this.state.pinnedColumns.set(this.state.pinnedColumns.get().filter((c) => c !== name));

      // Remove from hiddenColumnInfo
      const hiddenInfo = new Map(this.state.hiddenColumnInfo.get());
      hiddenInfo.delete(name);
      this.state.hiddenColumnInfo.set(hiddenInfo);

      // Remove filters for this column
      const filters = this.state.filters.get();
      if (filters.some((f) => f.column === name)) {
        this.state.filters.set(filters.filter((f) => f.column !== name));
        this.onFilterRemoveCallback?.(name);
      }

      // Remove from sortColumns
      this.state.sortColumns.set(this.state.sortColumns.get().filter((s) => s.column !== name));

      // Switch tableName: revert to base if no more derived columns
      this.state.tableName.set(manager.getEffectiveTableName());
    });

    this.emitDerivedChange('removed', name);
  }

  /**
   * Return the values of a single column as an in-memory array, honoring the
   * current effective table (base or derived-column VIEW), the requested
   * scope, and optional pagination.
   *
   * Values are returned in stable `__rowid__` order for `scope: 'all'` and
   * `scope: 'filtered'`. For `scope: 'selected'` the values are returned in
   * positional order within the current filter/sort view (same semantics as
   * the export "selected rows" scope) — not strict selection insertion order.
   *
   * Numeric columns materialize into the narrowest sensible typed array:
   * - DuckDB `BIGINT` / `HUGEINT` → `BigInt64Array`
   * - other integer types → `Int32Array`
   * - `FLOAT` / `DOUBLE` / `DECIMAL` → `Float64Array`
   * - all other types → `unknown[]`
   *
   * If any returned row carries a `NULL` value, the function falls back to
   * `unknown[]` regardless of declared type so that `null` is preserved (the
   * typed-array packed form would coerce `null` to `0`, which is ambiguous).
   *
   * The reserved `__rowid__` column is retrievable by name; the loaders
   * always cast its synthesized `row_number()` to `BIGINT` (the conditional
   * INTEGER/BIGINT cast described in the original spec was never wired up;
   * the always-BIGINT shape is kept for simplicity and consistency across
   * loaders). Values come back as `BigInt64Array`. For plain-number
   * consumption, coerce with `Number(bigint)` (lossless for rowids below
   * `Number.MAX_SAFE_INTEGER`).
   *
   * @example
   * const rowIds = await table.actions.getColumnValues('__rowid__');
   * // rowIds is BigInt64Array. Convert a single value: Number(rowIds[0]).
   *
   * @example
   * await table.actions.addFilter({ type: 'range', column: 'age', min: 18 });
   * const adultAges = await table.actions.getColumnValues('age', { scope: 'filtered' });
   *
   * @throws `QueryError` with `code: 'COLUMN_NOT_FOUND'` when `name` is not
   *   in the current schema.
   * @throws `QueryError` with `code: 'INVALID_PAGINATION'` when `limit` or
   *   `offset` is present but not a non-negative integer.
   * @throws `QueryError` with `code: 'INVALID_ROWID'` when `scope: 'selected'`
   *   and any rowId in `state.selectedRows` is not a non-negative integer.
   * @throws `QueryError` with `code: 'NO_TABLE'` when called before any data
   *   is loaded.
   */
  async getColumnValues(
    name: string,
    opts: GetColumnValuesOptions = {},
  ): Promise<unknown[] | Int32Array | Float64Array | BigInt64Array> {
    this.throwIfDestroyed('getColumnValues');
    const schema = this.state.schema.get();
    const entry = schema.find((c) => c.name === name);
    if (!entry) {
      throw new QueryError(`Column "${name}" not found`, {
        code: 'COLUMN_NOT_FOUND',
        details: { column: name },
      });
    }

    const { limit, offset, scope = 'all', signal } = opts;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw new QueryError(`Invalid limit: ${limit} (must be a non-negative integer)`, {
        code: 'INVALID_PAGINATION',
        details: { limit },
      });
    }
    if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
      throw new QueryError(`Invalid offset: ${offset} (must be a non-negative integer)`, {
        code: 'INVALID_PAGINATION',
        details: { offset },
      });
    }

    const tbl = this.state.tableName.get();
    if (!tbl) {
      throw new QueryError('No table loaded', { code: 'NO_TABLE' });
    }

    const pagination =
      (limit !== undefined ? ` LIMIT ${limit}` : '') +
      (offset !== undefined ? ` OFFSET ${offset}` : '');

    let sql: string;
    let valKey: string;

    if (scope === 'selected') {
      const selected = this.state.selectedRows.get();
      if (selected.size === 0) {
        return emptyTypedResult(entry);
      }
      const indices = Array.from(selected);
      for (const idx of indices) {
        if (!Number.isInteger(idx) || idx < 0) {
          throw new QueryError(
            `Invalid rowId in selectedRows: ${idx} (must be a non-negative integer)`,
            { code: 'INVALID_ROWID', details: { rowId: idx } },
          );
        }
      }
      const baseSql = buildSelectedRowsQuery(
        tbl,
        [name],
        this.state.filters.get(),
        this.state.sortColumns.get(),
        indices,
      );
      sql = pagination ? `SELECT * FROM (${baseSql})${pagination}` : baseSql;
      valKey = name;
    } else {
      const quotedCol = quoteIdentifier(name);
      const quotedTbl = quoteIdentifier(tbl);
      const filtersFragment =
        scope === 'filtered' ? filtersToWhereClause(this.state.filters.get()) : '';
      const where = filtersFragment ? ` WHERE ${filtersFragment}` : '';
      // Skip ORDER BY when scope='all' has no filter and no sort: the loaders
      // inject __rowid__ in scan order, so the natural scan order already
      // matches and an explicit ORDER BY would be a redundant N log N pass.
      const needsExplicitOrder =
        scope !== 'all' || where !== '' || this.state.sortColumns.get().length > 0;
      const orderBy = needsExplicitOrder ? ` ORDER BY ${quoteIdentifier(ROWID_COLUMN)}` : '';
      sql = `SELECT ${quotedCol} AS val FROM ${quotedTbl}${where}${orderBy}${pagination}`;
      valKey = 'val';
    }

    const rows = await this.bridge.query<Record<string, unknown>>(sql, signal);
    this.throwIfDestroyed('getColumnValues');
    return materializeColumn(rows, valKey, entry);
  }

  /**
   * Validate an expression without adding it. For UI preview.
   *
   * @throws `DestroyedError` if the table was destroyed before or during
   *   the call.
   */
  async validateExpression(expression: string): Promise<{
    valid: boolean;
    type?: DataType;
    originalType?: string;
    error?: string;
  }> {
    this.throwIfDestroyed('validateExpression');
    const manager = this.ensureDerivedManager();
    const result = await manager.validateExpression(expression);
    this.throwIfDestroyed('validateExpression');
    return result;
  }

  /**
   * Get completion context for expression editor autocompletion.
   */
  getCompletionContext(): CompletionContext {
    const schema = this.state.schema.get();
    if (this.derivedManager) {
      return this.derivedManager.getCompletionContext(schema);
    }
    return {
      columns: schema.map((c) => ({
        name: c.name,
        type: c.originalType,
        isDerived: c.isDerived ?? false,
      })),
    };
  }

  // =========================================
  // Row Selection Actions
  // =========================================

  /**
   * Select a row
   *
   * @param index - Row index to select
   * @param mode - Selection mode:
   *   - 'replace': Replace selection with this row (default, normal click)
   *   - 'toggle': Toggle this row in selection (Ctrl+click)
   *   - 'range': Select range from last selected to this row (Shift+click)
   */
  selectRow(index: number, mode: 'replace' | 'toggle' | 'range' = 'replace'): void {
    this.throwIfDestroyed('selectRow');
    const current = this.state.selectedRows.get();

    switch (mode) {
      case 'replace':
        if (current.size === 1 && current.has(index)) {
          // Clicking the only selected row deselects it
          this.state.selectedRows.set(new Set());
          this.lastSelectedIndex = null;
        } else {
          this.state.selectedRows.set(new Set([index]));
          this.lastSelectedIndex = index;
        }
        break;

      case 'toggle': {
        const updated = new Set(current);
        if (updated.has(index)) {
          updated.delete(index);
        } else {
          updated.add(index);
        }
        this.state.selectedRows.set(updated);
        this.lastSelectedIndex = index;
        break;
      }

      case 'range':
        if (this.lastSelectedIndex === null) {
          // No previous selection, treat as replace
          this.state.selectedRows.set(new Set([index]));
          this.lastSelectedIndex = index;
        } else {
          // Select range from lastSelectedIndex to index
          const start = Math.min(this.lastSelectedIndex, index);
          const end = Math.max(this.lastSelectedIndex, index);
          const rangeSet = new Set<number>();
          for (let i = start; i <= end; i++) {
            rangeSet.add(i);
          }
          this.state.selectedRows.set(rangeSet);
        }
        break;
    }
  }

  /**
   * Clear all row selection
   */
  clearSelection(): void {
    this.throwIfDestroyed('clearSelection');
    this.state.selectedRows.set(new Set());
    this.lastSelectedIndex = null;
  }

  /**
   * Select all rows
   */
  selectAll(): void {
    this.throwIfDestroyed('selectAll');
    const total = this.state.totalRows.get();
    const allRows = new Set<number>();
    for (let i = 0; i < total; i++) {
      allRows.add(i);
    }
    this.state.selectedRows.set(allRows);
  }

  // =========================================
  // UI State Actions
  // =========================================

  /**
   * Set hovered row
   */
  setHoveredRow(index: number | null): void {
    this.throwIfDestroyed('setHoveredRow');
    this.state.hoveredRow.set(index);
  }

  /**
   * Set hovered column
   */
  setHoveredColumn(column: string | null): void {
    this.throwIfDestroyed('setHoveredColumn');
    this.state.hoveredColumn.set(column);
  }

  // =========================================
  // Cell Focus Actions
  // =========================================

  /**
   * Set focused cell for keyboard navigation. Not undoable.
   */
  setFocusedCell(cell: { row: number; column: string } | null): void {
    this.throwIfDestroyed('setFocusedCell');
    this.state.focusedCell.set(cell);
  }

  /**
   * Clear focused cell.
   */
  clearFocusedCell(): void {
    this.throwIfDestroyed('clearFocusedCell');
    this.state.focusedCell.set(null);
  }
}

// ---------------------------------------------------------------------------
// Column-order helpers (supporting showColumn).
// ---------------------------------------------------------------------------

/** How many of `visible`'s leading columns are pinned. */
function leadingPinnedCount(visible: readonly string[], pinned: readonly string[]): number {
  const pinnedSet = new Set(pinned);
  let count = 0;
  while (count < visible.length && pinnedSet.has(visible[count]!)) count++;
  return count;
}

/**
 * `order` with `column` moved, only if it has to be, so that `visible` stays
 * a subsequence of it.
 *
 * `aria-colindex` numbers columns by their place in `columnOrder` and has to
 * ascend along a row, so a column shown between two neighbours must sit
 * between them in `columnOrder` too. The restore position `showColumn` picks
 * is where the column was when it was hidden, which a later reorder or pin
 * may have moved in `columnOrder`. Returns `order` itself when nothing moves.
 *
 * A moved column goes straight before its new right neighbour. Only a column
 * shown last goes after its left neighbour, and then past any pinned columns
 * that follow it: `columnOrder` keeps every pinned column, hidden ones too,
 * ahead of the rest, which `toggleColumnPin` and `showAllColumns` rely on.
 */
function alignOrderWithVisible(
  order: string[],
  visible: readonly string[],
  column: string,
  pinned: readonly string[],
): string[] {
  const at = visible.indexOf(column);
  const prev = at > 0 ? visible[at - 1] : undefined;
  const next = at >= 0 && at < visible.length - 1 ? visible[at + 1] : undefined;
  const position = order.indexOf(column);
  const prevPosition = prev === undefined ? -1 : order.indexOf(prev);
  const nextPosition = next === undefined ? order.length : order.indexOf(next);
  // A neighbour missing from `order` means the state was already out of
  // step; moving `column` would not repair it.
  if (position < 0 || (prev !== undefined && prevPosition < 0) || nextPosition < 0) return order;
  if (prevPosition < position && position < nextPosition) return order;

  const moved = order.filter((c) => c !== column);
  let insertAt: number;
  if (next !== undefined) {
    insertAt = moved.indexOf(next);
  } else {
    insertAt = moved.indexOf(prev!) + 1;
    if (!pinned.includes(column)) {
      while (insertAt < moved.length && pinned.includes(moved[insertAt]!)) insertAt++;
    }
  }
  moved.splice(insertAt, 0, column);
  return moved;
}

// ---------------------------------------------------------------------------
// Column-value materialization helpers (supporting getColumnValues).
// ---------------------------------------------------------------------------

function isBigIntOriginalType(originalType: string): boolean {
  return /BIGINT|HUGEINT/i.test(originalType);
}

function emptyTypedResult(
  schema: ColumnSchema,
): unknown[] | Int32Array | Float64Array | BigInt64Array {
  if (schema.type === 'integer') {
    return isBigIntOriginalType(schema.originalType) ? new BigInt64Array(0) : new Int32Array(0);
  }
  if (schema.type === 'float' || schema.type === 'decimal') {
    return new Float64Array(0);
  }
  return [];
}

function materializeColumn(
  rows: Record<string, unknown>[],
  key: string,
  schema: ColumnSchema,
): unknown[] | Int32Array | Float64Array | BigInt64Array {
  const len = rows.length;

  // Detect NULLs (DuckDB's JS layer surfaces SQL NULL as JS null/undefined).
  // Typed arrays cannot represent null, so any NULL forces a fallback to
  // unknown[] to keep the semantic distinction intact.
  // i < len, so rows[i] is defined; assertions encode the invariant.
  let hasNull = false;
  for (let i = 0; i < len; i++) {
    if (rows[i]![key] == null) {
      hasNull = true;
      break;
    }
  }
  if (hasNull) {
    return rows.map((r) => r[key]);
  }

  if (schema.type === 'integer') {
    if (isBigIntOriginalType(schema.originalType)) {
      const arr = new BigInt64Array(len);
      for (let i = 0; i < len; i++) {
        const v = rows[i]![key];
        arr[i] = typeof v === 'bigint' ? v : BigInt(v as number | string);
      }
      return arr;
    }
    const arr = new Int32Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = Number(rows[i]![key]);
    }
    return arr;
  }

  if (schema.type === 'float' || schema.type === 'decimal') {
    const arr = new Float64Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = Number(rows[i]![key]);
    }
    return arr;
  }

  return rows.map((r) => r[key]);
}
