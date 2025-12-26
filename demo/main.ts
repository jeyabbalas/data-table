import { VERSION } from '../src/index';

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

// Test worker and DuckDB
const demoContainer = document.getElementById('demo-container');
if (demoContainer) {
  demoContainer.innerHTML = '<p>Testing Web Worker and DuckDB...</p>';

  try {
    const worker = new Worker(
      new URL('../src/worker/worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event) => {
      const { id, type, payload } = event.data;

      if (id === '__ready__') {
        demoContainer.innerHTML = ''; // Clear initial message
        addStatus('✓ Web Worker loaded');
        // Initialize DuckDB
        worker.postMessage({ id: 'init-1', type: 'init', payload: {} });
      } else if (id === 'init-1' && type === 'result') {
        addStatus('✓ DuckDB initialized');
        // Test query
        worker.postMessage({
          id: 'query-1',
          type: 'query',
          payload: { sql: "SELECT 42 as answer, 'hello' as greeting" },
        });
      } else if (id === 'query-1' && type === 'result') {
        addStatus(`✓ Query executed successfully`);
        addStatus(`   Result: ${JSON.stringify(payload.rows)}`);
      } else if (type === 'error') {
        addStatus(`✗ Error: ${payload.message}`, true);
      }
    };

    worker.onerror = (error) => {
      addStatus(`✗ Worker error: ${error.message}`, true);
    };
  } catch (error) {
    demoContainer.innerHTML = '';
    addStatus(`✗ Failed to create worker: ${error}`, true);
  }
}

console.log('Data Table Library loaded, version:', VERSION);
