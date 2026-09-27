/**
 * What a column carries besides its cells — an open filter panel or
 * derived-column editor, a tooltip, annotations, a custom stats panel — when
 * the column scrolls out of view, or is set up while it is out of view.
 *
 * These hold on the unwindowed grid, where every header stays in the DOM.
 * Rendering only the headers near the view must keep them holding: a panel's
 * opener and anything set on a header before it mounts are exactly what a
 * header created and destroyed on scroll loses.
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

/** `document.activeElement`: inside which of the table's parts, if any. */
function focusIsIn(page: Page): Promise<'panel' | 'grid' | 'body' | 'elsewhere'> {
  return page.evaluate((hostId) => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'body';
    if (a.closest('.dt-filter-panel, .dt-derived-edit-panel')) return 'panel';
    if (a.closest(`#${hostId} .dt-grid`)) return 'grid';
    return 'elsewhere';
  }, HOST_ID);
}

/**
 * Wheel the body with the pointer over its bottom-left corner, clear of a
 * panel that opens under a header.
 */
async function wheelBodyCorner(page: Page, dx: number): Promise<void> {
  const box = (await page.locator(`#${HOST_ID} .dt-body-scroll`).boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height - 40);
  await wheelBy(page, dx, { over: 'pointer' });
}

test('an open filter panel outlives its column scrolling away, and gives focus back', async ({
  page,
}) => {
  await mountTable(page);
  await wheelIntoView(page, 'c150');
  await header(page, 'c150').locator('.dt-col-filter-btn').click();
  const panel = page.locator(`#${HOST_ID} .dt-filter-panel`);
  await expect(panel).toBeVisible();
  await expect.poll(() => focusIsIn(page)).toBe('panel');

  await wheelBodyCorner(page, 8_000);
  expect((await probe(page, 'column', 'c150'))!.inView).toBe(false);
  // Still open with focus inside, or closed with focus handed back to the
  // grid — never dropped on <body>.
  const where = await focusIsIn(page);
  if (await panel.isVisible()) expect(where).toBe('panel');
  else expect(where).toBe('grid');

  await page.keyboard.press('Escape');
  await settle(page);
  await expect(panel).toBeHidden();
  expect(await focusIsIn(page)).toBe('grid');
  // And the keyboard still drives the table from there.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await settle(page);
  expect((await probe(page, 'cursor')).target).not.toBeNull();
});

test('the filter panel opened from the keyboard takes focus, keeps it, and gives it back', async ({
  page,
}) => {
  await mountTable(page);
  const grid = page.locator(`#${HOST_ID} .dt-grid`);
  await grid.focus();
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setFocusedCell({ row: -1, column: 'c149' }),
  );
  await page.keyboard.press('ArrowRight');
  // F2 enters the header's controls: pin, hide, filter.
  await page.keyboard.press('F2');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.activeElement?.className ?? '')).toContain(
    'dt-col-filter-btn',
  );
  await page.keyboard.press('Enter');
  const panel = page.locator(`#${HOST_ID} .dt-filter-panel`);
  await expect(panel).toBeVisible();
  // The panel's first control, Clear, is hidden while the column has no
  // filter; focus has to land on the next one.
  await expect.poll(() => focusIsIn(page)).toBe('panel');

  // The focus trap keeps Shift+Tab and Tab inside the panel.
  await page.keyboard.press('Shift+Tab');
  expect(await focusIsIn(page)).toBe('panel');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await focusIsIn(page)).toBe('panel');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  const back = await page.evaluate(() => ({
    cls: document.activeElement?.className ?? '',
    column: document.activeElement?.closest('[data-column]')?.getAttribute('data-column'),
  }));
  expect(back.cls).toContain('dt-col-filter-btn');
  expect(back.column).toBe('c150');
});

