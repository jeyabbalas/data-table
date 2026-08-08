/**
 * The scaling plan's CI-weight smoke test: WIDE_CI (300 × 20,000) with
 * visualizations off.
 *
 * This is the one tier spec that runs in the default `npm run test:browser`
 * and therefore in CI. Everything heavier self-skips behind `RUN_*` gates
 * (`tiers.full.spec.ts`, `perf-baseline.spec.ts`), because a wall-clock
 * assertion on a shared runner is a coin flip — see
 * `tests/performance/benchmarks.duckdb.test.ts:10-12` for the same
 * reasoning. What runs here is machine-independent: counts, types, and
 * invariants.
 *
 * Two things it establishes that no existing spec could:
 *
 *  1. **The axes cross.** The widest existing test is 266 columns for
 *     accessibility only; the deepest is 3 columns. This is 300 × 20,000
 *     with a per-cell oracle on both axes at once.
 *  2. **The instrumentation tells the truth.** The demo panel's `loadMs`
 *     is checked against an independently measured wall clock, and its
 *     `queryCount` against the bridge counter it claims to mirror — so
 *     every later phase's before/after rests on a readout that has been
 *     shown to agree with reality.
 */
import { expect, test } from '@playwright/test';

import { DT_BUDGET } from '../budgets';
import {
  CLASS_CYCLE,
  TEXT_COMPARABLE_CLASSES,
  TIERS,
  classDataType,
  columnName,
} from '../fixtures/tiers';

import { bridgeStats, domNodeCount } from './helpers/metrics';
import {
  installColumnInvariantProbe,
  mountTierTable,
  readColViolations,
  sweepHorizontal,
  waitForTierSettled,
  TIER_HOST_ID,
} from './helpers/wideTable';

const TIER = TIERS['wide-ci'];

/** DuckDB boot + 6M cells generated, exported, and reloaded is not fast. */
test.describe.configure({ timeout: 240_000 });

