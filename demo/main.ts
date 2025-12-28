/**
 * Interactive Data Table - Demo Application
 *
 * Phase 4, Task 4.2: Testing Histogram Data Fetching
 *
 * This demo tests:
 * - fetchHistogramData function with real DuckDB data
 * - Automatic bin calculation (Freedman-Diaconis/Sturges)
 * - Filter-to-SQL conversion
 * - Histogram data display for numeric columns
 */

import {
  VERSION,
  createTableState,
  StateActions,
  TableContainer,
} from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';
import { fetchHistogramData, type HistogramData } from '../src/visualizations/histogram';
import type { DataType, ColumnSchema } from '../src/core/types';

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
 * Format histogram data for display
 */
function formatHistogramInfo(column: ColumnSchema, data: HistogramData): string {
  const totalNonNull = data.bins.reduce((sum, bin) => sum + bin.count, 0);
  const maxCount = Math.max(...data.bins.map(b => b.count), 0);

  // Create a simple ASCII bar chart
  const barWidth = 20;
  const bars = data.bins.map(bin => {
    const barLength = maxCount > 0 ? Math.round((bin.count / maxCount) * barWidth) : 0;
    const bar = '\u2588'.repeat(barLength);
    return `  [${bin.x0.toFixed(1)}-${bin.x1.toFixed(1)}]: ${bar} ${bin.count}`;
  }).join('\n');

  return `
<strong>${column.name}</strong> (${column.type})
  Range: ${data.min.toLocaleString()} to ${data.max.toLocaleString()}
  Bins: ${data.bins.length}, Total: ${data.total.toLocaleString()}, Nulls: ${data.nullCount.toLocaleString()}
${bars}`;
}

/**
 * Fetch and display histogram data for all numeric columns
 */
async function fetchHistograms(tableName: string, schema: ColumnSchema[]): Promise<void> {
  const numericColumns = schema.filter(col => isNumericType(col.type));

  if (numericColumns.length === 0) {
    console.log('No numeric columns found for histograms');
    return;
  }

  console.log(`Fetching histograms for ${numericColumns.length} numeric column(s)...`);

  const histogramResults: string[] = [];

  for (const column of numericColumns) {
    try {
      console.log(`Fetching histogram for "${column.name}"...`);
      const startTime = performance.now();

      const data = await fetchHistogramData(
        tableName,
        column.name,
        'auto',
        [], // No filters
        bridge
      );

      const elapsed = (performance.now() - startTime).toFixed(1);
      console.log(`Histogram for "${column.name}" fetched in ${elapsed}ms:`, data);

      histogramResults.push(formatHistogramInfo(column, data));
    } catch (error) {
      console.error(`Error fetching histogram for "${column.name}":`, error);
      histogramResults.push(`<strong>${column.name}</strong>: Error - ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  // Display histogram results
  if (histogramResults.length > 0) {
    const histogramInfoEl = document.createElement('div');
    histogramInfoEl.id = 'histogram-info';
    histogramInfoEl.style.cssText = `
      margin-top: 16px;
      padding: 12px;
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      max-height: 300px;
      overflow-y: auto;
    `;
    histogramInfoEl.innerHTML = `<strong>Histogram Data (Task 4.2 Test):</strong>\n\n${histogramResults.join('\n\n')}`;

    // Remove old histogram info if exists
    const oldInfo = document.getElementById('histogram-info');
    if (oldInfo) oldInfo.remove();

    tableInfoEl.parentElement?.appendChild(histogramInfoEl);
  }
}

function updateTableInfo(): void {
  const rowCount = tableState.totalRows.get();
  const schema = tableState.schema.get();
  const colCount = schema.length;
  const tableName = tableState.tableName.get();

  if (!tableName) return;

  const numericCols = schema.filter(col => isNumericType(col.type)).length;

  let info = `<strong>${rowCount.toLocaleString()}</strong> rows, <strong>${colCount}</strong> columns`;
  info += ` | <strong>${numericCols}</strong> numeric (histogram-ready)`;

  // Show sort info if any
  const sortColumns = tableState.sortColumns.get();
  if (sortColumns.length > 0) {
    const sortDesc = sortColumns
      .map((s, i) => `${s.column} (${s.direction === 'asc' ? '\u25B2' : '\u25BC'}${sortColumns.length > 1 ? ` #${i + 1}` : ''})`)
      .join(', ');
    info += ` | <strong>Sort:</strong> ${sortDesc}`;
  }

  updateInfo(info);
}

async function loadData(source: File | string): Promise<void> {
  const tableName = `table_${++tableCounter}`;
  updateInfo('Loading data...');

  // Remove old histogram info
  const oldInfo = document.getElementById('histogram-info');
  if (oldInfo) oldInfo.remove();

  try {
    await actions.loadData(source, { tableName });
    updateTableInfo();

    // Fetch histograms for numeric columns
    const schema = tableState.schema.get();
    const currentTableName = tableState.tableName.get();
    if (currentTableName) {
      await fetchHistograms(currentTableName, schema);
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
