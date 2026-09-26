import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = fileURLToPath(new URL('.', import.meta.url));

// Runs only the spike (`npx playwright test -c spike/memory/playwright.config.ts`).
// One worker: every run is a fresh page with its own DuckDB, and two
// multi-GiB runs side by side would measure the machine, not DuckDB.
export default defineConfig({
  testDir: here,
  testMatch: 'run.spec.ts',
  timeout: 4 * 60 * 60_000,
  workers: 1,
  reporter: 'list',
  use: { browserName: 'chromium', headless: true, baseURL: 'http://localhost:5190/' },
  webServer: {
    command: 'npx vite --config spike/memory/vite.config.ts',
    cwd: `${here}../..`,
    url: 'http://localhost:5190/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
