/**
 * The heavy tiers: WIDE (1,000 × 100,000) with visualizations both ways,
 * GRID (200 × 500,000), DEEP (20 × 5,000,000), and the TARGET file
 * (1,000 × 5,000,000).
 *
 * **Gated, never in CI.** Every test here self-skips unless
 * `RUN_BROWSER_PERF=1`, so the default `npm run test:browser` still runs
 * only `tiers.smoke.spec.ts`. That gate is the whole reason no
 * `playwright.config.ts` or `ci.yml` change was needed: a spec that costs
 * tens of minutes and gigabytes of RAM has no business on a shared runner,
 * and a wall-clock assertion there would be a coin flip
 * (`tests/performance/benchmarks.duckdb.test.ts:10-12`).
 *
 * What it is for: these are the sizes the scaling plan exists to fix, and
 * this file is where a later phase proves it did. Today the assertions are
 * the machine-independent ones — COUNT/DESCRIBE, converted types, both
 * oracles clean, deepest rendered row index — while the expensive numbers
 * (queries, DOM nodes, observers, subscribers, frame pacing) are *logged*
 * rather than capped. Phase 0 does not know yet which of them are
 * pathological and which are inherent; `perf-baseline.spec.ts` records
 * them, and the phase that improves one adds its cap to
 * `tests/budgets.ts` in the same commit.
 *
 * Two deliberate departures from the phase doc's `test.setTimeout(600_000)`,
 * both under its own §4.8 "budget generous timeouts":
 *
 *  - **WIDE with `viz=on`** is pathological by construction — ~1,000 column
 *    charts, each at least one query, through a serial dispatcher.
 *  - **TARGET** streams 5 × 10⁹ cells into parquet; measured at 1,000 ×
 *    20,000 it extrapolates to ~10 minutes for the `COPY` alone.
 *
 * If either genuinely cannot finish, §4.8 says the failure *is* the
 * baseline: record it in `plans/scaling/STATUS.md` and retry truncated —
 * do not fix the product here.
 */
import { expect, test, type Page } from '@playwright/test';

import { DT_BUDGET } from '../budgets';
import {
  TARGET_PROBE_COLUMNS,
  TIERS,
  cellOracle,
  classDataType,
  columnName,
  type TierSpec,
} from '../fixtures/tiers';

import {
  bridgeStats,
  domNodeCount,
  frameSampler,
  installObserverCensus,
  readObserverCensus,
  readSubscriberCounts,
  type BridgeStatsSnapshot,
  type FrameStats,
  type ObserverCensus,
} from './helpers/metrics';
import {
  installColumnInvariantProbe,
  mountTierTable,
  readColViolations,
  sweepHorizontal,
  waitForTierSettled,
  wideMountOptions,
  TIER_HOST_ID,
  WIDE_IS_TRUNCATED,
  WIDE_MOUNT_ROWS,
  type ColViolation,
  type MountTierOptions,
} from './helpers/wideTable';

test.skip(process.env['RUN_BROWSER_PERF'] !== '1', 'perf tier — set RUN_BROWSER_PERF=1');

/**
 * `mode: 'default'` — tests run in order, in one worker.
 *
 * The project sets `fullyParallel: true`, which is right for the a11y specs
 * and fatal here: four tiers of 10⁸ cells apiece, each in its own DuckDB
 * WASM instance, would race for the same machine's RAM and report an
 * out-of-memory that says nothing about the library. `'default'` rather
 * than `'serial'` on purpose — `'serial'` would abandon every remaining
 * tier after the first failure, and a run that captures three tiers and
 * one failure is strictly more informative than one that captures one.
 */
test.describe.configure({ mode: 'default', timeout: 600_000 });

/** Vertical stops as fractions of max scrollTop; ends at the very bottom. */
const VERTICAL_STOPS = [0.11, 0.5, 0.93, 0.27, 1];

/** Horizontal stops as fractions of max scrollLeft. */
const HORIZONTAL_STOPS = [0, 0.5, 1];

