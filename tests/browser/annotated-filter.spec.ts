/**
 * A reload with the annotated filter on: the saved session brings back the
 * filter and the annotations, and the table of annotated rows the filter
 * reads is built in DuckDB before anything reads it. Real Chromium, real
 * DuckDB-WASM, real IndexedDB, a real page reload.
 *
 * What it guards: without the read gate, the restored filter's first count
 * and rows would query a table not built yet (a Catalog error, error
 * events) or built before the annotations came back (an empty view, then
 * the right one). Here no error is reported, the count never reads 0, and
 * from the moment the filter is back every data row the grid renders is an
 * annotated one.
 */

import { expect, test, type Page } from '@playwright/test';

const HOST_ID = 'annotated-filter-host';
const TABLE = 'annotated_reload';
const ROWS = 5_000;
/**
 * A page of the dev server that leaves sessions alone: the demo's own start
 * deletes every saved session but its dataset's.
 */
const PAGE = './shortcuts/';
/** The rows that get annotations: by row scope, by cell scope, and both. */
const ANNOTATED = [7, 1234, 4321];

type SpecWindow = {
  __t: import('../../src/index').DataTable;
  __probe: {
    errors: string[];
    filterBack: boolean;
    strayRows: number[];
    counts: number[];
  };
};

/**
 * Mount a table with persistence on, watching it from before its load,
 * and load the same generated rows into `TABLE`.
 */
async function mountAndLoad(page: Page): Promise<void> {
  await page.evaluate(
    async ({ hostId, table, rows, annotated }) => {
      const w = window as unknown as SpecWindow;
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../src/index');
      await import(/* @vite-ignore */ '/data-table/src/styles/index.css?import');
      const host = document.createElement('div');
      host.id = hostId;
      host.style.cssText = 'position: fixed; inset: 0 auto auto 0; width: 900px; height: 600px;';
      document.body.appendChild(host);
      const t = await mod.createDataTable({ container: host, visualizations: false });
      w.__t = t;

      const probe = (w.__probe = { errors: [], filterBack: false, strayRows: [], counts: [] });
      t.on('error', ({ error, source }) => probe.errors.push(`${source}: ${error.message}`));
      t.state.filters.subscribe((filters) => {
        if (filters.some((f) => f.type === 'annotated')) probe.filterBack = true;
      });
      t.state.filteredRows.subscribe((count) => {
        if (probe.filterBack) probe.counts.push(count);
      });
      const keep = new Set(annotated);
      new MutationObserver(() => {
        if (!probe.filterBack) return;
        for (const row of host.querySelectorAll('.dt-body .dt-row[data-row-id]')) {
          if (row.hasAttribute('data-placeholder')) continue;
          const id = Number(row.getAttribute('data-row-id'));
          if (!keep.has(id)) probe.strayRows.push(id);
        }
      }).observe(host, { subtree: true, childList: true, attributes: true });

      await t.bridge.query(
        `CREATE OR REPLACE TABLE gen_src AS
         SELECT CAST(i AS INTEGER) AS id, 'g' || (i % 97) AS grp FROM range(0, ${rows}) t(i)`,
      );
      const buf = await t.bridge.exportToBuffer(
        'SELECT id, grp FROM gen_src ORDER BY id',
        'parquet',
      );
      await t.bridge.query('DROP TABLE gen_src');
      await t.loadData(buf.buffer as ArrayBuffer, { tableName: table, sourceFormat: 'parquet' });
    },
    { hostId: HOST_ID, table: TABLE, rows: ROWS, annotated: ANNOTATED },
  );
}

/** The ids of the data rows the grid renders now, in order. */
function renderedRows(page: Page): Promise<number[]> {
  return page.evaluate((hostId) => {
    return Array.from(
      document.querySelectorAll(`#${hostId} .dt-body .dt-row[data-row-id]:not([data-placeholder])`),
    ).map((row) => Number(row.getAttribute('data-row-id')));
  }, HOST_ID);
}

test('a reload with the annotated filter on restores the annotated view, with no error and no flash', async ({
  page,
}) => {
  await page.goto(PAGE);
  await mountAndLoad(page);
  // A fresh start: no session left from an earlier run.
  await page.evaluate(() => (window as unknown as SpecWindow).__t.clearSession());
  await mountAndLoadAgain(page);

  await page.evaluate((annotated) => {
    const t = (window as unknown as SpecWindow).__t;
    const [rowFirst, cell, both] = annotated;
    t.annotations.addMany([
      { scope: 'row', rowId: rowFirst!, severity: 'error', message: 'row' },
      { scope: 'cell', rowId: cell!, column: 'grp', severity: 'info', message: 'cell' },
      { scope: 'row', rowId: both!, severity: 'warning', message: 'row' },
      { scope: 'cell', rowId: both!, column: 'id', severity: 'error', message: 'cell' },
      { scope: 'column', column: 'grp', severity: 'warning', message: 'singles out no row' },
    ]);
    t.actions.showAnnotatedRows();
  }, ANNOTATED);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as SpecWindow).__t.state.filteredRows.get()))
    .toBe(3);
  await expect.poll(() => renderedRows(page)).toEqual(ANNOTATED);

  // The session, filter and annotations included, is saved.
  await expect
    .poll(() =>
      page.evaluate(async (table) => {
        const mod = (await import(
          /* @vite-ignore */ '/data-table/src/index.ts'
        )) as typeof import('../../src/index');
        const store = new mod.SessionStore();
        await store.open();
        const snapshot = await store.load(table);
        store.close();
        return (snapshot?.filters ?? []).map((f) => f.type);
      }, TABLE),
    )
    .toEqual(['annotated']);

  await page.reload();
  await mountAndLoad(page);

  const probe = await page.evaluate(() => (window as unknown as SpecWindow).__probe);
  expect(probe.filterBack).toBe(true);
  expect(probe.errors).toEqual([]);
  expect(probe.strayRows).toEqual([]);
  expect(probe.counts).not.toContain(0);
  expect(
    await page.evaluate(() => (window as unknown as SpecWindow).__t.state.filteredRows.get()),
  ).toBe(3);
  await expect.poll(() => renderedRows(page)).toEqual(ANNOTATED);

  await page.evaluate(() => (window as unknown as SpecWindow).__t.clearSession());
});

/** Destroy the table mounted, and mount and load another, as after a reload. */
async function mountAndLoadAgain(page: Page): Promise<void> {
  await page.evaluate(async (hostId) => {
    const w = window as unknown as SpecWindow;
    await w.__t.destroy();
    document.getElementById(hostId)?.remove();
  }, HOST_ID);
  await mountAndLoad(page);
}