test('mounts WIDE_CI through the real load path with both oracles clean', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  const mounted = await mountTierTable(page, { tier: 'wide-ci', viz: false });
  expect(mounted.spec).toEqual(TIER);
  await waitForTierSettled(page);

  // --- the data is the tier the spec asked for ---------------------------
  const shape = await page.evaluate(async () => {
    const table = (window as any).__t;
    const name = table.state.tableName.get() as string;
    const [counted] = await table.bridge.query(`SELECT COUNT(*) AS n FROM "${name}"`);
    const described = await table.bridge.query(`DESCRIBE "${name}"`);
    return {
      rowCount: Number(counted.n),
      columns: described.map((r: any) => String(r.column_name)),
      schema: (table.state.schema.get() as any[]).map((s) => [s.name, s.type, s.originalType]),
      totalRows: table.state.totalRows.get(),
      visibleColumns: (table.state.visibleColumns.get() as string[]).length,
    };
  });

  expect(shape.rowCount).toBe(TIER.rows);
  expect(shape.totalRows).toBe(TIER.rows);
  // +1 for the loader-injected __rowid__.
  expect(shape.columns).toHaveLength(TIER.cols + 1);
  expect(shape.columns[0]).toBe('__rowid__');
  expect(shape.columns[1]).toBe(columnName(0));
  expect(shape.visibleColumns).toBe(TIER.cols);

  // --- the *real* load path ran, including type detection ----------------
  // Classes 15/16/17 were generated as VARCHAR strings. Seeing TIMESTAMP /
  // DATE / TIME here is the proof that the parquet loader ran all three
  // detect-and-rewrite passes rather than something short-circuiting them.
  const byName = new Map(shape.schema.map(([n, t, o]) => [n, { type: t, originalType: o }]));
  for (let c = 0; c < TIER.cols; c++) {
    expect(byName.get(columnName(c))?.type, `${columnName(c)} data type`).toBe(classDataType(c));
  }
  expect(byName.get('col_15')?.originalType).toBe('TIMESTAMP');
  expect(byName.get('col_16')?.originalType).toBe('DATE');
  expect(byName.get('col_17')?.originalType).toBe('TIME');

  // --- both oracles, under a vertical scroll storm -----------------------
  await installColumnInvariantProbe(page, TIER.seed);

  for (const fraction of [0.13, 0.5, 0.97, 0.42, 1, 0]) {
    await page.evaluate(
      ({ hostId, f }) => {
        const el = document.querySelector(`#${hostId} .dt-body-scroll`) as HTMLElement;
        el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
      },
      { hostId: TIER_HOST_ID, f: fraction },
    );
    await waitForTierSettled(page);
  }

  // --- the column axis, swept end to end ---------------------------------
  const stops = await sweepHorizontal(page, [0, 0.25, 0.5, 0.75, 1]);
  for (const stop of stops) {
    // Pre-column-virtualization every visible column is rendered, so the
    // expected window is the whole list. Phase 3 narrows this; the probe
    // installed above is what will hold it honest when it does.
    expect(stop.columns, `at scrollLeft ${stop.scrollLeft}`).toHaveLength(TIER.cols);
    expect(stop.columns.some((col) => col.fullyVisible)).toBe(true);
  }
  expect(stops[0]!.scrollLeft).toBe(0);
  expect(stops[stops.length - 1]!.scrollLeft).toBeGreaterThan(0);

  const violations = await readColViolations(page);
  expect(
    violations.slice(0, 5),
    `column/row oracle breaches: ${JSON.stringify(violations.slice(0, 5))}`,
  ).toEqual([]);
  expect(violations).toHaveLength(DT_BUDGET.WIDE_CI.ORACLE_VIOLATIONS);

  // --- the text oracle covers what it claims to cover --------------------
  // A census over one full class cycle: which classes render byte-exactly
  // what `cellOracle` predicts. Every class the oracle *claims* must match;
  // the rest are reported so the included set stays an evidence-backed
  // decision rather than a guess (see TEXT_COMPARABLE_CLASSES).
  const census = await page.evaluate(
    ({ hostId, seed, cycle }) => {
      const oracle = (window as any).__dtOracle as (
        i: number,
        c: number,
        s: number,
        force?: boolean,
      ) => string | null;
      const row = document.querySelector(
        `#${hostId} .dt-body .dt-row[data-row-id]:not([data-placeholder])`,
      )!;
      const index = Number(row.getAttribute('data-row-index'));
      const out: Record<number, { rendered: string; expected: string; exact: boolean }> = {};
      for (let c = 0; c < cycle; c++) {
        const cell = row.querySelector(`.dt-cell[data-column="col_${c}"]`);
        if (!cell) continue;
        const rendered = cell.textContent ?? '';
        const expected = oracle(index, c, seed, true) ?? '';
        out[c] = { rendered, expected, exact: rendered === expected };
      }
      return { index, out };
    },
    { hostId: TIER_HOST_ID, seed: TIER.seed, cycle: CLASS_CYCLE },
  );

  const exactClasses = Object.entries(census.out)
    .filter(([, v]) => v.exact)
    .map(([c]) => Number(c));
  console.log(
    `[tiers.smoke] byte-exact classes at row ${census.index}: [${exactClasses.join(', ')}]`,
  );
  for (const klass of TEXT_COMPARABLE_CLASSES) {
    const entry = census.out[klass]!;
    expect(
      entry.exact,
      `class ${klass}: rendered "${entry.rendered}" vs oracle "${entry.expected}"`,
    ).toBe(true);
  }

  // --- DOM weight --------------------------------------------------------
  // Machine-independent: the same build renders the same node count
  // everywhere. Phases 3–4 are expected to cut this by an order of
  // magnitude, and this is the number they will cut it from.
  const nodes = await domNodeCount(page);
  console.log(`[tiers.smoke] .dt-root subtree = ${nodes} nodes at ${TIER.cols} columns`);
  expect(nodes, `.dt-root subtree = ${nodes} nodes`).toBeLessThanOrEqual(
    DT_BUDGET.WIDE_CI.DOM_NODES_MAX,
  );

  expect(consoleErrors).toEqual([]);
});

