import { VERSION, createSignal, computed } from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';
import { DataLoader } from '../src/data/DataLoader';
import { detectSchema } from '../src/data/SchemaDetector';
import { inferAllStringColumnTypes } from '../src/data/TypeInference';
import { detectAllColumnPatterns } from '../src/data/PatternDetector';
import type { ColumnSchema } from '../src/core/types';
import type { TypeInferenceResult } from '../src/data/TypeInference';
import type { PatternDetectionResult } from '../src/data/PatternDetector';
import type { Signal } from '../src/core/Signal';

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
  typeInference: Map<string, TypeInferenceResult>,
  patterns: Map<string, PatternDetectionResult>,
  rows: Record<string, unknown>[]
): void {
  const columns = schema.map((col) => col.name);

  // Format type inference suggestion for a column
  const formatSuggestion = (col: ColumnSchema): string => {
    const inference = typeInference.get(col.name);
    if (!inference || inference.suggestedType === 'string') {
      return '-';
    }
    const pct = (inference.confidence * 100).toFixed(0);
    return `<span style="color: #059669;">${inference.suggestedType}</span> <span style="color: #6b7280;">(${pct}%)</span>`;
  };

  // Format pattern detection for a column
  const formatPattern = (col: ColumnSchema): string => {
    const pattern = patterns.get(col.name);
    if (!pattern || !pattern.pattern) {
      return '-';
    }
    const pct = (pattern.confidence * 100).toFixed(0);
    return `<span style="color: #7c3aed;">${pattern.pattern}</span> <span style="color: #6b7280;">(${pct}%)</span>`;
  };

  const html = `
    <div class="status success">Data loaded successfully!</div>
    <div class="metadata">
      <p><strong>Table:</strong> ${tableName}</p>
      <p><strong>Total Rows:</strong> ${rowCount.toLocaleString()}</p>
      <p><strong>Columns:</strong> ${schema.length}</p>
    </div>
    <h3>Schema (with Type Inference & Pattern Detection)</h3>
    <table>
      <tr><th>Column</th><th>Type</th><th>DuckDB Type</th><th>Nullable</th><th>Suggested Type</th><th>Pattern</th></tr>
      ${schema.map((col) => `<tr><td>${col.name}</td><td class="mono">${col.type}</td><td class="mono">${col.originalType}</td><td>${col.nullable ? 'Yes' : 'No'}</td><td>${formatSuggestion(col)}</td><td>${formatPattern(col)}</td></tr>`).join('')}
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

    // Detect schema using detectSchema
    const schema = await detectSchema(tableName, bridge);

    // Infer types for string columns
    showStatus('Analyzing column types...', 'info');
    const typeInference = await inferAllStringColumnTypes(tableName, bridge);

    // Detect patterns for string columns
    showStatus('Detecting patterns...', 'info');
    const patterns = await detectAllColumnPatterns(tableName, bridge);

    // Get first 3 rows
    const rows = await bridge.query<Record<string, unknown>>(
      `SELECT * FROM "${tableName}" LIMIT 3`
    );

    showResult(tableName, result.rowCount, schema, typeInference, patterns, rows);
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

// ============================================
// Signal Demo - Reactive State
// ============================================

// Signal demo elements
const counterDisplay = document.getElementById('counter-display')!;
const doubledDisplay = document.getElementById('doubled-display')!;
const squaredDisplay = document.getElementById('squared-display')!;
const updateCountDisplay = document.getElementById('update-count')!;
const incrementBtn = document.getElementById('increment-btn') as HTMLButtonElement;
const decrementBtn = document.getElementById('decrement-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;

// Create reactive signals
const counter = createSignal(0);
const updateCount = createSignal(0);

// Create computed values that automatically update
const doubled = computed(() => counter.get() * 2, [counter]);
const squared = computed(() => counter.get() ** 2, [counter]);

// Subscribe to counter changes - update display and increment update count
counter.subscribe((value) => {
  counterDisplay.textContent = String(value);
  updateCount.set(updateCount.get() + 1);
});

// Subscribe to computed values
doubled.subscribe((value) => {
  doubledDisplay.textContent = String(value);
});

squared.subscribe((value) => {
  squaredDisplay.textContent = String(value);
});

// Subscribe to update count
updateCount.subscribe((value) => {
  updateCountDisplay.textContent = String(value);
});

// Button handlers
incrementBtn.addEventListener('click', () => {
  counter.set(counter.get() + 1);
});

decrementBtn.addEventListener('click', () => {
  counter.set(counter.get() - 1);
});

resetBtn.addEventListener('click', () => {
  counter.set(0);
});

console.log('Data Table Library loaded, version:', VERSION);
