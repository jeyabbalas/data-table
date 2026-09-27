/**
 * The columns `ColumnWindowController` publishes to mount, and the body rows
 * that render only those, against real layout and real wheel scrolling.
 *
 * Whatever is in view is mounted, in every frame of a sweep, and every row
 * holds exactly the mounted columns. The set stays a few viewports wide. A
 * small scroll leaves it alone. The cursor's column is in it wherever the view
 * goes. And what a sweep leaves in view shows the right values, lined up
 * under the right headers.
 */

import { expect, test } from '@playwright/test';
import { HOST_ID, type TestWindow, mountTable, probe, wheelBy } from './helpers/table';

test('every column in view is mounted, in every frame of a sweep across 400 columns', async ({
  page,
}) => {
  await mountTable(page, { columns: 400, rows: 40 });
  await probe(page, 'watchWindow');
  await wheelBy(page, 30_000);
  await wheelBy(page, -15_000);
  await wheelBy(page, 60_000);
  const report = await probe(page, 'windowReport');
  expect(report.frames).toBeGreaterThan(10);
  expect(report.breaches).toEqual([]);

  // At the far right of a 1,200px view of 150px columns: the eight in view,
  // and up to a viewport's worth either side of the view where the set was
  // last recomputed.
  const mounted = await probe(page, 'mounted');
  expect(mounted.at(-1)).toBe('c399');
  expect(mounted.length).toBeLessThanOrEqual(8 * 3 + 2);
});

test('a scroll back and forth across a column or two leaves the mounted columns alone', async ({
  page,
}) => {
  await mountTable(page, { columns: 300 });
  await wheelBy(page, 20_000);
  // Where a sweep stops, the set may have only the half viewport of slack
  // that a scroll keeps, and a jiggle could fairly move it. A layout change
  // recomputes it around the view, with a whole viewport either side.
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setColumnWidth('c000', 160),
  );
  await probe(page, 'watchWindow');
  for (const dx of [150, -150, 300, -300, 150, -150]) {
    await page.mouse.wheel(dx, 0);
    await page.waitForTimeout(50);
  }
  const report = await probe(page, 'windowReport');
  expect(report.breaches).toEqual([]);
  expect(report.changes).toBe(0);
});

test("the cursor's column stays mounted wherever the view goes, and so does a focused cell's", async ({
  page,
}) => {
  await mountTable(page, { columns: 300 });
  await page.locator(`#${HOST_ID} .dt-grid`).focus();
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setFocusedCell({ row: 2, column: 'c003' }),
  );
  await wheelBy(page, 25_000);
  expect((await probe(page, 'column', 'c003'))!.inView).toBe(false);
  expect(await probe(page, 'mounted')).toContain('c003');

  // A cell clicked on holds DOM focus, and keeps its column when the cursor
  // is moved elsewhere in code.
  const column = (await probe(page, 'inView'))[2]!;
  await page
    .locator(`#${HOST_ID} .dt-row[data-row-index="1"] .dt-cell[data-column="${column}"]`)
    .click();
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setFocusedCell({ row: 1, column: 'c299' }),
  );
  await wheelBy(page, -20_000);
  expect((await probe(page, 'column', column))!.inView).toBe(false);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-column'))).toBe(
    column,
  );
  expect(await probe(page, 'mounted')).toEqual(expect.arrayContaining(['c299', column]));
});

test('body rows hold only the mounted columns through a sweep of 1,000 columns, and show the right values', async ({
  page,
}) => {
  await mountTable(page, { columns: 1000, rows: 60 });
  await probe(page, 'watchWindow');
  for (const dx of [40_000, -25_000, 150_000, -60_000]) {
    await wheelBy(page, dx);
    expect(await probe(page, 'wrongCellsInView'), `after a wheel of ${dx}px`).toEqual([]);
    const misaligned = await probe(page, 'cellHeaderMisalignment');
    expect(misaligned.px, `cell of ${misaligned.column} under its header`).toBeLessThan(1);
  }
  const report = await probe(page, 'windowReport');
  expect(report.frames).toBeGreaterThan(10);
  expect(report.breaches).toEqual([]);

  // A row renders the eight columns in view, a viewport either side, and
  // nothing else: some two dozen cells, not a thousand.
  const mounted = await probe(page, 'mounted');
  expect(mounted.length).toBeLessThanOrEqual(8 * 3 + 2);
  const { rows, cells } = await probe(page, 'bodyCells');
  expect(rows).toBeGreaterThan(10);
  expect(cells).toBe(rows * mounted.length);
});

test('a pinned column keeps its cells at the left edge however far the rows scroll', async ({
  page,
}) => {
  await mountTable(page, { columns: 400 });
  await page.evaluate(() => (window as unknown as TestWindow).__dt.actions.toggleColumnPin('c200'));
  await wheelBy(page, 30_000);
  expect((await probe(page, 'mounted'))[0]).toBe('c200');
  expect(await probe(page, 'wrongCellsInView')).toEqual([]);
  const misaligned = await probe(page, 'cellHeaderMisalignment');
  expect(misaligned.px, `cell of ${misaligned.column} under its header`).toBeLessThan(1);
  const pinned = await page
    .locator(`#${HOST_ID} .dt-row[data-row-index="0"] .dt-cell[data-column="c200"]`)
    .boundingBox();
  const body = await page.locator(`#${HOST_ID} .dt-body-scroll`).boundingBox();
  expect(pinned!.x).toBe(body!.x);
});
