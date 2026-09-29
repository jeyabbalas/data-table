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

test('a drag-reorder lands where the pointer is after the wheel scrolls the headers under it', async ({
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

  // Scroll about twenty columns on with the button held, and let go without
  // moving the pointer: the drop has to follow the headers that moved under it.
  await wheelBy(page, 3_000, { over: 'pointer' });

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
  // The drop indicator followed the headers: it marks that gap, at the edge
  // of the header under the pointer, rather than scrolling off with the row.
  const indicator = await page.evaluate(
    ({ hostId, column, pastMiddle }) => {
      const h = document
        .querySelector(`#${hostId} .dt-col-header[data-column="${column}"]`)!
        .getBoundingClientRect();
      const i = document.querySelector(`#${hostId} .dt-drop-indicator`)!.getBoundingClientRect();
      return { at: i.left, edge: pastMiddle ? h.right : h.left };
    },
    { hostId: HOST_ID, column: under.column, pastMiddle: under.pastMiddle },
  );
  expect(indicator.at).toBeCloseTo(indicator.edge, 0);
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

/**
 * Pin c000 and c001 and widen c001 to 500 px, so the right half of its header
 * lies over 250 px of unpinned headers once the rest scroll beneath it, and
 * scroll c150 into view.
 */
async function pinWideBlock(page: Page): Promise<void> {
  await mountTable(page);
  await page.evaluate(() => {
    const { actions } = (window as unknown as TestWindow).__dt;
    actions.toggleColumnPin('c000');
    actions.toggleColumnPin('c001');
    actions.setColumnWidth('c001', 500);
  });
  await settle(page);
  await wheelIntoView(page, 'c150');
}

/**
 * On screen: the pinned block's right edge; the vertical middle of the
 * header row; a pointer over the right half of c001 that is just short of
 * the middle of `beneath`, an unpinned header wholly under the pinned block;
 * and `first`, the first unpinned column at least partly in view.
 */
function pinnedGeometry(page: Page) {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const headers = Array.from(host.querySelectorAll<HTMLElement>('.dt-col-header[data-column]'));
    const isPinned = (h: HTMLElement) => h.classList.contains('dt-col-header--pinned');
    const box = (h: HTMLElement) => h.getBoundingClientRect();
    const edge = Math.max(...headers.filter(isPinned).map((h) => box(h).right));
    const c001 = box(headers.find((h) => h.dataset.column === 'c001')!);
    const half = c001.left + c001.width / 2;
    const unpinned = headers.filter((h) => !isPinned(h));
    const middle = (h: HTMLElement) => box(h).left + box(h).width / 2;
    const beneath = unpinned.find((h) => middle(h) > half + 10 && box(h).right <= edge)!;
    const first = unpinned.find((h) => box(h).right > edge)!;
    return {
      edge,
      y: c001.top + c001.height / 2,
      pointer: middle(beneath) - 5,
      beneath: beneath.dataset.column!,
      first: first.dataset.column!,
    };
  }, HOST_ID);
}

/** Press `column`'s drag handle and drag it to `x`, `y` on screen. */
async function dragTo(page: Page, column: string, x: number, y: number): Promise<void> {
  const handle = (await header(page, column).locator('.dt-col-drag-handle').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await expect(page.locator(`#${HOST_ID} .dt-root`)).toHaveClass(/dt-column-dragging/);
}

function indicatorLeft(page: Page): Promise<number> {
  return page.evaluate(
    (hostId) =>
      document.querySelector(`#${hostId} .dt-drop-indicator`)!.getBoundingClientRect().left,
    HOST_ID,
  );
}

test('a column let go on the pinned block lands beside it, not among the headers beneath it', async ({
  page,
}) => {
  await pinWideBlock(page);
  const g = await pinnedGeometry(page);
  expect(g.beneath, 'a header wholly beneath the pinned block').not.toBe(g.first);
  const before = await probe(page, 'order');

  await dragTo(page, 'c150', g.pointer, g.y);
  // The indicator marks the pinned block's edge, where the column will land.
  expect(await indicatorLeft(page)).toBeCloseTo(g.edge, 0);
  await page.mouse.up();
  await settle(page);

  // Before the first unpinned column in view, and not before `beneath`,
  // whose header's middle was just past the pointer.
  const expected = before.filter((c) => c !== 'c150');
  expected.splice(expected.indexOf(g.first), 0, 'c150');
  expect(await probe(page, 'order')).toEqual(expected);
  const c150 = await boxes(page, 'c150');
  expect(c150.headerLeft + c150.headerWidth, 'c150 at least partly in view').toBeGreaterThan(
    g.edge,
  );
  expect(c150.headerLeft, 'c150 over its cells').toBeCloseTo(c150.cellLeft, 0);
  await expectAriaColIndexes(page);
});

test('a drag whose release is lost ends at the next move, without a drop', async ({ page }) => {
  await mountTable(page, { columns: 40 });
  const before = await probe(page, 'order');
  const root = page.locator(`#${HOST_ID} .dt-root`);
  const handle = (await header(page, 'c02').locator('.dt-col-drag-handle').boundingBox())!;
  const y = handle.y + handle.height / 2;
  await dragTo(page, 'c02', handle.x + 300, y);

  // The button came up in another window, after an alt-tab. Back in this
  // one, the pointer's first move reports no button held, and no mouseup
  // ever arrived.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: handle.x + 320,
    y,
    button: 'none',
    buttons: 0,
  });
  await expect(root).not.toHaveClass(/dt-column-dragging/);
  await expect(page.locator(`#${HOST_ID} .dt-drop-indicator`)).toHaveCount(0);

  // Playwright still holds the button: letting it go now is a stray mouseup.
  await page.mouse.up();
  await settle(page);
  expect(await probe(page, 'order')).toEqual(before);
});