/** Page-side shape facts, in one round trip (mirrors `tiers.smoke.spec.ts`). */
interface TierShape {
  rowCount: number;
  columns: string[];
  schema: Array<[string, string, string]>;
  totalRows: number;
  visibleColumns: number;
  canvases: number;
}

/** Everything one heavy mount produced, assertions and log lines alike. */
interface TierRun {
  spec: TierSpec;
  /** Building the parquet source; generation and encoding are one step. */
  genMs: number;
  loadMs: number;
  shape: TierShape;
  /** Bridge counters right after mount, before any probing added queries. */
  mountStats: BridgeStatsSnapshot | null;
  finalStats: BridgeStatsSnapshot | null;
  nodes: number;
  observers: ObserverCensus;
  subscribers: Record<string, number>;
  frames: FrameStats;
  violations: ColViolation[];
  /** Rendered row indices after the storm ends at the bottom. */
  bottom: { min: number; max: number; count: number };
}

/** Collect page errors and console errors for an end-of-test assertion. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function readShape(page: Page): Promise<TierShape> {
  return page.evaluate(async () => {
    const table = (window as any).__t;
    const name = table.state.tableName.get() as string;
    const [counted] = await table.bridge.query(`SELECT COUNT(*) AS n FROM "${name}"`);
    const described = await table.bridge.query(`DESCRIBE "${name}"`);
    return {
      rowCount: Number(counted.n),
      columns: described.map((r: any) => String(r.column_name)),
      schema: (table.state.schema.get() as any[]).map((s) => [s.name, s.type, s.originalType]),
      totalRows: table.state.totalRows.get() as number,
      visibleColumns: (table.state.visibleColumns.get() as string[]).length,
      canvases: document.querySelectorAll('.dt-root canvas').length,
    };
  });
}

/** Which source rows the body is currently showing. */
async function readRowIndexRange(page: Page): Promise<{ min: number; max: number; count: number }> {
  return page.evaluate((hostId) => {
    const rows = Array.from(
      document.querySelectorAll(`#${hostId} .dt-body .dt-row[data-row-index]`),
    );
    const indices = rows.map((r) => Number(r.getAttribute('data-row-index')));
    if (indices.length === 0) return { min: -1, max: -1, count: 0 };
    return { min: Math.min(...indices), max: Math.max(...indices), count: indices.length };
  }, TIER_HOST_ID);
}

/** Drive scrollTop to each fraction, settling between stops. */
async function scrollStorm(page: Page, stops: number[]): Promise<void> {
  for (const fraction of stops) {
    await page.evaluate(
      ({ hostId, f }) => {
        const el = document.querySelector(`#${hostId} .dt-body-scroll`) as HTMLElement;
        el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
      },
      { hostId: TIER_HOST_ID, f: fraction },
    );
    await waitForTierSettled(page);
  }
}

/**
 * Mount a tier and put it through the same exercise every time: settle,
 * snapshot the instruments, then a vertical storm plus a horizontal sweep
 * with both oracles watching.
 *
 * Uniform on purpose — a per-tier bespoke workout would make the recorded
 * numbers incomparable across tiers, which is precisely what the baselines
 * need them to be.
 */
async function exerciseTier(page: Page, opts: MountTierOptions): Promise<TierRun> {
  // Before the first navigation: the census patches constructors through
  // `addInitScript`, and anything already built is invisible to it.
  await installObserverCensus(page);

  const mounted = await mountTierTable(page, opts);
  await waitForTierSettled(page);

  // Read the counters before `readShape` spends two queries of its own, so
  // `mountStats.sent.query` is the cost of mounting and nothing else.
  const mountStats = await bridgeStats(page);
  const nodes = await domNodeCount(page);
  const observers = await readObserverCensus(page);
  const subscribers = await readSubscriberCounts(page);
  const shape = await readShape(page);

  await installColumnInvariantProbe(page, mounted.spec.seed);
  const frames = await frameSampler(page, async () => {
    await scrollStorm(page, VERTICAL_STOPS);
    // Horizontal only moves scrollLeft, so the body stays parked at the
    // bottom and `bottom` below reads the deepest rows the tier has.
    await sweepHorizontal(page, HORIZONTAL_STOPS);
  });
  const bottom = await readRowIndexRange(page);
  const violations = await readColViolations(page);
  const finalStats = await bridgeStats(page);

  return {
    spec: mounted.spec,
    genMs: mounted.genMs,
    loadMs: mounted.loadMs,
    shape,
    mountStats,
    finalStats,
    nodes,
    observers,
    subscribers,
    frames,
    violations,
    bottom,
  };
}

