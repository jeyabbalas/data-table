/**
 * Phase 1 — the load message really transfers its source buffer.
 *
 * `tests/data/WorkerBridge.transfer.test.ts` pins the contract (the buffer is
 * named in `postMessage`'s transfer list) against a synthetic worker. Only a
 * real `Worker` actually *detaches* it, so the observable consequence —
 * `byteLength` drops to 0 on the sending side — can only be asserted here.
 *
 * This runs in the default `npm run test:browser`: it is a single small load
 * with no wall-clock assertion, so it is CI-safe by the same rule as
 * `tiers.smoke.spec.ts`.
 */
import { expect, test } from '@playwright/test';

/** Small enough that the whole spec is a few hundred milliseconds of DuckDB. */
const CSV = ['id,label', ...Array.from({ length: 200 }, (_, i) => `${i},row-${i}`)].join('\n');

test('transfers and detaches the source ArrayBuffer', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('./');

  const result = await page.evaluate(async (csv: string) => {
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

    const source = new TextEncoder().encode(csv).buffer as ArrayBuffer;
    const byteLengthBefore = source.byteLength;

    const loaded = new Promise<number>((resolve) => {
      table.on('loadComplete', (payload) => resolve(payload.rowCount));
    });
    await table.loadData(source, { sourceFormat: 'csv' });
    const rowCount = await loaded;

    // Reading a detached buffer does not throw — `byteLength` is simply 0 —
    // so this is a value assertion, not a rejects-check.
    return { byteLengthBefore, byteLengthAfter: source.byteLength, rowCount };
  }, CSV);

  expect(result.byteLengthBefore).toBeGreaterThan(0);
  // The load succeeded *and* the buffer is gone: detachment happened because
  // the worker took ownership, not because the source was never read.
  expect(result.rowCount).toBe(200);
  expect(result.byteLengthAfter).toBe(0);
  expect(consoleErrors).toEqual([]);
});