test('demo readout agrees with the wall clock and the bridge counters', async ({ page }) => {
  const panel = '#dt-perf-panel';
  await page.goto('./?gen=wide-ci&viz=off');

  // An independent clock: Node-side, spanning the harness's whole run. The
  // panel's stage timings come from `performance.now()` inside the page, so
  // agreement between the two is a real cross-check rather than the readout
  // confirming itself.
  //
  // Spanning the whole run, not just `loading`, on purpose: Playwright
  // observes a `data-state` flip through a MutationObserver on a main
  // thread that a load has saturated, so it can notice `loading` a few
  // hundred ms late. Against a ~1.5 s load that latency alone is 20 %;
  // against the ~6 s run it is noise, and all four stage timings get
  // checked instead of one.
  await page.waitForSelector(`${panel}[data-state="generating"]`);
  const startedAt = Date.now();
  await page.waitForSelector(`${panel}[data-state="ready"]`);
  const wallMs = Date.now() - startedAt;

  // Re-render and read the panel and the counter it mirrors in one JS turn.
  // Sampling them in separate round trips is a race: the body prefetches
  // the next row block right after first paint, so the bridge counter can
  // legitimately move between two reads and the "exact" assertion would be
  // testing scheduling rather than the readout.
  const readout = await page.evaluate(() => {
    const perf = (window as any).__dtPerf;
    perf.refresh();
    const read = (metric: string) =>
      document.querySelector(`[data-metric="${metric}"]`)?.textContent ?? '';
    const stats = perf.table.bridge.__getStatsForTests();
    return {
      tier: read('tier'),
      rows: Number(read('rows')),
      cols: Number(read('cols')),
      bootMs: Number(read('bootMs')),
      genMs: Number(read('genMs')),
      loadMs: Number(read('loadMs')),
      queryCount: Number(read('queryCount')),
      cacheHits: Number(read('cacheHits')),
      error: read('error'),
      sentQuery: stats.sent.query as number,
      bridgeCacheHits: stats.cacheHits as number,
      markedTotal: perf.marks()['dt:load:total'] as number | undefined,
    };
  });

  expect(readout.tier).toBe('wide-ci');
  expect(readout.rows).toBe(TIER.rows);
  expect(readout.cols).toBe(TIER.cols);
  expect(readout.error).toBe('—');

  // The panel is a measuring instrument for every later phase; a readout
  // that drifts from the wall clock would quietly corrupt every baseline.
  const staged = readout.bootMs + readout.genMs + readout.loadMs;
  const drift = Math.abs(staged - wallMs) / wallMs;
  console.log(
    `[tiers.smoke] boot ${readout.bootMs} + gen ${readout.genMs} + load ` +
      `${readout.loadMs} = ${staged.toFixed(0)} ms vs wall ${wallMs} ms ` +
      `(${(drift * 100).toFixed(1)}% drift)`,
  );
  expect(drift, `staged ${staged.toFixed(0)} ms vs wall ${wallMs} ms`).toBeLessThanOrEqual(
    DT_BUDGET.READOUT_TOLERANCE,
  );

  // Two independent instruments around the same operation: the harness's
  // own `performance.now()` around `table.loadData`, and the library's
  // `dt:load:start` -> `dt:load:complete` measure. If the marks were on the
  // wrong seams, or the panel were reading the wrong stage, these two would
  // not agree.
  expect(readout.markedTotal).toBeDefined();
  const markDrift = Math.abs(readout.loadMs - readout.markedTotal!) / readout.loadMs;
  expect(
    markDrift,
    `panel loadMs ${readout.loadMs} vs dt:load:total ${readout.markedTotal}`,
  ).toBeLessThanOrEqual(DT_BUDGET.READOUT_TOLERANCE);

  // Exact, not approximate: the panel renders the same counter the specs
  // read, so any difference is a bug in one of the two readouts.
  expect(readout.queryCount).toBe(readout.sentQuery);
  expect(readout.cacheHits).toBe(readout.bridgeCacheHits);
  expect(readout.queryCount).toBeGreaterThan(0);

  // …and the Playwright-side helper reaches the same counter through
  // `window.__dtPerf.table`, which is what the baseline capture uses.
  const stats = await bridgeStats(page);
  expect(stats).not.toBeNull();
  expect(stats!.sent.query).toBeGreaterThanOrEqual(readout.sentQuery);
  expect(stats!.sent.load).toBe(1);
});

test('the demo human path is untouched without ?gen=', async ({ page }) => {
  await page.goto('./');
  await page.waitForSelector('#init-status.init-status--success');
  expect(await page.locator('#dt-perf-panel').count()).toBe(0);
  expect(await page.evaluate(() => '__dtPerf' in window)).toBe(false);
  // The visible grid only exists once a dataset is loaded; nothing should
  // have loaded one.
  expect(await page.locator('.dt-root').count()).toBe(0);
});
