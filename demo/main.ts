/**
 * Interactive Data Table - Demo Application
 *
 * Phase 4, Task 4.5: Testing Date Histogram
 *
 * This demo tests:
 * - DateHistogram for date/timestamp columns
 * - Histogram for numeric columns
 * - Context-aware date labels (Jan, Jan 2, 10am, etc.)
 * - All interaction patterns (hover, click, brush)
 *
 * Test with NYC Taxi dataset to see DateHistogram in action.
 */

import {
  VERSION,
  createTableState,
  StateActions,
  TableContainer,
} from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';
import { Histogram, DateHistogram, TimeHistogram } from '../src/visualizations/histogram';
import type { DataType, ColumnSchema } from '../src/core/types';
import type { BaseVisualization } from '../src/visualizations';

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
let histogramsAttached = false;
let reorderTimeout: ReturnType<typeof setTimeout> | null = null;

// State persistence maps for brush and selection states
const brushStates = new Map<
  string,
  { startBinIndex: number; endBinIndex: number }
>();
const selectionStates = new Map<
  string,
  { selectedBin: number | null; selectedNull: boolean }
>();

// LIFO stack for interactions (brushes and selections)
interface ActiveInteraction {
  type: 'brush' | 'selection';
  columnName: string;
  histogram: Histogram | DateHistogram | TimeHistogram;
}
const interactionStack: ActiveInteraction[] = [];

function updateInfo(message: string): void {
  tableInfoEl.innerHTML = message;
}

/**
 * Check if a column type is numeric (suitable for numeric histogram)
 */
function isNumericType(type: DataType): boolean {
  return type === 'integer' || type === 'float' || type === 'decimal';
}

/**
 * Check if a column type is date/timestamp (suitable for date histogram)
 */
function isDateType(type: DataType): boolean {
  return type === 'date' || type === 'timestamp';
}

/**
 * Check if a column type is time (suitable for time histogram)
 */
function isTimeType(type: DataType): boolean {
  return type === 'time';
}

/**
 * Attach histogram visualizations to numeric, date/timestamp, and time columns
 */
function attachHistograms(tableName: string, schema: ColumnSchema[]): void {
  if (!tableContainer) return;

  // Save brush/selection states before destroying histograms
  for (const viz of activeVisualizations) {
    if (viz instanceof Histogram || viz instanceof DateHistogram || viz instanceof TimeHistogram) {
      const column = viz.getColumn();
      const brushState = viz.getBrushState();
      if (brushState) {
        brushStates.set(column.name, brushState);
      }
      const selState = viz.getSelectionState();
      if (selState.selectedBin !== null || selState.selectedNull) {
        selectionStates.set(column.name, selState);
      }
    }
  }

  // Clean up previous visualizations
  for (const viz of activeVisualizations) {
    viz.destroy();
  }
  activeVisualizations = [];

  // Clear interaction stack entries for destroyed histograms
  interactionStack.length = 0;

  // Get all column headers
  const headers = tableContainer.getColumnHeaders();
  const numericCount = schema.filter((col) => isNumericType(col.type)).length;
  const dateCount = schema.filter((col) => isDateType(col.type)).length;
  const timeCount = schema.filter((col) => isTimeType(col.type)).length;

  console.log(
    `[Demo] Attaching histograms: ${numericCount} numeric + ${dateCount} date + ${timeCount} time columns out of ${headers.length} total`
  );

  for (const header of headers) {
    const column = header.getColumn();

    // Skip columns that don't need visualization
    if (!isNumericType(column.type) && !isDateType(column.type) && !isTimeType(column.type)) {
      continue;
    }

    const vizContainer = header.getVizContainer();
    const statsEl = header.getStatsElement();
    const defaultStats = `<span class="stats-label">Rows:</span> ${tableState.totalRows.get().toLocaleString()}`;

    // Common visualization options
    const vizOptions = {
      tableName,
      bridge,
      filters: tableState.filters.get(),
      onFilterChange: (filter: import('../src/core/types').Filter) => {
        console.log('[Demo] Filter created:', filter);
        actions.addFilter(filter);
      },
      onStatsChange: (stats: string | null) => {
        if (stats) {
          statsEl.innerHTML = stats;
        } else {
          statsEl.innerHTML = defaultStats;
        }
      },
      onBrushCommit: (colName: string) => {
        const idx = interactionStack.findIndex(
          (i) => i.type === 'brush' && i.columnName === colName
        );
        if (idx >= 0) interactionStack.splice(idx, 1);
        interactionStack.push({
          type: 'brush',
          columnName: colName,
          histogram: visualization,
        });
        const state = visualization.getBrushState();
        if (state) brushStates.set(colName, state);
      },
      onBrushClear: (colName: string) => {
        const idx = interactionStack.findIndex(
          (i) => i.type === 'brush' && i.columnName === colName
        );
        if (idx >= 0) interactionStack.splice(idx, 1);
        brushStates.delete(colName);
      },
      onSelectionChange: (colName: string, hasSelection: boolean) => {
        const idx = interactionStack.findIndex(
          (i) => i.type === 'selection' && i.columnName === colName
        );
        if (hasSelection) {
          if (idx < 0) {
            interactionStack.push({
              type: 'selection',
              columnName: colName,
              histogram: visualization,
            });
          }
          const state = visualization.getSelectionState();
          selectionStates.set(colName, state);
        } else {
          if (idx >= 0) interactionStack.splice(idx, 1);
          selectionStates.delete(colName);
        }
      },
    };

    // Create appropriate visualization based on column type
    let visualization: Histogram | DateHistogram | TimeHistogram;
    if (isTimeType(column.type)) {
      visualization = new TimeHistogram(vizContainer, column, vizOptions);
      console.log(`[Demo] Created TimeHistogram for "${column.name}" (${column.type})`);
    } else if (isDateType(column.type)) {
      visualization = new DateHistogram(vizContainer, column, vizOptions);
      console.log(`[Demo] Created DateHistogram for "${column.name}" (${column.type})`);
    } else {
      visualization = new Histogram(vizContainer, column, vizOptions);
      console.log(`[Demo] Created Histogram for "${column.name}" (${column.type})`);
    }

    activeVisualizations.push(visualization);

    // Restore brush/selection state if exists
    const savedBrush = brushStates.get(column.name);
    const savedSelection = selectionStates.get(column.name);

    if (savedBrush || savedSelection) {
      visualization.waitForData().then(() => {
        if (savedBrush) {
          visualization.setBrushState(savedBrush);
          interactionStack.push({
            type: 'brush',
            columnName: column.name,
            histogram: visualization,
          });
        }
        if (savedSelection) {
          visualization.setSelectionState(savedSelection);
          if (savedSelection.selectedBin !== null || savedSelection.selectedNull) {
            interactionStack.push({
              type: 'selection',
              columnName: column.name,
              histogram: visualization,
            });
          }
        }
      });
    }
  }

  histogramsAttached = true;
}

