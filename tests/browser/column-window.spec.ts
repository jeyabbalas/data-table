/**
 * The columns `ColumnWindowController` publishes to mount, against real
 * layout and real wheel scrolling.
 *
 * Nothing renders from them yet: the body still has every column. These pin
 * down what the body will rely on. Whatever is in view is mounted, in every
 * frame of a sweep. The set stays a few viewports wide. A small scroll leaves
 * it alone. And the cursor's column is in it wherever the view goes.
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
