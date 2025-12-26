import { VERSION } from '../src/index';

// Display library version
const versionEl = document.getElementById('version');
if (versionEl) {
  versionEl.textContent = VERSION;
}

// Test worker loading
const demoContainer = document.getElementById('demo-container');
if (demoContainer) {
  demoContainer.innerHTML = '<p>Testing Web Worker...</p>';

  try {
    const worker = new Worker(
      new URL('../src/worker/worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event) => {
      if (event.data.id === '__ready__') {
        demoContainer.innerHTML = '<p style="color: green;">✓ Web Worker loaded successfully!</p>';
      }
    };

    worker.onerror = (error) => {
      demoContainer.innerHTML = `<p style="color: red;">✗ Worker error: ${error.message}</p>`;
    };
  } catch (error) {
    demoContainer.innerHTML = `<p style="color: red;">✗ Failed to create worker: ${error}</p>`;
  }
}

console.log('Data Table Library loaded, version:', VERSION);
