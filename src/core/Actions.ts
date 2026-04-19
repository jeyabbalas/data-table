/**
 * State Actions
 *
 * Provides methods to manipulate TableState. This is the command/action layer
 * that encapsulates state mutations, making it easy for UI components and
 * external code to interact with the table state.
 */

import type { TableState, HiddenColumnInfo } from './State';
import { resetTableState, initializeColumnsFromSchema } from './State';
import type { Filter, FilterType, RawSQLFilter, SortColumn, ColumnSchema, DataType } from './types';
import { filtersToWhereClause, quoteIdentifier } from '../filters/FilterSQL';
import type { WorkerBridge } from '../data/WorkerBridge';
import { DataLoader, type DataLoaderOptions } from '../data/DataLoader';
import type { SessionStore } from '../persistence/SessionStore';
import { restoreStateFromSnapshot } from '../persistence/serialization';
import { UndoManager, captureSnapshot, applySnapshot, derivedColumnsEqual } from './UndoManager';
import type { StateSnapshot } from './UndoManager';
import { batch } from './Signal';
import { DerivedColumnManager } from '../derived/DerivedColumnManager';
import type { DerivedColumnDef, CompletionContext } from '../derived/types';
import type { FilterPresetManager } from '../filters/FilterPresets';
import { attachCacheInvalidation } from '../data/QueryCache';
import {
  ConfigurationError,
  DerivedColumnError,
  SQLValidationError,
} from './errors';

/**
 * Options for loading data
 */
export interface LoadDataOptions extends DataLoaderOptions {
  /** If provided, restores saved session state after loading */
  sessionStore?: SessionStore;
  /** If provided, restores saved filter presets after loading */
  presetManager?: FilterPresetManager;
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
  private undoRedoInProgress = false;
  private widthDragSnapshot: StateSnapshot | null = null;
  private onFilterRemoveCallback?: (column: string) => void;
  private initialSnapshot: StateSnapshot | null = null;
  private derivedManager: DerivedColumnManager | null = null;

  constructor(
    private state: TableState,
    bridge: WorkerBridge,
    undoManager?: UndoManager
  ) {
    this.bridge = bridge;
    this.loader = new DataLoader(bridge);
    this.undoManager = undoManager;
    attachCacheInvalidation(bridge, state);
  }

  // =========================================
  // Undo/Redo
  // =========================================

  /** Capture state snapshot before a mutation, if undo is enabled */
  private captureForUndo(): void {
    if (!this.undoManager || this.suppressUndoCapture) return;
    this.undoManager.push(captureSnapshot(this.state));
  }

  /**
   * Set a callback invoked for each column whose filter is removed by undo/redo.
   * Use this to clear visualization interaction state (brush, selection) that
   * lives outside the signal-driven state.
   */
  setOnFilterRemove(callback: (column: string) => void): void {
    this.onFilterRemoveCallback = callback;
  }

  /** Notify callback for each column that lost its filter between two states */
  private notifyRemovedFilters(before: Filter[], after: Filter[]): void {
    if (!this.onFilterRemoveCallback) return;
    const afterColumns = new Set(after.map(f => f.column));
    for (const f of before) {
      if (!afterColumns.has(f.column)) {
        this.onFilterRemoveCallback(f.column);
      }
    }
  }

  /**
   * Undo the last undoable action. Returns true if state was restored.
   * Async because derived column changes require DuckDB VIEW reconciliation.
   */
  async undo(): Promise<boolean> {
    if (this.undoRedoInProgress) return false;
    if (!this.undoManager?.canUndo) return false;
    this.undoRedoInProgress = true;
    this.suppressUndoCapture = true;
    try {
      const prevDerived = this.state.derivedColumns.get();
      const prevFilters = this.state.filters.get();
      const current = captureSnapshot(this.state);
      const snapshot = this.undoManager.undo(current);
      if (!snapshot) return false;

      const derivedChanged = !derivedColumnsEqual(prevDerived, snapshot.derivedColumns);

      // Reconcile DuckDB state BEFORE applying snapshot signals.
      // This ensures VIEW exists before visibleColumns/columnOrder reference derived cols.
      if (derivedChanged) {
        await this.reconcileDerivedColumns(snapshot);
      }

      // Apply view-state signals + tableName atomically in a single batch
      batch(() => {
        applySnapshot(this.state, snapshot);
        if (derivedChanged) {
          const baseTable = this.state.baseTableName.get();
          this.state.tableName.set(
            snapshot.derivedColumns.length > 0
              ? this.derivedManager!.getEffectiveTableName()
              : baseTable!
          );
        }
      });

      this.notifyRemovedFilters(prevFilters, this.state.filters.get());
      return true;
    } finally {
      this.suppressUndoCapture = false;
      this.undoRedoInProgress = false;
    }
  }

