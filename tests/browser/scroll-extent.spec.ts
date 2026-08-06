/**
 * Bug 1 — the browser max-element-height clamp — proven fixed at 1.6M rows.
 *
 * jsdom cannot see this bug: it performs no layout, so a 51.2M px spacer is
 * exactly as tall as a test claims. Real engines silently saturate element
 * heights (Blink/WebKit ≈33.55M px, Gecko ≈17.9M px), which used to strand
 * the scrollbar hundreds of thousands of rows short of the bottom. The
 * library now caps the physical spacer at 15,000,000 px and maps physical
 * scroll positions into virtual row space, reconciling exactly at both ends.
 *
 * The table is built in-page through public APIs only (`bridge.query` →
 * `exportToBuffer` → `loadData`), so every cell is a pure function of its
 * row index. Oracle: while unsorted and unfiltered,
 * `data-row-id === data-row-index` for every rendered non-placeholder row,
 * and the `grp` cell text equals `'g' + (index % 97)`.
 */

import { expect, test } from '@playwright/test';
import {
  BIG_TABLE_HOST_ID,
  expectedGrp,
  mountBigTable,
  readVisibleRows,
  waitForRowsResolved,
} from './helpers/bigTable';

const N_LARGE = 1_600_000;
const N_SMALL = 10_000;
const ROW_HEIGHT = 32;
/**
 * Mirrors `DEFAULT_MAX_VIRTUAL_HEIGHT` in `src/table/VirtualScroller.ts`, and
 * is asserted EXACTLY on purpose: a `scrollHeight < N × 32` guard would still
 * pass on unfixed code, because Chromium clamps an uncapped 51.2M px spacer
 * to ≈33.55M px — which is below 51.2M. Only the exact cap value proves the
 * compressed mapping is actually engaged.
 *
 * The exact assertion targets the spacer's CONTENT height (a style-set value,
 * deterministic). The container's `scrollHeight` gets a one-row band on top:
 * `clientHeight` can wobble a few px around a scroll write (horizontal
 * scrollbar appearing as columns settle), which briefly bakes a sub-row
 * viewport overhang past the spacer. The mapping reads measured geometry at
 * event time, so it self-corrects on the next scroll event — cosmetic, and
 * bounded by one row height.
 */
const MAX_VIRTUAL_HEIGHT = 15_000_000;

/** One-round-trip geometry snapshot; all assertions happen in Node. */
function readGeometry(page: import('@playwright/test').Page) {
  return page.evaluate((hostId) => {
    const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
    const grid = document.querySelector(`#${hostId} .dt-grid`)!;
    const content = document.querySelector<HTMLElement>(`#${hostId} .dt-virtual-content`)!;
    const rowIdx = Array.from(document.querySelectorAll(`#${hostId} .dt-body .dt-row`))
      .map((r) => Number(r.getAttribute('data-row-index')))
      .sort((a, b) => a - b);
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      contentHeight: content.offsetHeight,
      ariaRowCount: grid.getAttribute('aria-rowcount'),
      rowIdx,
      placeholders: document.querySelectorAll(`#${hostId} [data-placeholder]`).length,
    };
  }, BIG_TABLE_HOST_ID);
}

/**
 * Identity and geometry of one row, relative to the scroll container.
 * `bottomDelta` measures against `top + clientHeight` so a horizontal
 * scrollbar cannot skew the reading.
 */
function readRowFacts(page: import('@playwright/test').Page, index: number) {
  return page.evaluate(
    ({ hostId, index }) => {
      const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
      const row = document.querySelector(`#${hostId} .dt-row[data-row-index="${index}"]`);
      if (!row) return null;
      const rect = row.getBoundingClientRect();
      const cRect = el.getBoundingClientRect();
      return {
        rowid: row.getAttribute('data-row-id'),
        ariaRowIndex: row.getAttribute('aria-rowindex'),
        grp: row.querySelector('.dt-cell[data-column="grp"]')?.textContent ?? null,
        topDelta: Math.abs(rect.top - cRect.top),
        bottomDelta: Math.abs(rect.bottom - (cRect.top + el.clientHeight)),
      };
    },
    { hostId: BIG_TABLE_HOST_ID, index },
  );
}

/**
 * Scroll via the public API. `getTableBody()` is nullable and the TableBody
 * is destroyed and recreated whenever the schema or visible columns change —
 * re-read it on every call, never cache a handle.
 */
