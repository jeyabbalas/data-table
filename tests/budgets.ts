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
 * later phases (`DT_BUDGET.DEEPROWS` in Phase 7, and so on), named up front so
 * thirteen agents do not invent thirteen conventions. A phase may land a
 * number in a namespace it does not own — Phase 4 put one in `INTERACTION` —
 * as long as the docblock says which phase measured it.
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
     * cell in each rendered row. Cap was 18,000 (~20 % headroom).
     *
     * **Phase 3 (body column windowing): 15,051 → 11,136**, cap 18,000 →
     * 13,500. **Phase 4 (header column windowing): 11,136 → 950**, cap
     * 13,500 → 1,800. Both of those figures are read at the same point — the
     * end of the spec's horizontal sweep — so the ~10,200 nodes that went are
     * the 300 eagerly built column headers Phase 3 left behind. The header row
     * is a `[pinned][spacer][window][spacer]` row now, on the same model and
     * the same window as the body (`COLVIRT.HEADERS_RENDERED_MAX`).
     *
     * The cap is not 950 × 1.2, though: it is **1,511** × ~1.2, the maximum
     * across the sweep rather than the value at its end. The window is widest
     * at `scrollLeft` 50 % — 28 columns rather than 17, in both rows at once —
     * and a cap tuned to one favourable offset is not a bound. The spec reads
     * the count at every stop and asserts the largest, so both numbers appear
     * in its log line.
     *
     * Note the plan's §4.6 estimate was ~120K; the real pre-phase number was
     * ~8× smaller because row virtualization already bounded the body.
     */
    DOM_NODES_MAX: 1_800,
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
     * realistic case.
     *
     * Eager used to be the control case for this cap, at 604 queries at
     * WIDE_CI and 2,004 at WIDE. It is no longer: once the header row is
     * windowed, eager builds a chart per *mounted header* rather than per
     * column, and WIDE_CI eager measures **38** — inside this cap. The cap
     * now guards the lazy path against a regression to per-column fetching,
     * and `viz-lazy.spec.ts` asserts eager fits under it too.
     */
    QUERIES_AT_LOAD_MAX: 66,
    /**
     * `.dt-root canvas` elements once the initial wave has settled.
     *
     * Measured **8** at both tiers; **0** with visualizations off; **17**
     * under `eager: true` at WIDE_CI — one per mounted header, where before
     * the header row was windowed it was one per applicable column, 300 here
     * and 1,000 at WIDE. Cap at 40 for the same viewport-width reason as
     * above.
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
  /**
   * Phases 3–5 — column windowing and projection clipping.
   *
   * Every number here is measured at the **pinned** Playwright viewport,
   * 1,280 × 720 (`playwright.config.ts`, which is also `devices['Desktop
   * Chrome']`'s own default — pinning it changes nothing and removes one way
   * for these counts to drift). That matters more than usual: a column window
   * is a function of viewport width, so an unpinned viewport makes every
   * entry below unreproducible.
   */
  COLVIRT: {
    /**
     * Cells one body row may render.
     *
     * Measured **17** at rest and **28** mid-sweep (`column-window.spec.ts`,
     * which logs the live figures). The shape is `visible + overscan`:
     * ~7 columns fit the ~1,050 px body viewport, `MIN_OVERSCAN_COLUMNS` adds
     * ten per side, and at `scrollLeft = 0` the left side clamps away. It is
     * **identical at 60 and 300 columns**, which is the whole claim of the
     * phase and is asserted directly rather than left to this cap.
     *
     * Cap at 48 — ~1.7× the measured maximum, which absorbs a wider body
     * viewport or a raised overscan while still failing loudly for any tier
     * of 48+ columns that stopped windowing. Before the phase a row rendered
     * one cell per visible column: 300 at WIDE_CI, 1,000 at WIDE.
     */
    WINDOW_COLUMNS_MAX: 48,
    /**
     * `.dt-cell` elements under `.dt-body`, all rendered rows together.
     *
     * Measured **420** (300 columns × 2,000 rows, mid-sweep: 15 rendered rows
     * × 28 cells). Cap at 900 — ~2.1×, covering a taller viewport as well as
     * a wider one. The pre-phase shape at the same tier is 15 × 300 = 4,500,
     * so a lost column window fails this by 5× and not by 10 %.
     */
    BODY_CELLS_MAX: 900,
    /**
     * px a rendered body cell's left edge may differ from its header's.
     *
     * The C2 alignment spike measured **0.000 px** for every rendered column
     * at every sweep stop, which is what `box-sizing: border-box` plus
     * integer-quantized widths buys. 1 px is the threshold the phase doc
     * asked for and absorbs subpixel layout rounding; a spacer one column
     * short would be 150 px out, not 1.
     */
    HEADER_BODY_ALIGN_PX: 1,
    /**
     * Column headers the header row may mount — Phase 4's headline number.
     *
     * Measured **17** at rest and **28** mid-sweep, and *identical* at 60,
     * 300 and 1,000 columns, with visualizations on and off
     * (`column-window.spec.ts` and the WIDE runs in `tiers.full.spec.ts`, both
     * of which log the live figure). Those are the same two numbers
     * {@link WINDOW_COLUMNS_MAX} records for a body row, because they are the
     * same window: `TableContainer.computeHeaderWindow` and `TableBody` both
     * ask one `ColumnWindowModel` at one `scrollLeft`, and
     * `column-window.spec.ts` asserts the two rendered sequences are equal
     * rather than merely equally sized. Before this phase the row held one
     * header per visible column — 300 at WIDE_CI, 1,000 at WIDE — whatever the
     * viewport was.
     *
     * Cap at 48, the same as the body's, for a reason beyond symmetry: the
     * header window is the *wider* of the two by construction.
     * `extendWindowToAnchors` pulls a nearby keyboard cursor or focus holder
     * back into the row so `aria-activedescendant` names an element that
     * exists, clamped at `MIN_OVERSCAN_COLUMNS` (10) per side — so the worst
     * case this cap has to hold is 28 + 10 = 38, and 48 still leaves ~1.3×
     * over that while failing any tier of 48+ columns that stopped windowing.
     */
    HEADERS_RENDERED_MAX: 48,
    /**
     * Elements under `.dt-root` at the **WIDE** tier — 1,000 columns.
     *
     * Measured across a horizontal sweep at 1,000 × 60,000 (`tiers.full.spec.ts`,
     * gated): **970** at rest and **1,511** at the widest stop with
     * visualizations off, **994** and **1,541** with them on. Pre-phase:
     * **36,356** off and **36,380** on.
     *
     * The reason this entry exists next to `WIDE_CI.DOM_NODES_MAX` rather than
     * being folded into it is that the two are now *the same number* — 1,511
     * at 300 columns and 1,511 at 1,000 — and that equality is the claim of
     * the phase, so it is worth being able to state it twice and watch both.
     * The same gated run measures **970** at rest for GRID (200 columns) and
     * for DEEP (20), which is the corroboration: at rest the `.dt-root`
     * subtree is now the same size at 20 columns as at 1,000. DEEP fell from
     * 1,076 with it — even a table narrower than the overscan floor pays less,
     * because the header row windows to 17 of its 20.
     *
     * Cap at 1,900, ~20 % over the larger (viz-on) measurement; the WIDE_CI
     * cap is 1,800 because that tier is only ever measured with charts off.
     */
    DOM_NODES_WIDE_MAX: 1_900,
    /**
     * Live `ResizeObserver`s per table, visualizations **off**.
     *
     * Measured **2** at 60, 300 and 1,000 columns alike: the container's own
     * over its host element, plus the column-viewport observer over
     * `.dt-body-scroll` that recomputes the window when the viewport widens
     * without anything scrolling.
     * The last recorded WIDE capture (`baselines/baseline-wide-off-202bb18.json`)
     * shows **1** — the second is not a leak but the ownership move this phase
     * made: `TableBody` kept an observer of its own on the same element until
     * the container took the window over, and it is `null` now.
     *
     * With charts on the count tracks *canvases* (one `ResizeObserver` per live
     * chart), measured 10 for 8 charts at both tiers; `viz-lazy.spec.ts` holds
     * that to `canvases + 4`. This cap is deliberately the structural one, so
     * it fails for a per-header or per-column observer — 300 and 1,000
     * respectively — rather than tracking the chart count and catching neither.
     */
    RESIZE_OBSERVERS_MAX: 4,
    /**
     * Live `MutationObserver`s per table, visualizations **off**.
     *
     * Measured **1** at 60, 300 and 1,000 columns — the table's own, and
     * nothing per header. `VIZ.MUTATION_OBSERVERS_MAX` is the same gauge with
     * charts on, where the shared `ThemeWatcher` makes it 2 and the cap is 4;
     * this one is tighter precisely because it has no chart-driven term, so a
     * single stray observer fails it.
     */
    MUTATION_OBSERVERS_MAX: 2,
    /**
     * Subscribers on `state.sortColumns`, the busiest of the seven signals a
     * `ColumnHeader` used to watch for itself.
     *
     * Measured **5** at 60, 300 and 1,000 columns, with visualizations on and
     * off, at rest and after a full horizontal sweep — a constant, which is
     * the entire point. Before this phase it was one per column plus the
     * table's own: **305** at WIDE_CI and **1,005** at WIDE, every one of them
     * notified on every sort. `TableContainer` subscribes once and fans out to
     * the mounted headers (`readSubscriberCounts`, `metrics.ts`).
     *
     * The jsdom milestone test measures **4** for the same signal
     * (`TableContainer.subscriptions.test.ts`); the extra one in a browser is
     * the fully assembled `DataTable` around it, not a per-header leak — the
     * count is 5 at every column count.
     *
     * Cap at 8: room for a couple more container-level consumers, and still
     * 38× below the per-header shape it exists to catch.
     */
    SORT_SIGNAL_SUBSCRIBERS_MAX: 8,
  },
  /**
   * Phase 6 — resize / pin / keynav query and frame budgets, and the one
   * Phase 4 number that is about an *interaction* rather than about what is
   * mounted: what a hide or a show costs the bridge.
   */
  INTERACTION: {
    /**
     * Bridge `sent.query` for one `hideColumn` or one `showColumn`.
     *
     * Measured **2** for each, at WIDE_CI and at WIDE, with visualizations on
     * and off (`viz-lazy.spec.ts`, which logs `reorderQueries`, `hideQueries`
     * and `showQueries`). Both are the grid's own cost: the projection
     * changed, so the row block is re-fetched and the count re-synced. A
     * reorder measures **0** — the projection is the same set of columns in a
     * different order, and the rows already in hand are re-keyed rather than
     * re-fetched. Before the header row was reconciled by name, a reorder cost
     * **2**, because every header was destroyed and rebuilt and the
     * visualizations went with them.
     *
     * Cap at 4, which is not 2 + slack but a measured case: hiding a column
     * that is *inside* the mounted window with charts on costs 4 — the grid's
     * 2, plus the two aggregates for the chart that the narrowing pulls into
     * view. What the cap still catches is the fan-out this phase exists to
     * prevent: a hide that re-queried the mounted charts would be ~40, and one
     * that re-queried every column ~600 at WIDE_CI.
     */
    QUERIES_PER_HIDE_SHOW_MAX: 4,
  },
  /** Phase 7 — deep sorted/filtered scrolling via the rank index. */
  DEEPROWS: {},
  /** Phases 8, 10 — selection model and direct-scan memory guardrails. */
  BIGDATA: {},
  /** Phase 11 — streaming exports and clipboard caps. */
  EXPORT: {},
  /** Phases 8–9 — state, undo stacks, autosave payload sizes. */
  STATE: {},
} as const;
