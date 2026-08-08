/**
 * Phase 2's proof: at any column count, per-column charts cost what the
 * *viewport* costs.
 *
 * Before this phase a 1,000-column table with visualizations on built 1,000
 * canvases, issued 2,004 queries, installed 1,001 MutationObservers, and made
 * `loadData` resolve at 18,884 ms against 8,334 ms with charts off. Charts are
 * now created when their header scrolls into view, their data outlives the
 * canvas, and only visible charts refetch on a filter change.
 *
 * **Most of this file runs in the default `npm run test:browser`,** at
 * WIDE_CI (300 × 20,000) — deliberately, and against this repo's own rule
 * that gated tiers stay gated (README §8.3). Everything asserted here is a
 * machine-independent count: queries, canvases, observers. A slow runner
 * makes them slower, not different. The one wall-clock assertion, and the
 * 1,000-column repeat, sit behind `RUN_BROWSER_PERF=1` at the bottom.
 *
 * The measured figures behind every cap are recorded in `tests/budgets.ts`
 * under `DT_BUDGET.VIZ`, not here — a spec that restated them would be a
 * second place to update and a first place to disagree.
 */
import { expect, test, type Page } from '@playwright/test';

import { DT_BUDGET } from '../budgets';
import { TIERS, columnName } from '../fixtures/tiers';

import {
  bridgeStats,
  canvasCount,
  installObserverCensus,
  readObserverCensus,
  resetBridgeStats,
} from './helpers/metrics';
import {
  mountTierTable,
  sweepHorizontal,
  waitForTierSettled,
  waitForVizReady,
  wideMountOptions,
  TIER_HOST_ID,
  type MountTierOptions,
} from './helpers/wideTable';

const CI_TIER = TIERS['wide-ci'];

/** DuckDB boot plus 6M cells generated, exported and reloaded is not fast. */
test.describe.configure({ timeout: 300_000 });

// =========================================
// Page-side readouts
// =========================================

/** Headers that currently own a chart, and the total. */
async function headerCensus(page: Page): Promise<{ headers: number; withCanvas: number }> {
  return page.evaluate((hostId) => {
    const headers = Array.from(document.querySelectorAll(`#${hostId} .dt-col-header`));
    let withCanvas = 0;
    for (const header of headers) if (header.querySelector('canvas')) withCanvas++;
    return { headers: headers.length, withCanvas };
  }, TIER_HOST_ID);
}

/** Durations of the `dt:load:*` measures, in ms. */
async function loadMeasures(page: Page): Promise<{ total: number | null; viz: number | null }> {
  return page.evaluate(() => {
    const read = (name: string): number | null => {
      const entries = performance.getEntriesByName(`dt:load:${name}`, 'measure');
      return entries.length > 0 ? entries[entries.length - 1]!.duration : null;
    };
    return { total: read('total'), viz: read('viz') };
  });
}

/** Mount, wait for both the grid and the initial chart wave, return the counters. */
async function mountAndSettle(
  page: Page,
  opts: MountTierOptions,
): Promise<{ loadMs: number; queriesAtPaint: number; queries: number; canvases: number }> {
  const mounted = await mountTierTable(page, opts);
  const atPaint = await bridgeStats(page);
  await waitForVizReady(page);
  await waitForTierSettled(page);
  const after = await bridgeStats(page);
  return {
    loadMs: mounted.loadMs,
    queriesAtPaint: atPaint?.sent.query ?? -1,
    queries: after?.sent.query ?? -1,
    canvases: await canvasCount(page),
  };
}

// =========================================
// Default-run assertions, WIDE_CI
// =========================================

test('creates charts for the visible columns only', async ({ page }) => {
  await installObserverCensus(page);
  const run = await mountAndSettle(page, { tier: 'wide-ci', viz: true });
  const census = await headerCensus(page);
  const observers = await readObserverCensus(page);

  console.log(
    `[viz-lazy] wide-ci viz=on ${JSON.stringify({
      queriesAtPaint: run.queriesAtPaint,
      queries: run.queries,
      canvases: run.canvases,
      headers: census.headers,
      io: observers.intersection,
      mo: observers.mutation,
      ro: observers.resize,
    })}`,
  );

  // Every column has a header; almost none has a chart. That gap is the phase.
  expect(census.headers).toBe(CI_TIER.cols);
  expect(run.canvases, 'canvases after the initial wave').toBeGreaterThan(0);
  expect(run.canvases).toBeLessThanOrEqual(DT_BUDGET.VIZ.CANVAS_COUNT_MAX);
  expect(census.withCanvas, 'headers owning a chart').toBe(run.canvases);

  expect(run.queries, 'queries from load start to vizReady').toBeLessThanOrEqual(
    DT_BUDGET.VIZ.QUERIES_AT_LOAD_MAX,
  );

  // One IntersectionObserver for the table, whatever the column count, and a
  // theme observer that is shared rather than per chart.
  expect(observers.intersection).toBeLessThanOrEqual(DT_BUDGET.VIZ.INTERSECTION_OBSERVERS_MAX);
  expect(observers.created.intersection, 'observers ever constructed').toBeLessThanOrEqual(
    DT_BUDGET.VIZ.INTERSECTION_OBSERVERS_MAX,
  );
  expect(observers.mutation).toBeLessThanOrEqual(DT_BUDGET.VIZ.MUTATION_OBSERVERS_MAX);
  // ResizeObservers are per live chart plus the container's own, so they
  // track the canvas count rather than the column count.
  expect(observers.resize).toBeLessThanOrEqual(run.canvases + 4);
});