  /**
   * Redo the last undone action. Returns true if state was restored.
   * Async because derived column changes require DuckDB VIEW reconciliation.
   */
  async redo(): Promise<boolean> {
    if (this.undoRedoInProgress) return false;
    if (!this.undoManager?.canRedo) return false;
    this.undoRedoInProgress = true;
    this.suppressUndoCapture = true;
    try {
      const prevDerived = this.state.derivedColumns.get();
      const prevFilters = this.state.filters.get();
      const current = captureSnapshot(this.state);
      const snapshot = this.undoManager.redo(current);
      if (!snapshot) return false;

      const derivedChanged = !derivedColumnsEqual(prevDerived, snapshot.derivedColumns);

      if (derivedChanged) {
        await this.reconcileDerivedColumns(snapshot);
      }

      batch(() => {
        applySnapshot(this.state, snapshot);
        if (derivedChanged) {
          const baseTable = this.state.baseTableName.get();
          this.state.tableName.set(
            snapshot.derivedColumns.length > 0
              ? this.derivedManager!.getEffectiveTableName()
              : baseTable!
          );
        }
      });

      this.notifyRemovedFilters(prevFilters, this.state.filters.get());
      return true;
    } finally {
      this.suppressUndoCapture = false;
      this.undoRedoInProgress = false;
    }
  }

  /**
   * Begin a column width drag sequence.
   * Captures state once at drag start for undo.
   */
  beginColumnWidthChange(): void {
    if (!this.undoManager) return;
    this.widthDragSnapshot = captureSnapshot(this.state);
  }

  /**
   * End a column width drag sequence.
   * Pushes the pre-drag snapshot to the undo stack.
   */
  endColumnWidthChange(): void {
    if (!this.undoManager || !this.widthDragSnapshot) return;
    this.undoManager.push(this.widthDragSnapshot);
    this.widthDragSnapshot = null;
  }

  /** Get the UndoManager instance, if one was provided */
  getUndoManager(): UndoManager | undefined {
    return this.undoManager;
  }

