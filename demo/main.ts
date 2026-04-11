/**
 * Interactive Data Table - Demo Application
 *
 * Demo app for beta testers to explore the data table library's features:
 * file loading, type detection, column visualizations, crossfilter
 * coordination, pin/hide/sort/reorder/resize columns, and manual filters.
 */

import {
  VERSION,
  createTableState,
  StateActions,
  TableContainer,
  UndoManager,
} from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';
import { Histogram, DateHistogram, TimeHistogram, IntervalHistogram } from '../src/visualizations/histogram';
import { ValueCounts } from '../src/visualizations/valuecounts';
import { CrossfilterCoordinator } from '../src/visualizations/CrossfilterCoordinator';
import {
  VisualizationFactory,
  isNumericType,
  isDateType,
  isTimeType,
  isCategoricalType,
} from '../src/visualizations/VisualizationFactory';
import type { BaseVisualization } from '../src/visualizations';
import { InteractionManager } from '../src/visualizations/InteractionManager';
import { formatDefaultStats } from '../src/statistics/StatsFormatters';
import type { ColumnStatsData } from '../src/statistics/ColumnStatsTypes';
import { ExportDialog } from '../src/export/ExportDialog';
import { SessionStore } from '../src/persistence/SessionStore';
import { AutoSave } from '../src/persistence/AutoSave';
import { quoteIdentifier } from '../src/filters/FilterSQL';

// Visualization type union for type safety
type VisualizationType = Histogram | DateHistogram | TimeHistogram | IntervalHistogram | ValueCounts;

// Elements
const versionEl = document.getElementById('version')!;
const initStatusEl = document.getElementById('init-status')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const loadFileBtn = document.getElementById('load-file-btn') as HTMLButtonElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const loadUrlBtn = document.getElementById('load-url-btn') as HTMLButtonElement;
const tableContainerEl = document.getElementById('table-container')!;
const tableInfoEl = document.getElementById('table-info')!;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const clearSessionBtn = document.getElementById('clear-session-btn') as HTMLButtonElement;
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const sqlFilterInput = document.getElementById('sql-filter-input') as HTMLInputElement;
const sqlFilterLabel = document.getElementById('sql-filter-label') as HTMLInputElement;
const addSqlFilterBtn = document.getElementById('add-sql-filter-btn') as HTMLButtonElement;
const validateSqlBtn = document.getElementById('validate-sql-btn') as HTMLButtonElement;
const sqlFilterInfo = document.getElementById('sql-filter-info')!;


// Display version
versionEl.textContent = VERSION;

// Initialize bridge and state
const bridge = new WorkerBridge();
const tableState = createTableState();
const undoManager = new UndoManager();
let actions: StateActions;
let tableContainer: TableContainer | null = null;
let exportDialog: ExportDialog | null = null;
let tableCounter = 0;
const sessionStore = new SessionStore();
let autoSave: AutoSave | null = null;

// Last-session tracking for auto-restore on page refresh
const LAST_SESSION_KEY = 'dt-last-session';
interface LastSession {
  type: 'url' | 'file';
  source: string; // URL string or filename (for display only)
  tableName: string;
}

// --- Data cache (Parquet buffer in IndexedDB) for auto-restore on refresh ---

const DATA_CACHE_DB = 'dt-data-cache';
const DATA_CACHE_STORE = 'data';
const DATA_CACHE_VERSION = 1;

function openDataCache(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DATA_CACHE_DB, DATA_CACHE_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DATA_CACHE_STORE)) {
          db.createObjectStore(DATA_CACHE_STORE, { keyPath: 'tableName' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function cacheTableData(tableName: string, buffer: Uint8Array, sourceName: string): Promise<void> {
  const db = await openDataCache();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DATA_CACHE_STORE, 'readwrite');
      tx.objectStore(DATA_CACHE_STORE).put({ tableName, buffer, sourceName });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    } catch { db.close(); resolve(); }
  });
}

async function loadCachedData(tableName: string): Promise<{ buffer: Uint8Array; sourceName: string } | null> {
  const db = await openDataCache();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DATA_CACHE_STORE, 'readonly');
      const req = tx.objectStore(DATA_CACHE_STORE).get(tableName);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); resolve(null); };
    } catch { db.close(); resolve(null); }
  });
}

