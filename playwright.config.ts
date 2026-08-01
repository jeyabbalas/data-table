import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the browser-level accessibility suite.
 *
 * These specs exist because jsdom cannot see the bugs they guard. jsdom
 * implements no sequential focus navigation, so no jsdom test can observe
 * `Tab` escaping (or failing to escape) the table — a live keyboard trap was
 * shown to pass all ~3,650 vitest tests. Real layout also matters: axe's
 * colour-contrast and scrollable-region rules need paint, and the tab-stop
 * census depends on `getClientRects()`.
 *
 * The specs are named `*.spec.ts` on purpose. `vitest.config.ts` includes
 * `tests/**\/*.test.ts`, so this directory is invisible to vitest and to the
 * global coverage thresholds it enforces.
 */

/** Fixed port so the `webServer` URL below is deterministic. */
const PORT = 5199;

/**
 * The demo's Vite `base` — `index.html` is served from this sub-path.
 *
 * `localhost` rather than `127.0.0.1`: Vite binds to whatever `localhost`
 * resolves to, which is IPv6-only on some machines, and a hard-coded IPv4
 * literal then never connects.
 */
const BASE_URL = `http://localhost:${PORT}/data-table/`;

export default defineConfig({
  testDir: './tests/browser',
  // Loading a 266-column CSV means booting DuckDB WASM, parsing, and
  // rendering ~1,300 controls. Individual assertions are fast; the setup
  // is not.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Serial on CI. Each spec boots DuckDB WASM and parses a 266-column CSV in
  // its own browser context; two of those at once on a shared runner pushes
  // the load past its timeout, and a flaky accessibility gate gets ignored.
  // Locally, parallel — the whole suite is a couple of minutes.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `--strictPort` so a busy 5199 fails loudly instead of silently moving
    // the server somewhere `baseURL` does not point.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
