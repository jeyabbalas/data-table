/**
 * Interactive Data Table - Demo Application
 *
 * Phase 4, Task 4.6: Testing Value Counts Visualization
 *
 * This demo tests:
 * - ValueCounts for categorical columns (string, boolean, uuid)
 * - Blue gradient segments with light borders
 * - Hover and click-to-select interactions
 * - All existing histogram visualizations
 *
 * Test with datasets containing string columns to see ValueCounts in action.
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
import type { DataType, ColumnSchema } from '../src/core/types';
import type { BaseVisualization } from '../src/visualizations';

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

// State persistence maps for brush and selection states
const brushStates = new Map<
  string,
  { startBinIndex: number; endBinIndex: number }
>();
const selectionStates = new Map<
  string,
  // Histogram/DateHistogram/TimeHistogram use selectedBin, ValueCounts uses selectedSegment
  { selectedBin?: number | null; selectedSegment?: number | null; selectedNull: boolean }
>();

// LIFO stack for interactions (brushes and selections)
interface ActiveInteraction {
  type: 'brush' | 'selection';
  columnName: string;
  visualization: VisualizationType;
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
 * Check if a column type is categorical (suitable for value counts)
 */
function isCategoricalType(type: DataType): boolean {
  return type === 'string' || type === 'boolean' || type === 'uuid';
}

/**
 * Check if a column type needs a visualization
 */
function needsVisualization(type: DataType): boolean {
  return isNumericType(type) || isDateType(type) || isTimeType(type) || isCategoricalType(type);
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
      if (selState.selectedSegment !== null || selState.selectedNull) {
        selectionStates.set(column.name, {
          selectedSegment: selState.selectedSegment,
          selectedNull: selState.selectedNull,
        });
      }
    }
  }

  // Clean up previous visualizations
  for (const viz of activeVisualizations) {
    viz.destroy();
  }
  activeVisualizations = [];

  // Clear interaction stack entries for destroyed visualizations
  interactionStack.length = 0;

  // Get all column headers
  const headers = tableContainer.getColumnHeaders();
  const numericCount = schema.filter((col) => isNumericType(col.type)).length;
  const dateCount = schema.filter((col) => isDateType(col.type)).length;
  const timeCount = schema.filter((col) => isTimeType(col.type)).length;
  const categoricalCount = schema.filter((col) => isCategoricalType(col.type)).length;

  console.log(
    `[Demo] Attaching visualizations: ${numericCount} numeric, ${dateCount} date, ${timeCount} time, ${categoricalCount} categorical out of ${headers.length} total`
  );

  for (const header of headers) {
    const column = header.getColumn();

    // Skip columns that don't need visualization
    if (!needsVisualization(column.type)) {
      continue;
    }

    const vizContainer = header.getVizContainer();
    const statsEl = header.getStatsElement();
    const defaultStats = `<span class="stats-label">Rows:</span> ${tableState.totalRows.get().toLocaleString()}`;

    // Declare visualization variable
    let visualization: VisualizationType;

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
          visualization: visualization,
        });
        if (visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram) {
          const state = visualization.getBrushState();
          if (state) brushStates.set(colName, state);
        }
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
              visualization: visualization,
            });
          }
          // Save state based on visualization type
          if (visualization instanceof ValueCounts) {
            const state = visualization.getSelectionState();
            selectionStates.set(colName, {
              selectedSegment: state.selectedSegment,
              selectedNull: state.selectedNull,
            });
          } else if (visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram) {
            const state = visualization.getSelectionState();
            selectionStates.set(colName, state);
          }
        } else {
          if (idx >= 0) interactionStack.splice(idx, 1);
          selectionStates.delete(colName);
        }
      },
    };

    // Create appropriate visualization based on column type
    if (isTimeType(column.type)) {
      visualization = new TimeHistogram(vizContainer, column, vizOptions);
      console.log(`[Demo] Created TimeHistogram for "${column.name}" (${column.type})`);
    } else if (isDateType(column.type)) {
      visualization = new DateHistogram(vizContainer, column, vizOptions);
      console.log(`[Demo] Created DateHistogram for "${column.name}" (${column.type})`);
    } else if (isNumericType(column.type)) {
      visualization = new Histogram(vizContainer, column, vizOptions);
      console.log(`[Demo] Created Histogram for "${column.name}" (${column.type})`);
    } else if (isCategoricalType(column.type)) {
      visualization = new ValueCounts(vizContainer, column, vizOptions);
      console.log(`[Demo] Created ValueCounts for "${column.name}" (${column.type})`);
    } else {
      continue;
    }

    activeVisualizations.push(visualization);

    // Restore brush/selection state if exists
    const savedBrush = brushStates.get(column.name);
    const savedSelection = selectionStates.get(column.name);

    if (savedBrush || savedSelection) {
      visualization.waitForData().then(() => {
        // Restore brush state (only for histograms)
        if (savedBrush && (visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram)) {
          visualization.setBrushState(savedBrush);
          interactionStack.push({
            type: 'brush',
            columnName: column.name,
            visualization: visualization,
          });
        }

        // Restore selection state
        if (savedSelection) {
          if (visualization instanceof ValueCounts && savedSelection.selectedSegment !== undefined) {
            visualization.setSelectionState({
              selectedSegment: savedSelection.selectedSegment,
              selectedNull: savedSelection.selectedNull,
            });
            if (savedSelection.selectedSegment !== null || savedSelection.selectedNull) {
              interactionStack.push({
                type: 'selection',
                columnName: column.name,
                visualization: visualization,
              });
            }
          } else if ((visualization instanceof Histogram || visualization instanceof DateHistogram || visualization instanceof TimeHistogram) && savedSelection.selectedBin !== undefined) {
            visualization.setSelectionState({
              selectedBin: savedSelection.selectedBin,
              selectedNull: savedSelection.selectedNull,
            });
            if (savedSelection.selectedBin !== null || savedSelection.selectedNull) {
              interactionStack.push({
                type: 'selection',
                columnName: column.name,
                visualization: visualization,
              });
            }
          }
        }
      });
    }
  }

  visualizationsAttached = true;
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
  const categoricalCols = schema.filter((col) => isCategoricalType(col.type)).length;
  const vizCount = activeVisualizations.length;

  let info = `<strong>${rowCount.toLocaleString()}</strong> rows, <strong>${colCount}</strong> columns`;
  info += ` | <strong>${vizCount}</strong> visualizations`;
  info += ` (${numericCols} numeric, ${dateCols} date, ${timeCols} time, ${categoricalCols} categorical)`;

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

    // Global Esc handler for LIFO brush/selection clearing
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && interactionStack.length > 0) {
        const last = interactionStack.pop()!;
        if (last.type === 'brush') {
          last.visualization.clearBrush();
        } else {
          last.visualization.clearSelection();
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