async function clearCachedData(tableName: string): Promise<void> {
  const db = await openDataCache();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DATA_CACHE_STORE, 'readwrite');
      tx.objectStore(DATA_CACHE_STORE).delete(tableName);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    } catch { db.close(); resolve(); }
  });
}

// Keep track of active visualizations for cleanup
let activeVisualizations: BaseVisualization[] = [];
let visualizationsAttached = false;
let reorderTimeout: ReturnType<typeof setTimeout> | null = null;
let coordinator: CrossfilterCoordinator | null = null;

// State persistence maps for brush and selection states
const brushStates = new Map<
  string,
  { startBinIndex: number; endBinIndex: number }
>();
const selectionStates = new Map<
  string,
  // Histogram/DateHistogram/TimeHistogram use selectedBin, ValueCounts uses selectedSegments (array for multi-select)
  { selectedBin?: number | null; selectedSegments?: number[]; selectedNull: boolean }
>();

// LIFO interaction manager for brush/selection Escape handling
const interactionManager = new InteractionManager();

function updateInfo(message: string): void {
  tableInfoEl.innerHTML = message;
}

/**
 * Attach visualizations to columns based on their types
 */
function attachVisualizations(): void {
  if (!tableContainer) return;
  const tableName = tableState.tableName.get();
  if (!tableName) return;

  // Save brush/selection states before destroying visualizations
  for (const viz of activeVisualizations) {
    const column = viz.getColumn();

    if (viz instanceof Histogram || viz instanceof DateHistogram || viz instanceof TimeHistogram || viz instanceof IntervalHistogram) {
      const brushState = viz.getBrushState();
      if (brushState) {
        brushStates.set(column.name, brushState);
      }
      const selState = viz.getSelectionState();
      if (selState.selectedBin !== null || selState.selectedNull) {
        selectionStates.set(column.name, selState);
      }
    } else if (viz instanceof ValueCounts) {
      const selState = viz.getSelectionState();
      if (selState.selectedSegments.length > 0 || selState.selectedNull) {
        selectionStates.set(column.name, {
          selectedSegments: selState.selectedSegments,
          selectedNull: selState.selectedNull,
        });
      }
    }
  }

  // Clean up previous visualizations and coordinator registrations
  if (coordinator) {
    for (const viz of activeVisualizations) {
      const col = viz.getColumn();
      coordinator.unregister(col.name);
    }
  }
  for (const viz of activeVisualizations) {
    viz.destroy();
  }
  activeVisualizations = [];

  // Clear interaction stack entries for destroyed visualizations
  interactionManager.clear();

  // Create or recreate coordinator for this table
  if (coordinator) {
    coordinator.destroy();
  }
  coordinator = new CrossfilterCoordinator(tableState, actions, bridge);

  // Get all column headers
  const headers = tableContainer.getColumnHeaders();

  for (const header of headers) {
    const column = header.getColumn();

    // Skip columns that don't have a registered visualization
    if (!VisualizationFactory.isApplicable(column)) {
      continue;
    }

    const vizContainer = header.getVizContainer();
    const statsEl = header.getStatsElement();

    // Track current default stats (rich two-line version from visualization)
    let currentDefaultStats: string | null = null;
    let isShowingHoverStats = false;

    function getFallbackStats(): string {
      const fr = tableState.filteredRows.get();
      const tr = tableState.totalRows.get();
      const af = tableState.filters.get();
      return af.length > 0
        ? `<span class="dt-stats-line1">${fr.toLocaleString()} / ${tr.toLocaleString()} rows</span>`
        : `<span class="dt-stats-line1">${tr.toLocaleString()} rows</span>`;
    }
    statsEl.innerHTML = getFallbackStats();

    // Declare visualization variable
    let visualization: VisualizationType;

    // Common visualization options
    const vizOptions = {
      tableName,
      bridge,
      filters: tableState.filters.get(),
      onFilterChange: (filter: import('../src/core/types').Filter | null) => {
        coordinator!.handleFilterChange(column.name, filter);
      },
      onDefaultStatsChange: (stats: ColumnStatsData) => {
        const html = formatDefaultStats(stats, column.type);
        currentDefaultStats = html;
        if (!isShowingHoverStats) {
          statsEl.innerHTML = html;
        }
      },
      onStatsChange: (stats: string | null) => {
        if (stats) {
          isShowingHoverStats = true;
          statsEl.innerHTML = stats;
        } else {
          isShowingHoverStats = false;
          statsEl.innerHTML = currentDefaultStats ?? getFallbackStats();
        }
      },
      onBrushCommit: (colName: string) => {
        interactionManager.pushBrush(colName, visualization);
        if (visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram || visualization instanceof IntervalHistogram) {
          const state = visualization.getBrushState();
          if (state) brushStates.set(colName, state);
        }
      },
      onBrushClear: (colName: string) => {
        interactionManager.removeColumn(colName);
        brushStates.delete(colName);
      },
      onSelectionChange: (colName: string, hasSelection: boolean) => {
        if (hasSelection) {
          interactionManager.pushSelection(colName, visualization);
          // Save state based on visualization type
          if (visualization instanceof ValueCounts) {
            const state = visualization.getSelectionState();
            selectionStates.set(colName, {
              selectedSegments: state.selectedSegments,
              selectedNull: state.selectedNull,
            });
          } else if (visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram || visualization instanceof IntervalHistogram) {
            const state = visualization.getSelectionState();
            selectionStates.set(colName, state);
          }
        } else {
          interactionManager.removeColumn(colName);
          selectionStates.delete(colName);
        }
      },
    };

    // Create appropriate visualization via factory
    const viz = VisualizationFactory.create(vizContainer, column, vizOptions);
    if (!viz) continue;
    visualization = viz as VisualizationType;

    activeVisualizations.push(visualization);
    coordinator!.register(column.name, visualization);

    // Restore brush/selection state if exists
    const savedBrush = brushStates.get(column.name);
    const savedSelection = selectionStates.get(column.name);

    if (savedBrush || savedSelection) {
      visualization.waitForData().then(() => {
        // Restore brush state (only for histograms)
        if (savedBrush && (visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram || visualization instanceof IntervalHistogram)) {
          visualization.setBrushState(savedBrush);
          interactionManager.pushBrush(column.name, visualization);
        }

        // Restore selection state
        if (savedSelection) {
          if (visualization instanceof ValueCounts && savedSelection.selectedSegments !== undefined) {
            visualization.setSelectionState({
              selectedSegments: savedSelection.selectedSegments,
              selectedNull: savedSelection.selectedNull,
            });
            if (savedSelection.selectedSegments.length > 0 || savedSelection.selectedNull) {
              interactionManager.pushSelection(column.name, visualization);
            }
          } else if ((visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram || visualization instanceof IntervalHistogram) && savedSelection.selectedBin !== undefined) {
            visualization.setSelectionState({
              selectedBin: savedSelection.selectedBin,
              selectedNull: savedSelection.selectedNull,
            });
            if (savedSelection.selectedBin !== null || savedSelection.selectedNull) {
              interactionManager.pushSelection(column.name, visualization);
            }
          }
        }
      });
    }
  }

  // Sync filtered row count for filters restored from persistence
  coordinator!.syncExistingFilters();

  // Fetch stats for columns without visualizations
  for (const header of headers) {
    const column = header.getColumn();
    if (VisualizationFactory.isApplicable(column)) continue;

    // Simple row count fallback for non-visualized types
    const statsEl = header.getStatsElement();
    const totalRows = tableState.totalRows.get();
    statsEl.innerHTML = `<span class="dt-stats-line1">${totalRows.toLocaleString()} rows</span>`;
  }

  visualizationsAttached = true;
}