  /**
   * Reset to the original state captured at data-load time.
   * Clears all filters, sorts, column customizations, derived columns,
   * and the undo/redo stacks. Returns true if state was restored.
   */
  async resetToInitial(): Promise<boolean> {
    if (!this.initialSnapshot) return false;
    this.suppressUndoCapture = true;
    try {
      const prevFilters = this.state.filters.get();

      // Destroy derived columns BEFORE batch (async DuckDB operation)
      if (this.derivedManager) {
        try { await this.derivedManager.destroy(); } catch { /* best-effort cleanup */ }
        this.derivedManager = null;
      }

      // Collect derived column names from snapshot to strip after restore.
      // The initial snapshot may include derived columns from session restore.
      const derivedNames = new Set(
        this.initialSnapshot.derivedColumns.map(d => d.name)
      );

      // Apply snapshot + clean up derived refs + reset tableName atomically
      batch(() => {
        applySnapshot(this.state, this.initialSnapshot!);

        this.state.derivedColumns.set([]);
        this.state.schema.set(
          this.state.schema.get().filter(c => !c.isDerived)
        );

        const baseTableName = this.state.baseTableName.get();
        if (baseTableName) {
          this.state.tableName.set(baseTableName);
        }

        // Strip derived column names from all column arrays restored by applySnapshot
        this.stripDerivedColumnRefs(derivedNames);

        // Reset filteredRows when initial state has no filters
        if (this.initialSnapshot!.filters.length === 0) {
          this.state.filteredRows.set(this.state.totalRows.get());
        }
      });

      this.notifyRemovedFilters(prevFilters, this.state.filters.get());
      this.undoManager?.clear();

      return true;
    } finally {
      this.suppressUndoCapture = false;
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
   * @param source - File, URL string, or raw data (ArrayBuffer for Parquet; string for CSV/JSON)
   * @param options - Loading options (tableName, format)
   */
  async loadData(
    source: File | string | ArrayBuffer,
    options: LoadDataOptions = {}
  ): Promise<void> {
    // Reset state for new data
    resetTableState(this.state);
    this.undoManager?.clear();

    // Load data - schema is included in the result (no more blocking queries!)
    const result = await this.loader.load(source, options);

    // Clean up any previous derived column manager
    if (this.derivedManager) {
      this.derivedManager.destroy().catch(() => {});
      this.derivedManager = null;
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
      if (snapshot) {
        restoreStateFromSnapshot(this.state, snapshot, this.undoManager, options.presetManager);

        // Recreate derived columns (VIEW + helper tables) if snapshot has them
        if (snapshot.derivedColumns && snapshot.derivedColumns.length > 0) {
          try {
            const manager = this.ensureDerivedManager();
            const restoredSchemas = await manager.restoreColumns(
              this.state.derivedColumns.get()
            );

            if (restoredSchemas.length > 0) {
              // Compute values needed for the batch
              const baseSchema = this.state.schema.get().filter(c => !c.isDerived);
              const restoredNames = new Set(restoredSchemas.map(s => s.name));
              const allSnapshotDerived = new Set(snapshot.derivedColumns!.map(d => d.name));
              const failedNames = new Set(
                [...allSnapshotDerived].filter(n => !restoredNames.has(n))
              );

              // Batch all state mutations so render() sees fully settled state.
              // Without this, schema.set triggers render() before tableName
              // points to the VIEW, causing the initial fetch to fail.
              batch(() => {
                this.state.schema.set([...baseSchema, ...restoredSchemas]);
                this.state.tableName.set(manager.getEffectiveTableName());
                this.state.derivedColumns.set(
                  this.state.derivedColumns.get().filter(d => restoredNames.has(d.name))
                );
                this.stripDerivedColumnRefs(failedNames);
              });
            }
          } catch (err) {
            console.warn('Failed to restore derived columns:', err);
            // All derived columns failed — clean up all references from state
            const derivedNames = new Set(snapshot.derivedColumns!.map(d => d.name));
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
    this.captureForUndo();
    const current = this.state.filters.get();
    const existingIndex = current.findIndex(
      (f) => f.column === filter.column
    );

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
   * @param column - Column name
   * @param type - Optional filter type to remove (if not specified, removes all filters for column)
   */
  removeFilter(column: string, type?: FilterType): void {
    this.captureForUndo();
    const current = this.state.filters.get();
    const updated = current.filter((f) =>
      type ? !(f.column === column && f.type === type) : f.column !== column
    );
    this.state.filters.set(updated);
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.captureForUndo();
    this.state.filters.set([]);
    this.state.filteredRows.set(this.state.totalRows.get());
  }

  /**
   * Load a filter preset: replace all filters (and optionally sort) in one
   * undo step. Uses suppressUndoCapture + batch() so Ctrl+Z restores the
   * entire pre-load state atomically.
   */
  loadFilterPreset(filters: Filter[], sortColumns?: SortColumn[]): void {
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
  }

  // =========================================
  // Raw SQL Filter Actions
  // =========================================

  /**
   * Add a raw SQL filter. Does NOT re-validate — caller is responsible
   * for validation (see validateSQLFilter). Creates a RawSQLFilter with
   * a unique id and synthetic column key, appends to state.filters.
   * Captures undo snapshot before mutation.
   * @returns The filter's unique id
   */
  addRawSQLFilter(sql: string, label?: string): string {
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
    if (!sql.trim()) {
      throw new SQLValidationError('SQL expression must not be empty', {
        code: 'SQL_SYNTAX',
      });
    }
    const syntheticKey = `__raw_sql_${id}__`;
    const current = this.state.filters.get();
    const index = current.findIndex(f => f.column === syntheticKey);
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
    const syntheticKey = `__raw_sql_${id}__`;
    this.removeFilter(syntheticKey);
  }

  /**
   * Get all active raw SQL filters. Convenience getter.
   */
  getRawSQLFilters(): RawSQLFilter[] {
    return this.state.filters.get().filter(
      (f): f is RawSQLFilter => f.type === 'raw-sql'
    );
  }

  /**
   * Validate a SQL WHERE clause fragment. Runs the SQL against DuckDB
   * and returns validity, match count, and any error message.
   * Used by the SQL filter modal's Validate button (Task 8.9).
   */
  async validateSQLFilter(sql: string, signal?: AbortSignal): Promise<{
    valid: boolean;
    matchCount?: number;
    error?: string;
  }> {
    const tableName = this.state.tableName.get();
    if (!tableName) return { valid: false, error: 'No table loaded' };
    try {
      const result = await this.bridge.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM ${quoteIdentifier(tableName)} WHERE (${sql})`,
        signal
      );
      return { valid: true, matchCount: Number(result[0].cnt) };
    } catch (e) {
      // Silently return for aborted requests — the caller has moved on
      if (signal?.aborted) return { valid: false, error: 'Validation cancelled' };
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
    this.captureForUndo();
    this.state.sortColumns.set(columns);
  }

  /**
   * Toggle sort for a single column (cycles: none → asc → desc → none)
   *
   * Replaces any existing sort with the new column.
   */
  toggleSort(column: string): void {
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
    this.captureForUndo();
    const current = this.state.sortColumns.get();
    const existingIndex = current.findIndex((s) => s.column === column);

    if (existingIndex === -1) {
      // Add new sort column
      this.state.sortColumns.set([...current, { column, direction: 'asc' }]);
    } else {
      const updated = [...current];
      const existing = updated[existingIndex];
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
    const visible = this.state.visibleColumns.get();
    if (!visible.includes(column)) return;

    // Don't allow hiding the last visible column
    if (visible.length <= 1) return;

    this.captureForUndo();

    // Record neighbor info before hiding
    const colIndex = visible.indexOf(column);
    const leftNeighbor = colIndex > 0 ? visible[colIndex - 1] : null;
    const rightNeighbor =
      colIndex < visible.length - 1 ? visible[colIndex + 1] : null;

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

    const newVisible = [...visible];
    newVisible.splice(insertIndex, 0, column);
    this.state.visibleColumns.set(newVisible);

    // Remove from hiddenColumnInfo
    if (info) {
      const updated = new Map(hiddenMap);
      updated.delete(column);
      this.state.hiddenColumnInfo.set(updated);
    }
  }

  /**
   * Show all hidden columns, restoring them in columnOrder
   */
  showAllColumns(): void {
    this.captureForUndo();
    const order = this.state.columnOrder.get();
    this.state.visibleColumns.set([...order]);
    this.state.hiddenColumnInfo.set(new Map());
  }

  /**
   * Compute restore index using columnOrder-based positioning (fallback)
   */
  private computeOrderBasedIndex(
    visible: string[],
    order: string[],
    column: string
  ): number {
    const orderIndex = order.indexOf(column);
    let insertIndex = 0;
    for (let i = 0; i < orderIndex; i++) {
      if (visible.includes(order[i])) {
        insertIndex++;
      }
    }
    return insertIndex;
  }

  /**
   * Compute restore index using neighbor-aware logic
   */
  private computeRestoreIndex(
    visible: string[],
    order: string[],
    info: HiddenColumnInfo
  ): number {
    const { leftNeighbor, rightNeighbor } = info;
    const leftIdx =
      leftNeighbor !== null ? visible.indexOf(leftNeighbor) : -1;
    const rightIdx =
      rightNeighbor !== null ? visible.indexOf(rightNeighbor) : -1;
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
        const candidate = order[colOrderIdx + dist];
        const candidateIdx = visible.indexOf(candidate);
        if (candidateIdx !== -1) {
          return candidateIdx; // Insert before this visible column
        }
      }
      // Check left
      if (colOrderIdx - dist >= 0) {
        const candidate = order[colOrderIdx - dist];
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
   * Also reorders visible columns to match the new order.
   * Preserves hidden columns in columnOrder at their relative positions.
   */
  setColumnOrder(columns: string[]): void {
    this.captureForUndo();
    const currentOrder = this.state.columnOrder.get();
    const columnsSet = new Set(columns);

    // Find columns in currentOrder that are NOT in the incoming list (hidden columns)
    const missingColumns = currentOrder.filter((c) => !columnsSet.has(c));

    if (missingColumns.length > 0) {
      // Merge hidden columns back at their relative positions
      const fullOrder = [...columns];
      for (const missing of missingColumns) {
        const oldIndex = currentOrder.indexOf(missing);
        // Find the nearest column to the right in currentOrder that is in fullOrder
        let insertIndex = fullOrder.length; // default: append at end
        for (let i = oldIndex + 1; i < currentOrder.length; i++) {
          const idx = fullOrder.indexOf(currentOrder[i]);
          if (idx !== -1) {
            insertIndex = idx;
            break;
          }
        }
        fullOrder.splice(insertIndex, 0, missing);
      }
      this.state.columnOrder.set(fullOrder);
    } else {
      this.state.columnOrder.set(columns);
    }

    // Reorder visible columns to match
    const visible = this.state.visibleColumns.get();
    const newOrder = this.state.columnOrder.get();
    const reorderedVisible = newOrder.filter((c) => visible.includes(c));
    this.state.visibleColumns.set(reorderedVisible);
  }

  /**
   * Toggle column pin status
   *
   * When pinning, moves the column to the end of the pinned group (leftmost columns).
   * When unpinning, moves the column to the first unpinned position.
   * Also updates columnOrder and visibleColumns to reflect the new position.
   */
  toggleColumnPin(column: string): void {
    this.captureForUndo();
    const pinned = this.state.pinnedColumns.get();
    const order = this.state.columnOrder.get();
    const isPinned = pinned.includes(column);

    // Suppress undo capture for the internal setColumnOrder call
    this.suppressUndoCapture = true;
    try {
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
    } finally {
      this.suppressUndoCapture = false;
    }
  }

  /**
   * Set column width
   */
  setColumnWidth(column: string, width: number): void {
    const widths = new Map(this.state.columnWidths.get());
    widths.set(column, width);
    this.state.columnWidths.set(widths);
  }

  /**
   * Reset column width to default
   */
  resetColumnWidth(column: string): void {
    this.captureForUndo();
    const widths = new Map(this.state.columnWidths.get());
    widths.delete(column);
    this.state.columnWidths.set(widths);
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
      this.state.filters.set(
        this.state.filters.get().filter(f => !names.has(f.column))
      );
      this.state.sortColumns.set(
        this.state.sortColumns.get().filter(s => !names.has(s.column))
      );
      this.state.visibleColumns.set(
        this.state.visibleColumns.get().filter(c => !names.has(c))
      );
      this.state.columnOrder.set(
        this.state.columnOrder.get().filter(c => !names.has(c))
      );
      this.state.pinnedColumns.set(
        this.state.pinnedColumns.get().filter(c => !names.has(c))
      );
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
        throw new ConfigurationError(
          'Cannot create derived columns before data is loaded',
          { code: 'BRIDGE_NOT_READY' },
        );
      }
      this.derivedManager = new DerivedColumnManager(this.bridge, baseTableName);
    }
    return this.derivedManager;
  }

  /**
   * Reconcile DuckDB VIEW state after undo/redo changes derived columns.
   * Destroys the existing manager and either recreates with the snapshot's
   * derived columns, or leaves the table in base-table mode.
   */
  private async reconcileDerivedColumns(snapshot: StateSnapshot): Promise<void> {
    // 1. Destroy existing manager (drops VIEW + helper tables)
    if (this.derivedManager) {
      await this.derivedManager.destroy();
      this.derivedManager = null;
    }

    // 2. Update schema: remove old derived entries
    const baseSchema = this.state.schema.get().filter(c => !c.isDerived);

    if (snapshot.derivedColumns.length > 0) {
      // 3. Create new manager, restore columns
      const manager = this.ensureDerivedManager();
      const restoredSchemas = await manager.restoreColumns(snapshot.derivedColumns);

      // 4. Update schema with restored derived entries
      this.state.schema.set([...baseSchema, ...restoredSchemas]);

      // 5. Update derivedColumns signal (filtered to only successfully restored)
      const restoredNames = new Set(restoredSchemas.map(s => s.name));
      this.state.derivedColumns.set(
        snapshot.derivedColumns.filter(d => restoredNames.has(d.name))
      );
    } else {
      this.state.schema.set(baseSchema);
      this.state.derivedColumns.set([]);
    }
  }

  /**
   * Add a derived column (expression or vector).
   * Validates name uniqueness, creates VIEW, updates state.
   */
  async addDerivedColumn(def: DerivedColumnDef): Promise<{ success: boolean; error?: string }> {
    // Validate name uniqueness against all columns
    const allColumnNames = this.state.schema.get().map(c => c.name);
    if (allColumnNames.includes(def.name)) {
      return { success: false, error: `Column name "${def.name}" already exists` };
    }

    if (!def.name.trim()) {
      return { success: false, error: 'Column name cannot be empty' };
    }

    // Capture undo snapshot locally — only push after success
    const preSnapshot = this.undoManager && !this.suppressUndoCapture
      ? captureSnapshot(this.state) : null;

    try {
      const manager = this.ensureDerivedManager();
      const info = await manager.addColumn(def);

      // Push to undo stack AFTER DuckDB success, BEFORE state mutation
      if (preSnapshot && this.undoManager) {
        this.undoManager.push(preSnapshot);
      }

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
   */
  async updateDerivedColumn(
    oldName: string,
    def: DerivedColumnDef
  ): Promise<{ success: boolean; error?: string }> {
    // Validate target is derived
    const currentSchema = this.state.schema.get();
    const oldEntry = currentSchema.find(c => c.name === oldName);
    if (!oldEntry?.isDerived) {
      return { success: false, error: `Column "${oldName}" is not a derived column` };
    }

    // If renaming, validate new name uniqueness (excluding self)
    const isRename = oldName !== def.name;
    if (isRename) {
      const otherNames = currentSchema.filter(c => c.name !== oldName).map(c => c.name);
      if (otherNames.includes(def.name)) {
        return { success: false, error: `Column name "${def.name}" already exists` };
      }
    }

    if (!def.name.trim()) {
      return { success: false, error: 'Column name cannot be empty' };
    }

    // Capture undo snapshot locally — only push after success
    const preSnapshot = this.undoManager && !this.suppressUndoCapture
      ? captureSnapshot(this.state) : null;

    try {
      const manager = this.ensureDerivedManager();
      const info = await manager.updateColumn(oldName, def);

      // Push to undo stack AFTER DuckDB success, BEFORE state mutation
      if (preSnapshot && this.undoManager) {
        this.undoManager.push(preSnapshot);
      }

      const typeChanged = oldEntry.type !== info.detectedType;

      batch(() => {
        // Update derivedColumns list
        this.state.derivedColumns.set(
          this.state.derivedColumns.get().map(d => d.name === oldName ? def : d)
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
        this.state.schema.set(
          currentSchema.map(c => c.name === oldName ? newSchemaEntry : c)
        );

        if (isRename) {
          // Update all state references
          this.state.visibleColumns.set(
            this.state.visibleColumns.get().map(c => c === oldName ? def.name : c)
          );
          this.state.columnOrder.set(
            this.state.columnOrder.get().map(c => c === oldName ? def.name : c)
          );

          // columnWidths
          const widths = new Map(this.state.columnWidths.get());
          if (widths.has(oldName)) {
            widths.set(def.name, widths.get(oldName)!);
            widths.delete(oldName);
          }
          this.state.columnWidths.set(widths);

          // pinnedColumns
          this.state.pinnedColumns.set(
            this.state.pinnedColumns.get().map(c => c === oldName ? def.name : c)
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
            this.state.sortColumns.get().map(s =>
              s.column === oldName ? { ...s, column: def.name } : s
            )
          );

          // filters: rename or remove if type changed
          const filters = this.state.filters.get();
          if (typeChanged) {
            if (filters.some(f => f.column === oldName)) {
              this.state.filters.set(filters.filter(f => f.column !== oldName));
              this.onFilterRemoveCallback?.(oldName);
            }
          } else {
            this.state.filters.set(
              filters.map(f => f.column === oldName ? { ...f, column: def.name } : f)
            );
          }
        } else if (typeChanged) {
          // Same name but type changed — remove stale filters
          const filters = this.state.filters.get();
          if (filters.some(f => f.column === def.name)) {
            this.state.filters.set(filters.filter(f => f.column !== def.name));
            this.onFilterRemoveCallback?.(def.name);
          }
        }
      });

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Remove a derived column.
   * Cleans up filters, sorts, pins, then delegates to manager.
   */
  async removeDerivedColumn(name: string): Promise<void> {
    const currentSchema = this.state.schema.get();
    const entry = currentSchema.find(c => c.name === name);
    if (!entry?.isDerived) {
      throw new DerivedColumnError(`Column "${name}" is not a derived column`, {
        code: 'NOT_FOUND',
        details: { column: name },
      });
    }

    // Capture undo snapshot locally — only push after success
    const preSnapshot = this.undoManager && !this.suppressUndoCapture
      ? captureSnapshot(this.state) : null;

    const manager = this.ensureDerivedManager();
    await manager.removeColumn(name);

    // Push to undo stack AFTER DuckDB success, BEFORE state mutation
    if (preSnapshot && this.undoManager) {
      this.undoManager.push(preSnapshot);
    }

    batch(() => {
      // Remove from derivedColumns
      this.state.derivedColumns.set(
        this.state.derivedColumns.get().filter(d => d.name !== name)
      );

      // Remove from schema
      this.state.schema.set(currentSchema.filter(c => c.name !== name));

      // Remove from visibleColumns
      this.state.visibleColumns.set(
        this.state.visibleColumns.get().filter(c => c !== name)
      );

      // Remove from columnOrder
      this.state.columnOrder.set(
        this.state.columnOrder.get().filter(c => c !== name)
      );

      // Remove from columnWidths
      const widths = new Map(this.state.columnWidths.get());
      widths.delete(name);
      this.state.columnWidths.set(widths);

      // Remove from pinnedColumns
      this.state.pinnedColumns.set(
        this.state.pinnedColumns.get().filter(c => c !== name)
      );

      // Remove from hiddenColumnInfo
      const hiddenInfo = new Map(this.state.hiddenColumnInfo.get());
      hiddenInfo.delete(name);
      this.state.hiddenColumnInfo.set(hiddenInfo);

      // Remove filters for this column
      const filters = this.state.filters.get();
      if (filters.some(f => f.column === name)) {
        this.state.filters.set(filters.filter(f => f.column !== name));
        this.onFilterRemoveCallback?.(name);
      }

      // Remove from sortColumns
      this.state.sortColumns.set(
        this.state.sortColumns.get().filter(s => s.column !== name)
      );

      // Switch tableName: revert to base if no more derived columns
      this.state.tableName.set(manager.getEffectiveTableName());
    });
  }

  /**
   * Validate an expression without adding it. For UI preview.
   */
  async validateExpression(expression: string): Promise<{
    valid: boolean;
    type?: DataType;
    originalType?: string;
    error?: string;
  }> {
    const manager = this.ensureDerivedManager();
    return manager.validateExpression(expression);
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
      columns: schema.map(c => ({
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
  selectRow(
    index: number,
    mode: 'replace' | 'toggle' | 'range' = 'replace'
  ): void {
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
    this.state.selectedRows.set(new Set());
    this.lastSelectedIndex = null;
  }

  /**
   * Select all rows
   */
  selectAll(): void {
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
    this.state.hoveredRow.set(index);
  }

  /**
   * Set hovered column
   */
  setHoveredColumn(column: string | null): void {
    this.state.hoveredColumn.set(column);
  }

  // =========================================
  // Cell Focus Actions
  // =========================================

  /**
   * Set focused cell for keyboard navigation. Not undoable.
   */
  setFocusedCell(cell: { row: number; column: string } | null): void {
    this.state.focusedCell.set(cell);
  }

  /**
   * Clear focused cell.
   */
  clearFocusedCell(): void {
    this.state.focusedCell.set(null);
  }
}
