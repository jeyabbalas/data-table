/**
 * Interactive Data Table - Demo Application
 *
 * Phase 4, Task 4.3: Testing Histogram Visualization Rendering
 *
 * This demo tests:
 * - Histogram class rendering in column headers
 * - Elegant bar styling with rounded corners
 * - Hover interaction with in-place axis labels
 * - Null bar rendering in amber color
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

  // Clean up previous visualizations
  for (const viz of activeVisualizations) {
    viz.destroy();
  }
  activeVisualizations = [];

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

    // Create histogram visualization
    const histogram = new Histogram(vizContainer, column, {
      tableName,
      bridge,
      filters: [],
    });

    activeVisualizations.push(histogram);

    console.log(`[Demo] Created histogram for "${column.name}" (${column.type})`);
  }
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