/**
 * One greppable line per tier.
 *
 * `perf-baseline.spec.ts` writes the machine-readable capture; this exists
 * so a gated run that is *not* a baseline still leaves evidence in the
 * console, which is where a failure investigation starts.
 */
function report(label: string, run: TierRun): void {
  console.log(
    `[tiers.full] ${label} ` +
      JSON.stringify({
        rows: run.spec.rows,
        cols: run.spec.cols,
        genMs: Math.round(run.genMs),
        loadMs: Math.round(run.loadMs),
        mountQueries: run.mountStats?.sent.query ?? null,
        totalQueries: run.finalStats?.sent.query ?? null,
        cacheHits: run.finalStats?.cacheHits ?? null,
        maxInFlight: run.finalStats?.maxInFlight ?? null,
        domNodes: run.nodes,
        canvases: run.shape.canvases,
        liveResizeObservers: run.observers.resize,
        liveMutationObservers: run.observers.mutation,
        sortColumnSubscribers: run.subscribers['sortColumns'] ?? null,
        visibleColumnSubscribers: run.subscribers['visibleColumns'] ?? null,
        frameP95Ms: Math.round(run.frames.p95DeltaMs),
        frameOver50: run.frames.over50Count,
        deepestRow: run.bottom.max,
      }),
  );
}

/** The invariants every tier must satisfy, whatever its shape. */
function expectTierIntact(run: TierRun): void {
  const { spec, shape } = run;

  expect(shape.rowCount).toBe(spec.rows);
  expect(shape.totalRows).toBe(spec.rows);
  // +1 for the loader-injected __rowid__.
  expect(shape.columns).toHaveLength(spec.cols + 1);
  expect(shape.columns[0]).toBe('__rowid__');
  expect(shape.visibleColumns).toBe(spec.cols);

  // Classes 15/16/17 were generated as VARCHAR text. Seeing them as
  // timestamp/date/time is the proof the real loader ran all three
  // detect-and-rewrite passes at this scale too — the pass most likely to
  // be quietly skipped when a table gets large.
  const byName = new Map(shape.schema.map(([n, t, o]) => [n, { type: t, originalType: o }]));
  for (let c = 0; c < spec.cols; c++) {
    expect(byName.get(columnName(c))?.type, `${columnName(c)} data type`).toBe(classDataType(c));
  }
  expect(byName.get('col_15')?.originalType).toBe('TIMESTAMP');
  expect(byName.get('col_16')?.originalType).toBe('DATE');
  expect(byName.get('col_17')?.originalType).toBe('TIME');

  // The storm ends at scrollTop = max, so the last row of the tier must be
  // rendered. This is the assertion a virtualization off-by-one at 5 × 10⁶
  // rows fails and every smaller test passes.
  expect(run.bottom.count).toBeGreaterThan(0);
  expect(run.bottom.max, 'deepest rendered row index').toBe(spec.rows - 1);

  expect(
    run.violations.slice(0, 5),
    `oracle breaches: ${JSON.stringify(run.violations.slice(0, 5))}`,
  ).toEqual([]);
  expect(run.violations).toHaveLength(DT_BUDGET.WIDE_CI.ORACLE_VIOLATIONS);

  expect(run.finalStats).not.toBeNull();
  expect(run.finalStats!.sent.load).toBe(1);
  expect(run.finalStats!.sent.query).toBeGreaterThan(0);
  // The dispatcher is serial by design (README §3); a snapshot showing two
  // requests in flight would mean that changed under us.
  expect(run.finalStats!.maxInFlight).toBeGreaterThan(0);
}

