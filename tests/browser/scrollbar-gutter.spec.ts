/**
 * The header's scrollbar gutter, against a real scrollbar.
 *
 * The header scrolls in step with the body, so the gutter beside it has to be
 * as wide as the body's vertical scrollbar: any narrower or wider and the two
 * viewports differ, and at the far right the last header is cut off or the
 * body is held short of its end.
 *
 * Playwright starts headless Chromium with `--hide-scrollbars`, which takes
 * every scrollbar out of layout, so the rest of the suite never has one. This
 * file turns the flag off and gives the body a 12px scrollbar: neither the
 * 17px the gutter used to assume nor a platform's 15px, so only a measured
 * gutter fits it.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, mountTable } from './helpers/table';

// A worker option, so it can only be set for a whole file.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const COLUMNS = 40;
const SCROLLBAR = 12;

function mount(page: Page, rows: number): Promise<void> {
  // The default 600px host: its body holds about ten rows, so 60 scroll and
  // 5 do not.
  return mountTable(page, {
    columns: COLUMNS,
    rows,
    css:
      `.dt-body-scroll::-webkit-scrollbar { width: ${SCROLLBAR}px; height: ${SCROLLBAR}px; }` +
      '.dt-body-scroll::-webkit-scrollbar-thumb { background: #999; }',
  });
}

/**
 * Put the cursor on the last header with the keyboard, which scrolls the body
 * to its far right, and check that the header came with it.
 *
 * @param scrollbar - The vertical scrollbar's expected width.
 */
async function expectLastHeaderInView(page: Page, scrollbar: number): Promise<void> {
  await page.locator(`#${HOST_ID} .dt-grid`).focus();
  // From no cursor or from the header row, ArrowUp lands on the header row.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  await settle(page);

  const m = await page.evaluate(
    ({ hostId, last }) => {
      const host = document.getElementById(hostId)!;
      const body = host.querySelector<HTMLElement>('.dt-body-scroll')!;
      const headerScroll = host.querySelector<HTMLElement>('.dt-header-scroll')!;
      const header = host.querySelector(`.dt-col-header[data-column="${last}"]`)!;
      const cell = host.querySelector(
        `.dt-body .dt-row:not([data-placeholder]) .dt-cell[data-column="${last}"]`,
      )!;
      return {
        scrollbar: body.offsetWidth - body.clientWidth,
        gutter: host.querySelector('.dt-scrollbar-gutter')!.getBoundingClientRect().width,
        cursor: header.classList.contains('dt-col-header--focused'),
        header: header.getBoundingClientRect().right,
        cell: cell.getBoundingClientRect().right,
        headerView: headerScroll.getBoundingClientRect().left + headerScroll.clientWidth,
        bodyView: body.getBoundingClientRect().left + body.clientWidth,
      };
    },
    { hostId: HOST_ID, last: `c${COLUMNS - 1}` },
  );
  expect(m.scrollbar, "the body's vertical scrollbar").toBe(scrollbar);
  expect(m.gutter, 'the gutter').toBeCloseTo(scrollbar, 1);
  expect(m.cursor).toBe(true);
  expect(m.header, 'the last header is wholly in view').toBeLessThanOrEqual(m.headerView + 0.5);
  expect(m.header, 'the last header sits over its cells').toBeCloseTo(m.cell, 0);
  expect(m.headerView, 'the header viewport is as wide as the body').toBeCloseTo(m.bodyView, 0);
}

test('with a vertical scrollbar, the gutter is as wide as it', async ({ page }) => {
  await mount(page, 60);
  await expectLastHeaderInView(page, SCROLLBAR);
});

test('with too few rows to scroll, there is no gutter', async ({ page }) => {
  await mount(page, 5);
  await expectLastHeaderInView(page, 0);
});

test('the gutter follows the scrollbar as the table grows taller than its rows and back', async ({
  page,
}) => {
  const setHeight = async (height: number) => {
    await page.evaluate(
      ({ hostId, height }) => {
        document.getElementById(hostId)!.style.height = `${height}px`;
      },
      { hostId: HOST_ID, height },
    );
    await settle(page);
  };

  // Twenty rows take 640px: more than a 600px table has room for, less
  // than a 1000px one.
  await mount(page, 20);
  await expectLastHeaderInView(page, SCROLLBAR);
  await setHeight(1000);
  await expectLastHeaderInView(page, 0);
  await setHeight(600);
  await expectLastHeaderInView(page, SCROLLBAR);
});

test('a scrollbar that appears as the body reaches its far right does not pull it back', async ({
  page,
}) => {
  await mount(page, 5);
  // In one task: the body starts to overflow vertically, so a scrollbar
  // appears, and it scrolls to its far right, which is now 12px further than
  // the header can go until the gutter is measured. The header's clamped
  // position must not be synced back into the body.
  await page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const body = host.querySelector<HTMLElement>('.dt-body-scroll')!;
    host.querySelector<HTMLElement>('.dt-body')!.style.minHeight = '5000px';
    body.scrollLeft = body.scrollWidth;
  }, HOST_ID);
  await settle(page);

  const end = await page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const body = host.querySelector<HTMLElement>('.dt-body-scroll')!;
    return {
      body: body.scrollLeft,
      max: body.scrollWidth - body.clientWidth,
      header: host.querySelector<HTMLElement>('.dt-header-scroll')!.scrollLeft,
    };
  }, HOST_ID);
  expect(end.body, 'the body stays at its far right').toBeCloseTo(end.max, 0);
  expect(end.header, 'the header is where the body is').toBeCloseTo(end.body, 0);
});
