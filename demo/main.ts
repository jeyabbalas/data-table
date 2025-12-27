import { VERSION } from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';
import { DataLoader } from '../src/data/DataLoader';
import { detectSchema } from '../src/data/SchemaDetector';
import type { ColumnSchema } from '../src/core/types';

// Elements
const versionEl = document.getElementById('version')!;
const initStatusEl = document.getElementById('init-status')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const loadFileBtn = document.getElementById('load-file-btn') as HTMLButtonElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const loadUrlBtn = document.getElementById('load-url-btn') as HTMLButtonElement;
const resultContainer = document.getElementById('result-container')!;

// Display version
versionEl.textContent = VERSION;

// Initialize
const bridge = new WorkerBridge();
const loader = new DataLoader(bridge);
let tableCounter = 0;

function showStatus(
  message: string,
  type: 'success' | 'error' | 'info' = 'info'
): void {
  resultContainer.innerHTML = `<p class="status ${type}">${message}</p>`;
}

function showResult(
  tableName: string,
  rowCount: number,
  schema: ColumnSchema[],
  rows: Record<string, unknown>[]
): void {
  const columns = schema.map((col) => col.name);
  const html = `
    <div class="status success">Data loaded successfully!</div>
    <div class="metadata">
      <p><strong>Table:</strong> ${tableName}</p>
      <p><strong>Total Rows:</strong> ${rowCount.toLocaleString()}</p>
      <p><strong>Columns:</strong> ${schema.length}</p>
    </div>
    <h3>Schema (detected via detectSchema)</h3>
    <table>
      <tr><th>Column</th><th>Type</th><th>Original DuckDB Type</th><th>Nullable</th></tr>
      ${schema.map((col) => `<tr><td>${col.name}</td><td class="mono">${col.type}</td><td class="mono">${col.originalType}</td><td>${col.nullable ? 'Yes' : 'No'}</td></tr>`).join('')}
    </table>
    <h3>First ${rows.length} Rows</h3>
    <div style="overflow-x: auto;">
      <table>
        <tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>
        ${rows.map((row) => `<tr>${columns.map((c) => `<td class="mono truncate">${formatCell(row[c])}</td>`).join('')}</tr>`).join('')}
      </table>
    </div>
  `;
  resultContainer.innerHTML = html;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '<em>null</em>';
  if (typeof value === 'string' && value.length > 50)
    return escapeHtml(value.slice(0, 47)) + '...';
  return escapeHtml(String(value));
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadData(source: File | string): Promise<void> {
  const tableName = `table_${++tableCounter}`;
  showStatus('Loading...', 'info');

  try {
    const result = await loader.load(source, { tableName });

    // Detect schema using the new detectSchema function
    const schema = await detectSchema(tableName, bridge);

    // Get first 3 rows
    const rows = await bridge.query<Record<string, unknown>>(
      `SELECT * FROM "${tableName}" LIMIT 3`
    );

    showResult(tableName, result.rowCount, schema, rows);
  } catch (error) {
    showStatus(
      `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    );
  }
}

// Initialize bridge
initStatusEl.textContent = 'Initializing DuckDB...';
bridge
  .initialize()
  .then(() => {
    initStatusEl.innerHTML =
      '<span style="color: green;">DuckDB ready</span>';
    loadFileBtn.disabled = false;
    loadUrlBtn.disabled = false;
  })
  .catch((error) => {
    initStatusEl.innerHTML = `<span style="color: red;">Error: ${error.message}</span>`;
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

// Also trigger on Enter key in URL input
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !loadUrlBtn.disabled) {
    const url = urlInput.value.trim();
    if (url) loadData(url);
  }
});

console.log('Data Table Library loaded, version:', VERSION);
