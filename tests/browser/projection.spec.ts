/**
 * Phase 5's acceptance test: a row fetch projects the **column window**, not
 * the column list — and a horizontal move resolves what it exposes.
 *
 * Phases 3 and 4 windowed the DOM on the column axis. The data path did not
 * move: a 128-row block still `SELECT`ed every visible column, so a table with
 * 1,000 columns drained 128K values out of Arrow, structured-cloned them
 * across the worker boundary, and cached them whole — to paint ~28 columns.
 * What this spec establishes on a real browser against a real DuckDB load:
 *
 *  - **Every block-fetch `SELECT` list is a clipped, quantized run**, bounded
 *    by `COLVIRT.PROJECTED_COLS_MAX` and *strictly shorter* than the visible
 *    column count, at every stop of a full horizontal sweep. The cap alone
 *    would not be an assertion; "strictly shorter than the whole table" is.
 *  - **It is the same size at 300 columns as at 1,000** (the gated tier at
 *    the bottom), which is the phase's claim in one number.
 *  - **A diagonal sweep converges.** Driving `scrollTop` and `scrollLeft`
 *    together — the case where a row is present, short of the window, and
 *    moving on both axes at once — ends with zero pending cells, zero
 *    placeholders, and zero column-oracle violations. The oracle is what
 *    makes this more than a smoke test: a cell showing a *neighbouring*
 *    column's value renders perfectly and is completely wrong.
 *  - **One window move costs the visible blocks**, not a fetch per column or
 *    per frame (`COLVIRT.QUERIES_PER_WINDOW_MOVE_MAX`).
 *
 * A small custom tier for the same reason `column-window.spec.ts` uses one:
 * every fact here is about the column axis, and depth is already paid for by
 * `tiers.smoke.spec.ts`.
 */
import { expect, test, type Page } from '@playwright/test';

import { DT_BUDGET } from '../budgets';

import { bridgeStats, resetBridgeStats } from './helpers/metrics';
import {
  installColumnInvariantProbe,
  mountTierTable,
  readColViolations,
  sweepHorizontal,
  waitForTierSettled,
  wideMountOptions,
  TIER_HOST_ID,
} from './helpers/wideTable';

const SEED = 23;
const ROWS = 2_000;

test.describe.configure({ timeout: 300_000 });

/** One recorded row-fetch query. */
interface RecordedFetch {
  columns: string[];
  priority: string | undefined;
}

/**
 * Wrap `bridge.query` so the spec can read the projection the body actually
 * asked for.
 *
 * The bridge counts queries but does not keep their SQL, and the SELECT list
 * is the whole subject here. Install after the mount so the load path's own
 * traffic is not recorded.
 */
async function recordFetches(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface Recorder {
      __dtFetchLog?: { columns: string[]; priority: string | undefined }[];
      __t?: { bridge: Record<string, unknown> };
    }
    const w = window as unknown as Recorder;
    const bridge = w.__t?.bridge;
    if (!bridge) throw new Error('projection spec: no bridge — mountTierTable first');
    const log: { columns: string[]; priority: string | undefined }[] = (w.__dtFetchLog = []);
    const original = bridge['query'] as (...args: unknown[]) => unknown;
    bridge['query'] = function patched(...args: unknown[]) {
      const sql = String(args[0] ?? '');
      const options = args[2] as { priority?: string } | undefined;
      // Row fetches are the only queries that project `__rowid__` — header
      // stats, counts and histograms never do.
      const select = sql.match(/\bSELECT\s+([\s\S]*?)\s+FROM\s/i);
      if (select && select[1]!.includes('"__rowid__"')) {
        log.push({
          columns: select[1]!.split(',').map((part) => {
            const trimmed = part.trim();
            const alias = trimmed.match(/\sAS\s+"((?:[^"]|"")*)"\s*$/i);
            if (alias) return alias[1]!.replace(/""/g, '"');
            return trimmed.replace(/^"|"$/g, '').replace(/""/g, '"');
          }),
          priority: options?.priority,
        });
      }
      return original.apply(bridge, args);
    };
  });
}