/**
 * Update stats for columns without visualizations.
 * Columns with visualizations update stats via onDefaultStatsChange callback.
 */
function updateColumnStats(): void {
  if (!tableContainer) return;

  const totalRows = tableState.totalRows.get();
  const filters = tableState.filters.get();
  const headers = tableContainer.getColumnHeaders();

  for (const header of headers) {
    const column = header.getColumn();
    // Skip columns with visualizations — they manage their own stats
    if (VisualizationFactory.isApplicable(column)) continue;

    const statsEl = header.getStatsElement();
    // Simple row count fallback for non-visualized types
    const filteredRows = tableState.filteredRows.get();
    const defaultStats = filters.length > 0
      ? `<span class="dt-stats-line1">${filteredRows.toLocaleString()} / ${totalRows.toLocaleString()} rows</span>`
      : `<span class="dt-stats-line1">${totalRows.toLocaleString()} rows</span>`;
    statsEl.innerHTML = defaultStats;
  }
}

function updateTableInfo(): void {
  const totalRows = tableState.totalRows.get();
  const filteredRows = tableState.filteredRows.get();
  const schema = tableState.schema.get();
  const colCount = schema.length;
  const tableName = tableState.tableName.get();
  const filters = tableState.filters.get();

  if (!tableName) return;

  const numericCols = schema.filter((col) => isNumericType(col.type)).length;
  const dateCols = schema.filter((col) => isDateType(col.type)).length;
  const timeCols = schema.filter((col) => isTimeType(col.type)).length;
  const categoricalCols = schema.filter((col) => isCategoricalType(col.type)).length;
  const vizCount = activeVisualizations.length;

  // Show filtered/total rows
  let info: string;
  if (filters.length > 0) {
    info = `<strong>${filteredRows.toLocaleString()}</strong> / ${totalRows.toLocaleString()} rows, <strong>${colCount}</strong> columns`;
    info += ` | <strong>${filters.length}</strong> filter${filters.length > 1 ? 's' : ''}`;
  } else {
    info = `<strong>${totalRows.toLocaleString()}</strong> rows, <strong>${colCount}</strong> columns`;
  }

  info += ` | <strong>${vizCount}</strong> visualizations`;
  info += ` (${numericCols} numeric, ${dateCols} date, ${timeCols} time, ${categoricalCols} categorical)`;

  // Show derived column info if any
  const derivedCols = tableState.derivedColumns.get();
  if (derivedCols.length > 0) {
    info += ` | <strong>${derivedCols.length}</strong> derived`;
  }

  // Show pinned column info if any
  const pinnedColumns = tableState.pinnedColumns.get();
  if (pinnedColumns.length > 0) {
    info += ` | <strong>${pinnedColumns.length}</strong> pinned`;
  }

  // Show sort info if any
  const sortColumns = tableState.sortColumns.get();
  if (sortColumns.length > 0) {
    const sortDesc = sortColumns
      .map(
        (s, i) =>
          `${s.column} (${s.direction === 'asc' ? '\u25B2' : '\u25BC'}${sortColumns.length > 1 ? ` #${i + 1}` : ''})`
      )
      .join(', ');
    info += ` | <strong>Sort:</strong> ${sortDesc}`;
  }

  updateInfo(info);
}