test('the load promise resolves before the charts are drawn', async ({ page }) => {
  await mountAndSettle(page, { tier: 'wide-ci', viz: true });
  const measures = await loadMeasures(page);

  console.log(`[viz-lazy] wide-ci lazy measures ${JSON.stringify(measures)}`);
  expect(measures.total, 'dt:load:total').not.toBeNull();
  expect(measures.viz, 'dt:load:viz').not.toBeNull();
  // The structural form of "loadComplete no longer waits for charts". Both
  // measures start at `dt:load:start`, so comparing durations compares the
  // two end marks.
  expect(measures.viz!).toBeGreaterThan(measures.total!);
});

test('eager restores the old contract: everything built, load waits for it', async ({ page }) => {
  await installObserverCensus(page);
  const run = await mountAndSettle(page, { tier: 'wide-ci', viz: true, eager: true });
  const measures = await loadMeasures(page);
  const observers = await readObserverCensus(page);

  console.log(
    `[viz-lazy] wide-ci eager ${JSON.stringify({
      queries: run.queries,
      canvases: run.canvases,
      measures,
    })}`,
  );

  // The control for every "after" number above: this is what the library did
  // for every table before this phase, and still does on request.
  expect(run.canvases, 'eager builds every applicable column').toBeGreaterThan(
    DT_BUDGET.VIZ.CANVAS_COUNT_MAX,
  );
  expect(run.queries).toBeGreaterThan(DT_BUDGET.VIZ.QUERIES_AT_LOAD_MAX);
  // …and the load promise waits for them, so `dt:load:viz` lands *inside*
  // `dt:load:total` rather than after it.
  expect(measures.viz!).toBeLessThanOrEqual(measures.total!);
  // One shared theme observer either way — that saving is not lazy-only.
  expect(observers.mutation).toBeLessThanOrEqual(DT_BUDGET.VIZ.MUTATION_OBSERVERS_MAX);
});

test('vizReady fires exactly once per load, after loadComplete, and re-arms', async ({ page }) => {
  await mountAndSettle(page, { tier: 'wide-ci', viz: true });

  // Subscribe, then load again. A second load is the only way to watch the
  // event from a load's beginning — the table has to exist before anything
  // can listen to it — and it is also what proves the promise re-arms rather
  // than staying resolved from the first load forever.
  const observed = await page.evaluate(async () => {
    const table = (window as unknown as { __t: import('../../src/index').DataTable }).__t;
    const order: string[] = [];
    const viz: Array<{ tableName: string; vizCount: number }> = [];
    const offViz = table.on('vizReady', (payload) => {
      order.push('vizReady');
      viz.push(payload);
    });
    const offDone = table.on('loadComplete', () => order.push('loadComplete'));

    const csv = 'a,b,c\n1,x,2.5\n2,y,3.5\n3,x,4.5\n';
    await table.loadData(csv, { sourceFormat: 'csv' });
    const orderAtResolve = [...order];
    await table.whenVizReady();
    offViz();
    offDone();
    return { order, orderAtResolve, viz };
  });

  console.log(`[viz-lazy] second load ${JSON.stringify(observed)}`);

  // Exactly one emission for the load, and it carries the real wave size.
  expect(observed.viz).toHaveLength(1);
  expect(observed.viz[0]!.tableName).toBeTruthy();
  expect(observed.viz[0]!.vizCount).toBeGreaterThanOrEqual(0);
  expect(observed.viz[0]!.vizCount).toBeLessThanOrEqual(3);

  // `loadData` resolved before the charts were ready …
  expect(observed.orderAtResolve).toEqual(['loadComplete']);
  // … and `whenVizReady()` waited for the rest.
  expect(observed.order).toEqual(['loadComplete', 'vizReady']);
});

