/**
 * DataTable — high-level facade over the library's modular API.
 *
 * Wires together everything a typical embedder needs (worker bridge,
 * reactive state, actions, UI container, visualizations, crossfilter,
 * undo/redo, session persistence, filter presets, export dialog) and
 * exposes a single object with a typed event bus and a unified
 * `destroy()` method.
 *
 * The modular classes (`WorkerBridge`, `TableContainer`, etc.) remain
 * exported for power users who want to orchestrate things manually.
 *
 * @example
 * ```ts
 * import { createDataTable } from '@jeyabbalas/data-table';
 * import '@jeyabbalas/data-table/styles';
 *
 * const table = await createDataTable({
 *   container: document.getElementById('my-table')!,
 *   source: fileOrUrl,
 *   persistence: true,
 *   presets: true,
 *   undoRedo: true,
 * });
 *
 * table.on('filterChange', ({ filters, filteredRowCount }) => {
 *   console.log(`${filters.length} filters, ${filteredRowCount} rows`);
 * });
 *
 * // Later, when unmounting:
 * await table.destroy();
 * ```
 */

import type { TableState } from './core/State';
import { createTableState } from './core/State';
import { StateActions, type LoadDataOptions } from './core/Actions';
import { UndoManager } from './core/UndoManager';
import { WorkerBridge, type WorkerBridgeOptions } from './data/WorkerBridge';
import { EventEmitter } from './core/EventEmitter';
import type { TableEvents } from './core/TableEvents';
import type { DataFormat } from './data/DataLoader';
import type { Filter, SortColumn } from './core/types';
import type { DerivedColumnDef } from './derived/types';
import type { ExpressionEditorFactory } from './derived/ExpressionEditorTypes';

import { TableContainer } from './table/TableContainer';
import { CrossfilterCoordinator } from './visualizations/CrossfilterCoordinator';
import { InteractionManager } from './visualizations/InteractionManager';
import { VisualizationFactory } from './visualizations/VisualizationFactory';
import type { BaseVisualization } from './visualizations/BaseVisualization';
import { Histogram } from './visualizations/histogram/Histogram';
import { DateHistogram } from './visualizations/histogram/DateHistogram';
import { TimeHistogram } from './visualizations/histogram/TimeHistogram';
import { IntervalHistogram } from './visualizations/histogram/IntervalHistogram';
import { ValueCounts } from './visualizations/valuecounts/ValueCounts';
import { formatDefaultStats } from './statistics/StatsFormatters';
import type { ColumnStatsData } from './statistics/ColumnStatsTypes';

import { SessionStore } from './persistence/SessionStore';
import { AutoSave } from './persistence/AutoSave';
import { FilterPresetManager } from './filters/FilterPresets';

import { ExportDialog } from './export/ExportDialog';

/**
 * Options accepted by {@link createDataTable}. All feature toggles default
 * to `true`; pass `false` (or a configuration object) to customize.
 */
export interface CreateDataTableOptions {
  /** Element that will host the table. The library takes full ownership of its contents. */
  container: HTMLElement;

  /** Optional initial data source. If omitted, call `table.loadData(source)` later. */
  source?: File | string | ArrayBuffer | Blob;
  /** Override the format detected from the source (e.g., if URL has no extension). */
  sourceFormat?: DataFormat;
  /** Table name used inside DuckDB. Auto-generated if omitted. */
  tableName?: string;

  // ---- Feature toggles ----

  /**
   * Persist UI state (filters, sort, columns, derived columns) to IndexedDB
   * and auto-restore on next mount. Pass `{ sessionStore }` to reuse an
   * existing store across tables. Default: `true`.
   */
  persistence?: boolean | { sessionStore?: SessionStore };

  /**
   * Enable the "Presets" button for saving/loading named filter sets.
   * Pass `{ manager }` to reuse an existing preset manager. Default: `true`.
   */
  presets?: boolean | { manager?: FilterPresetManager };

  /** Enable undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z). Default: `true`. */
  undoRedo?: boolean;

  /** Enable the "Expression" (raw SQL) filter button in the filter bar. Default: `true`. */
  expressionFilter?: boolean;

  /** Enable auto-attached column header visualizations (histograms, value counts). Default: `true`. */
  visualizations?: boolean;

  /** Enable the built-in export dialog (CSV/JSON/Parquet). Default: `true`. */
  exportDialog?: boolean;

