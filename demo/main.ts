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
} from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';
import { Histogram, DateHistogram, TimeHistogram } from '../src/visualizations/histogram';
import { ValueCounts } from '../src/visualizations/valuecounts';
import { CrossfilterCoordinator } from '../src/visualizations/CrossfilterCoordinator';
import {
  VisualizationFactory,
  isNumericType,
  isDateType,
  isTimeType,
  isCategoricalType,
} from '../src/visualizations/VisualizationFactory';
import type { ColumnSchema } from '../src/core/types';
import type { BaseVisualization } from '../src/visualizations';
import { InteractionManager } from '../src/visualizations/InteractionManager';
import { formatDefaultStats } from '../src/statistics/StatsFormatters';
import { fetchIntervalStats } from '../src/statistics/StatsComputer';
import type { ColumnStatsData } from '../src/statistics/ColumnStatsTypes';

// Visualization type union for type safety
type VisualizationType = Histogram | DateHistogram | TimeHistogram | ValueCounts;

// Elements
const versionEl = document.getElementById('version')!;
const initStatusEl = document.getElementById('init-status')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const loadFileBtn = document.getElementById('load-file-btn') as HTMLButtonElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const loadUrlBtn = document.getElementById('load-url-btn') as HTMLButtonElement;
const tableContainerEl = document.getElementById('table-container')!;
const tableInfoEl = document.getElementById('table-info')!;

// Display version
versionEl.textContent = VERSION;

// Initialize bridge and state
const bridge = new WorkerBridge();
const tableState = createTableState();
let actions: StateActions;
let tableContainer: TableContainer | null = null;
let tableCounter = 0;

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
function attachVisualizations(tableName: string, schema: ColumnSchema[]): void {
  if (!tableContainer) return;

  // Save brush/selection states before destroying visualizations
  for (const viz of activeVisualizations) {
    const column = viz.getColumn();

    if (viz instanceof Histogram || viz instanceof DateHistogram || viz instanceof TimeHistogram) {
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
  coordinator = new CrossfilterCoordinator(tableState, actions, bridge, tableName);

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
        if (visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram) {
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
          } else if (visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram) {
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
        if (savedBrush && (visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram)) {
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
          } else if ((visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram) && savedSelection.selectedBin !== undefined) {
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

  // Fetch stats for columns without visualizations (e.g., interval)
  for (const header of headers) {
    const column = header.getColumn();
    if (VisualizationFactory.isApplicable(column)) continue;

    const statsEl = header.getStatsElement();
    if (column.type === 'interval') {
      fetchIntervalStats(
        tableName,
        column.name,
        tableState.filters.get(),
        bridge
      ).then((stats) => {
        // Guard against stale update if table was replaced while fetching
        if (statsEl.isConnected) {
          statsEl.innerHTML = formatDefaultStats(stats, column.type);
        }
      });
    }
  }

  visualizationsAttached = true;
}

/**
 * Update stats for columns without visualizations (e.g., interval columns).
 * Columns with visualizations update stats via onDefaultStatsChange callback.
 */
function updateColumnStats(): void {
  if (!tableContainer) return;

  const totalRows = tableState.totalRows.get();
  const filters = tableState.filters.get();
  const headers = tableContainer.getColumnHeaders();
  const currentTableName = tableState.tableName.get();

  for (const header of headers) {
    const column = header.getColumn();
    // Skip columns with visualizations — they manage their own stats
    if (VisualizationFactory.isApplicable(column)) continue;

    const statsEl = header.getStatsElement();

    if (column.type === 'interval' && currentTableName) {
      // Re-fetch full interval stats
      fetchIntervalStats(
        currentTableName,
        column.name,
        filters,
        bridge,
        filters.length > 0 ? totalRows : undefined
      ).then((stats) => {
        if (statsEl.isConnected) {
          statsEl.innerHTML = formatDefaultStats(stats, column.type);
        }
      });
    } else {
      // Simple row count fallback for unknown non-visualized types
      const filteredRows = tableState.filteredRows.get();
      const defaultStats = filters.length > 0
        ? `<span class="dt-stats-line1">${filteredRows.toLocaleString()} / ${totalRows.toLocaleString()} rows</span>`
        : `<span class="dt-stats-line1">${totalRows.toLocaleString()} rows</span>`;
      statsEl.innerHTML = defaultStats;
    }
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

async function loadData(source: File | string): Promise<void> {
  const tableName = `table_${++tableCounter}`;
  updateInfo('Loading data...');

  try {
    await actions.loadData(source, { tableName });
    actions.clearFilters();
    updateTableInfo();

    // Attach visualizations after data loads
    const schema = tableState.schema.get();
    const currentTableName = tableState.tableName.get();
    if (currentTableName) {
      // Small delay to ensure table is rendered
      setTimeout(() => {
        attachVisualizations(currentTableName, schema);
        updateTableInfo();
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
    actions = new StateActions(tableState, bridge);

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

    // Subscribe to column reorder to re-attach visualizations
    tableState.visibleColumns.subscribe(() => {
      const tableName = tableState.tableName.get();

      // Only re-attach if visualizations were already attached initially
      if (!tableName || !visualizationsAttached) return;

      // Clear any pending reorder timeout
      if (reorderTimeout) {
        clearTimeout(reorderTimeout);
      }

      // Debounce re-attachment
      reorderTimeout = setTimeout(() => {
        reorderTimeout = null;
        const schema = tableState.schema.get();
        attachVisualizations(tableName, schema);
        updateTableInfo();
      }, 100);
    });

    // Escape key handling is provided by InteractionManager (created above)

    // Update info with dimensions
    tableContainer.onResize((dims) => {
      if (!tableState.tableName.get()) {
        updateInfo(`Ready - Container: ${dims.width.toFixed(0)} x ${dims.height.toFixed(0)}px`);
      }
    });

    initStatusEl.textContent = 'DuckDB Ready';
    initStatusEl.classList.add('init-status--success');
    loadFileBtn.disabled = false;
    loadUrlBtn.disabled = false;
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