test('scrolling right streams charts in and drops the ones left behind', async ({ page }) => {
  await mountAndSettle(page, { tier: 'wide-ci', viz: true });
  const atRest = await canvasCount(page);

  await resetBridgeStats(page);
  await sweepHorizontal(page, [0.5]);
  await waitForVizReady(page);
  await waitForTierSettled(page);
  const stats = await bridgeStats(page);
  const after = await canvasCount(page);
  const census = await headerCensus(page);

  console.log(
    `[viz-lazy] sweep 0 → 0.5 ${JSON.stringify({
      canvasBefore: atRest,
      canvasAfter: after,
      queries: stats?.sent.query,
      maxInFlight: stats?.maxInFlight,
    })}`,
  );

  // Charts appeared for the new window …
  expect(after).toBeGreaterThan(0);
  expect(census.withCanvas).toBe(after);
  // … and the count did not grow with the distance travelled: the columns
  // left behind gave their canvases back.
  expect(after).toBeLessThanOrEqual(DT_BUDGET.VIZ.CANVAS_COUNT_MAX);
  // Each newly visible chart costs its own two aggregates and no more. The
  // ceiling is "every canvas now on screen was built from scratch", which is
  // the worst case for a jump this large.
  expect(stats!.sent.query).toBeLessThanOrEqual(after * DT_BUDGET.VIZ.QUERIES_PER_VIZ_CREATE + 8);
  expect(stats!.maxInFlight).toBeLessThanOrEqual(DT_BUDGET.VIZ.MAX_IN_FLIGHT);
});

test('a filter refetches the visible charts and nothing else', async ({ page }) => {
  await mountAndSettle(page, { tier: 'wide-ci', viz: true });
  const visible = await canvasCount(page);
  expect(visible).toBeGreaterThan(0);

  await resetBridgeStats(page);
  await page.evaluate(
    (column) =>
      (window as unknown as { __t: import('../../src/index').DataTable }).__t.actions.addFilter({
        type: 'range',
        column,
        min: 0,
        max: 50_000,
      }),
    columnName(10),
  );
  await waitForTierSettled(page);
  const stats = await bridgeStats(page);

  const ceiling =
    DT_BUDGET.VIZ.NONVIZ_QUERIES_PER_FILTER +
    DT_BUDGET.VIZ.QUERIES_PER_VIZ_PER_FILTER * DT_BUDGET.VIZ.CANVAS_COUNT_MAX;
  console.log(
    `[viz-lazy] one filter ${JSON.stringify({
      visibleCharts: visible,
      queries: stats?.sent.query,
      maxInFlight: stats?.maxInFlight,
      ceiling,
    })}`,
  );

  // The number that mattered: one filter used to fan out to all 300 charts.
  expect(stats!.sent.query).toBeLessThanOrEqual(ceiling);
  expect(stats!.maxInFlight).toBeLessThanOrEqual(DT_BUDGET.VIZ.MAX_IN_FLIGHT);
});

test('an offscreen column refreshes when it scrolls back into a filtered view', async ({
  page,
}) => {
  await mountAndSettle(page, { tier: 'wide-ci', viz: true });
  await page.evaluate(
    (column) =>
      (window as unknown as { __t: import('../../src/index').DataTable }).__t.actions.addFilter({
        type: 'range',
        column,
        min: 0,
        max: 50_000,
      }),
    columnName(10),
  );
  await waitForTierSettled(page);

  // Jump somewhere the initial wave never reached: those columns are stale,
  // never fetched, and have to come up filter-aware in one step.
  await resetBridgeStats(page);
  await sweepHorizontal(page, [0.8]);
  await waitForVizReady(page);
  await waitForTierSettled(page);
  const stats = await bridgeStats(page);
  const after = await canvasCount(page);

  console.log(
    `[viz-lazy] filtered jump to 0.8 ${JSON.stringify({
      canvases: after,
      queries: stats?.sent.query,
    })}`,
  );

  // Charts exist in the new window …
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThanOrEqual(DT_BUDGET.VIZ.CANVAS_COUNT_MAX);
  // … each costing the filtered-creation price and no fan-out to the other
  // ~290 columns, which stay stale until someone looks at them.
  expect(stats!.sent.query).toBeLessThanOrEqual(
    after * DT_BUDGET.VIZ.QUERIES_PER_VIZ_CREATE_FILTERED + 8,
  );
});