/** Everything recorded since {@link recordFetches}, oldest first. */
async function readFetches(page: Page): Promise<RecordedFetch[]> {
  return page.evaluate(
    () => (window as unknown as { __dtFetchLog?: RecordedFetch[] }).__dtFetchLog ?? [],
  );
}

async function clearFetches(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log = (window as unknown as { __dtFetchLog?: unknown[] }).__dtFetchLog;
    if (log) log.length = 0;
  });
}

/** Cells currently marked as awaiting their column's values. */
async function pendingCells(page: Page): Promise<number> {
  return page.evaluate(
    (hostId) => document.querySelectorAll(`#${hostId} .dt-cell[data-pending]`).length,
    TIER_HOST_ID,
  );
}

/** `visibleColumns[start, end)` — what the body is rendering right now. */
async function renderedColumns(page: Page): Promise<string[]> {
  return page.evaluate((hostId) => {
    const row = document.querySelector(
      `#${hostId} .dt-body .dt-row[data-row-id]:not([data-placeholder])`,
    );
    if (!row) return [];
    return Array.from(row.querySelectorAll('.dt-cell[data-column]')).map((cell) =>
      cell.getAttribute('data-column')!,
    );
  }, TIER_HOST_ID);
}

/**
 * Assert one recorded projection against every property that must hold at
 * every offset and every column count.
 */
function expectClipped(fetch: RecordedFetch, totalColumns: number, where: string): void {
  expect(fetch.columns[0], `${where}: __rowid__ leads the projection`).toBe('__rowid__');
  expect(fetch.columns.length, `${where}: projected columns`).toBeLessThanOrEqual(
    DT_BUDGET.COLVIRT.PROJECTED_COLS_MAX,
  );
  // The assertion a cap alone cannot make: this is not the whole table.
  expect(fetch.columns.length, `${where}: strictly clipped`).toBeLessThan(totalColumns);
  const indices = fetch.columns.slice(1).map((name) => Number(name.slice(4)));
  expect(indices, `${where}: ascending`).toEqual([...indices].sort((a, b) => a - b));
}

test('a block fetch projects the column window, not the column list', async ({ page }) => {
  const COLS = 300;
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: COLS, seed: SEED, viz: false });
  await waitForTierSettled(page);
  await recordFetches(page);
  await installColumnInvariantProbe(page, SEED);

  const stops = await sweepHorizontal(page, [0, 0.25, 0.5, 0.75, 1]);
  expect(stops).toHaveLength(5);

  const fetches = await readFetches(page);
  expect(fetches.length, 'the sweep issued row fetches').toBeGreaterThan(0);

  let widest = 0;
  for (const [i, fetch] of fetches.entries()) {
    expectClipped(fetch, COLS, `fetch ${i}`);
    widest = Math.max(widest, fetch.columns.length);
  }
  console.log(
    `[projection] ${COLS} columns: ${fetches.length} row fetches, ` +
      `widest SELECT list ${widest} columns ` +
      `(budget ${DT_BUDGET.COLVIRT.PROJECTED_COLS_MAX}, unclipped would be ${COLS + 1}); ` +
      `payload ${widest * 128} values/block vs ${(COLS + 1) * 128}`,
  );
  expect(widest * 128, 'block payload values').toBeLessThanOrEqual(
    DT_BUDGET.COLVIRT.BLOCK_VALUES_MAX,
  );

  // The last stop is settled, so what is rendered must be covered by what was
  // fetched — no pending cells, and no oracle breach.
  expect(await pendingCells(page), 'pending cells after settle').toBe(0);
  const violations = await readColViolations(page);
  expect(violations.slice(0, 5), 'column-oracle violations').toEqual([]);
  expect(violations.length).toBe(DT_BUDGET.WIDE_CI.ORACLE_VIOLATIONS);
});

