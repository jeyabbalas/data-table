/**
 * The rows in view follow the body's height, not only its scroll position.
 *
 * The virtual scroller works the row range out from the body's
 * `clientHeight`, and re-read it only on a scroll or a state change. A
 * container that grew taller left the space below the rows it had rendered
 * blank until the next scroll, one that shrank went on rendering rows out of
 * view, and a table mounted hidden (a closed tab, a collapsed panel) showed no
 * rows at all once it was shown.
 *
 * jsdom cannot see this: it lays nothing out, so every `clientHeight` is 0
 * and no ResizeObserver ever reports a size.
 */

import { expect, test, type Page } from '@playwright/test';
import { HOST_ID, mountTable } from './helpers/table';

const ROW_HEIGHT = 32;
/** `VirtualScroller`'s default buffer above and below the view. */
const BUFFER_ROWS = 5;

interface RowsInView {
  scrollTop: number;
  clientHeight: number;
  /** Indices of rows the body's viewport shows at least a pixel of that have no data row. */
  missing: number[];
  /** Rows in the DOM, placeholders included. */
  rendered: number;
}

async function rowsInView(page: Page, hostId = HOST_ID): Promise<RowsInView> {
  return page.evaluate(
    ({ hostId, rowHeight }) => {
      const host = document.getElementById(hostId)!;
      const body = host.querySelector<HTMLElement>('.dt-body-scroll')!;
      const total = Number(host.querySelector('.dt-grid')!.getAttribute('aria-rowcount')) - 1;
      const withData = new Set(
        Array.from(host.querySelectorAll<HTMLElement>('.dt-body .dt-row[data-row-index]'))
          .filter((row) => !row.hasAttribute('data-placeholder'))
          .map((row) => Number(row.dataset.rowIndex)),
      );
      const first = Math.floor(body.scrollTop / rowHeight);
      const last = Math.min(total, Math.ceil((body.scrollTop + body.clientHeight) / rowHeight)) - 1;
      const missing: number[] = [];
      for (let i = first; i <= last; i++) if (!withData.has(i)) missing.push(i);
      return {
        scrollTop: body.scrollTop,
        clientHeight: body.clientHeight,
        missing,
        rendered: host.querySelectorAll('.dt-body .dt-row').length,
      };
    },
    { hostId, rowHeight: ROW_HEIGHT },
  );
}

/**
 * Collect the page's error events from now on. A ResizeObserver callback that
 * changed the size of what it observes would report "ResizeObserver loop
 * completed with undelivered notifications" here.
 */
async function watchErrors(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __errors: string[] };
    w.__errors = [];
    window.addEventListener('error', (event) => w.__errors.push(String(event.message)));
  });
  return () => page.evaluate(() => (window as unknown as { __errors: string[] }).__errors);
}

async function setHostStyle(page: Page, hostId: string, style: Record<string, string>) {
  await page.evaluate(
    ({ hostId, style }) => Object.assign(document.getElementById(hostId)!.style, style),
    { hostId, style },
  );
}

test.describe('rows follow the body height', () => {
  test('a container grown taller fills the new space with rows, with no scroll', async ({
    page,
  }) => {
    await mountTable(page, { columns: 8, rows: 400, height: 300 });
    const errors = await watchErrors(page);
    const before = await rowsInView(page);
    expect(before.missing).toEqual([]);

    await setHostStyle(page, HOST_ID, { height: '900px' });

    await expect.poll(async () => (await rowsInView(page)).missing, { timeout: 5_000 }).toEqual([]);
    const after = await rowsInView(page);
    expect(after.clientHeight).toBeGreaterThan(before.clientHeight + 500);
    expect(after.scrollTop).toBe(0);
    expect(await errors()).toEqual([]);
  });

  test('a container shrunk renders only the rows near the new view', async ({ page }) => {
    await mountTable(page, { columns: 8, rows: 400, height: 900 });
    const errors = await watchErrors(page);
    const tall = await rowsInView(page);

    await setHostStyle(page, HOST_ID, { height: '300px' });

    const most = (clientHeight: number) =>
      Math.ceil(clientHeight / ROW_HEIGHT) + 2 * BUFFER_ROWS + 1;
    await expect
      .poll(
        async () => {
          const { rendered, clientHeight } = await rowsInView(page);
          return rendered <= most(clientHeight);
        },
        { timeout: 5_000 },
      )
      .toBe(true);
    const short = await rowsInView(page);
    expect(short.rendered).toBeLessThan(tall.rendered);
    expect(short.missing).toEqual([]);
    expect(await errors()).toEqual([]);
  });

  test('a table mounted hidden shows its rows once it is shown', async ({ page }) => {
    const hostId = 'dt-hidden-host';
    await page.goto('./');
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await page.evaluate(async (hostId) => {
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../src/index');
      const host = document.createElement('div');
      host.id = hostId;
      host.style.cssText =
        'position: fixed; left: 0; top: 0; width: 900px; height: 600px; z-index: 1;' +
        ' background: white; display: none;';
      document.body.appendChild(host);
      const lines = ['n,label', ...Array.from({ length: 300 }, (_, i) => `${i},row-${i}`)];
      const table = await mod.createDataTable({
        container: host,
        tableName: 'hidden',
        persistence: false,
        visualizations: false,
      });
      await table.loadData(new File([lines.join('\n')], 'hidden.csv', { type: 'text/csv' }));
    }, hostId);
    expect((await rowsInView(page, hostId)).rendered).toBe(0);

    await setHostStyle(page, hostId, { display: 'block' });

    await expect
      .poll(async () => (await rowsInView(page, hostId)).missing, { timeout: 5_000 })
      .toEqual([]);
    const shown = await rowsInView(page, hostId);
    expect(shown.clientHeight).toBeGreaterThan(300);
    expect(shown.scrollTop).toBe(0);
    // The one-shot zero-height warning at mount is the only one.
    expect(warnings.filter((w) => /zero|height/i.test(w)).length).toBeLessThanOrEqual(1);
  });
});
