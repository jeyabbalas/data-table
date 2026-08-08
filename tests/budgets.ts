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
 * The namespaces below `WIDE_CI` are deliberately empty. They are the
 * agreed landing sites for later phases (`DT_BUDGET.COLVIRT` in Phase 5,
 * `DT_BUDGET.VIZ.MAX_IN_FLIGHT` in Phase 2, and so on), named up front so
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
     * **10**, the four extra statements being probe chunks.
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
  },
  /** Phase 2 — lazy visualizations: viz query counts, `maxInFlight`. */
  VIZ: {},
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