test('a diagonal sweep converges with no wrong, stale or pending cells', async ({ page }) => {
  const COLS = 300;
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: COLS, seed: SEED, viz: false });
  await waitForTierSettled(page);
  await installColumnInvariantProbe(page, SEED);

  // Five alternating half-viewport steps on both axes at once — the case a
  // single-axis sweep never produces: rows arriving while the columns under
  // them are still moving.
  for (let step = 1; step <= 5; step++) {
    await page.evaluate((fraction) => {
      const scroll = document.querySelector('.dt-body-scroll') as HTMLElement;
      scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * fraction;
      scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) * fraction;
    }, step / 6);
    await waitForTierSettled(page);
  }

  expect(await pendingCells(page), 'pending cells after the diagonal settle').toBe(0);
  const rendered = await renderedColumns(page);
  expect(rendered.length, 'the body is still rendering a window').toBeGreaterThan(0);
  expect(rendered.length).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.WINDOW_COLUMNS_MAX);

  const violations = await readColViolations(page);
  expect(violations.slice(0, 5), 'oracle violations over the diagonal sweep').toEqual([]);
  expect(violations.length).toBe(DT_BUDGET.WIDE_CI.ORACLE_VIOLATIONS);
});

test('one horizontal window move costs the visible blocks, not a fetch per column', async ({
  page,
}) => {
  const COLS = 300;
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: COLS, seed: SEED, viz: false });
  await waitForTierSettled(page);
  await recordFetches(page);

  // Park mid-axis first so the move below is an ordinary one rather than the
  // first departure from a fully covered origin.
  await page.evaluate(() => {
    const scroll = document.querySelector('.dt-body-scroll') as HTMLElement;
    scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) * 0.5;
  });
  await waitForTierSettled(page);

  await clearFetches(page);
  await resetBridgeStats(page);
  const before = await bridgeStats(page);

  // One viewport of columns further along — ~7 at the default width, well
  // inside the padded band, which is the whole point of padding it.
  await page.evaluate(() => {
    const scroll = document.querySelector('.dt-body-scroll') as HTMLElement;
    scroll.scrollLeft += scroll.clientWidth;
  });
  await waitForTierSettled(page);

  const small = await readFetches(page);
  const smallHigh = small.filter((fetch) => fetch.priority === 'high');
  const after = await bridgeStats(page);
  console.log(
    `[projection] one window move: ${small.length} row fetches ` +
      `(${smallHigh.length} high priority), ` +
      `${(after?.sent.query ?? 0) - (before?.sent.query ?? 0)} bridge queries total`,
  );
  expect(smallHigh.length, 'high-priority fetches for one window move').toBeLessThanOrEqual(
    DT_BUDGET.COLVIRT.QUERIES_PER_WINDOW_MOVE_MAX,
  );
  expect(await pendingCells(page)).toBe(0);

  // Now a move that genuinely leaves the padded band, so the budget is a
  // bound rather than a tautology. It takes a jump most of the way down the
  // axis: the padded window is ~112 columns wide, so a *ten*-viewport move is
  // still a cache hit — which is the padding earning its keep, and the reason
  // the small move above legitimately costs nothing.
  await clearFetches(page);
  await page.evaluate(() => {
    const scroll = document.querySelector('.dt-body-scroll') as HTMLElement;
    scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) * 0.95;
  });
  await waitForTierSettled(page);

  const big = await readFetches(page);
  const bigHigh = big.filter((fetch) => fetch.priority === 'high');
  console.log(
    `[projection] a jump past the padded band: ${big.length} row fetches ` +
      `(${bigHigh.length} high priority)`,
  );
  expect(bigHigh.length, 'a move past the padded band re-fetches').toBeGreaterThan(0);
  expect(bigHigh.length, 'and still costs the visible blocks only').toBeLessThanOrEqual(
    DT_BUDGET.COLVIRT.QUERIES_PER_WINDOW_MOVE_MAX,
  );
  for (const [i, fetch] of [...small, ...big].entries()) {
    expectClipped(fetch, COLS, `move fetch ${i}`);
  }
  expect(await pendingCells(page)).toBe(0);
});

