/**
 * Parquet from a File is read from disk by DuckDB, not copied into memory.
 *
 * DataLoader hands the File to the worker unread, and the loader registers
 * it as a file handle (BROWSER_FILEREADER), which only works in a real
 * browser: Node has no FileReaderSync, so the loader's Node tests cover the
 * ArrayBuffer path only. These specs load through the public API and check
 * three things: the rows arrive intact, the page never reads the File, and
 * a load that cannot fit rejects with LOAD_MEMORY_EXCEEDED while the DuckDB
 * table already loaded stays queryable.
 */

import { expect, test } from '@playwright/test';

type Window = {
  __t: import('../../src/index').DataTable;
  __reads: number;
};

const ROWS = 300_000;

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const w = window as unknown as Window;
    const mod = (await import(
      /* @vite-ignore */ '/data-table/src/index.ts'
    )) as typeof import('../../src/index');
    const host = document.createElement('div');
    host.style.height = '600px';
    document.querySelector('#table-container')!.appendChild(host);
    w.__t = await mod.createDataTable({
      container: host,
      persistence: false,
      visualizations: false,
    });
  });
});

/** Build a Parquet File in the page, with its reads counted in `window.__reads`. */
async function makeParquetFile(page: import('@playwright/test').Page, rows: number) {
  await page.evaluate(async (rows) => {
    const w = window as unknown as Window & { __file: File };
    const bridge = w.__t.bridge;
    await bridge.query(
      `CREATE OR REPLACE TABLE src AS
       SELECT CAST(i AS INTEGER) AS id, 'name ' || (i % 1000) AS name, i / 7.0 AS score
       FROM range(0, ${rows}) t(i)`,
    );
    const bytes = await bridge.exportToBuffer('SELECT * FROM src ORDER BY id', 'parquet');
    await bridge.query('DROP TABLE src');
    const file = new File([bytes], 'scores.parquet');
    w.__reads = 0;
    for (const method of ['arrayBuffer', 'text', 'stream', 'bytes'] as const) {
      const original = (file as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
      if (typeof original !== 'function') continue;
      Object.defineProperty(file, method, {
        value: (...args: unknown[]) => {
          w.__reads++;
          return original.apply(file, args);
        },
      });
    }
    w.__file = file;
  }, rows);
}

test('loads a Parquet File without reading it on the page', async ({ page }) => {
  await makeParquetFile(page, ROWS);

  const result = await page.evaluate(async () => {
    const w = window as unknown as Window & { __file: File };
    await w.__t.loadData(w.__file);
    const table = w.__t.state.tableName.get()!;
    const [summary] = await w.__t.bridge.query<{ n: number; ids: number; last: string }>(
      `SELECT count(*) AS n, sum(id) AS ids,
              max_by(name, "__rowid__") AS last
       FROM "${table}"`,
    );
    const [settings] = await w.__t.bridge.query<{ prefetch: string; cache: string }>(
      `SELECT current_setting('prefetch_all_parquet_files')::VARCHAR AS prefetch,
              current_setting('enable_external_file_cache')::VARCHAR AS cache`,
    );
    return { summary, settings, reads: w.__reads, total: w.__t.state.totalRows.get() };
  });

  expect(result.reads).toBe(0);
  expect(result.total).toBe(ROWS);
  expect(result.summary).toEqual({
    n: ROWS,
    ids: (ROWS * (ROWS - 1)) / 2,
    last: `name ${(ROWS - 1) % 1000}`,
  });
  // The loader's read settings are back to DuckDB's defaults.
  expect(result.settings).toEqual({ prefetch: 'false', cache: 'true' });
  await expect(page.locator('#table-container .dt-body .dt-row').first()).toBeVisible();
});

test('rejects a Parquet File that cannot fit, keeping the loaded DuckDB table', async ({
  page,
}) => {
  await makeParquetFile(page, 10_000);
  await page.evaluate(async () => {
    const w = window as unknown as Window & { __file: File };
    await w.__t.loadData(w.__file);
  });
  await makeParquetFile(page, ROWS);

  const outcome = await page.evaluate(async () => {
    const w = window as unknown as Window & { __file: File };
    const bridge = w.__t.bridge;
    // A failed load resets the table's state, but leaves the previous
    // DuckDB table in place.
    const previous = w.__t.state.tableName.get()!;
    const events: string[] = [];
    w.__t.on('loadError', ({ error }) => events.push(error.code));
    const [{ limit }] = await bridge.query<{ limit: string }>(
      "SELECT current_setting('memory_limit') AS limit",
    );
    // ~7 MB of footer work fits; ~7 MB of table on top does not.
    await bridge.query("SET memory_limit = '12MB'");
    let error: { name: string; code: string; stage: unknown } | null = null;
    try {
      await w.__t.loadData(w.__file);
    } catch (err) {
      const e = err as { name: string; code: string; details?: { stage?: unknown } };
      error = { name: e.name, code: e.code, stage: e.details?.stage };
    } finally {
      await bridge.query(`SET memory_limit = '${limit}'`);
    }
    const [{ n }] = await bridge.query<{ n: number }>(`SELECT count(*) AS n FROM "${previous}"`);
    return { error, events, rowsStillQueryable: n };
  });

  expect(outcome.error).toEqual({
    name: 'LoadError',
    code: 'LOAD_MEMORY_EXCEEDED',
    stage: 'estimate',
  });
  expect(outcome.events).toEqual(['LOAD_MEMORY_EXCEEDED']);
  expect(outcome.rowsStillQueryable).toBe(10_000);
});
