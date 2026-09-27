/**
 * The keyboard cursor on a column that the wheel has scrolled out of view.
 *
 * Every assertion here holds on the unwindowed grid, where every column is in
 * the DOM whether it is on screen or not. Rendering only the columns near the
 * view must keep them holding: the cursor's cell and header have to stay
 * mounted however far away the user scrolls, and `aria-activedescendant` has
 * to keep naming the element that carries the cursor ring.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import {
  HOST_ID,
  type CursorState,
  type TestWindow,
  mountTable,
  probe,
  wheelBy,
  wheelIntoView,
} from './helpers/table';

/** A header row cursor, as `state.focusedCell` records it. */
const HEADER = -1;

/** Put the cursor at `row` / `column` with one real key press, so it is in view. */
async function placeCursor(page: Page, row: number, column: string): Promise<void> {
  await page.locator(`#${HOST_ID} .dt-grid`).focus();
  // One column to the left, then ArrowRight: the key press is what scrolls
  // the cursor into view.
  await page.evaluate(
    ({ row, column }) => {
      const table = (window as unknown as TestWindow).__dt;
      const visible = table.state.visibleColumns.get();
      const left = visible[visible.indexOf(column) - 1]!;
      table.actions.setFocusedCell({ row, column: left });
    },
    { row, column },
  );
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), row, column, { inView: true });
}

/**
 * The cursor sits on `row` / `column`, `aria-activedescendant` names the one
 * element carrying the cursor ring, and real focus is on the grid.
 */
function expectCursor(
  c: CursorState,
  row: number,
  column: string,
  opts: { inView?: boolean } = {},
): void {
  const where = `cursor at ${row}/${column}`;
  expect(c.focused, where).toEqual({ row, column });
  expect(c.target, `${where}: aria-activedescendant="${c.activeId}" resolves`).not.toBeNull();
  expect(c.target!.kind, where).toBe(row === HEADER ? 'header' : 'cell');
  expect(c.target!.row, where).toBe(row);
  expect(c.target!.column, where).toBe(column);
  expect(c.target!.ringed, `${where}: the named element carries the ring`).toBe(true);
  expect(c.rings, `${where}: one ring in the table`).toEqual([
    row === HEADER ? `header:${column}` : `cell:${row}:${column}`,
  ]);
  expect(c.active, `${where}: real focus`).toContain('dt-grid');
  if (opts.inView !== undefined) {
    expect(c.target!.inView, `${where}: in view`).toBe(opts.inView);
  }
}

test('the cursor keeps its cell through a wheel sweep, and the arrows bring it back', async ({
  page,
}) => {
  await mountTable(page);

  await placeCursor(page, 2, 'c150');
  await wheelBy(page, 20_000);
  expectCursor(await probe(page, 'cursor'), 2, 'c150', { inView: false });
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), 2, 'c149', { inView: true });

  // The header row, scrolled the other way.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c149', { inView: true });
  await wheelBy(page, -15_000);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c149', { inView: false });
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });
});

test('Home, End and Ctrl+End keep the cursor in view with two pinned columns', async ({ page }) => {
  await mountTable(page);
  await page.evaluate(() => {
    const { actions } = (window as unknown as TestWindow).__dt;
    actions.toggleColumnPin('c000');
    actions.toggleColumnPin('c001');
  });
  await settle(page);

  await placeCursor(page, 3, 'c150');
  await wheelBy(page, 10_000);

  const steps: [key: string, row: number, column: string][] = [
    ['End', 3, 'c299'],
    ['Home', 3, 'c000'],
    ['ArrowRight', 3, 'c001'],
    ['ArrowRight', 3, 'c002'],
    ['Control+End', 199, 'c299'],
    ['Control+Home', 0, 'c000'],
    ['ArrowUp', HEADER, 'c000'],
    ['End', HEADER, 'c299'],
    ['Home', HEADER, 'c000'],
  ];
  for (const [key, row, column] of steps) {
    await page.keyboard.press(key);
    await settle(page);
    expectCursor(await probe(page, 'cursor'), row, column, { inView: true });
  }
});

test('a header scrolled away and back sorts, cycles its controls and gives focus back', async ({
  page,
}) => {
  await mountTable(page);
  await placeCursor(page, HEADER, 'c150');
  await wheelBy(page, 20_000);
  await wheelIntoView(page, 'c150');
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });

  await page.keyboard.press('Enter');
  await settle(page);
  expect(
    await page.evaluate(() => (window as unknown as TestWindow).__dt.state.sortColumns.get()),
  ).toEqual([{ column: 'c150', direction: 'asc' }]);
  await expect(page.locator(`#${HOST_ID} .dt-col-header[data-column="c150"]`)).toHaveAttribute(
    'aria-sort',
    'ascending',
  );

  // F2 puts real focus on the header's first control; the arrows cycle them.
  await page.keyboard.press('F2');
  const first = await page.evaluate(() => document.activeElement?.className ?? '');
  expect(first).toContain('dt-col-pin-btn');
  await page.keyboard.press('ArrowRight');
  const second = await page.evaluate(() => ({
    cls: document.activeElement?.className ?? '',
    column: document.activeElement?.closest('[data-column]')?.getAttribute('data-column'),
  }));
  expect(second.cls).toContain('dt-col-hide-btn');
  expect(second.column).toBe('c150');

  await page.keyboard.press('Escape');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });
  await page.keyboard.press('ArrowDown');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), 0, 'c150', { inView: true });
});