/**
 * Say out loud when WIDE is not being built at its defined depth.
 *
 * A silent truncation is how a capture ends up reading as "we measured
 * WIDE" when it measured something smaller — README §8.6's no-silent-caps
 * rule. See {@link WIDE_MOUNT_ROWS} for why, and what would lift it.
 */
function announceWideTruncation(): void {
  if (!WIDE_IS_TRUNCATED) return;
  console.log(
    `[tiers.full] WIDE truncated to ${WIDE_MOUNT_ROWS} rows of ` +
      `${TIERS.wide.rows} (all ${TIERS.wide.cols} columns kept) — ` +
      'exportToBuffer has no ROW_GROUP_SIZE option; set DT_WIDE_ROWS to override.',
  );
}

test('WIDE — 1,000 columns, visualizations off', async ({ page }) => {
  const consoleErrors = watchConsole(page);
  announceWideTruncation();

  const run = await exerciseTier(page, wideMountOptions(false));
  report('wide viz=off', run);
  expectTierIntact(run);

  // No column virtualization yet: every visible column is rendered at every
  // scroll position. Phase 3 makes this a window, and the probe installed
  // during the sweep is what will hold that honest.
  const stops = await sweepHorizontal(page, HORIZONTAL_STOPS);
  for (const stop of stops) {
    expect(stop.columns, `at scrollLeft ${stop.scrollLeft}`).toHaveLength(TIERS.wide.cols);
    expect(stop.columns.some((col) => col.fullyVisible)).toBe(true);
  }
  expect(stops[stops.length - 1]!.scrollLeft).toBeGreaterThan(0);

  // Visualizations off means no canvases, whatever the column count — the
  // control for the `viz=on` test below.
  expect(run.shape.canvases).toBe(0);

  expect(consoleErrors).toEqual([]);
});

test('WIDE — 1,000 columns, visualizations on', async ({ page }) => {
  // ~1,000 column charts, each at least one aggregate query, through a
  // serial dispatcher. This is the pathology Phase 2 exists to fix; the
  // timeout is sized to let it finish so there is a number to fix *from*.
  test.setTimeout(1_800_000);
  const consoleErrors = watchConsole(page);
  announceWideTruncation();

  const run = await exerciseTier(page, wideMountOptions(true));
  report('wide viz=on', run);
  expectTierIntact(run);

  // What visualizations cost at 1,000 columns is the number Phase 2 has to
  // beat, so it is *recorded*, not capped: an assertion here would be a
  // threshold with no measurement behind it, which is exactly what
  // `tests/budgets.ts` forbids. The only claim made is that charts were
  // actually built and actually queried.
  expect(run.shape.canvases, 'canvases at 1,000 columns').toBeGreaterThan(0);
  console.log(
    `[tiers.full] wide viz=on cost ${run.mountStats!.sent.query} mount queries and ` +
      `${run.shape.canvases} canvases for ${TIERS.wide.cols} columns ` +
      `(${(run.mountStats!.sent.query / TIERS.wide.cols).toFixed(2)} queries/column)`,
  );

  // The viz stage has to have actually run for that number to mean
  // anything — `dt:load:viz` is the library's own evidence that it did.
  const vizMeasureMs = await page.evaluate(() => {
    const entries = performance.getEntriesByName('dt:load:viz', 'measure');
    return entries.length > 0 ? entries[entries.length - 1]!.duration : null;
  });
  console.log(`[tiers.full] wide viz=on dt:load:viz = ${vizMeasureMs} ms`);
  expect(vizMeasureMs).not.toBeNull();

  expect(consoleErrors).toEqual([]);
});

test('GRID — 200 columns × 500,000 rows', async ({ page }) => {
  const consoleErrors = watchConsole(page);

  const run = await exerciseTier(page, { tier: 'grid', viz: false });
  report('grid', run);
  expectTierIntact(run);

  // Half a million rows behind a 600 px viewport: the body must be showing
  // a couple of screenfuls, not the tier.
  expect(run.bottom.count).toBeLessThan(200);
  expect(run.bottom.min).toBeGreaterThan(TIERS.grid.rows - 200);

  expect(consoleErrors).toEqual([]);
});

