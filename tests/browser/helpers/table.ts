/**
 * Mount a table straight into the demo page through the public API.
 *
 * The demo's own load path builds a table the way a user does, but it offers
 * no knobs: no host size, no column count, no page without the demo's
 * `box-sizing` reset. Specs that need those create the table in-page from the
 * dev server's source instead, in a fixed-position host above the demo. The
 * data is generated in-page too; every cell is a pure function of its row
 * and column.
 */

import type { Page } from '@playwright/test';
import { settle } from './demo';

/** Id of the element the table mounts into. */
export const HOST_ID = 'dt-test-host';

export interface MountOptions {
  /**
   * Columns, named `c` and the index zero-padded to the width of the last
   * one: `c00`…`c39` for 40, `c000`…`c299` for 300. Default 300.
   */
  columns?: number;
  /** Data rows. Default 200. */
  rows?: number;
  /** Host width in px. Default 1200. */
  width?: number;
  /** Host height in px. Default 600. */
  height?: number;
  /** Header charts. Default `false`: they cost a query per column in view. */
  visualizations?: boolean;
  /**
   * Put `box-sizing` back to `content-box` everywhere, undoing the demo's
   * global reset, so only the library's stylesheet sizes the table.
   */
  contentBox?: boolean;
  /** More CSS for the page, added before the table mounts. */
  css?: string;
}

/** What {@link mountTable} leaves on `window`, for `page.evaluate` callbacks. */
export type TestWindow = {
  __dt: import('../../../src/index').DataTable;
};

/**
 * Create a table in a fixed-position host at the top-left of the page and
 * load generated data into it. The table is on `window.__dt`.
 *
 * Column `i` holds text (`k0`…`k6`) when `i % 3 === 1`, and numbers
 * otherwise, so the header charts include both histograms and value counts.
 */
export async function mountTable(page: Page, options: MountOptions = {}): Promise<void> {
  const o = {
    columns: options.columns ?? 300,
    rows: options.rows ?? 200,
    width: options.width ?? 1200,
    height: options.height ?? 600,
    visualizations: options.visualizations ?? false,
    hostId: HOST_ID,
  };
  await page.goto('./');
  // Same specificity as the demo's `*` reset and later in the cascade, so it
  // wins everywhere the library does not declare box-sizing itself.
  const reset = options.contentBox ? '*, *::before, *::after { box-sizing: content-box; }' : '';
  if (reset || options.css) await page.addStyleTag({ content: reset + (options.css ?? '') });

  await page.evaluate(async (o) => {
    const mod = (await import(
      /* @vite-ignore */ '/data-table/src/index.ts'
    )) as typeof import('../../../src/index');

    const host = document.createElement('div');
    host.id = o.hostId;
    // Above the demo's own content, which sets no z-index, and below
    // everything the table portals to <body>: popovers from 55, modals 1000.
    host.style.cssText =
      `position: fixed; left: 0; top: 0; width: ${o.width}px; height: ${o.height}px;` +
      ' z-index: 1; background: white;';
    document.body.appendChild(host);

    const digits = String(o.columns - 1).length;
    const names = Array.from(
      { length: o.columns },
      (_, i) => `c${String(i).padStart(digits, '0')}`,
    );
    const lines = [names.join(',')];
    for (let r = 0; r < o.rows; r++) {
      lines.push(
        names
          .map((_, i) =>
            i % 3 === 1 ? `k${(r + i) % 7}` : String(((r * 31 + i * 17) % 1000) / 10),
          )
          .join(','),
      );
    }

    const table = await mod.createDataTable({
      container: host,
      tableName: 'generated',
      // No IndexedDB: a restored session would make this a different test.
      persistence: false,
      visualizations: o.visualizations,
    });
    (window as unknown as TestWindow).__dt = table;
    await table.loadData(new File([lines.join('\n')], 'generated.csv', { type: 'text/csv' }));
  }, o);

  await page.waitForFunction(
    (hostId) =>
      document.querySelectorAll(`#${hostId} .dt-body .dt-row:not([data-placeholder])`).length > 0,
    HOST_ID,
    { timeout: 90_000 },
  );
  await settle(page);
}