test('Shift+F2 on a header scrolled away and back resizes, moves, and Escape restores both', async ({
  page,
}) => {
  await mountTable(page);
  await placeCursor(page, HEADER, 'c150');
  await wheelBy(page, -8_000);
  await wheelIntoView(page, 'c150');
  // Clear of the right edge, so the column can grow and move without leaving
  // the view.
  await wheelBy(page, 600);

  const orderBefore = await probe(page, 'headerOrder');
  await page.keyboard.press('Shift+F2');
  await expect(page.locator(`#${HOST_ID} .dt-col-header--layout`)).toHaveAttribute(
    'data-column',
    'c150',
  );

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await settle(page);
  const during = await probe(page, 'headerOrder');
  expect(during.indexOf('c150')).toBe(orderBefore.indexOf('c150') + 1);
  const header = page.locator(`#${HOST_ID} .dt-col-header[data-column="c150"]`);
  expect((await header.boundingBox())!.width).toBeCloseTo(182, 0);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });

  await page.keyboard.press('Escape');
  await settle(page);
  expect(await probe(page, 'headerOrder')).toEqual(orderBefore);
  expect((await header.boundingBox())!.width).toBeCloseTo(150, 0);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });
});

test('Shift+F2 then Shift+End keeps the moved column in view', async ({ page }) => {
  await mountTable(page);
  await placeCursor(page, HEADER, 'c150');
  await page.keyboard.press('Shift+F2');
  // Moving the column rebuilds the header row, and the rebuild used to put
  // the old scroll position back a frame after the move had scrolled to it.
  await page.keyboard.press('Shift+End');
  await settle(page);
  const order = await probe(page, 'headerOrder');
  expect(order.at(-1)).toBe('c150');
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });

  // Escape puts it back, and the view follows it there.
  await page.keyboard.press('Escape');
  await settle(page);
  expect((await probe(page, 'headerOrder')).indexOf('c150')).toBe(150);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });
});

test('a Shift+F2 resize at the right edge keeps the column in view', async ({ page }) => {
  await mountTable(page);
  // ArrowRight onto c150 scrolls it in at the right edge.
  await placeCursor(page, HEADER, 'c150');
  await page.keyboard.press('Shift+F2');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });
  // End: the widest a column may be.
  await page.keyboard.press('End');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });
});

test('keys that act on the cursor bring it back into view first', async ({ page }) => {
  await mountTable(page);
  await placeCursor(page, HEADER, 'c150');

  // F2 moves real focus onto a header control: it has to be one the user can
  // see.
  await wheelBy(page, 20_000);
  await page.keyboard.press('F2');
  await settle(page);
  const control = await page.evaluate(() => {
    const el = document.activeElement!;
    const box = el.getBoundingClientRect();
    const view = document.querySelector('.dt-header-scroll')!.getBoundingClientRect();
    return {
      column: el.closest('[data-column]')?.getAttribute('data-column'),
      inView: box.left >= view.left && box.right <= view.right,
    };
  });
  expect(control).toEqual({ column: 'c150', inView: true });
  await page.keyboard.press('Escape');

  await wheelBy(page, 20_000);
  await page.keyboard.press('Shift+F2');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });
  await page.keyboard.press('Escape');

  await wheelBy(page, 20_000);
  await page.keyboard.press('Enter');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c150', { inView: true });

  await page.keyboard.press('ArrowDown');
  await wheelBy(page, 20_000);
  await page.keyboard.press('Enter');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), 0, 'c150', { inView: true });
});

test('End right after a filter change keeps the cursor in view', async ({ page }) => {
  await mountTable(page);
  // On the header row, which a filter change leaves alone; it clears a body
  // cursor, whose rows it replaces.
  await placeCursor(page, HEADER, 'c150');
  // For a second after a filter change the table puts back any horizontal
  // scroll it did not make itself; the keyboard's scroll is the user's.
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.addFilter({
      type: 'range',
      column: 'c000',
      min: 0,
      max: 50,
    }),
  );
  await page.keyboard.press('End');
  await settle(page);
  expectCursor(await probe(page, 'cursor'), HEADER, 'c299', { inView: true });
});

test('a cursor set in code names its cell off-screen, and survives its column being hidden', async ({
  page,
}) => {
  await mountTable(page);
  await page.locator(`#${HOST_ID} .dt-grid`).focus();

  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setFocusedCell({ row: 5, column: 'c150' }),
  );
  await settle(page);
  expectCursor(await probe(page, 'cursor'), 5, 'c150', { inView: false });

  // Hidden while off-screen: the cursor moves to a column still shown, and
  // aria-activedescendant names that column's ringed cell.
  await page.evaluate(() => (window as unknown as TestWindow).__dt.actions.hideColumn('c150'));
  await settle(page);
  const after = await probe(page, 'cursor');
  expect(after.focused?.row).toBe(5);
  expect(after.focused?.column).not.toBe('c150');
  expectCursor(after, 5, after.focused!.column);
});
