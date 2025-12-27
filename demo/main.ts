import { VERSION } from '../src/index';
import { WorkerBridge } from '../src/data/WorkerBridge';

// Display library version
const versionEl = document.getElementById('version');
if (versionEl) {
  versionEl.textContent = VERSION;
}

// Helper to add status messages
function addStatus(message: string, isError = false): void {
  const demoContainer = document.getElementById('demo-container');
  if (demoContainer) {
    const p = document.createElement('p');
    p.style.color = isError ? 'red' : 'green';
    p.style.margin = '0.5rem 0';
    p.textContent = message;
    demoContainer.appendChild(p);
  }
}

// Test WorkerBridge
const demoContainer = document.getElementById('demo-container');
if (demoContainer) {
  demoContainer.innerHTML = '<p>Testing WorkerBridge...</p>';

  const bridge = new WorkerBridge();

  bridge
    .initialize()
    .then(() => {
      demoContainer.innerHTML = '';
      addStatus('✓ WorkerBridge initialized (Worker + DuckDB ready)');
      return bridge.query<{ answer: number; greeting: string }>(
        "SELECT 42 as answer, 'hello' as greeting"
      );
    })
    .then((rows) => {
      addStatus('✓ Query executed via WorkerBridge');
      addStatus(`   Result: ${JSON.stringify(rows)}`);

      // Test AbortController
      const controller = new AbortController();
      controller.abort(); // Abort immediately
      return bridge.query('SELECT 1', controller.signal).catch((err) => {
        addStatus('✓ AbortController works: ' + err.message);
      });
    })
    .then(() => {
      // Test CSV loading
      addStatus('');
      addStatus('Testing CSV loading...');

      const csvData = `id,name,value
1,Alice,100
2,Bob,200
3,Charlie,300`;

      return bridge.loadData(csvData, { format: 'csv', tableName: 'demo_table' });
    })
    .then(() => {
      addStatus('✓ CSV data loaded into demo_table');
      return bridge.query<{ id: number; name: string; value: number }>(
        'SELECT * FROM demo_table ORDER BY id'
      );
    })
    .then((rows) => {
      addStatus(`✓ Query from loaded CSV: ${rows.length} rows`);
      addStatus(`   Data: ${JSON.stringify(rows)}`);
    })
    .catch((error) => {
      addStatus(`✗ Error: ${error.message}`, true);
    });
}

console.log('Data Table Library loaded, version:', VERSION);