function scrollToRow(page: import('@playwright/test').Page, index: number) {
  return page.evaluate((i) => {
    const w = window as unknown as { __t: import('../../src/index').DataTable };
    const body = w.__t.container.getTableBody();
    if (!body) throw new Error('scrollToRow: table body not mounted');
    body.scrollToRow(i, 'start');
  }, index);
}

/**
 * The row holding the keyboard cursor. DOM focus stays on `.dt-grid` (the
 * cursor is `aria-activedescendant` plus the `.dt-cell--focused` class), so
 * `document.activeElement` says nothing about the focused row.
 */
function focusedRowIndex(page: import('@playwright/test').Page) {
  return page.evaluate((hostId) => {
    const cell = document.querySelector(`#${hostId} .dt-cell--focused`);
    return cell?.closest('.dt-row')?.getAttribute('data-row-index') ?? null;
  }, BIG_TABLE_HOST_ID);
}

test('Block A: 1.6M rows — compressed mapping reaches, maps, and lands exactly', async ({
  page,
}) => {
  test.setTimeout(360_000);
  await mountBigTable(page, { rows: N_LARGE });

  await test.step('bottom reachability', async () => {
    // The write can race a few px of clientHeight wobble (horizontal
    // scrollbar appearing as columns settle), leaving scrollTop just shy of
    // the settled maximum — re-write until the position holds at max.
    let g = await readGeometry(page);
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate((hostId) => {
        const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
        el.scrollTop = el.scrollHeight; // browser clamps to its max scroll
      }, BIG_TABLE_HOST_ID);
      await waitForRowsResolved(page);
      g = await readGeometry(page);
      if (g.scrollTop + g.clientHeight >= g.scrollHeight - 1) break;
    }
    expect(g.scrollTop + g.clientHeight, 'scroll position settled at max').toBeGreaterThanOrEqual(
      g.scrollHeight - 1,
    );

    expect(g.contentHeight, 'compressed mode engaged (exact cap)').toBe(MAX_VIRTUAL_HEIGHT);
    expect(g.scrollHeight).toBeGreaterThanOrEqual(MAX_VIRTUAL_HEIGHT);
    expect(g.scrollHeight).toBeLessThanOrEqual(MAX_VIRTUAL_HEIGHT + ROW_HEIGHT);
    expect(g.placeholders).toBe(0);
    expect(g.rowIdx.length).toBeGreaterThan(0);
    for (let i = 1; i < g.rowIdx.length; i++) {
      expect(g.rowIdx[i], 'rendered indices are contiguous').toBe(g.rowIdx[i - 1]! + 1);
    }
    // THE bug-1 assertion: pre-fix, the last ~460K rows were unreachable.
    expect(g.rowIdx[g.rowIdx.length - 1]).toBe(N_LARGE - 1);

    const last = await readRowFacts(page, N_LARGE - 1);
    expect(last).not.toBeNull();
    expect(last!.rowid).toBe(String(N_LARGE - 1));
    // aria-rowindex is index + 2 (the column-header row is aria row 1) and
    // aria-rowcount is totalRows + 1 — for the last body row the two agree.
    expect(last!.ariaRowIndex).toBe(String(N_LARGE + 1));
    expect(g.ariaRowCount).toBe(String(N_LARGE + 1));
    expect(last!.grp).toBe(expectedGrp(N_LARGE - 1));
    expect(last!.bottomDelta, 'last row bottom-flush with the container').toBeLessThanOrEqual(1);
  });

  await test.step('proportionality: fractional thumb positions land within 0.1%', async () => {
    const firsts: number[] = [];
    for (const f of [0.25, 0.5, 0.75]) {
      // Each jump is ~3.75M physical px — far beyond one viewport height, so
      // the memoryless PROPORTIONAL branch is taken. Do not shrink these
      // jumps: deltas under one viewport height take the LINEAR branch.
      await page.evaluate(
        ({ hostId, f }) => {
          const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
          el.scrollTop = Math.round(f * (el.scrollHeight - el.clientHeight));
        },
        { hostId: BIG_TABLE_HOST_ID, f },
      );
      await waitForRowsResolved(page);
      const rows = await readVisibleRows(page);
      expect(rows.length).toBeGreaterThan(0);
      const first = rows[0]!.index;
      // Pre-fix the error here was ~460K rows; the mapping's own skew is ~10.
      expect(Math.abs(first - f * N_LARGE), `f=${f} within ±1,600 rows`).toBeLessThanOrEqual(1600);
      firsts.push(first);
    }
    expect(firsts[0]!).toBeLessThan(firsts[1]!);
    expect(firsts[1]!).toBeLessThan(firsts[2]!);
  });

  await test.step('scrollToRow exactness at the far end', async () => {
    // 1,048,570 is the pre-fix Chromium clamp edge; 1,599,940 is near-bottom
    // but ~550 physical px clear of the bottom-reconciliation snap. For both,
    // scrollToRow writes the virtual anchor losslessly → top-flush is exact.
    for (const i of [1_048_570, 1_599_940]) {
      await scrollToRow(page, i);
      await waitForRowsResolved(page);
      const facts = await readRowFacts(page, i);
      expect(facts, `row ${i} rendered`).not.toBeNull();
      expect(facts!.rowid).toBe(String(i));
      expect(facts!.grp).toBe(expectedGrp(i));
      expect(facts!.topDelta, `row ${i} top-flush`).toBeLessThanOrEqual(1);
    }

    // The last row can never land top-flush: the virtual anchor clamps to max
    // scroll, which renders the final viewport with the last row bottom-flush.
    await scrollToRow(page, N_LARGE - 1);
    await waitForRowsResolved(page);
    const last = await readRowFacts(page, N_LARGE - 1);
    expect(last).not.toBeNull();
    expect(last!.rowid).toBe(String(N_LARGE - 1));
    expect(last!.grp).toBe(expectedGrp(N_LARGE - 1));
    expect(last!.bottomDelta, 'last row bottom-flush').toBeLessThanOrEqual(1);

    await scrollToRow(page, 0);
    await waitForRowsResolved(page);
    const first = await readRowFacts(page, 0);
    expect(first).not.toBeNull();
    expect(first!.rowid).toBe('0');
    expect(first!.topDelta, 'row 0 top-flush').toBeLessThanOrEqual(1);
  });

  await test.step('keyboard: Ctrl+End, PageDown clamp, Ctrl+Home', async () => {
    // Cursor keys apply only once focus is inside the grid — click a body cell.
    await page.locator(`#${BIG_TABLE_HOST_ID} .dt-body .dt-row .dt-cell`).first().click();
    await page.waitForSelector(`#${BIG_TABLE_HOST_ID} .dt-cell--focused`, { timeout: 15_000 });

    // The handler accepts ctrlKey OR metaKey, so Control works on every OS.
    // Each keystroke renders placeholders synchronously and resolves them
    // async — wait after EVERY key before asserting.
    await page.keyboard.press('Control+End');
    await waitForRowsResolved(page);
    expect(await focusedRowIndex(page)).toBe(String(N_LARGE - 1));
    const vis = await readVisibleRows(page);
    expect(vis.some((r) => r.index === N_LARGE - 1 && r.rowid === N_LARGE - 1)).toBe(true);

    for (let k = 0; k < 2; k++) {
      await page.keyboard.press('PageDown');
      await waitForRowsResolved(page);
    }
    // From the last page, PageDown clamps: no overshoot, no blank viewport.
    expect(await focusedRowIndex(page)).toBe(String(N_LARGE - 1));
    const after = await readGeometry(page);
    expect(after.placeholders).toBe(0);
    expect(after.rowIdx.length).toBeGreaterThan(0);
    for (let i = 1; i < after.rowIdx.length; i++) {
      expect(after.rowIdx[i]).toBe(after.rowIdx[i - 1]! + 1);
    }

    await page.keyboard.press('Control+Home');
    await waitForRowsResolved(page);
    expect(await focusedRowIndex(page)).toBe('0');
    expect((await readVisibleRows(page))[0]!.index).toBe(0);
  });
});

test('Block B: 10K rows — identity mapping is bit-for-bit exact below the cap', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await mountBigTable(page, { rows: N_SMALL });

  // Below the cap the spacer is exactly totalRows × rowHeight — no
  // compression, no mapping. This is the guard that the cap never engages
  // for the overwhelmingly common dataset sizes.
  const g = await readGeometry(page);
  expect(g.scrollHeight).toBe(N_SMALL * ROW_HEIGHT);

  for (const k of [0, 1, 137, 5000, 9950]) {
    // Largest target: 9,950 × 32 = 318,400 px, still short of
    // maxScroll = 320,000 − clientHeight, so the browser never clamps it.
    await page.evaluate(
      ({ hostId, top }) => {
        const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
        el.scrollTop = top;
      },
      { hostId: BIG_TABLE_HOST_ID, top: k * ROW_HEIGHT },
    );
    await waitForRowsResolved(page);
    const rows = await readVisibleRows(page);
    expect(rows[0]!.index, `scrollTop ${k * ROW_HEIGHT} → first fully-visible row ${k}`).toBe(k);
  }
});
