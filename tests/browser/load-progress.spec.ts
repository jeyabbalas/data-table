/**
 * Phase 1 — `table.on('loadProgress', …)` fires against a real worker.
 *
 * `tests/DataTable.loadProgress.test.ts` drives the same chain in jsdom with
 * a scripted bridge, which proves the wiring but not that the worker's
 * `progress` responses survive the real `postMessage` round trip and the
 * bridge's pending-request bookkeeping. A shipped example
 * (`examples/02-load-from-url/main.ts`) binds a progress bar to this event,
 * so the round trip is the contract.
 *
 * CI-safe by the same rule as `tiers.smoke.spec.ts`: one small load, and
 * every assertion is a count or an invariant rather than a wall clock.
 */
import { expect, test } from '@playwright/test';

/**
 * A timestamp column is deliberate: it is what makes the type probe find
 * something to classify, which is what makes the `analyzing` band real
 * rather than an instant open-and-close.
 */
const CSV = [
  'id,label,when',
  ...Array.from(
    { length: 2000 },
    (_, i) => `${i},row-${i},2024-01-01T00:00:${String(i % 60).padStart(2, '0')}`,
  ),
].join('\n');

test('emits an honest loadProgress sequence through the real worker', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('./');

  const reports = await page.evaluate(async (csv: string) => {
    const mod = (await import(
      /* @vite-ignore */ '/data-table/src/index.ts'
    )) as typeof import('../../src/index');

    const host = document.createElement('div');
    host.style.height = '400px';
    document.querySelector('#table-container')!.appendChild(host);

    const table = await mod.createDataTable({
      container: host,
      persistence: false,
      visualizations: false,
    });

    const seen: import('../../src/index').ProgressInfo[] = [];
    table.on('loadProgress', (info) => seen.push(info));
    await table.loadData(csv, { sourceFormat: 'csv' });
    return seen;
  }, CSV);

  // More than the three fixed reports the old dispatcher posted, and each
  // one attached to work that really happened.
  expect(reports.length).toBeGreaterThan(3);

  const percents = reports.map((r) => r.percent);
  for (let i = 1; i < percents.length; i++) {
    expect(percents[i], `report ${i}: ${JSON.stringify(reports[i])}`).toBeGreaterThanOrEqual(
      percents[i - 1]!,
    );
  }
  expect(percents.filter((p) => p === 100)).toHaveLength(1);
  expect(percents.at(-1)).toBe(100);

  // The main thread's stage carries real bytes; the worker's stages do not
  // claim to be interruptible.
  const reading = reports.filter((r) => r.stage === 'reading');
  expect(reading.length).toBeGreaterThan(0);
  expect(reading.at(-1)!.loaded).toBe(new TextEncoder().encode(CSV).byteLength);
  expect(reading.every((r) => r.cancelable)).toBe(true);
  expect(reports.filter((r) => r.stage !== 'reading').every((r) => !r.cancelable)).toBe(true);

  // `analyzing` was a declared stage nothing emitted.
  expect(reports.some((r) => r.stage === 'analyzing')).toBe(true);

  expect(consoleErrors).toEqual([]);
});