async function loadData(source: File | string, overrideTableName?: string): Promise<void> {
  const tableName = overrideTableName || `table_${++tableCounter}`;

  // Keep tableCounter in sync so subsequent loads don't collide
  if (overrideTableName) {
    const match = overrideTableName.match(/^table_(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= tableCounter) tableCounter = num;
    }
  }

  updateInfo('Loading data...');

  // Disable auto-save during load to avoid saving intermediate states
  if (autoSave) {
    autoSave.disable();
  }

  try {
    await actions.loadData(source, { tableName, sessionStore });
    updateTableInfo();

    // Set export filename based on source
    const sourceName = source instanceof File
      ? source.name
      : source.substring(source.lastIndexOf('/') + 1) || tableName;
    if (exportDialog) {
      exportDialog.setSourceName(sourceName);
    }

    // Persist last session info for auto-restore on page refresh
    try {
      const session: LastSession = source instanceof File
        ? { type: 'file', source: source.name, tableName }
        : { type: 'url', source: source as string, tableName };
      localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
    } catch { /* localStorage may be unavailable */ }

    // Enable auto-save immediately after data load (before visualization delay)
    // so lifecycle handlers (beforeunload, visibilitychange) are registered.
    // AutoSave only needs signals, not DOM — visualizations need the delay.
    if (!autoSave) {
      autoSave = new AutoSave(tableState, sessionStore, { undoManager });
    }
    autoSave.enable();

    // Attach visualizations after data loads
    const currentTableName = tableState.tableName.get();
    if (currentTableName) {
      // Small delay to ensure table is rendered
      setTimeout(() => {
        attachVisualizations();
        updateTableInfo();

        // Cache data as Parquet in IndexedDB for auto-restore on page refresh
        bridge.exportToBuffer(
          `SELECT * FROM ${quoteIdentifier(currentTableName)}`, 'parquet'
        )
          .then(buffer => cacheTableData(currentTableName, buffer, sourceName))
          .catch(() => { /* caching is best-effort */ });
      }, 100);
    }
  } catch (error) {
    updateInfo(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Initialize
bridge
  .initialize()
  .then(() => {
    actions = new StateActions(tableState, bridge, undoManager);

    // Clean up visualization state when undo/redo removes filters
    actions.setOnFilterRemove((column: string) => {
      interactionManager.clearColumn(column);
      brushStates.delete(column);
      selectionStates.delete(column);
    });

    // Create TableContainer with bridge and filter removal handler
    tableContainer = new TableContainer(
      tableContainerEl,
      tableState,
      actions,
      bridge,
      {
        onFilterRemove: (column: string) => {
          // Clear the visualization interaction and remove from stack
          interactionManager.clearColumn(column);
          // Clean up persisted state
          brushStates.delete(column);
          selectionStates.delete(column);
        },
      }
    );

    // Subscribe to state changes
    tableState.sortColumns.subscribe(() => {
      if (tableState.tableName.get()) {
        updateTableInfo();
      }
    });

    // Subscribe to pinned columns to update table info bar
    tableState.pinnedColumns.subscribe(() => {
      if (tableState.tableName.get()) {
        updateTableInfo();
      }
    });

    // Subscribe to filter changes to update table info bar
    tableState.filters.subscribe(() => {
      if (tableState.tableName.get()) {
        updateTableInfo();
        // Update all column stats lines to show filtered/total
        updateColumnStats();
      }
    });

    // Subscribe to filtered row count changes to update display
    tableState.filteredRows.subscribe(() => {
      if (tableState.tableName.get()) {
        updateTableInfo();
        updateColumnStats();
      }
    });

    // Debounced re-attachment of visualizations.
    // Shared by visibleColumns and schema subscribers so that batch updates
    // (e.g., updateDerivedColumn which sets both) only re-attach once.
    function scheduleVisualizationReattach(): void {
      if (!tableState.tableName.get() || !visualizationsAttached) return;

      if (reorderTimeout) {
        clearTimeout(reorderTimeout);
      }

      // Debounce re-attachment. Read tableName inside the callback so it
      // reflects the settled value (not a stale capture from when the
      // subscriber fired, which may precede a tableName update).
      reorderTimeout = setTimeout(() => {
        reorderTimeout = null;
        attachVisualizations();
        updateTableInfo();
      }, 100);
    }

    // Subscribe to column reorder to re-attach visualizations
    tableState.visibleColumns.subscribe(scheduleVisualizationReattach);

    // Subscribe to schema changes to re-attach visualizations.
    // Schema changes trigger TableContainer.render() which destroys column
    // headers — visualizations must be re-attached to the new headers.
    tableState.schema.subscribe(scheduleVisualizationReattach);

    // Subscribe to tableName changes to re-attach visualizations.
    // When derived columns switch tableName from base to VIEW (or back),
    // visualizations need fresh options pointing to the current table.
    tableState.tableName.subscribe(scheduleVisualizationReattach);

    // Subscribe to derived columns changes to update info bar
    tableState.derivedColumns.subscribe(() => {
      if (tableState.tableName.get()) {
        updateTableInfo();
      }
    });

    // Escape key handling is provided by InteractionManager (created above)

    // Update info with dimensions
    tableContainer.onResize((dims) => {
      if (!tableState.tableName.get()) {
        updateInfo(`Ready - Container: ${dims.width.toFixed(0)} x ${dims.height.toFixed(0)}px`);
      }
    });

    // Export dialog
    exportDialog = new ExportDialog(tableState, bridge);
    document.body.appendChild(exportDialog.getElement());
    exportBtn.addEventListener('click', () => exportDialog!.open());
    tableState.tableName.subscribe((name) => {
      exportBtn.disabled = !name;
      clearSessionBtn.disabled = !name;
    });

    // Undo/redo/reset buttons
    undoBtn.addEventListener('click', () => actions.undo());
    redoBtn.addEventListener('click', () => actions.redo());
    resetBtn.addEventListener('click', () => {
      actions.resetToInitial();
      interactionManager.clear();
      brushStates.clear();
      selectionStates.clear();
    });
    undoManager.canUndoSignal.subscribe((canUndo) => {
      undoBtn.disabled = !canUndo;
      resetBtn.disabled = !canUndo;
    });
    undoManager.canRedoSignal.subscribe((canRedo) => {
      redoBtn.disabled = !canRedo;
    });

    // Raw SQL filter controls
    tableState.tableName.subscribe((name) => {
      addSqlFilterBtn.disabled = !name;
      validateSqlBtn.disabled = !name;
    });

    addSqlFilterBtn.addEventListener('click', () => {
      const sql = sqlFilterInput.value.trim();
      if (!sql) return;
      const label = sqlFilterLabel.value.trim() || undefined;
      const id = actions.addRawSQLFilter(sql, label);
      sqlFilterInfo.textContent = `Added SQL filter (id: ${id.slice(0, 8)}\u2026)`;
      sqlFilterInput.value = '';
      sqlFilterLabel.value = '';
    });

    validateSqlBtn.addEventListener('click', async () => {
      const sql = sqlFilterInput.value.trim();
      if (!sql) return;
      sqlFilterInfo.textContent = 'Validating\u2026';
      const result = await actions.validateSQLFilter(sql);
      if (result.valid) {
        sqlFilterInfo.textContent = `\u2705 Valid SQL \u2014 ${result.matchCount!.toLocaleString()} matching rows`;
      } else {
        sqlFilterInfo.textContent = `\u274c Invalid SQL: ${result.error}`;
      }
    });

    sqlFilterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !addSqlFilterBtn.disabled) {
        addSqlFilterBtn.click();
      }
    });

    // Open session store for persistence
    sessionStore.open();

    // Clear session button — deletes saved state, data cache, and localStorage
    clearSessionBtn.addEventListener('click', async () => {
      const tableName = tableState.baseTableName.get() ?? tableState.tableName.get();
      if (tableName) {
        await sessionStore.delete(tableName);
        await clearCachedData(tableName);
        try { localStorage.removeItem(LAST_SESSION_KEY); } catch { /* ignore */ }
        updateInfo('Session cleared. Reload the page to start fresh.');
      }
    });

    initStatusEl.textContent = 'DuckDB Ready';
    initStatusEl.classList.add('init-status--success');
    loadFileBtn.disabled = false;
    loadUrlBtn.disabled = false;

    // Auto-restore last session on page refresh
    (async () => {
      try {
        const raw = localStorage.getItem(LAST_SESSION_KEY);
        if (!raw) return;

        const session: LastSession = JSON.parse(raw);

        // Try loading from data cache first (works for both files and URLs)
        const cached = await loadCachedData(session.tableName);
        if (cached) {
          updateInfo(`Restoring session: <strong>${cached.sourceName}</strong>...`);
          const file = new File([cached.buffer], cached.sourceName + '.parquet');
          loadData(file, session.tableName);
        } else if (session.type === 'url') {
          // Fallback: re-fetch URL if cache is missing
          urlInput.value = session.source;
          loadData(session.source, session.tableName);
        } else {
          // File with no cache — prompt user
          updateInfo(
            `Previous session: <strong>${session.source}</strong> — ` +
            `load the same file to restore your state, or ` +
            `<a href="#" id="dismiss-session">dismiss</a>.`
          );
          document.getElementById('dismiss-session')?.addEventListener('click', (e) => {
            e.preventDefault();
            try { localStorage.removeItem(LAST_SESSION_KEY); } catch { /* ignore */ }
            updateInfo('Load a file or URL to get started.');
          });
        }
      } catch { /* localStorage unavailable */ }
    })();
  })
  .catch((error) => {
    initStatusEl.textContent = `Error: ${error.message}`;
    initStatusEl.classList.add('init-status--error');
  });





// Event handlers
loadFileBtn.addEventListener('click', () => {
  const file = fileInput.files?.[0];
  if (file) loadData(file);
});

loadUrlBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (url) loadData(url);
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !loadUrlBtn.disabled) {
    const url = urlInput.value.trim();
    if (url) loadData(url);
  }
});
