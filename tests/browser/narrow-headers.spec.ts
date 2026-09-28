/**
 * Header controls in columns narrower than their buttons.
 *
 * A header's five 22 px action buttons need about 135 px with its padding,
 * and a column can be as narrow as 50 px. Below that the buttons ran on past
 * the header's right edge: under the next header, which painted over them
 * and took their clicks, or, for a pinned column, whose sticky header sits
 * on top, over the first unpinned header, where they took its clicks.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, type TestWindow, mountTable } from './helpers/table';

/** The action bar's controls, in order, drag handle last. */
const CONTROLS = [
  'dt-col-pin-btn',
  'dt-col-hide-btn',
  'dt-col-filter-btn',
  'dt-col-sort-btn',
  'dt-col-drag-handle',
];

function header(page: Page, column: string) {
  return page.locator(`#${HOST_ID} .dt-col-header[data-column="${column}"]`);
}

async function narrow(page: Page, widths: Record<string, number>, pinned: string[] = []) {
  await page.evaluate(
    ({ widths, pinned }) => {
      const { actions } = (window as unknown as TestWindow).__dt;
      for (const column of pinned) actions.toggleColumnPin(column);
      for (const [column, width] of Object.entries(widths)) actions.setColumnWidth(column, width);
    },
    { widths, pinned },
  );
  await settle(page);
}

/**
 * Points of `column`'s controls outside its header that reach something of
 * that header: its buttons painted, and clickable, past its right edge. A
 * 4 × 4 grid of points over each control.
 */
function reachableOutside(page: Page, column: string): Promise<string[]> {
  return page.evaluate(
    ({ hostId, column, controls }) => {
      const h = document.querySelector<HTMLElement>(
        `#${hostId} .dt-col-header[data-column="${column}"]`,
      )!;
      const box = h.getBoundingClientRect();
      const found: string[] = [];
      for (const cls of controls) {
        const c = h.querySelector(`.${cls}`)!.getBoundingClientRect();
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const x = c.left + ((i + 0.5) * c.width) / 4;
            const y = c.top + ((j + 0.5) * c.height) / 4;
            if (x >= box.left && x < box.right) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit && h.contains(hit)) found.push(`${cls} at ${Math.round(x)},${Math.round(y)}`);
          }
        }
      }
      return found;
    },
    { hostId: HOST_ID, column, controls: CONTROLS },
  );
}

/** Controls of `column` whose middle does not reach them: covered, or not painted there. */
function unreachable(page: Page, column: string, controls = CONTROLS): Promise<string[]> {
  return page.evaluate(
    ({ hostId, column, controls }) => {
      const h = document.querySelector<HTMLElement>(
        `#${hostId} .dt-col-header[data-column="${column}"]`,
      )!;
      return controls.filter((cls) => {
        const el = h.querySelector<HTMLElement>(`.${cls}`)!;
        const c = el.getBoundingClientRect();
        const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
        return !(hit && el.contains(hit));
      });
    },
    { hostId: HOST_ID, column, controls },
  );
}

/** Park the pointer over the body, away from every header. */
async function pointerAway(page: Page): Promise<void> {
  const body = (await page.locator(`#${HOST_ID} .dt-body-scroll`).boundingBox())!;
  await page.mouse.move(body.x + body.width - 40, body.y + body.height - 40);
}

test('a narrow column keeps its controls inside its header until pointed at', async ({ page }) => {
  await mountTable(page, { columns: 40 });
  await narrow(page, { c00: 60, c03: 60, c06: 100 }, ['c00']);
  await pointerAway(page);

  for (const column of ['c00', 'c03', 'c06']) {
    expect(await reachableOutside(page, column), column).toEqual([]);
  }
});

test('a click beside a narrow pinned column goes to the header there', async ({ page }) => {
  await mountTable(page, { columns: 40 });
  await narrow(page, { c00: 60 }, ['c00']);
  await pointerAway(page);

  const first = (await header(page, 'c01').boundingBox())!;
  const bar = (await header(page, 'c01').locator('.dt-col-action-panel').boundingBox())!;
  await page.evaluate((hostId) => {
    const w = window as unknown as { __clicked: (string | null)[] };
    w.__clicked = [];
    document
      .getElementById(hostId)!
      .addEventListener(
        'click',
        (e) =>
          w.__clicked.push(
            (e.target as Element).closest('[data-column]')?.getAttribute('data-column') ?? null,
          ),
        true,
      );
  }, HOST_ID);
  // The first unpinned header's left edge, level with the action bars.
  await page.mouse.click(first.x + 4, bar.y + bar.height / 2);
  await settle(page);

  expect(
    await page.evaluate(() => (window as unknown as { __clicked: string[] }).__clicked),
  ).toEqual(['c01']);
  const state = await page.evaluate(() => {
    const { state } = (window as unknown as TestWindow).__dt;
    return { visible: state.visibleColumns.get().slice(0, 2), sort: state.sortColumns.get() };
  });
  expect(state).toEqual({ visible: ['c00', 'c01'], sort: [] });
  await expect(page.locator('.dt-filter-panel')).toHaveCount(0);
});

