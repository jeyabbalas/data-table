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
  expectAriaColIndexes,
  mountTable,
  probe,
  wheelBy,
  wheelIntoView,
} from './helpers/table';

function header(page: Page, column: string) {
  return page.locator(`#${HOST_ID} .dt-col-header[data-column="${column}"]`);
}

/** Header and first-row cell of `column`: where they are, and whether either is sticky. */
function boxes(page: Page, column: string) {
  return page.evaluate(
    ({ hostId, column }) => {
      const host = document.getElementById(hostId)!;
      const h = host.querySelector<HTMLElement>(`.dt-col-header[data-column="${column}"]`)!;
      const c = host.querySelector<HTMLElement>(
        `.dt-body .dt-row:not([data-placeholder]) .dt-cell[data-column="${column}"]`,
      )!;
      const hr = h.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      return {
        headerLeft: hr.left,
        headerWidth: hr.width,
        cellLeft: cr.left,
        cellWidth: cr.width,
        sticky: [h, c].some((el) => getComputedStyle(el).position === 'sticky'),
      };
    },
    { hostId: HOST_ID, column },
  );
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

  // Where the pointer is now: before the column under it, or after it if the
  // pointer is past its middle. The header under the pointer is in view; the
  // order around it comes from state.
  const before = await probe(page, 'order');
  const under = await page.evaluate(
    ({ hostId, x }) => {
      const header = Array.from(
        document.querySelectorAll<HTMLElement>(`#${hostId} .dt-col-header[data-column]`),
      ).find((h) => {
        const r = h.getBoundingClientRect();
        return x >= r.left && x < r.right;
      })!;
      const r = header.getBoundingClientRect();
      return { column: header.dataset.column!, pastMiddle: x >= r.left + r.width / 2 };
    },
    { hostId: HOST_ID, x },
  );
  expect(under.column, 'the wheel moved the pointer onto another column').not.toBe('c150');
  const drop = before.indexOf(under.column) + (under.pastMiddle ? 1 : 0);
  const expected = before.filter((c) => c !== 'c150');
  expected.splice(drop - (before.indexOf('c150') < drop ? 1 : 0), 0, 'c150');
  await page.mouse.up();
  await settle(page);

  expect(await probe(page, 'order')).toEqual(expected);
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

  // The column grew past the right edge; bring its handle back into view.
  await wheelIntoView(page, 'c150');
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
  // Hidden throughout, so `aria-colindex` has a gap that numbering the
  // rendered columns from 1 would not.
  await page.evaluate(() => (window as unknown as TestWindow).__dt.actions.hideColumn('c005'));
  await wheelIntoView(page, 'c250');

  await header(page, 'c250').locator('.dt-col-pin-btn').click();
  await settle(page);
  expect((await probe(page, 'order'))[0]).toBe('c250');
  let view = (await probe(page, 'column', 'c250'))!;
  expect(view.pinned).toBe(true);
  expect(view.inView).toBe(true);
  await expectAriaColIndexes(page);

  // Pinned, it stays at the left edge wherever the table scrolls.
  await wheelBy(page, 5_000);
  view = (await probe(page, 'column', 'c250'))!;
  expect(view.left).toBeCloseTo(view.viewLeft, 0);
  let b = await boxes(page, 'c250');
  expect(b.headerLeft).toBeCloseTo(view.left, 0);
  expect(b.cellLeft).toBeCloseTo(view.left, 0);

  // Unpinning puts it first among the unpinned columns, with no sticky
  // styles left behind.
  await header(page, 'c250').locator('.dt-col-pin-btn').click();
  await settle(page);
  expect((await probe(page, 'order'))[0]).toBe('c250');
  expect((await probe(page, 'column', 'c250'))!.pinned).toBe(false);
  await expectAriaColIndexes(page);
  await wheelIntoView(page, 'c250');
  b = await boxes(page, 'c250');
  expect(b.headerLeft).toBeCloseTo((await probe(page, 'column', 'c250'))!.left, 0);
  expect(b.cellLeft).toBeCloseTo(b.headerLeft, 0);
  expect(b.sticky).toBe(false);

  // Hide → pin → show, far from the view: the shown column goes after the
  // pinned block, and every column keeps its number.
  await page.evaluate(() => {
    const { actions } = (window as unknown as TestWindow).__dt;
    actions.hideColumn('c010');
    actions.toggleColumnPin('c011');
    actions.showColumn('c010');
  });
  await settle(page);
  const order = await probe(page, 'order');
  expect(order[0]).toBe('c011');
  expect(order.indexOf('c010')).toBeGreaterThan(0);
  await expectAriaColIndexes(page);
  b = await boxes(page, 'c011');
  expect(b.headerLeft).toBeCloseTo(b.cellLeft, 0);
});
