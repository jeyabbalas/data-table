/**
 * Pointer gestures and column actions on a column that the wheel has
 * scrolled away and back: drag-reorder, resize, pin and unpin, hide and
 * show.
 *
 * These hold on the unwindowed grid, where a column's header and cells stay
 * in the DOM however far it scrolls. Rendering only the columns near the
 * view must keep them holding.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import {
  HOST_ID,
  type TestWindow,
  mountTable,
  probe,
  wheelBy,
  wheelIntoView,
} from './helpers/table';

function header(page: Page, column: string) {
  return page.locator(`#${HOST_ID} .dt-col-header[data-column="${column}"]`);
}

/** Header and first-row cell of `column`: left edge and width. */
function boxes(page: Page, column: string) {
  return page.evaluate(
    ({ hostId, column }) => {
      const host = document.getElementById(hostId)!;
      const h = host.querySelector(`.dt-col-header[data-column="${column}"]`)!;
      const c = host.querySelector(
        `.dt-body .dt-row:not([data-placeholder]) .dt-cell[data-column="${column}"]`,
      )!;
      const hr = h.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      return { headerLeft: hr.left, headerWidth: hr.width, cellLeft: cr.left, cellWidth: cr.width };
    },
    { hostId: HOST_ID, column },
  );
}

function ascending(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v > values[i - 1]!);
}

test('a drag-reorder lands where the pointer is after the wheel scrolls mid-drag', async ({
  page,
}) => {
  await mountTable(page);
  await wheelIntoView(page, 'c150');

  const handle = (await header(page, 'c150').locator('.dt-col-drag-handle').boundingBox())!;
  const y = handle.y + handle.height / 2;
  let x = handle.x + handle.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  x += 12;
  await page.mouse.move(x, y, { steps: 3 });
  await expect(page.locator(`#${HOST_ID} .dt-root`)).toHaveClass(/dt-column-dragging/);

  // Scroll about twenty columns on with the button held, then nudge the
  // pointer the way a hand holding a mouse does.
  await wheelBy(page, 3_000, { over: 'pointer' });
  x += 2;
  await page.mouse.move(x, y);

  // Where the pointer is now: before the header under it, or after it if the
  // pointer is past its middle.
  const expected = await page.evaluate(
    ({ hostId, x }) => {
      const headers = Array.from(
        document.querySelectorAll<HTMLElement>(`#${hostId} .dt-col-header[data-column]`),
      );
      const i = headers.findIndex((h) => {
        const r = h.getBoundingClientRect();
        return x >= r.left && x < r.right;
      });
      const r = headers[i]!.getBoundingClientRect();
      const names = headers.map((h) => h.dataset.column!);
      const drop = x < r.left + r.width / 2 ? i : i + 1;
      const moved = names.filter((n) => n !== 'c150');
      moved.splice(drop - (names.indexOf('c150') < drop ? 1 : 0), 0, 'c150');
      return moved;
    },
    { hostId: HOST_ID, x },
  );
  await page.mouse.up();
  await settle(page);

  expect(await probe(page, 'headerOrder')).toEqual(expected);
  expect(
    await page.evaluate(() => (window as unknown as TestWindow).__dt.state.visibleColumns.get()),
  ).toEqual(expected);
  await expect(page.locator(`#${HOST_ID} .dt-root`)).not.toHaveClass(/dt-column-dragging/);
  const c150 = await boxes(page, 'c150');
  expect(c150.headerLeft, 'c150 over its cells').toBeCloseTo(c150.cellLeft, 0);
});

test('a column scrolled away and back resizes by drag and resets on double-click', async ({
  page,
}) => {
  await mountTable(page);
  await wheelBy(page, 20_000);
  await wheelIntoView(page, 'c150');

  const resize = header(page, 'c150').locator('.dt-col-resize-handle');
  const box = (await resize.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 4 });
  await page.mouse.up();
  await settle(page);

  let b = await boxes(page, 'c150');
  expect(b.headerWidth).toBeCloseTo(190, 0);
  expect(b.cellWidth).toBeCloseTo(190, 0);
  expect(b.headerLeft).toBeCloseTo(b.cellLeft, 0);
  expect(
    await page.evaluate(() =>
      (window as unknown as TestWindow).__dt.state.columnWidths.get().get('c150'),
    ),
  ).toBe(190);

  const after = (await resize.boundingBox())!;
  await page.mouse.dblclick(after.x + after.width / 2, after.y + after.height / 2);
  await settle(page);
  b = await boxes(page, 'c150');
  expect(b.headerWidth).toBeCloseTo(150, 0);
  expect(b.cellWidth).toBeCloseTo(150, 0);
  expect(b.headerLeft).toBeCloseTo(b.cellLeft, 0);
});

test('pinning a far-right column, and hide → pin → show, keep columns over their cells', async ({
  page,
}) => {
  await mountTable(page);
  await wheelIntoView(page, 'c250');

  await header(page, 'c250').locator('.dt-col-pin-btn').click();
  await settle(page);
  let order = await probe(page, 'headerOrder');
  expect(order[0]).toBe('c250');
  let view = (await probe(page, 'column', 'c250'))!;
  expect(view.pinned).toBe(true);
  expect(view.inView).toBe(true);
  expect(ascending(await probe(page, 'headerColIndexes'))).toBe(true);
  expect(ascending(await probe(page, 'cellColIndexes'))).toBe(true);

  // Pinned, it stays at the left edge wherever the table scrolls.
  await wheelBy(page, 5_000);
  view = (await probe(page, 'column', 'c250'))!;
  expect(view.left).toBeCloseTo(view.viewLeft, 0);
  let b = await boxes(page, 'c250');
  expect(b.headerLeft).toBeCloseTo(b.cellLeft, 0);

  // Unpinning puts it first among the unpinned columns.
  await header(page, 'c250').locator('.dt-col-pin-btn').click();
  await settle(page);
  order = await probe(page, 'headerOrder');
  expect(order[0]).toBe('c250');
  expect((await probe(page, 'column', 'c250'))!.pinned).toBe(false);
  expect(ascending(await probe(page, 'headerColIndexes'))).toBe(true);
  expect(ascending(await probe(page, 'cellColIndexes'))).toBe(true);

  // Hide → pin → show, far from the view: the shown column goes after the
  // pinned block, and the numbering still ascends.
  await page.evaluate(() => {
    const { actions } = (window as unknown as TestWindow).__dt;
    actions.hideColumn('c010');
    actions.toggleColumnPin('c011');
    actions.showColumn('c010');
  });
  await settle(page);
  order = await probe(page, 'headerOrder');
  expect(order[0]).toBe('c011');
  expect(order.indexOf('c010')).toBeGreaterThan(0);
  expect(ascending(await probe(page, 'headerColIndexes'))).toBe(true);
  expect(ascending(await probe(page, 'cellColIndexes'))).toBe(true);
  b = await boxes(page, 'c011');
  expect(b.headerLeft).toBeCloseTo(b.cellLeft, 0);
});