test('moving or hiding a column costs no chart queries', async ({ page }) => {
  await mountAndSettle(page, { tier: 'wide-ci', viz: true });
  const before = await canvasCount(page);

  // At rest: same scroll offset, same visible columns. (A reorder that also
  // moves the viewport legitimately builds charts for wherever it landed —
  // that is the streaming test above, not this one.)
  await resetBridgeStats(page);
  const scrolled = await page.evaluate((hostId) => {
    const table = (window as unknown as { __t: import('../../src/index').DataTable }).__t;
    const el = document.querySelector(`#${hostId} .dt-body-scroll`) as HTMLElement;
    const was = el.scrollLeft;
    const order = [...table.state.columnOrder.get()];
    const [moved] = order.splice(5, 1);
    order.splice(1, 0, moved!);
    table.actions.setColumnOrder(order);
    return { was, now: el.scrollLeft };
  }, TIER_HOST_ID);
  await waitForTierSettled(page);
  const afterReorder = await bridgeStats(page);

  // A column far outside the viewport: hiding it changes the projection
  // without changing which charts are on screen.
  await resetBridgeStats(page);
  await page.evaluate(
    (column) =>
      (window as unknown as { __t: import('../../src/index').DataTable }).__t.actions.hideColumn(
        column,
      ),
    columnName(200),
  );
  await waitForTierSettled(page);
  const afterHide = await bridgeStats(page);

  console.log(
    `[viz-lazy] reorder/hide at rest ${JSON.stringify({
      scrolled,
      reorderQueries: afterReorder?.sent.query,
      hideQueries: afterHide?.sent.query,
      canvasBefore: before,
      canvasAfter: await canvasCount(page),
    })}`,
  );

  // The grid refetches its rows because the projection changed; the charts
  // are rebuilt from their snapshots and query nothing. The ceiling is the
  // grid's own cost with visualizations off, measured at 2.
  expect(afterReorder!.sent.query, 'reorder at rest').toBeLessThanOrEqual(4);
  expect(afterHide!.sent.query, 'hiding an offscreen column').toBeLessThanOrEqual(4);
  expect(await canvasCount(page)).toBeGreaterThan(0);
});

test('visualizations off costs nothing at all', async ({ page }) => {
  await installObserverCensus(page);
  const run = await mountAndSettle(page, { tier: 'wide-ci', viz: false });
  const observers = await readObserverCensus(page);

  console.log(
    `[viz-lazy] wide-ci viz=off ${JSON.stringify({
      queries: run.queries,
      canvases: run.canvases,
      io: observers.intersection,
      mo: observers.mutation,
    })}`,
  );

  // The control for the whole file: no charts, no observer, and the fixed
  // query cost the lazy numbers are measured against.
  expect(run.canvases).toBe(0);
  expect(observers.intersection).toBe(0);
  expect(observers.mutation).toBeLessThanOrEqual(1);
  expect(run.queries).toBeLessThan(DT_BUDGET.VIZ.QUERIES_AT_LOAD_MAX);
});

// =========================================
// Gated: the same claims at 1,000 columns
// =========================================

test.describe('WIDE — 1,000 columns', () => {
  test.skip(process.env['RUN_BROWSER_PERF'] !== '1', 'perf tier — set RUN_BROWSER_PERF=1');
  test.describe.configure({ timeout: 1_800_000 });

  test('charts cost the viewport, not the column count', async ({ page }) => {
    await installObserverCensus(page);
    const run = await mountAndSettle(page, wideMountOptions(true));
    const census = await headerCensus(page);
    const observers = await readObserverCensus(page);
    const measures = await loadMeasures(page);

    console.log(
      `[viz-lazy] WIDE viz=on ${JSON.stringify({
        loadMs: Math.round(run.loadMs),
        measures,
        queries: run.queries,
        canvases: run.canvases,
        headers: census.headers,
        io: observers.intersection,
        mo: observers.mutation,
        ro: observers.resize,
      })}`,
    );

    // The same caps as WIDE_CI, at 3.3× the columns. That they hold
    // unchanged is the claim.
    expect(census.headers).toBe(TIERS.wide.cols);
    expect(run.canvases).toBeGreaterThan(0);
    expect(run.canvases).toBeLessThanOrEqual(DT_BUDGET.VIZ.CANVAS_COUNT_MAX);
    expect(run.queries).toBeLessThanOrEqual(DT_BUDGET.VIZ.QUERIES_AT_LOAD_MAX);
    expect(observers.intersection).toBeLessThanOrEqual(DT_BUDGET.VIZ.INTERSECTION_OBSERVERS_MAX);
    expect(observers.mutation).toBeLessThanOrEqual(DT_BUDGET.VIZ.MUTATION_OBSERVERS_MAX);
    expect(measures.viz!).toBeGreaterThan(measures.total!);

    // The one wall-clock assertion in the file — see the budget's docblock
    // for why it is tight rather than generous.
    expect(run.loadMs, '1,000-column load with charts on').toBeLessThan(
      DT_BUDGET.VIZ.LOAD_MS_WIDE_MAX,
    );
  });
});
