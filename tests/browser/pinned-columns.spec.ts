/**
 * Pinned columns in a real layout: side by side at the left edge while the
 * rest scroll under them, with the divider at their right edge.
 *
 * jsdom checks the inline `left` offsets; only a browser applies
 * `position: sticky` to them. The offsets used to be summed over
 * `pinnedColumns`, hidden columns included, and were not recomputed when a
 * pinned column was resized, so both hiding and resizing left a pinned column
 * stuck part-way across its neighbour.
 *
 * The demo's global `box-sizing` reset is overridden back to content-box, as
 * in `column-geometry.spec.ts`: offsets are sums of declared widths, so they
 * only line up when the library's own stylesheet makes each column occupy
 * exactly its width.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, type TestWindow, mountTable } from './helpers/table';

function mountPinnedTable(page: Page): Promise<void> {
  return mountTable(page, { columns: 30, rows: 40, width: 900, height: 420, contentBox: true });
}

type Call = [method: 'toggleColumnPin' | 'hideColumn' | 'setColumnWidth', ...args: unknown[]];

/** Run table actions, scroll the table to `scrollLeft`, and let it settle. */
async function act(page: Page, calls: Call[], scrollLeft: number): Promise<void> {
  await page.evaluate(
    ({ calls, scrollLeft, hostId }) => {
      const actions = (window as unknown as TestWindow).__dt.actions as unknown as Record<
        string,
        (...args: unknown[]) => void
      >;
      for (const [method, ...args] of calls) actions[method]!(...args);
      const host = document.getElementById(hostId)!;
      host.querySelector<HTMLElement>('.dt-body-scroll')!.scrollLeft = scrollLeft;
      host.querySelector<HTMLElement>('.dt-header-scroll')!.scrollLeft = scrollLeft;
    },
    { calls, scrollLeft, hostId: HOST_ID },
  );
  await settle(page);
}

interface Placement {
  /** Left and right of each named header, relative to the header viewport. */
  headers: Record<string, { left: number; right: number }>;
  /** Left and right of the same columns' first-row cells. */
  cells: Record<string, { left: number; right: number }>;
  /** The divider's left edge, relative to the header viewport, or null. */
  divider: number | null;
}

function placement(page: Page, columns: string[]): Promise<Placement> {
  return page.evaluate(
    ({ columns, hostId }) => {
      const host = document.getElementById(hostId)!;
      const origin = host.querySelector('.dt-header-scroll')!.getBoundingClientRect().left;
      const row = host.querySelector('.dt-body .dt-row:not([data-placeholder])')!;
      const box = (el: Element | null) => {
        const r = el!.getBoundingClientRect();
        return { left: r.left - origin, right: r.right - origin };
      };
      const headers: Placement['headers'] = {};
      const cells: Placement['cells'] = {};
      for (const c of columns) {
        headers[c] = box(host.querySelector(`.dt-col-header[data-column="${c}"]`));
        cells[c] = box(row.querySelector(`.dt-cell[data-column="${c}"]`));
      }
      const divider = host.querySelector<HTMLElement>('.dt-pinned-demarcation');
      return {
        headers,
        cells,
        divider:
          divider && divider.style.display !== 'none'
            ? divider.getBoundingClientRect().left - origin
            : null,
      };
    },
    { columns, hostId: HOST_ID },
  );
}

test('hiding the first pinned column closes the pinned block up', async ({ page }) => {
  await mountPinnedTable(page);
  await act(
    page,
    [
      ['toggleColumnPin', 'c00'],
      ['toggleColumnPin', 'c01'],
    ],
    0,
  );
  await act(page, [['hideColumn', 'c00']], 600);

  const p = await placement(page, ['c01']);
  expect(p.headers.c01!.left).toBeCloseTo(0, 0);
  expect(p.cells.c01!.left).toBeCloseTo(0, 0);
  expect(p.headers.c01!.right).toBeCloseTo(150, 0);
  expect(p.divider).toBeCloseTo(p.headers.c01!.right, 0);
});

test('resizing a pinned column moves the pinned columns after it', async ({ page }) => {
  await mountPinnedTable(page);
  await act(
    page,
    [
      ['toggleColumnPin', 'c00'],
      ['toggleColumnPin', 'c01'],
    ],
    0,
  );
  await act(page, [['setColumnWidth', 'c00', 260]], 600);

  const p = await placement(page, ['c00', 'c01']);
  for (const side of ['headers', 'cells'] as const) {
    expect(p[side].c00!.left, `${side} c00`).toBeCloseTo(0, 0);
    expect(p[side].c01!.left, `${side} c01 starts where c00 ends`).toBeCloseTo(
      p[side].c00!.right,
      0,
    );
    expect(p[side].c01!.left, `${side} c01`).toBeCloseTo(260, 0);
  }
  expect(p.divider).toBeCloseTo(p.headers.c01!.right, 0);
  expect(p.divider).toBeCloseTo(410, 0);
});
