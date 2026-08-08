/**
 * Named limits for the large-scale plan (`plans/scaling/`).
 *
 * **The rule this file exists to enforce** (README §8.3, Glossary): a
 * budget that runs in the default suites is a machine-independent count or
 * invariant — DOM nodes, query counts, observer gauges, byte sizes, oracle
 * violations. Wall-clock numbers live behind the `RUN_BROWSER_PERF` /
 * `RUN_BASELINE` env gates, where a slow shared runner can only make a
 * capture noisy, not a build red. `tests/performance/benchmarks.duckdb.test.ts:10-12`
 * argued this first; nothing here overrides it.
 *
 * Every value is the **measured** pre-optimization number plus stated
 * headroom, in the style of `.size-limit.cjs` — a cap with no measurement
 * behind it documents a guess. The measurement and the machine that
 * produced it are recorded next to each entry; when a phase improves a
 * number it tightens the cap in the same commit and records the before →
 * after in `plans/scaling/STATUS.md`.
 *
 * The namespaces below that are still empty are the agreed landing sites for
 * later phases (`DT_BUDGET.COLVIRT` in Phase 5, and so on), named up front so
 * thirteen agents do not invent thirteen conventions.
 */

export const DT_BUDGET = {
  /**
   * WIDE_CI — 300 columns × 20,000 rows, visualizations off. The only tier
   * that runs in the default `npm run test:browser`.
   */
  WIDE_CI: {
    /**
     * Elements under `.dt-root` after mount and a scroll storm.
     *
     * Measured pre-optimization: **15,051** nodes (Chromium, macOS,
     * `tiers.smoke.spec.ts`, which logs the live figure on every run).
     * That is ~50 nodes per column at 300 columns — an eager header plus a
     * cell in each rendered row. Cap set at 18,000 (~20 % headroom) so
     * ordinary rendering changes do not trip it while a lost row
     * virtualization would.
     *
     * Note the plan's §4.6 estimate was ~120K; the real number is ~8×
     * smaller because row virtualization already bounds the body. The
     * column axis is what is unbounded, and Phases 3–4 window it — they
     * tighten this number.
     */
    DOM_NODES_MAX: 18_000,
    /**
     * Row- and column-oracle breaches tolerated: none. A single one means
     * a rendered cell disagreed with `cellOracle`, which is a correctness
     * bug and not a performance nuance.
     */
    ORACLE_VIOLATIONS: 0,
  },

  /**
   * How far a harness readout may drift from an independently measured
   * wall clock before it stops being evidence. 20 % absorbs the polling
   * latency between a `data-state` flip and the Node-side clock read; it
   * would not absorb a readout wired to the wrong operation.
   */
  READOUT_TOLERANCE: 0.2,

  /** Phase 1 — load path: rewrites, type probes, ingest copies, progress. */
  LOAD: {
    /**
     * Statements one loader issues for one load, end to end.
     *
     * Measured at the budget tier (2,000 × 100, `queryBudget.test.ts`, which
     * drives all three loaders through a counting `LoaderContext` proxy):
     * **6** for every format — `SET TimeZone`, one preflight `DESCRIBE` of
     * the reader relation, one batched type probe, the ingest CTAS, the row
     * count, and the final `DESCRIBE`. At 1,000 columns Parquet measures
     * **12**: four extra probe chunks, plus the create/drop pair for the
     * bounded detection sample that kicks in past `PROBE_SAMPLE_THRESHOLD`.
     *
     * Cap at 15 so an added `SET` or schema read does not trip it while a
     * reintroduced per-column probe loop would: the shape this replaces
     * issued `3 × VARCHAR columns` statements for detection alone — 90 at
     * this tier, 900 at 1,000 columns.
     */
    QUERIES_MAX: 15,
    /**
     * Full-table `CREATE TABLE … AS SELECT`s per load.
     *
     * Each is a complete copy plus a sort at ~2× transient memory, and none
     * is interruptible by `cancelSent()` — this is the count that decides
     * whether a large load survives the WASM heap.
     *
     * Measured: **1**, the ingest CTAS, with every detected temporal cast
     * folded into its projection. Was up to **4** (ingest plus one rewrite
     * per triggered type class), which the WIDE tier trips by construction.
     *
     * There is no headroom on purpose. A second full-table materialization
     * is exactly the regression this phase exists to prevent, so it should
     * fail the suite rather than be absorbed.
     */
    CTAS_MAX: 1,
    /**
     * Wall clock for one WIDE load — 1,000 columns × 60,000 rows, Parquet,
     * visualizations off (`tiers.full.spec.ts`).
     *
     * Measured **8,336 ms** before this phase (`baselines/baseline-wide-off-970698e.json`,
     * macOS, 10 cores, Chromium) and **3,912 ms** after. Cap at 30,000 —
     * ~7.7× the measured number, which sounds absurd until you remember
     * where it can run: this is a `RUN_BROWSER_PERF` assertion, and the
     * whole reason wall clock is gated (README §8.3) is that a shared
     * runner can be several times slower without anything being wrong.
     * What a cap this size still catches is the thing worth catching — a
     * load that has gone structurally quadratic, or fallen back to a
     * per-column probe loop, is 10× out and not 2×.
     */
    WIDE_LOAD_MS: 30_000,
    /**
     * Wall clock for one DEEP load — 20 columns × 5,000,000 rows, Parquet,
     * visualizations off.
     *
     * Measured **11,192 ms** before this phase
     * (`baselines/baseline-deep-off-970698e.json`), same machine. Cap at
     * 60,000 for the reason above; the deep tier is 100× the rows of WIDE
     * on a single-threaded engine, so it has less structural headroom and
     * more absolute variance.
     */
    DEEP_LOAD_MS: 60_000,
  },
  /**
   * Phase 2 — lazy visualizations: viz query counts, `maxInFlight`.
   *
   * Every number below was measured on the reference machine (macOS, 10
   * cores, Chromium, 1,280 px viewport) at both WIDE_CI (300 × 20,000) and
   * WIDE (1,000 × 60,000). The two tiers agree on all of them, which is the
   * point of the phase: what a lazy chart costs is a function of the
   * *viewport*, not the column count.
   *
   * | metric                | WIDE before | WIDE after |
   * | --------------------- | ----------- | ---------- |
   * | queries at load       | 2,004       | 20         |
   * | canvases              | 1,000       | 8          |
   * | live MutationObservers| 1,001       | 2          |
   * | live ResizeObservers  | ~1,001      | 9          |
   * | `loadData` resolves   | 18,884 ms   | 3,743 ms   |
   *
   * The caps carry real headroom over the measured numbers because the
   * measured numbers depend on viewport width, which a CI runner and a
   * developer's monitor do not share. They are still one to two orders of
   * magnitude below the eager shape they exist to catch — at WIDE_CI the
   * same mount under `visualizations: { eager: true }` costs 604 queries and
   * 300 canvases, so a regression fails these by 10× or more, not by 10 %.
   */
  VIZ: {
    /**
     * Bridge `sent.query` from load start to the initial chart wave settling
     * (`whenVizReady()`), visualizations on.
     *
     * Measured **20** at both WIDE_CI and WIDE: 4 fixed (schema, first row
     * block, count sync) plus 8 visible-plus-overscan charts × 2 aggregate
     * queries each. Visualizations off is **4** at both tiers, which is the
     * fixed part on its own.
     *
     * Cap at 66 — the phase doc's figure, and it survives measurement for a
     * different reason than the doc gave: 66 covers a viewport roughly three
     * times wider than the one measured (~30 charts), which is the widest
     * realistic case. Eager at WIDE_CI is 604 and at WIDE 2,004, so the cap
     * discriminates by more than 9×.
     */
    QUERIES_AT_LOAD_MAX: 66,
    /**
     * `.dt-root canvas` elements once the initial wave has settled.
     *
     * Measured **8** at both tiers; **0** with visualizations off; **300**
     * (every applicable column) under `eager: true` at WIDE_CI and 1,000 at
     * WIDE. Cap at 40 for the same viewport-width reason as above.
     *
     * This is the assertion that a scrolled-away column has *no* canvas, not
     * merely an idle one — canvas memory is the second half of what made
     * 1,000 charts untenable.
     */
    CANVAS_COUNT_MAX: 40,
    /**
     * Concurrent chart *fetch operations*, mirroring
     * `DEFAULT_VIZ_FETCH_CONCURRENCY` in
     * `src/visualizations/VizDataController.ts`.
     *
     * Mirrored rather than imported: `tests/` must not depend on the library
     * bundle, and a budget that reads its own limit from the code it guards
     * cannot fail.
     */
    FETCH_CONCURRENCY: 4,
    /**
     * Bridge `maxInFlight` high-water mark across a visualization-driven
     * window.
     *
     * **Not the same number as {@link FETCH_CONCURRENCY}, and the difference
     * is the whole reason this entry has a docblock.** The controller bounds
     * concurrent *fetches* at 4; each histogram fetch issues two or three
     * statements, and the grid's own traffic runs alongside. The bridge
     * counter sees all of it.
     *
     * Measured: **5** at load, **4** over a horizontal sweep, **10** at the
     * high-water mark of one filter fan-out (4 concurrent refreshes × 2
     * statements, plus the count sync and a row block). Cap at 16 — above
     * the worst measured case, far below the unbounded shape, where one
     * filter over 1,000 columns would put ~2,000 statements in flight.
     */
    MAX_IN_FLIGHT: 16,
    /**
     * Queries one filter change costs before any chart is considered.
     *
     * Measured **3** with visualizations off: the filtered count, the row
     * block, and the re-fetch the body issues once the count lands.
     */
    NONVIZ_QUERIES_PER_FILTER: 3,
    /**
     * Aggregate queries one *visible* chart re-issues per filter change.
     *
     * Measured **2** — foreground and background series. One filter at
     * WIDE_CI with 10 visible charts cost exactly
     * `3 + 2 × 10 = 23` queries, against ~2,000 before this phase.
     */
    QUERIES_PER_VIZ_PER_FILTER: 2,
    /**
     * Aggregate queries one chart costs when it is created by scrolling into
     * view, with no filter active. Measured **2**.
     */
    QUERIES_PER_VIZ_CREATE: 2,
    /**
     * The same, with a filter active: measured **4**.
     *
     * A chart built under a filter needs the unfiltered background series as
     * well as the filtered foreground one, and cannot reuse a cached
     * unfiltered pass it never made. Budgeted separately rather than folded
     * into one number, because collapsing them would hide a regression in
     * whichever direction was the smaller of the two.
     */
    QUERIES_PER_VIZ_CREATE_FILTERED: 4,
    /**
     * Live `IntersectionObserver`s per table: exactly one, at any column
     * count. The controller runs a single observer at the keep margin and
     * derives the narrower create band per entry, rather than running two.
     */
    INTERSECTION_OBSERVERS_MAX: 1,
    /**
     * Live `MutationObserver`s with visualizations on.
     *
     * Measured **2** at both tiers — the table's own, plus the one shared
     * `ThemeWatcher`. Off it is **1**. Before this phase every chart
     * installed its own: 1,001 at WIDE. Cap at 4, which leaves room for a
     * modal or portal observer and still fails a per-column regression by
     * two orders of magnitude.
     */
    MUTATION_OBSERVERS_MAX: 4,
    /**
     * Mirror of `APPROX_DISTINCT_ROW_THRESHOLD` in
     * `src/visualizations/histogram/HistogramData.ts` — above this many rows
     * the distinct-value count switches to `approx_count_distinct`.
     *
     * Mirrored, not imported, for the reason given on
     * {@link FETCH_CONCURRENCY}.
     */
    APPROX_DISTINCT_ROW_THRESHOLD: 100_000,
    /**
     * Wall clock for one WIDE load — 1,000 columns × 60,000 rows, Parquet,
     * visualizations **on** (`RUN_BROWSER_PERF` only).
     *
     * Measured **3,743 ms** after this phase against **18,884 ms** before,
     * and *faster* than the same capture run's viz=off number of 3,859 ms —
     * i.e. within run-to-run noise of it, which is the real claim: turning
     * charts on no longer costs anything at load. Both figures are from
     * `plans/scaling/baselines/baseline-wide-{on,off}-51ba4ef.json`.
     *
     * Cap at 15,000. Unusually tight for a gated wall-clock number, and
     * deliberately so: the regression it exists to catch is the load promise
     * going back to waiting for every chart, which measured 18,884 ms here.
     * A cap generous enough to absorb a 4× slower machine would sit above
     * that and catch nothing. The machine-independent guards above are the
     * ones that run everywhere; this one is a second opinion on a known box.
     */
    LOAD_MS_WIDE_MAX: 15_000,
  },
  /** Phases 3–5 — column windowing and projection clipping. */
  COLVIRT: {},
  /** Phase 6 — resize / pin / keynav query and frame budgets. */
  INTERACTION: {},
  /** Phase 7 — deep sorted/filtered scrolling via the rank index. */
  DEEPROWS: {},
  /** Phases 8, 10 — selection model and direct-scan memory guardrails. */
  BIGDATA: {},
  /** Phase 11 — streaming exports and clipboard caps. */
  EXPORT: {},
  /** Phases 8–9 — state, undo stacks, autosave payload sizes. */
  STATE: {},
} as const;
