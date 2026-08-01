/**
 * The `rowHeight` option and the `--dt-row-height` token have to agree.
 *
 * jsdom cannot see this bug. It resolves no `var()` and computes no
 * `line-height`, so the only thing a jsdom test can assert is that the custom
 * property was written; whether the stylesheet then lays a row out at that
 * height, and whether a stretched cell's text ends up centred in it, is a
 * question about real cascade and real layout.
 *
 * The defect being guarded: `rowHeight` reached the virtual scroller and the
 * inline height on each row element, but never `--dt-row-height`. The
 * stylesheet keeps its 32px default for the `line-height` that re-centres
 * text in any cell using `align-self: stretch` — `.dt-cell--focused`,
 * `.dt-cell--derived`, and every annotation-tinted cell — because those cells
 * opt out of the row's `align-items: center`. A table built with
 * `rowHeight: 48` therefore drew 48px rows whose focused cell centred its
 * text against a 32px line box, sitting 8px high against its neighbours.
 */

import { expect, test } from '@playwright/test';
import { settle } from './helpers/demo';

/** Small inline CSV — this suite needs rows, not width. */
const CSV = ['n,label', ...Array.from({ length: 40 }, (_, i) => `${i},row-${i}`)].join('\n');

/**
 * Mount a table into a bounded host with an explicit `rowHeight`.
 *
 * Imports the library from the dev server rather than going through the demo,
 * which offers no way to set `rowHeight`.
 */
async function mountWithRowHeight(
  page: import('@playwright/test').Page,
  rowHeight?: number,
): Promise<void> {
  await page.goto('./');
  await page.evaluate(
    async ({ rowHeight, csv }) => {
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../src/index');
      const host = document.createElement('div');
      host.id = 'row-height-host';
      // Bounded, so the scroller virtualizes instead of rendering all 40 rows.
      host.style.height = '400px';
      document.querySelector('#table-container')!.appendChild(host);
      await mod.createDataTable({
        container: host,
        source: csv,
        // A restored session would reinstate a different column layout and
        // quietly make this a different test.
        persistence: false,
        ...(rowHeight === undefined ? {} : { rowHeight }),
      });
    },
    { rowHeight, csv: CSV },
  );

  await page.waitForFunction(
    () => document.querySelectorAll('#row-height-host .dt-body .dt-row').length > 0,
    undefined,
    { timeout: 90_000 },
  );
  await settle(page);
}

/** Computed geometry of the token, a real row, and a real stretched cell. */
async function measure(page: import('@playwright/test').Page) {
  await page.locator('#row-height-host .dt-body .dt-row .dt-cell').first().click();
  await page.waitForSelector('#row-height-host .dt-cell--focused', { timeout: 15_000 });
  await settle(page);

  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#row-height-host .dt-root')!;
    const row = document.querySelector<HTMLElement>('#row-height-host .dt-body .dt-row')!;
    const focused = document.querySelector<HTMLElement>('#row-height-host .dt-cell--focused')!;
    return {
      token: getComputedStyle(root).getPropertyValue('--dt-row-height').trim(),
      rowHeight: getComputedStyle(row).height,
      focusedLineHeight: getComputedStyle(focused).lineHeight,
      // `align-self: stretch` is what makes line-height the only centring
      // mechanism for this cell. If the stylesheet ever stops stretching it,
      // this spec is testing nothing and should be revisited.
      focusedAlignSelf: getComputedStyle(focused).alignSelf,
    };
  });
}

test('a custom rowHeight drives the row-height token, the row box, and stretched-cell centring', async ({
  page,
}) => {
  await mountWithRowHeight(page, 48);
  const m = await measure(page);

  expect(m.focusedAlignSelf, 'focused cell is no longer stretched').toBe('stretch');
  expect(m.token).toBe('48px');
  expect(m.rowHeight).toBe('48px');
  // The regression: this was 32px — the stylesheet default — against a 48px row.
  expect(m.focusedLineHeight).toBe('48px');
});

test('the default rowHeight leaves every sizing surface at 32px', async ({ page }) => {
  await mountWithRowHeight(page);
  const m = await measure(page);

  expect(m.focusedAlignSelf).toBe('stretch');
  expect(m.token).toBe('32px');
  expect(m.rowHeight).toBe('32px');
  expect(m.focusedLineHeight).toBe('32px');
});
