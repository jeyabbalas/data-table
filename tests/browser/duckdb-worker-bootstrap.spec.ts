/**
 * DuckDB still starts when the fix for duckdb-wasm's `openFile` cannot
 * install itself (src/worker/openFileFix.ts). Here the fix meets a
 * duckdb-wasm worker that publishes its runtime where it cannot be hooked:
 * DuckDB's own script is served with one line more, which makes
 * `DUCKDB_RUNTIME` a property that cannot be redefined.
 */

import { expect, test } from '@playwright/test';

test('DuckDB still starts and loads when the openFile fix cannot install itself', async ({
  page,
}) => {
  let served = 0;
  await page.context().route(/duckdb-browser-(eh|mvp)\.worker\.js$/, async (route) => {
    const response = await route.fetch();
    served++;
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        '\nObject.defineProperty(globalThis, "DUCKDB_RUNTIME", ' +
        '{ value: undefined, writable: true, configurable: false });\n',
    });
  });
  await page.goto('./');

  const rows = await page.evaluate(async () => {
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
    await table.bridge.query(
      "CREATE TABLE src AS SELECT range AS id, 'row ' || range AS name FROM range(1000)",
    );
    const bytes = await table.bridge.exportToBuffer('SELECT * FROM src', 'parquet');
    await table.loadData(new File([bytes], 'rows.parquet'));
    return table.state.totalRows.get();
  });

  expect(served).toBe(1);
  expect(rows).toBe(1000);
});
