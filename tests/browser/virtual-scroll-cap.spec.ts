/**
 * Height-capped virtual scrolling has to be proven against a real engine.
 *
 * jsdom cannot see this bug: it performs no layout, so an element is exactly
 * as tall as a test claims it is. Real browsers silently saturate element
 * heights (Blink/WebKit at ≈33,554,431 px), so an uncapped spacer of
 * `totalRows × rowHeight` px — 64M px for the 2M rows mounted here — used to
 * leave the scrollbar bottoming out hundreds of thousands of rows early: the
 * last rows were unreachable by any scroll gesture. The scroller now caps
 * the spacer at 15,000,000 px and maps physical scroll positions into
 * virtual ones, so max scroll lands exactly on the final row.
 *
 * No DuckDB and no demo boot — the spec mounts a bare `VirtualScroller` from
 * the library source with a minimal row renderer, so it is fast.
 */

import { expect, test } from '@playwright/test';

/** 2M rows × 32 px = 64M virtual px — above both engine clamps and the cap. */
const TOTAL_ROWS = 2_000_000;
const ROW_HEIGHT = 32;
const HOST_HEIGHT = 600;
const MAX_VIRTUAL_HEIGHT = 15_000_000;

/** Handles stashed on `window` by the mount for later `page.evaluate` calls. */
type ScrollerWindow = {
  __scroller: import('../../src/advanced').VirtualScroller;
  __scrollEl: HTMLElement;
  __contentEl: HTMLElement;
  __lastRange: import('../../src/advanced').VisibleRange | undefined;
};

/**
 * Wait until the rAF-throttled scroll pipeline has flushed: scrollTop and
 * the mirrored range stop changing across animation-frame pairs.
 *
 * `helpers/demo.settle` is not usable here — it keys off `.dt-root`, which a
 * bare scroller mount never creates.
 */
async function settleScroll(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const w = window as unknown as ScrollerWindow;
    const rafPair = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    let prev = '';
    for (let i = 0; i < 30; i++) {
      await rafPair();
      const r = w.__lastRange;
      const cur = `${w.__scrollEl.scrollTop}|${r?.start}|${r?.end}|${r?.offsetY}`;
      if (cur === prev) return;
      prev = cur;
    }
  });
}

/**
 * Mount a legacy-mode `VirtualScroller` into a bounded host with a minimal
 * renderer that fills the viewport with 32-px rows carrying `data-row-index`
 * and mirrors every emitted range to `window.__lastRange`.
 */
async function mountScroller(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(
    async ({ totalRows, rowHeight, hostHeight }) => {
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/advanced.ts'
      )) as typeof import('../../src/advanced');

      const host = document.createElement('div');
      host.id = 'vsc-host';
      host.style.height = `${hostHeight}px`;
      document.querySelector('#table-container')!.appendChild(host);

      const scroller = new mod.VirtualScroller(host, { rowHeight });

      // `.dt-virtual-scroll` has no stylesheet rule — size it inline so the
      // host bounds it and it scrolls.
      const scrollEl = scroller.getScrollContainer();
      scrollEl.style.height = '100%';
      scrollEl.style.overflow = 'auto';

      const w = window as unknown as ScrollerWindow;
      w.__scroller = scroller;
      w.__scrollEl = scrollEl;
      w.__contentEl = scroller.getContentContainer();

      scroller.onScroll((range) => {
        w.__lastRange = { ...range };
        const viewport = scroller.getViewportContainer();
        viewport.textContent = '';
        const frag = document.createDocumentFragment();
        for (let i = range.start; i < range.end; i++) {
          const row = document.createElement('div');
          row.dataset.rowIndex = String(i);
          row.style.height = `${rowHeight}px`;
          row.textContent = `row ${i}`;
          frag.appendChild(row);
        }
        viewport.appendChild(frag);
      });

      scroller.setTotalRows(totalRows);
    },
    { totalRows: TOTAL_ROWS, rowHeight: ROW_HEIGHT, hostHeight: HOST_HEIGHT },
  );
  await settleScroll(page);
}