  // ---- Lifecycle ----

  /** Where fixed-position modals mount. Default: `document.body`. */
  portalTarget?: HTMLElement;
  /** Share a WorkerBridge across tables. If omitted, one is created and owned by this table. */
  bridge?: WorkerBridge;
  /** Options for the owned WorkerBridge (ignored if `bridge` is supplied). */
  bridgeOptions?: WorkerBridgeOptions;

  // ---- Customization ----

  /** CSS class prefix. Default: `'dt'`. */
  classPrefix?: string;
  /** Custom expression editor factory (replaces the CodeMirror-based default). */
  editorFactory?: ExpressionEditorFactory;
  /** Row height in pixels. Default: 32. */
  rowHeight?: number;
  /** Header height in pixels. Default: 120. */
  headerHeight?: number;
}

/**
 * The returned object from {@link createDataTable}.
 */
export interface DataTable {
  /** Reactive state signals — advanced users can subscribe directly. */
  readonly state: TableState;
  /** Command/mutation layer. */
  readonly actions: StateActions;
  /** DuckDB worker bridge for custom SQL queries. */
  readonly bridge: WorkerBridge;
  /** UI container. Rarely needed directly; prefer the event bus. */
  readonly container: TableContainer;

  /**
   * Load a new data source into the table. Re-uses the existing worker.
   * Emits `loadStart` → (`loadProgress` …) → `loadComplete` or `loadError`.
   */
  loadData(
    source: File | string | ArrayBuffer | Blob,
    opts?: LoadDataOptions & { sourceFormat?: DataFormat }
  ): Promise<void>;

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof TableEvents>(
    event: K,
    handler: (payload: TableEvents[K]) => void
  ): () => void;
  /** Alternative to the return value of `on`. */
  off<K extends keyof TableEvents>(
    event: K,
    handler: (payload: TableEvents[K]) => void
  ): void;

  /** Open the export dialog. No-op if `exportDialog: false`. */
  openExportDialog(): void;

  /**
   * Delete the persisted UI snapshot for the current table from the session
   * store (filters, sort, columns, undo/redo stack, derived columns, presets).
   * In-memory state is untouched — the intended flow is "clear, then reload
   * the page" so the table starts fresh. No-op if persistence is disabled or
   * no table is loaded.
   */
  clearSession(): Promise<void>;

  /**
   * Tear down everything this table owns: DOM, subscriptions, worker (if owned),
   * session store (if owned). Call when unmounting from the DOM.
   */
  destroy(): Promise<void>;
}

type VisualizationType =
  | Histogram
  | DateHistogram
  | TimeHistogram
  | IntervalHistogram
  | ValueCounts;

interface BrushState {
  // Opaque per-visualization — we don't need to type it at this level.
  [key: string]: unknown;
}

interface SelectionStateSnapshot {
  selectedBin?: number | null;
  selectedSegments?: number[];
  selectedNull: boolean;
}

/**
 * Resolve a source argument into something `DataLoader.load()` accepts.
 * It natively handles File/string/ArrayBuffer; we convert Blob to ArrayBuffer.
 */
async function normalizeSource(
  source: File | string | ArrayBuffer | Blob
): Promise<File | string | ArrayBuffer> {
  if (source instanceof Blob && !(source instanceof File)) {
    return source.arrayBuffer();
  }
  return source;
}

/**
 * Create a fully-wired data table mounted in `container`.
 *
 * Awaits worker initialization before returning so the caller can immediately
 * `loadData()` or rely on `state.schema` being populated (if `source` was
 * provided).
 */