test('an open derived-column editor outlives its column scrolling away', async ({ page }) => {
  await mountTable(page);
  const added = await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.addDerivedColumn({
      kind: 'expression',
      name: 'd_sum',
      expression: 'c000 + c002',
    }),
  );
  expect(added.success).toBe(true);
  await settle(page);

  await wheelIntoView(page, 'd_sum');
  await header(page, 'd_sum').locator('.dt-derived-icon-btn').click();
  const panel = page.locator(`#${HOST_ID} .dt-derived-edit-panel`);
  await expect(panel).toBeVisible();
  await expect.poll(() => focusIsIn(page)).toBe('panel');

  await wheelBodyCorner(page, -8_000);
  expect((await probe(page, 'column', 'd_sum'))!.inView).toBe(false);
  const where = await focusIsIn(page);
  if (await panel.isVisible()) expect(where).toBe('panel');
  else expect(where).toBe('grid');

  await page.keyboard.press('Escape');
  await settle(page);
  await expect(panel).toBeHidden();
  expect(await focusIsIn(page)).toBe('grid');
});

test('a tooltip set on an off-screen column shows once the column scrolls in', async ({ page }) => {
  await mountTable(page);
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setColumnHeaderTooltip('c200', {
      title: 'Column 200',
      description: 'Set while the column was off-screen.',
    }),
  );
  expect((await probe(page, 'column', 'c200'))!.inView).toBe(false);

  await wheelIntoView(page, 'c200');
  await header(page, 'c200').locator('.dt-col-name').hover();
  const title = page.locator('.dt-col-tooltip__title');
  await expect(title).toHaveText('Column 200');

  // Scrolling under the pointer dismisses it rather than leaving it over
  // another column.
  await wheelBy(page, 2_000, { over: 'pointer' });
  await expect(title).toBeHidden();
});

test('annotations set off-screen paint when their column scrolls in, and clear the same way', async ({
  page,
}) => {
  await mountTable(page);
  await page.evaluate(() => {
    const { annotations } = (window as unknown as TestWindow).__dt;
    annotations.addMany([
      { scope: 'cell', rowId: 3, column: 'c200', severity: 'error', message: 'cell' },
      { scope: 'column', column: 'c200', severity: 'warning', message: 'column' },
      { scope: 'row', rowId: 4, severity: 'info', message: 'row' },
    ]);
  });

  const classes = () =>
    page.evaluate((hostId) => {
      const host = document.getElementById(hostId)!;
      const row = (i: number) => host.querySelector(`.dt-body .dt-row[data-row-index="${i}"]`)!;
      const cell = (i: number) => row(i).querySelector('.dt-cell[data-column="c200"]')!;
      const h = host.querySelector('.dt-col-header[data-column="c200"]')!;
      return {
        header: h.classList.contains('dt-col-header--annotation-warning'),
        cell: cell(3).classList.contains('dt-cell--annotation-error'),
        column: cell(0).classList.contains('dt-cell--col-annotation-warning'),
        row: row(4).classList.contains('dt-row--annotation-info'),
      };
    }, HOST_ID);

  await wheelIntoView(page, 'c200');
  expect(await classes()).toEqual({ header: true, cell: true, column: true, row: true });

  await wheelBy(page, -20_000);
  await page.evaluate(() => (window as unknown as TestWindow).__dt.annotations.clear());
  await wheelIntoView(page, 'c200');
  expect(await classes()).toEqual({ header: false, cell: false, column: false, row: false });
});

test('a custom stats panel is in place whenever its column is in view, and a wobble builds none', async ({
  page,
}) => {
  // Custom stats panels come with the header charts.
  await mountTable(page, { statsPanel: true, visualizations: true });
  const slot = header(page, 'c150').locator('.dt-col-stats');
  const log = () =>
    page.evaluate(() => (window as unknown as TestWindow).__dtTest.panelLog.slice());

  await wheelIntoView(page, 'c150');
  await expect(slot).toHaveText('panel c150');

  // A pixel back and forth, as a trackpad at rest produces.
  const before = (await log()).length;
  for (const dx of [1, -1, 1, -1, 1, -1]) await page.mouse.wheel(dx, 0);
  await settle(page);
  expect((await log()).length, 'a wobble built or destroyed a panel').toBe(before);

  await wheelBy(page, 20_000);
  await wheelIntoView(page, 'c150');
  await expect(slot).toHaveText('panel c150');

  // Never two live panels for one column.
  const live = new Map<string, number>();
  for (const { event, column } of await log()) {
    live.set(column, (live.get(column) ?? 0) + (event === 'construct' ? 1 : -1));
    expect(live.get(column), `${column} has one panel at most`).toBeLessThanOrEqual(1);
  }
});
