import { VERSION } from '../src/index';

// Display library version
const versionEl = document.getElementById('version');
if (versionEl) {
  versionEl.textContent = VERSION;
}

console.log('Data Table Library loaded, version:', VERSION);