test('a drag ends without a drop, and lets go of its column, when the window loses focus', async ({
  page,
}) => {
  await mountTable(page);
  await wheelIntoView(page, 'c150');
  const before = await probe(page, 'order');
  const root = page.locator(`#${HOST_ID} .dt-root`);
  const handle = (await header(page, 'c150').locator('.dt-col-drag-handle').boundingBox())!;
  await dragTo(page, 'c150', handle.x + 20, handle.y + handle.height / 2);
  // Held while dragged, however far the wheel takes it.
  await wheelBy(page, 3_000, { over: 'pointer' });
  expect(await probe(page, 'mounted')).toContain('c150');

  // What an alt-tab does to the page.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(root).not.toHaveClass(/dt-column-dragging/);
  await expect.poll(() => probe(page, 'mounted')).not.toContain('c150');

  await page.mouse.up();
  await settle(page);
  expect(await probe(page, 'order')).toEqual(before);
});

for (const scaling of ['transform: scale(0.8); transform-origin: 0 0;', 'zoom: 1.25;']) {
  test(`a drop lands before the header under the pointer in a host with ${scaling.split(';')[0]}`, async ({
    page,
  }) => {
    // Scaled, rects are in screen pixels and scroll positions and the
    // layout's widths are not.
    await mountTable(page, {
      css: `#${HOST_ID} { ${scaling} }`,
      width: scaling.includes('1.25') ? 900 : 1200,
    });
    await wheelIntoView(page, 'c150');
    const inView = await probe(page, 'inView');
    const target = inView[inView.indexOf('c150') - 4]!;
    const before = await probe(page, 'order');

    const t = (await header(page, target).boundingBox())!;
    await dragTo(page, 'c150', t.x + t.width / 4, t.y + t.height / 2);
    expect(await indicatorLeft(page), 'the indicator at the target header’s left edge').toBeCloseTo(
      t.x,
      0,
    );
    await page.mouse.up();
    await settle(page);

    const expected = before.filter((c) => c !== 'c150');
    expected.splice(expected.indexOf(target), 0, 'c150');
    expect(await probe(page, 'order')).toEqual(expected);
  });
}