export async function createDataTable(
  opts: CreateDataTableOptions
): Promise<DataTable> {
  // -------- Worker bridge --------
  const ownsBridge = !opts.bridge;
  const bridge =
    opts.bridge ?? new WorkerBridge(opts.bridgeOptions);
  await bridge.initialize();

  // -------- Reactive state + actions --------
  const state = createTableState();
  const undoManager = opts.undoRedo === false ? undefined : new UndoManager();
  const actions = new StateActions(state, bridge, undoManager);

  // -------- Persistence --------
  let sessionStore: SessionStore | null = null;
  let ownsSessionStore = false;
  let autoSave: AutoSave | null = null;
  if (opts.persistence !== false) {
    const persistConfig =
      typeof opts.persistence === 'object' ? opts.persistence : {};
    if (persistConfig.sessionStore) {
      sessionStore = persistConfig.sessionStore;
    } else {
      sessionStore = new SessionStore();
      ownsSessionStore = true;
    }
    try {
      await sessionStore.open();
    } catch {
      // IndexedDB may be unavailable (private browsing, etc.); degrade silently.
      sessionStore = null;
      ownsSessionStore = false;
    }
  }

  // -------- Presets --------
  let presetManager: FilterPresetManager | null = null;
  if (opts.presets !== false) {
    const presetConfig = typeof opts.presets === 'object' ? opts.presets : {};
    presetManager = presetConfig.manager ?? new FilterPresetManager();
  }

  // -------- UI container --------
  const tableContainer = new TableContainer(
    opts.container,
    state,
    actions,
    bridge,
    {
      rowHeight: opts.rowHeight,
      headerHeight: opts.headerHeight,
      classPrefix: opts.classPrefix ?? 'dt',
      showExpressionFilter: opts.expressionFilter !== false,
      editorFactory: opts.editorFactory,
      presetManager: presetManager ?? undefined,
      portalTarget: opts.portalTarget,
    }
  );

  // -------- Event bus --------
  const emitter = new EventEmitter<TableEvents>();

  // -------- Visualizations (auto-attach) --------
  const interactionManager =
    opts.visualizations === false ? null : new InteractionManager();
  let coordinator: CrossfilterCoordinator | null = null;
  let activeVisualizations: BaseVisualization[] = [];
  const brushStates = new Map<string, BrushState>();
  const selectionStates = new Map<string, SelectionStateSnapshot>();

  /** Clear saved interaction state for a single column (on filter removal). */
  const clearVisualizationState = (column: string): void => {
    brushStates.delete(column);
    selectionStates.delete(column);
    interactionManager?.clearColumn(column);
  };

  if (opts.visualizations !== false) {
    actions.setOnFilterRemove(clearVisualizationState);
  }

  // Auto-attach/detach visualizations as the schema changes. This replaces
  // the ~200 lines of manual wiring that every consumer used to have to write.
  const attachVisualizations = (): void => {
    if (opts.visualizations === false) return;
    const tableName = state.tableName.get();
    if (!tableName) return;

    // Save brush/selection state so it survives a schema-change reattach.
    for (const viz of activeVisualizations) {
      const column = viz.getColumn();
      if (
        viz instanceof Histogram ||
        viz instanceof DateHistogram ||
        viz instanceof TimeHistogram ||
        viz instanceof IntervalHistogram
      ) {
        const brush = viz.getBrushState();
        if (brush) brushStates.set(column.name, brush as BrushState);
        const sel = viz.getSelectionState();
        if (sel.selectedBin !== null || sel.selectedNull) {
          selectionStates.set(column.name, sel);
        }
      } else if (viz instanceof ValueCounts) {
        const sel = viz.getSelectionState();
        if (sel.selectedSegments.length > 0 || sel.selectedNull) {
          selectionStates.set(column.name, {
            selectedSegments: sel.selectedSegments,
            selectedNull: sel.selectedNull,
          });
        }
      }
    }

    // Tear down previous visualizations and their registrations.
    if (coordinator) {
      for (const viz of activeVisualizations) {
        coordinator.unregister(viz.getColumn().name);
      }
    }
    for (const viz of activeVisualizations) viz.destroy();
    activeVisualizations = [];
    interactionManager?.clear();

    // Recreate coordinator for this table; it reads state.tableName dynamically.
    if (coordinator) coordinator.destroy();
    coordinator = new CrossfilterCoordinator(state, actions, bridge);

    // Create a visualization per applicable column.
    const headers = tableContainer.getColumnHeaders();
    for (const header of headers) {
      const column = header.getColumn();
      if (!VisualizationFactory.isApplicable(column)) {
        // Fallback: simple row count for non-visualized types.
        const statsEl = header.getStatsElement();
        const total = state.totalRows.get();
        statsEl.innerHTML = `<span class="${opts.classPrefix ?? 'dt'}-stats-line1">${total.toLocaleString()} rows</span>`;
        continue;
      }

      const vizContainer = header.getVizContainer();
      const statsEl = header.getStatsElement();
      let currentDefault: string | null = null;
      let showingHover = false;

      const fallbackStats = (): string => {
        const fr = state.filteredRows.get();
        const tr = state.totalRows.get();
        const af = state.filters.get();
        return af.length > 0
          ? `<span class="${opts.classPrefix ?? 'dt'}-stats-line1">${fr.toLocaleString()} / ${tr.toLocaleString()} rows</span>`
          : `<span class="${opts.classPrefix ?? 'dt'}-stats-line1">${tr.toLocaleString()} rows</span>`;
      };
      statsEl.innerHTML = fallbackStats();

      let viz: VisualizationType | undefined;
      const vizOptions = {
        tableName,
        bridge,
        filters: state.filters.get(),
        onFilterChange: (filter: Filter | null) => {
          coordinator!.handleFilterChange(column.name, filter);
        },
        onDefaultStatsChange: (stats: ColumnStatsData) => {
          const html = formatDefaultStats(stats, column.type);
          currentDefault = html;
          if (!showingHover) statsEl.innerHTML = html;
        },
        onStatsChange: (stats: string | null) => {
          if (stats) {
            showingHover = true;
            statsEl.innerHTML = stats;
          } else {
            showingHover = false;
            statsEl.innerHTML = currentDefault ?? fallbackStats();
          }
        },
        onBrushCommit: (colName: string) => {
          if (!viz) return;
          interactionManager?.pushBrush(colName, viz);
          if (
            viz instanceof Histogram ||
            viz instanceof DateHistogram ||
            viz instanceof TimeHistogram ||
            viz instanceof IntervalHistogram
          ) {
            const bs = viz.getBrushState();
            if (bs) brushStates.set(colName, bs as BrushState);
          }
        },
        onBrushClear: (colName: string) => {
          interactionManager?.removeColumn(colName);
          brushStates.delete(colName);
        },
        onSelectionChange: (colName: string, hasSelection: boolean) => {
          if (!viz) return;
          if (hasSelection) {
            interactionManager?.pushSelection(colName, viz);
            if (viz instanceof ValueCounts) {
              const sel = viz.getSelectionState();
              selectionStates.set(colName, {
                selectedSegments: sel.selectedSegments,
                selectedNull: sel.selectedNull,
              });
            } else if (
              viz instanceof Histogram ||
              viz instanceof DateHistogram ||
              viz instanceof TimeHistogram ||
              viz instanceof IntervalHistogram
            ) {
              selectionStates.set(colName, viz.getSelectionState());
            }
          } else {
            interactionManager?.removeColumn(colName);
            selectionStates.delete(colName);
          }
        },
      };

      const created = VisualizationFactory.create(
        vizContainer,
        column,
        vizOptions
      );
      if (!created) continue;
      viz = created as VisualizationType;
      activeVisualizations.push(viz);
      coordinator.register(column.name, viz);

      // Restore saved interaction state on the next data frame.
      const savedBrush = brushStates.get(column.name);
      const savedSel = selectionStates.get(column.name);
      if (savedBrush || savedSel) {
        void viz.waitForData().then(() => {
          if (!viz) return;
          if (
            savedBrush &&
            (viz instanceof Histogram ||
              viz instanceof DateHistogram ||
              viz instanceof TimeHistogram ||
              viz instanceof IntervalHistogram)
          ) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            viz.setBrushState(savedBrush as any);
            interactionManager?.pushBrush(column.name, viz);
          }
          if (savedSel) {
            if (viz instanceof ValueCounts && savedSel.selectedSegments !== undefined) {
              viz.setSelectionState({
                selectedSegments: savedSel.selectedSegments,
                selectedNull: savedSel.selectedNull,
              });
              if (savedSel.selectedSegments.length > 0 || savedSel.selectedNull) {
                interactionManager?.pushSelection(column.name, viz);
              }
            } else if (
              (viz instanceof Histogram ||
                viz instanceof DateHistogram ||
                viz instanceof TimeHistogram ||
                viz instanceof IntervalHistogram) &&
              savedSel.selectedBin !== undefined
            ) {
              viz.setSelectionState({
                selectedBin: savedSel.selectedBin,
                selectedNull: savedSel.selectedNull,
              });
              if (savedSel.selectedBin !== null || savedSel.selectedNull) {
                interactionManager?.pushSelection(column.name, viz);
              }
            }
          }
        });
      }
    }

    // Rebroadcast any filters already in state (e.g., restored from session).
    coordinator.syncExistingFilters();
  };

  // -------- AutoSave --------
  if (sessionStore && opts.persistence !== false) {
    autoSave = new AutoSave(state, sessionStore, {
      undoManager,
      presetManager: presetManager ?? undefined,
    });
    autoSave.enable();
  }

  // -------- Export dialog (lazy) --------
  let exportDialog: ExportDialog | null = null;
  const openExport = (): void => {
    if (opts.exportDialog === false) return;
    if (!exportDialog) {
      exportDialog = new ExportDialog(state, bridge, {
        classPrefix: opts.classPrefix ?? 'dt',
      });
      (opts.portalTarget ?? document.body).appendChild(exportDialog.getElement());
    }
    exportDialog.open();
  };

  // -------- Re-emit signals as typed events --------
  const unsubscribes: Array<() => void> = [];
  let destroyed = false;

  unsubscribes.push(
    state.filters.subscribe((filters: Filter[]) => {
      emitter.emit('filterChange', {
        filters,
        filteredRowCount: state.filteredRows.get(),
        totalRowCount: state.totalRows.get(),
      });
    })
  );
  unsubscribes.push(
    state.sortColumns.subscribe((sortColumns: SortColumn[]) => {
      emitter.emit('sortChange', { sortColumns });
    })
  );
  unsubscribes.push(
    state.selectedRows.subscribe((selectedRows: Set<number>) => {
      emitter.emit('selectionChange', { selectedRows });
    })
  );
  unsubscribes.push(
    state.visibleColumns.subscribe(() => {
      emitter.emit('columnChange', {
        visibleColumns: state.visibleColumns.get(),
        pinnedColumns: state.pinnedColumns.get(),
        columnOrder: state.columnOrder.get(),
      });
    })
  );
  unsubscribes.push(
    state.pinnedColumns.subscribe(() => {
      emitter.emit('columnChange', {
        visibleColumns: state.visibleColumns.get(),
        pinnedColumns: state.pinnedColumns.get(),
        columnOrder: state.columnOrder.get(),
      });
    })
  );
  unsubscribes.push(
    state.derivedColumns.subscribe((derivedColumns: DerivedColumnDef[]) => {
      emitter.emit('derivedChange', { derivedColumns });
    })
  );
  if (undoManager) {
    unsubscribes.push(
      undoManager.canUndoSignal.subscribe(() => {
        emitter.emit('undoChange', {
          canUndo: undoManager.canUndo,
          canRedo: undoManager.canRedo,
        });
      })
    );
    unsubscribes.push(
      undoManager.canRedoSignal.subscribe(() => {
        emitter.emit('undoChange', {
          canUndo: undoManager.canUndo,
          canRedo: undoManager.canRedo,
        });
      })
    );
  }

  // Debounced re-attach of visualizations. `initializeColumnsFromSchema`
  // (see `src/core/State.ts`) sets `schema` and `visibleColumns` back-to-back
  // and each triggers a `TableContainer.render()` that rebuilds column
  // headers — so attaching synchronously inside the schema subscriber would
  // bind visualizations to headers that are immediately destroyed by the
  // following visibleColumns render.
  //
  // `queueMicrotask` defers until all synchronous signal updates in the
  // current call stack have fired (and the last `render()` has run), but
  // still runs before the browser paints — no visual flash.
  //
  // Subscribing to `visibleColumns` and `tableName` in addition to `schema`
  // covers: column hide/show/reorder (visibleColumns) and derived-column
  // table switches where a VIEW replaces the base table (tableName).
  let attachScheduled = false;
  const scheduleAttach = (): void => {
    if (attachScheduled || destroyed) return;
    attachScheduled = true;
    queueMicrotask(() => {
      attachScheduled = false;
      if (destroyed) return;
      if (state.schema.get().length === 0) return;
      if (!state.tableName.get()) return;
      attachVisualizations();
    });
  };
  unsubscribes.push(state.schema.subscribe(scheduleAttach));
  unsubscribes.push(state.visibleColumns.subscribe(scheduleAttach));
  unsubscribes.push(state.tableName.subscribe(scheduleAttach));

  // Keep the row-count stats line live for columns without a visualization
  // (e.g. uuid). Columns *with* a visualization refresh their own stats via
  // the `onDefaultStatsChange` callback inside `attachVisualizations`.
  const refreshNonVizStats = (): void => {
    if (destroyed) return;
    if (!state.tableName.get()) return;
    const headers = tableContainer.getColumnHeaders();
    const totalRows = state.totalRows.get();
    const filteredRows = state.filteredRows.get();
    const activeFilters = state.filters.get();
    const prefix = opts.classPrefix ?? 'dt';
    for (const header of headers) {
      const column = header.getColumn();
      if (VisualizationFactory.isApplicable(column)) continue;
      const statsEl = header.getStatsElement();
      statsEl.innerHTML =
        activeFilters.length > 0
          ? `<span class="${prefix}-stats-line1">${filteredRows.toLocaleString()} / ${totalRows.toLocaleString()} rows</span>`
          : `<span class="${prefix}-stats-line1">${totalRows.toLocaleString()} rows</span>`;
    }
  };
  unsubscribes.push(state.filters.subscribe(refreshNonVizStats));
  unsubscribes.push(state.filteredRows.subscribe(refreshNonVizStats));

  // -------- Public loadData --------
  async function loadDataImpl(
    source: File | string | ArrayBuffer | Blob,
    loadOpts?: LoadDataOptions & { sourceFormat?: DataFormat }
  ): Promise<void> {
    const sourceLabel =
      typeof source === 'string'
        ? source
        : source instanceof File
          ? source.name
          : 'in-memory';
    emitter.emit('loadStart', { source: sourceLabel });
    // Disable auto-save while loading so we don't capture the transient
    // half-initialized state.
    autoSave?.disable();
    try {
      const normalized = await normalizeSource(source);
      const mergedOpts: LoadDataOptions = {
        ...(loadOpts ?? {}),
        format: loadOpts?.sourceFormat ?? loadOpts?.format,
        // Always pass store/presetManager if we have them, so session +
        // preset restore happens as part of loadData.
        sessionStore: loadOpts?.sessionStore ?? sessionStore ?? undefined,
        presetManager:
          loadOpts?.presetManager ?? presetManager ?? undefined,
      };
      await actions.loadData(normalized, mergedOpts);
      emitter.emit('loadComplete', {
        tableName: state.tableName.get() ?? '',
        rowCount: state.totalRows.get(),
        schema: state.schema.get(),
      });
    } catch (error) {
      emitter.emit('loadError', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    } finally {
      autoSave?.enable();
    }
  }

  // -------- Fire 'ready' (and maybe initial load) --------
  emitter.emit('ready', { bridgeReady: true });
  if (opts.source !== undefined) {
    // Do not await inside createDataTable — consumers can await the returned
    // promise via `table.on('loadComplete', …)` or a subsequent state read.
    // However, we DO await here so that `createDataTable` resolves with
    // an already-populated table, matching most consumer expectations.
    await loadDataImpl(opts.source, {
      tableName: opts.tableName,
      sourceFormat: opts.sourceFormat,
    });
  }

  // -------- destroy --------
  async function destroy(): Promise<void> {
    if (destroyed) return;
    destroyed = true;
    emitter.emit('destroy', {});

    autoSave?.disable();
    for (const unsub of unsubscribes) {
      try {
        unsub();
      } catch {
        // Ignore — we're tearing down.
      }
    }
    unsubscribes.length = 0;

    for (const viz of activeVisualizations) viz.destroy();
    activeVisualizations = [];
    interactionManager?.destroy();
    coordinator?.destroy();
    coordinator = null;

    exportDialog?.destroy();
    exportDialog = null;

    tableContainer.destroy();

    if (ownsSessionStore && sessionStore) {
      try {
        sessionStore.close();
      } catch {
        // ignore
      }
    }

    if (ownsBridge) bridge.terminate();

    emitter.removeAllListeners();
  }

  // -------- clearSession --------
  // Matches the keying used by AutoSave's `snapshotFromState` in
  // src/persistence/serialization.ts — baseTableName takes precedence so the
  // same snapshot is shared between the base table and any VIEW derived from
  // it (derived columns switch tableName to the VIEW).
  async function clearSession(): Promise<void> {
    if (!sessionStore) return;
    const key = state.baseTableName.get() ?? state.tableName.get();
    if (!key) return;
    await sessionStore.delete(key);
  }

  // -------- Public DataTable --------
  const dataTable: DataTable = {
    state,
    actions,
    bridge,
    container: tableContainer,
    loadData: loadDataImpl,
    on(event, handler) {
      emitter.on(event, handler);
      return () => emitter.off(event, handler);
    },
    off(event, handler) {
      emitter.off(event, handler);
    },
    openExportDialog: openExport,
    clearSession,
    destroy,
  };

  return dataTable;
}
