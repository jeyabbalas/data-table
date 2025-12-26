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
    .catch((error) => {
      addStatus(`✗ Error: ${error.message}`, true);
    });
}

console.log('Data Table Library loaded, version:', VERSION);
