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
  const sortColumns = tableState.sortColumns.get();
  const selectedRows = tableState.selectedRows.get();
  const rowCount = tableState.totalRows.get();
  const colCount = tableState.schema.get().length;
  const tableName = tableState.tableName.get();

  if (!tableName) return;

  let info = `<strong>${rowCount.toLocaleString()}</strong> rows, <strong>${colCount}</strong> columns`;

  // Show visible range from table body
  const tableBody = tableContainer?.getTableBody();
  if (tableBody) {
    const range = tableBody.getVisibleRange();
    if (range.end > 0) {
      info += ` | <strong>Visible:</strong> ${range.start + 1}-${range.end}`;
    }
  }

  // Show selection info
  if (selectedRows.size > 0) {
    info += ` | <strong>Selected:</strong> ${selectedRows.size} row${selectedRows.size > 1 ? 's' : ''}`;
  }

  // Show sort info
  if (sortColumns.length > 0) {
    const sortDesc = sortColumns
      .map((s, i) => `${s.column} (${s.direction === 'asc' ? '▲' : '▼'}${sortColumns.length > 1 ? ` #${i + 1}` : ''})`)
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
      bridge  // Pass bridge for TableBody
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

    // Update info when table body scrolls
    // We can periodically update or subscribe to a scroll event
    // For now, just update on selection/sort changes

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