test('DEEP — 20 columns × 5,000,000 rows', async ({ page }) => {
  const consoleErrors = watchConsole(page);

  const run = await exerciseTier(page, { tier: 'deep', viz: false });
  report('deep', run);
  expectTierIntact(run);

  // Five million rows is past the point where a naïve `height: rows × 32px`
  // spacer exceeds the browser's maximum element height, so "the last row
  // is reachable and correct" is a real question here, not a formality.
  expect(run.bottom.count).toBeLessThan(200);
  expect(run.bottom.min).toBeGreaterThan(TIERS.deep.rows - 200);

  expect(consoleErrors).toEqual([]);
});

test('TARGET — 1,000 columns × 5,000,000 rows streamed to parquet and probed deep', async ({
  page,
}) => {
  // 5 × 10⁹ cells. Measured at 1,000 × 20,000 the `COPY` extrapolates to
  // ~10 minutes; the ceiling is generous so a slower machine records a
  // number rather than a timeout.
  test.setTimeout(1_800_000);
  const consoleErrors = watchConsole(page);
  const spec = TIERS.target;

  // Driven through the demo harness rather than a bespoke mount: this is
  // the exact path `perf:baseline` and the Chrome manual pass use, so a
  // break in it surfaces here instead of during a capture. `?gen=target`
  // forces `mode=sql` — there is no table to load until Phase 10.
  await page.goto('./?gen=target');
  await page.waitForSelector('#dt-perf-panel[data-state="ready"]', { timeout: 1_700_000 });

  const snap = await page.evaluate(() => (window as any).__dtPerf.snapshot());

  expect(snap.error).toBeNull();
  expect(snap.mode).toBe('sql');
  expect(snap.rows).toBe(spec.rows);
  expect(snap.cols).toBe(spec.cols);
  // Nothing was loaded — the file exists, the table does not.
  expect(snap.loadMs).toBeNull();
  expect(snap.genMs, 'COPY … TO parquet duration').toBeGreaterThan(0);

  console.log(
    `[tiers.full] target ` +
      JSON.stringify({
        rows: spec.rows,
        cols: spec.cols,
        copyMs: Math.round(snap.genMs),
        queryCount: snap.queryCount,
        heapMB: snap.heapMB,
      }),
  );

  // The file DuckDB wrote is the file DuckDB reads back.
  expect(snap.probe).toBeDefined();
  expect(snap.probe.rowCount, 'read_parquet COUNT(*)').toBe(spec.rows);
  expect(snap.probe.colCount, 'read_parquet DESCRIBE width').toBe(spec.cols);

  // The deep window: 128 rows starting at 4,999,000, projected to columns
  // the oracle still describes exactly. Beyond `TARGET_PROBE_COLUMNS` the
  // tier switches to run-length bulk expressions precisely so a 40 GB
  // logical dataset fits in a few hundred MB — those columns are storage,
  // not signal, and are not oracle-checkable.
  expect(TARGET_PROBE_COLUMNS).toBeGreaterThan(12);
  const sample = snap.probe.sample as Array<Record<string, unknown>>;
  expect(sample).toHaveLength(128);

  const deepFrom = spec.rows - 1000;
  sample.forEach((row, n) => {
    const i = deepFrom + n;
    expect(Number(row['col_0']), `row ${i} col_0`).toBe(i);
    expect(Number(row['col_10']), `row ${i} col_10`).toBe(cellOracle(i, 10, spec.seed));
    expect(String(row['col_12']), `row ${i} col_12`).toBe(cellOracle(i, 12, spec.seed));
  });
  // The window really is at the far end of the file, not row 0 relabelled.
  expect(Number(sample[0]!['col_0'])).toBe(4_999_000);

  expect(consoleErrors).toEqual([]);
});