test('height-capped scroller reaches the true last row of a 2M-row dataset', async ({ page }) => {
  await mountScroller(page);

  // (1) The capped spacer height is honored by the engine — an uncapped
  // 64M px request would be silently clamped to ≈33.55M px.
  const contentHeight = await page.evaluate(() => {
    const w = window as unknown as ScrollerWindow;
    return w.__contentEl.getBoundingClientRect().height;
  });
  expect(contentHeight).toBe(MAX_VIRTUAL_HEIGHT);

  // (2) Max scroll reaches the final row — THE assertion that fails on
  // unfixed code, where the clamped spacer left the last ~460K rows
  // unreachable.
  await page.evaluate(() => {
    const w = window as unknown as ScrollerWindow;
    w.__scrollEl.scrollTop = 1e9; // browser clamps to its max scroll
  });
  await settleScroll(page);
  const atBottom = await page.evaluate(() => {
    const w = window as unknown as ScrollerWindow;
    const lastRow = document.querySelector(`[data-row-index="${1_999_999}"]`);
    return {
      end: w.__lastRange?.end,
      lastRowBottom: lastRow ? lastRow.getBoundingClientRect().bottom : null,
      containerBottom: w.__scrollEl.getBoundingClientRect().bottom,
    };
  });
  expect(atBottom.end).toBe(TOTAL_ROWS);
  expect(atBottom.lastRowBottom).not.toBeNull();
  expect(Math.abs(atBottom.lastRowBottom! - atBottom.containerBottom)).toBeLessThanOrEqual(1);

  // (3) scrollToRow lands exactly on an arbitrary deep index.
  await page.evaluate(() => {
    const w = window as unknown as ScrollerWindow;
    w.__scroller.scrollToRow(1_234_567, 'start');
  });
  await settleScroll(page);
  const target = await page.evaluate(() => {
    const w = window as unknown as ScrollerWindow;
    const row = document.querySelector(`[data-row-index="${1_234_567}"]`);
    return {
      rowTop: row ? row.getBoundingClientRect().top : null,
      containerTop: w.__scrollEl.getBoundingClientRect().top,
    };
  });
  expect(target.rowTop).not.toBeNull();
  expect(Math.abs(target.rowTop! - target.containerTop)).toBeLessThanOrEqual(1);

  // (4) Wheel ticks from that deep position advance linearly — a
  // proportional-mapping bug would jump thousands of rows per tick.
  await page.locator('#vsc-host').scrollIntoViewIfNeeded();
  const center = await page.evaluate(() => {
    const w = window as unknown as ScrollerWindow;
    const rect = w.__scrollEl.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.move(center.x, center.y);
  let prevRange = await page.evaluate(() => {
    const w = window as unknown as ScrollerWindow;
    return { start: w.__lastRange!.start, end: w.__lastRange!.end };
  });
  for (let tick = 0; tick < 5; tick++) {
    await page.mouse.wheel(0, 120);
    await settleScroll(page);
    const cur = await page.evaluate(() => {
      const w = window as unknown as ScrollerWindow;
      return { start: w.__lastRange!.start, end: w.__lastRange!.end };
    });
    expect(cur.start - prevRange.start).toBeLessThanOrEqual(10);
    expect(cur.start).toBeLessThan(prevRange.end); // consecutive ranges overlap
    prevRange = cur;
  }

  // (5) Back to the top: row 0 renders flush with the container top.
  await page.evaluate(() => {
    const w = window as unknown as ScrollerWindow;
    w.__scrollEl.scrollTop = 0;
  });
  await settleScroll(page);
  const atTop = await page.evaluate(() => {
    const w = window as unknown as ScrollerWindow;
    const row0 = document.querySelector('[data-row-index="0"]');
    return {
      start: w.__lastRange?.start,
      row0Top: row0 ? row0.getBoundingClientRect().top : null,
      containerTop: w.__scrollEl.getBoundingClientRect().top,
    };
  });
  expect(atTop.start).toBe(0);
  expect(atTop.row0Top).not.toBeNull();
  expect(Math.abs(atTop.row0Top! - atTop.containerTop)).toBeLessThanOrEqual(1);
});