function updateTableInfo(): void {
  const rowCount = tableState.totalRows.get();
  const schema = tableState.schema.get();
  const colCount = schema.length;
  const tableName = tableState.tableName.get();

  if (!tableName) return;

  const numericCols = schema.filter((col) => isNumericType(col.type)).length;
  const dateCols = schema.filter((col) => isDateType(col.type)).length;
  const timeCols = schema.filter((col) => isTimeType(col.type)).length;
  const histogramCount = activeVisualizations.length;

  let info = `<strong>${rowCount.toLocaleString()}</strong> rows, <strong>${colCount}</strong> columns`;
  info += ` | <strong>${histogramCount}</strong> histograms (${numericCols} numeric, ${dateCols} date, ${timeCols} time)`;

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
    updateTableInfo();

    // Attach histograms after data loads
    const schema = tableState.schema.get();
    const currentTableName = tableState.tableName.get();
    if (currentTableName) {
      // Small delay to ensure table is rendered
      setTimeout(() => {
        attachHistograms(currentTableName, schema);
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

    // Create TableContainer with bridge
    tableContainer = new TableContainer(
      tableContainerEl,
      tableState,
      actions,
      bridge
    );

    // Subscribe to state changes
    tableState.sortColumns.subscribe(() => {
      if (tableState.tableName.get()) {
        updateTableInfo();
      }
    });

    // Subscribe to column reorder to re-attach histograms
    tableState.visibleColumns.subscribe(() => {
      const tableName = tableState.tableName.get();

      // Only re-attach if histograms were already attached initially
      if (!tableName || !histogramsAttached) return;

      // Clear any pending reorder timeout
      if (reorderTimeout) {
        clearTimeout(reorderTimeout);
      }

      // Debounce re-attachment
      reorderTimeout = setTimeout(() => {
        reorderTimeout = null;
        const schema = tableState.schema.get();
        attachHistograms(tableName, schema);
        updateTableInfo();
      }, 100);
    });

    // Global Esc handler for LIFO brush/selection clearing
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && interactionStack.length > 0) {
        const last = interactionStack.pop()!;
        if (last.type === 'brush') {
          last.histogram.clearBrush();
        } else {
          last.histogram.clearSelection();
        }
        e.stopPropagation();
        e.preventDefault();
      }
    });

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