/** Point at the start of `column`'s action bar, inside its header. */
async function pointAtBar(page: Page, column: string): Promise<{ y: number }> {
  const bar = (await header(page, column).locator('.dt-col-action-panel').boundingBox())!;
  const y = bar.y + bar.height / 2;
  await page.mouse.move(bar.x + 4, y);
  return { y };
}

test('pointed at, a narrow column’s bar shows every control, and each one works', async ({
  page,
}) => {
  await mountTable(page, { columns: 40 });
  await narrow(page, { c03: 60 });

  const { y } = await pointAtBar(page, 'c03');
  expect(await unreachable(page, 'c03')).toEqual([]);
  // On a backing of the header's own colour, wide enough for all of them.
  const backing = await page.evaluate((hostId) => {
    const h = document.querySelector<HTMLElement>(`#${hostId} .dt-col-header[data-column="c03"]`)!;
    const bar = h.querySelector<HTMLElement>('.dt-col-action-panel')!;
    return {
      right: bar.getBoundingClientRect().right,
      lastRight: h.querySelector('.dt-col-drag-handle')!.getBoundingClientRect().right,
      colour: getComputedStyle(bar).backgroundColor,
      header: getComputedStyle(h).backgroundColor,
    };
  }, HOST_ID);
  expect(backing.right).toBeGreaterThanOrEqual(backing.lastRight - 0.5);
  expect(backing.colour).toBe(backing.header);
  expect(backing.colour).not.toBe('rgba(0, 0, 0, 0)');

  // Along the bar to the sort button, past the header's edge, and click.
  const sort = (await header(page, 'c03').locator('.dt-col-sort-btn').boundingBox())!;
  await page.mouse.move(sort.x + sort.width / 2, y, { steps: 6 });
  await page.mouse.down();
  await page.mouse.up();
  await settle(page);
  expect(
    await page.evaluate(() => (window as unknown as TestWindow).__dt.state.sortColumns.get()),
  ).toEqual([{ column: 'c03', direction: 'asc' }]);

  // The drag handle, the bar's last control, starts a drag.
  await pointAtBar(page, 'c03');
  const handle = (await header(page, 'c03').locator('.dt-col-drag-handle').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, y, { steps: 6 });
  await page.mouse.down();
  await page.mouse.move(handle.x + 200, y - 60, { steps: 6 });
  await expect(page.locator(`#${HOST_ID} .dt-root`)).toHaveClass(/dt-column-dragging/);
  await page.mouse.up();
  await settle(page);

  // Pointed at anywhere else in the header, its chart and stats stay clear:
  // the bar is back inside the header.
  await pointAtBar(page, 'c03');
  const c = (await header(page, 'c03').boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 4 });
  expect(await reachableOutside(page, 'c03')).toEqual([]);

  // And the resize handle, at the header's right edge, still resizes.
  const resize = (await header(page, 'c03').locator('.dt-col-resize-handle').boundingBox())!;
  const rx = resize.x + resize.width / 2;
  const ry = c.y + 20;
  await page.mouse.move(rx, ry);
  await page.mouse.down();
  await page.mouse.move(rx + 30, ry, { steps: 3 });
  await page.mouse.up();
  await settle(page);
  expect(
    await page.evaluate(() =>
      (window as unknown as TestWindow).__dt.state.columnWidths.get().get('c03'),
    ),
  ).toBe(90);
});

test('F2 on a narrow column shows each control it focuses', async ({ page }) => {
  await mountTable(page, { columns: 40 });
  await narrow(page, { c03: 60 });
  await pointerAway(page);

  await page.locator(`#${HOST_ID} .dt-grid`).focus();
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setFocusedCell({ row: -1, column: 'c02' }),
  );
  await page.keyboard.press('ArrowRight');
  await settle(page);
  await page.keyboard.press('F2');

  const seen: string[] = [];
  for (const cls of CONTROLS.slice(0, 4)) {
    const active = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(active).toContain(cls);
    expect(await unreachable(page, 'c03', [cls]), `${cls} focused but hidden`).toEqual([]);
    seen.push(cls);
    await page.keyboard.press('ArrowRight');
  }
  expect(seen).toHaveLength(4);

  // Back to the sort button, and Enter sorts.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await settle(page);
  expect(
    await page.evaluate(() => (window as unknown as TestWindow).__dt.state.sortColumns.get()),
  ).toEqual([{ column: 'c03', direction: 'asc' }]);
});
