import {
  VERSION,
  createTableState,
  StateActions,
  TableContainer,
} from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';
import { VirtualScroller, type VisibleRange } from '../src/table/VirtualScroller';

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
let virtualScroller: VirtualScroller | null = null;
let tableCounter = 0;
let currentVisibleRange: VisibleRange | null = null;

function updateInfo(message: string): void {
  tableInfoEl.innerHTML = message;
}

function updateTableInfo(): void {
  const sortColumns = tableState.sortColumns.get();
  const rowCount = tableState.totalRows.get();
  const colCount = tableState.schema.get().length;
  const tableName = tableState.tableName.get();

  if (!tableName) return;

  let info = `${rowCount.toLocaleString()} rows, ${colCount} columns`;

  // Show visible range if virtual scroller is active
  if (currentVisibleRange && currentVisibleRange.end > 0) {
    info += ` | <strong>Visible:</strong> rows ${currentVisibleRange.start + 1}-${currentVisibleRange.end}`;
  }

  // Show sort info
  if (sortColumns.length > 0) {
    const sortDesc = sortColumns
      .map((s, i) => `${s.column} (${s.direction === 'asc' ? '▲' : '▼'}${sortColumns.length > 1 ? ` #${i + 1}` : ''})`)
      .join(', ');
    info += ` | <strong>Sort:</strong> ${sortDesc}`;
  } else {
    info += ' | Click headers to sort, scroll to test virtual scrolling';
  }

  updateInfo(info);
}

async function loadData(source: File | string): Promise<void> {
  const tableName = `table_${++tableCounter}`;
  updateInfo('Loading data...');

  try {
    await actions.loadData(source, { tableName });

    // Create virtual scroller in body container
    setupVirtualScroller();

    updateTableInfo();
  } catch (error) {
    updateInfo(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function setupVirtualScroller(): void {
  // Destroy existing scroller
  if (virtualScroller) {
    virtualScroller.destroy();
    virtualScroller = null;
  }

  if (!tableContainer) return;

  const bodyContainer = tableContainer.getBodyContainer();
  const totalRows = tableState.totalRows.get();
  const rowHeight = tableContainer.getOptions().rowHeight;

  // Clear body container
  bodyContainer.innerHTML = '';

  // Create virtual scroller
  virtualScroller = new VirtualScroller(bodyContainer, { rowHeight });
  virtualScroller.setTotalRows(totalRows);

  // Subscribe to scroll events
  virtualScroller.onScroll((range) => {
    currentVisibleRange = range;
    updateTableInfo();

    // Render placeholder rows in the viewport (actual row rendering in Task 3.4)
    const viewport = virtualScroller!.getViewportContainer();
    viewport.innerHTML = '';

    for (let i = range.start; i < range.end; i++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'dt-row-placeholder';
      rowEl.style.height = `${rowHeight}px`;
      rowEl.style.display = 'flex';
      rowEl.style.alignItems = 'center';
      rowEl.style.padding = '0 0.75rem';
      rowEl.style.borderBottom = '1px solid #f3f4f6';
      rowEl.style.fontSize = '0.875rem';
      rowEl.style.color = '#6b7280';
      rowEl.textContent = `Row ${i + 1} (placeholder - actual data rendering in Task 3.4)`;
      viewport.appendChild(rowEl);
    }
  });
}

// Initialize
bridge
  .initialize()
  .then(() => {
    actions = new StateActions(tableState, bridge);
    tableContainer = new TableContainer(tableContainerEl, tableState, actions);

    // Subscribe to sort changes to update info display
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