test('pinning a column resolves it without a full-viewport refetch', async ({ page }) => {
  const COLS = 300;
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: COLS, seed: SEED, viz: false });
  await waitForTierSettled(page);

  await page.evaluate(() => {
    const scroll = document.querySelector('.dt-body-scroll') as HTMLElement;
    scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) * 0.5;
  });
  await waitForTierSettled(page);
  await recordFetches(page);

  // Pin whatever is leftmost on screen, then look further along the axis: the
  // pinned column must still have values under it.
  //
  // Through `actions.toggleColumnPin`, which is what the header's pin control
  // calls, rather than by writing `pinnedColumns` directly — the action also
  // moves the column to the front of the order, and writing the signal alone
  // leaves a pinned column sitting behind unpinned ones, which is
  // `ColumnWindow.pinnedPrefixViolated`: the pinned "prefix" then runs through
  // the *last* pinned index, so the body renders every column before it. The
  // fetch follows the render there, correctly and expensively, and it is not
  // a state any UI gesture produces.
  const pinned = await page.evaluate(() => {
    const w = window as unknown as {
      __t: { actions: { toggleColumnPin(column: string): void } };
    };
    const first = document
      .querySelector('.dt-body .dt-row[data-row-id] .dt-cell[data-column]')
      ?.getAttribute('data-column');
    if (!first) throw new Error('projection spec: no rendered cell to pin');
    w.__t.actions.toggleColumnPin(first);
    return first;
  });
  await waitForTierSettled(page);

  // `toggleColumnPin` writes `pinnedColumns` and then `columnOrder`, so there
  // is one render between the two in which the column is pinned and still
  // in place — `pinnedPrefixViolated`, and a wide projection for one frame.
  // Measured, reported, and deliberately not asserted against the steady-state
  // budget: closing it means batching the two writes in `StateActions`, which
  // is Phase 6's interaction sweep, not this phase's fetch path.
  const duringPin = await readFetches(page);
  console.log(
    `[projection] pinning issued ${duringPin.length} row fetches, widest ` +
      `${Math.max(0, ...duringPin.map((f) => f.columns.length))} columns ` +
      `(one of them spans the transient pinned prefix; unclipped would be ${COLS + 1})`,
  );
  await clearFetches(page);

  await page.evaluate(() => {
    const scroll = document.querySelector('.dt-body-scroll') as HTMLElement;
    scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) * 0.85;
  });
  await waitForTierSettled(page);

  const pinnedText = await page.evaluate(
    (column) =>
      document.querySelector(`.dt-body .dt-row[data-row-id] .dt-cell[data-column="${column}"]`)
        ?.textContent ?? null,
    pinned,
  );
  expect(pinnedText, 'the pinned column still has values under it').not.toBeNull();
  expect(pinnedText).not.toBe('');
  expect(await pendingCells(page)).toBe(0);

  const fetches = await readFetches(page);
  for (const [i, fetch] of fetches.entries()) {
    expectClipped(fetch, COLS, `pin fetch ${i}`);
    expect(fetch.columns, `pin fetch ${i} carries the pinned column`).toContain(pinned);
  }
});

test.describe('WIDE — 1,000 columns', () => {
  test.skip(process.env['RUN_BROWSER_PERF'] !== '1', 'perf tier — set RUN_BROWSER_PERF=1');
  test.describe.configure({ timeout: 1_800_000 });

  test('the projection is the same size at 1,000 columns as at 300', async ({ page }) => {
    const mounted = await mountTierTable(page, wideMountOptions(false));
    const COLS = mounted.spec.cols;
    await waitForTierSettled(page);
    await recordFetches(page);
    await installColumnInvariantProbe(page, mounted.spec.seed);

    await sweepHorizontal(page, [0, 0.25, 0.5, 0.75, 1]);

    const fetches = await readFetches(page);
    expect(fetches.length).toBeGreaterThan(0);
    let widest = 0;
    for (const [i, fetch] of fetches.entries()) {
      expectClipped(fetch, COLS, `WIDE fetch ${i}`);
      widest = Math.max(widest, fetch.columns.length);
    }
    console.log(
      `[projection] WIDE ${COLS} columns: widest SELECT list ${widest} ` +
        `(unclipped would be ${COLS + 1}); payload ${widest * 128} values/block ` +
        `vs ${(COLS + 1) * 128} — ${Math.round(((COLS + 1) / widest) * 10) / 10}x fewer`,
    );

    expect(await pendingCells(page)).toBe(0);
    const violations = await readColViolations(page);
    expect(violations.slice(0, 5)).toEqual([]);
    expect(violations.length).toBe(DT_BUDGET.WIDE_CI.ORACLE_VIOLATIONS);
  });
});
