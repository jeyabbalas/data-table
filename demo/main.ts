/**
 * Interactive Data Table - Demo Application
 *
 * Phase 4, Task 4.4: Testing Histogram Interaction
 *
 * This demo tests:
 * - Histogram click-to-filter (single bin or null bar)
 * - Brush selection for range filtering
 * - Stats line updates on hover
 * - Hover interaction with tooltips
 */

import {
  VERSION,
  createTableState,
  StateActions,
  TableContainer,
} from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';
import { Histogram } from '../src/visualizations/histogram';
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
  histogram: Histogram;
}
const interactionStack: ActiveInteraction[] = [];

function updateInfo(message: string): void {
  tableInfoEl.innerHTML = message;
}

/**
 * Check if a column type is numeric (suitable for histogram)
 */
function isNumericType(type: DataType): boolean {
  return type === 'integer' || type === 'float' || type === 'decimal';
}

/**
 * Attach histogram visualizations to numeric column headers
 */
function attachHistograms(tableName: string, schema: ColumnSchema[]): void {
  if (!tableContainer) return;

  // Save brush/selection states before destroying histograms
  for (const viz of activeVisualizations) {
    if (viz instanceof Histogram) {
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

  console.log(
    `[Demo] Attaching histograms to ${numericCount} numeric columns out of ${headers.length} total`
  );

  for (const header of headers) {
    const column = header.getColumn();

    // Only attach histograms to numeric columns
    if (!isNumericType(column.type)) {
      continue;
    }

    const vizContainer = header.getVizContainer();
    const statsEl = header.getStatsElement();
    const defaultStats = `<span class="stats-label">Rows:</span> ${tableState.totalRows.get().toLocaleString()}`;

    // Create histogram visualization with filter and stats callbacks
    const histogram = new Histogram(vizContainer, column, {
      tableName,
      bridge,
      filters: tableState.filters.get(),
      onFilterChange: (filter) => {
        console.log('[Demo] Filter created:', filter);
        actions.addFilter(filter);
      },
      onStatsChange: (stats) => {
        if (stats) {
          statsEl.innerHTML = stats;
        } else {
          // Restore default
          statsEl.innerHTML = defaultStats;
        }
      },
      // Callback when brush is committed - add to LIFO stack
      onBrushCommit: (colName) => {
        // Remove any existing brush entry for this column
        const idx = interactionStack.findIndex(
          (i) => i.type === 'brush' && i.columnName === colName
        );
        if (idx >= 0) interactionStack.splice(idx, 1);
        // Add to top of stack
        interactionStack.push({
          type: 'brush',
          columnName: colName,
          histogram,
        });
        // Save state
        const state = histogram.getBrushState();
        if (state) brushStates.set(colName, state);
      },
      // Callback when brush is cleared - remove from stack
      onBrushClear: (colName) => {
        const idx = interactionStack.findIndex(
          (i) => i.type === 'brush' && i.columnName === colName
        );
        if (idx >= 0) interactionStack.splice(idx, 1);
        brushStates.delete(colName);
      },
      // Callback when selection changes
      onSelectionChange: (colName, hasSelection) => {
        const idx = interactionStack.findIndex(
          (i) => i.type === 'selection' && i.columnName === colName
        );
        if (hasSelection) {
          if (idx < 0) {
            interactionStack.push({
              type: 'selection',
              columnName: colName,
              histogram,
            });
          }
          // Save state
          const state = histogram.getSelectionState();
          selectionStates.set(colName, state);
        } else {
          if (idx >= 0) interactionStack.splice(idx, 1);
          selectionStates.delete(colName);
        }
      },
    });

    activeVisualizations.push(histogram);

    // Restore brush state if exists (after data is loaded)
    const savedBrush = brushStates.get(column.name);
    const savedSelection = selectionStates.get(column.name);

    if (savedBrush || savedSelection) {
      // Wait for data to load before restoring state
      // Use waitForData() instead of fetchData() to avoid triggering a redundant fetch
      histogram.waitForData().then(() => {
        if (savedBrush) {
          histogram.setBrushState(savedBrush);
          // Add back to interaction stack
          interactionStack.push({
            type: 'brush',
            columnName: column.name,
            histogram,
          });
        }
        if (savedSelection) {
          histogram.setSelectionState(savedSelection);
          // Add back to interaction stack
          if (savedSelection.selectedBin !== null || savedSelection.selectedNull) {
            interactionStack.push({
              type: 'selection',
              columnName: column.name,
              histogram,
            });
          }
        }
      });
    }

    console.log(`[Demo] Created histogram for "${column.name}" (${column.type})`);
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
  const histogramCount = activeVisualizations.length;

  let info = `<strong>${rowCount.toLocaleString()}</strong> rows, <strong>${colCount}</strong> columns`;
  info += ` | <strong>${histogramCount}</strong> histograms (${numericCols} numeric columns)`;

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
