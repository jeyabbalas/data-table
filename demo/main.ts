/**
 * Demo: Task 3.5 - Cell Rendering
 *
 * This demo showcases the CellRenderer functionality:
 * - Type-aware value formatting (integers, floats, dates, timestamps, booleans)
 * - Locale-aware number formatting with thousand separators
 * - Null value display with distinctive styling
 * - Text truncation with ellipsis for long strings
 */

import {
  VERSION,
  createTableState,
  StateActions,
  TableContainer,
} from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';

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

function updateTableInfo(): void {
  const rowCount = tableState.totalRows.get();
  const schema = tableState.schema.get();
  const colCount = schema.length;
  const tableName = tableState.tableName.get();

  if (!tableName) return;

  // Build type summary
  const typeCounts = new Map<string, number>();
  for (const col of schema) {
    typeCounts.set(col.type, (typeCounts.get(col.type) || 0) + 1);
  }

  const typeInfo = Array.from(typeCounts.entries())
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');

  let info = `<strong>${rowCount.toLocaleString()}</strong> rows, <strong>${colCount}</strong> columns`;
  info += `<br><span style="color: #6b7280; font-size: 0.8rem;">Types: ${typeInfo}</span>`;

  // Show visible range from table body
  const tableBody = tableContainer?.getTableBody();
  if (tableBody) {
    const range = tableBody.getVisibleRange();
    if (range.end > 0) {
      info += ` | <strong>Visible:</strong> ${range.start + 1}-${range.end}`;
    }
  }

  // Show selection info
  const selectedRows = tableState.selectedRows.get();
  if (selectedRows.size > 0) {
    info += ` | <strong>Selected:</strong> ${selectedRows.size} row${selectedRows.size > 1 ? 's' : ''}`;
  }

  // Show sort info
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

  try {
    await actions.loadData(source, { tableName });
    updateTableInfo();

    // Subscribe to scroll events AFTER table is rendered
    const tableBody = tableContainer?.getTableBody();
    if (tableBody) {
      const virtualScroller = tableBody.getVirtualScroller();

      // Update info box on scroll
      virtualScroller.onScroll(() => {
        updateTableInfo();
      });

      // Sync horizontal scroll between body and header
      const bodyScroll = tableContainer?.getScrollContainer();
      const headerScroll = tableContainer?.getHeaderScroll();
      if (bodyScroll && headerScroll) {
        bodyScroll.addEventListener('scroll', () => {
          headerScroll.scrollLeft = bodyScroll.scrollLeft;
        }, { passive: true });
      }
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

    // Create TableContainer with bridge - TableBody is created internally
    tableContainer = new TableContainer(
      tableContainerEl,
      tableState,
      actions,
      bridge
    );

    // Subscribe to state changes to update info display
    tableState.sortColumns.subscribe(() => {
      if (tableState.tableName.get()) {
        updateTableInfo();
      }
    });

    tableState.selectedRows.subscribe(() => {
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
    initStatusEl.style.color = '#059669';
    loadFileBtn.disabled = false;
    loadUrlBtn.disabled = false;
  })
  .catch((error) => {
    initStatusEl.textContent = `Error: ${error.message}`;
    initStatusEl.style.color = '#dc2626';
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
