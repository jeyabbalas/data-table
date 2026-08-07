# Phase 0 — Scale test harness, instrumentation, and baselines

Size: **L** · Depends on: **nothing** · Blocks: **every other phase**

---

## 1. Context

Read [`README.md`](./README.md) (whole file) and [`STATUS.md`](./STATUS.md) first. This phase
builds the verification infrastructure every later phase consumes: parametric dataset tiers, a
demo-page harness drivable from a browser-automation agent, query/DOM/timing instrumentation, a
budgets file, Playwright helpers with a column-axis oracle, and the first recorded baselines.
**It changes no product behavior** — after this phase the library behaves identically for users;
it is just measurable.

Relevant README sections: §5.H (assets to build on), §6 (tier definitions — this phase makes
them real), §8 (protocol you follow), Glossary (row/column oracle, budgets).

## 2. Problem statement

Today nothing can measure the problem this plan fixes:

- No test exercises more than 266 columns, and 266 only for a11y (`tests/browser/helpers/demo.ts`
  `WIDE_COLUMNS = 266`); the deep-row harness is fixed at 3 columns
  (`tests/browser/helpers/bigTable.ts:24` `GEN_COLUMNS`). **No test crosses the axes.**
- The wide-table SQL generator exists but is referenced by no test
  (`tests/fixtures/generators.ts:33` `generateWideTableSQL`).
- There is no query-count assertion anywhere; the "534 queries per column move at 266 columns"
  figure lives only in a comment (`src/table/TableBody.ts:409-414`).
- `PerfMonitor` (`src/core/PerfMonitor.ts`) is unwired — no marks exist in library code; there is
  no render-phase or load-stage timing.
- The demo (`demo/main.ts`) has no way to load a large synthetic dataset and no readout an
  automation agent could assert against; committed fixtures max out at 100K rows × 19 cols /
  39 cols × 451 rows.
- No budgets file, no baselines, so no later phase could prove a before/after.

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- `tests/browser/helpers/bigTable.ts` — the whole file. You are generalizing this: generate via
  DuckDB SQL → `bridge.exportToBuffer(…, 'parquet')` → `table.loadData(buf.buffer)` → row-id
  oracle probe. Note the in-page `import('/data-table/src/index.ts')` mount pattern, the
  `window.__t` stash, the stage marker, and why the oracle function is inlined into
  `page.evaluate` (evaluate callbacks cannot see module scope).
- `tests/browser/helpers/demo.ts` — `openDemo`, `loadCsv`, `installProbes` (the `addInitScript`
  precedent), `settle`.
- `tests/fixtures/generators.ts` and `tests/helpers/{duckdbNode,nodeBridge,fixtures}.ts` — Node
  DuckDB harness and fixture conventions.
- `src/data/WorkerBridge.ts` — `sendMessage` (the single choke point all worker traffic passes
  through), `query()`'s cache early-return (`:314-345`), `QueryOptions` (`:51-64`).
- `src/worker/dispatcher.ts:85-106` — the `__resetDispatcherForTests` / `__getQueueDepthsForTests`
  `@internal` seam precedent your bridge stats seam copies.
- `src/DataTable.ts` load pipeline (~`:1206-1292`): where `loadStart` is emitted, where
  `bridge`-level load resolves, `whenBodyReady`, `pendingVizInit`, the
  `Promise.all([whenBodyReady, pendingVizInit])` gate, `loadComplete` emit. Your five marks land
  on these seams.
- `demo/main.ts` boot sequence (~`:609-694` — session auto-restore, `?url=` handling) — your
  perf-mode guard must bypass it entirely; and `vite.demo.config.ts` (base path `/data-table/`,
  `/fixtures/*` dev middleware).
- `playwright.config.ts` (port 5199, webServer, serial CI) and `.github/workflows/ci.yml`
  (which jobs gate CI — you must not add heavy specs to them).
- `tests/performance/benchmarks.duckdb.test.ts:10-12` — the stated rationale for keeping
  wall-clock budgets out of default runs. Follow it.
- `tests/api-surface.snapshot.test.ts` + `tests/api-surface.private-paths.test.ts` — know how
  they react to new `@internal` members before you add them.
- Loader detection internals your tier columns must trigger: `isISOTimestamp` / date / time
  matchers and probe queries in `src/worker/loaders/common.ts:144-278` — **verify the exact
  regexes** so tier classes 15–17 actually match them.

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 Tier definitions — `tests/fixtures/tiers.ts` (new)

One column-class cycle, `c % 20` (README §6 table). Exports:

- `TIERS`: named specs `{ name, rows, cols, seed }` for `wide-ci` (300×20,000), `wide`
  (1,000×100,000), `wide-csv` (1,000×5,000), `grid` (200×500,000), `deep` (20×5,000,000),
  `target` (1,000×5,000,000).
- `tierTableSQL(spec, tableName)` → `CREATE OR REPLACE TABLE … AS SELECT <cycle exprs> FROM
range(0, rows) t(i)`. `col_0` is `CAST(i AS INTEGER)` (monotone row oracle). ~1% NULLs in
  DOUBLE classes via a deterministic `CASE`. Classes 15/16/17 emit **strings** that satisfy the
  loader's timestamp/date/time matchers (verified in §3) so the real load path runs all three
  detection passes and rewrites.
- `targetCopySQL(spec, fileName)` → streamed
  `COPY (SELECT <16 probe cols + RLE-friendly bulk cols> FROM range(0, rows) t(i)) TO '<file>'
(FORMAT PARQUET, ROW_GROUP_SIZE 30720)`. Bulk columns use run-length formulas
  (`((i + c * 4096) // 4096) % 50` cast per class) so the 1,000×5M file lands ~150–400 MB and
  generation never materializes the table.
- `cellOracle(i, c, seed)` → the expected cell value for any tier cell, plus
  `ORACLE_FN_SOURCE`: a **self-contained function source string** (no imports, no closure)
  serialized from the same implementation, for injection into `page.evaluate` /
  `addInitScript` / the demo harness. One definition, three consumers — this kills oracle drift.
- CSV variant helper for `wide-csv`: `tierCSV(spec)` building the CSV text in JS (bounded:
  1,000×5,000 ≈ 40 MB) for the text-format load path.

`generateWideTableSQL` in `tests/fixtures/generators.ts` stays (perf suite may use it); add a
comment pointing new work at `tiers.ts`.

### 4.2 Bridge stats seam — `src/data/WorkerBridge.ts`

```ts
interface BridgeStats {
  sent: { query: number; load: number; export: number };
  cacheHits: number;
  inFlight: number; // gauge
  maxInFlight: number; // high-water mark
  recent: { type: string; ms: number; priority?: string }[]; // ring buffer, last 512
}
```

Count + time around the `await` in `sendMessage`; `cacheHits++` in `query()`'s cached
early-return. Exposed **only** as `__getStatsForTests(): BridgeStats` and
`__resetStatsForTests(): void`, JSDoc `@internal Test-only` — copying the dispatcher precedent.
Always on (two counter bumps + two `performance.now()` per round-trip is noise next to
postMessage). No events, no console output, no public API.

### 4.3 Load-stage marks — `src/DataTable.ts` (+ tiny helper, e.g. `src/core/loadMarks.ts`)

`performance.mark`/`measure`, main thread only, try/catch-wrapped, `dt:load:*` cleared at each
load start:

| Mark                 | Placed where                                |
| -------------------- | ------------------------------------------- |
| `dt:load:start`      | facade load entry                           |
| `dt:load:workerDone` | bridge load resolved (table + schema exist) |
| `dt:load:firstPaint` | `whenBodyReady` resolved                    |
| `dt:load:vizReady`   | `pendingVizInit` settled                    |
| `dt:load:complete`   | just before `loadComplete` emits            |

Measures from `dt:load:start`: `dt:load:worker`, `dt:load:paint`, `dt:load:viz`,
`dt:load:total`. (Phase 2 will move what gates the load promise; these names are stable —
`vizReady` simply starts landing after `complete`.)

### 4.4 Demo perf harness — `demo/perf.ts` (new) + ~10-line guard in `demo/main.ts`

Guard at the top of the demo init, **before** session auto-restore:

```ts
const params = new URLSearchParams(location.search);
if (import.meta.env.DEV && params.has('gen')) {
  const { installPerfHarness } = await import('./perf');
  await installPerfHarness(container, params);
  return; // perf mode owns the page; demo boot (auto-restore, ?url=) is skipped
}
```

Param grammar:
`?gen=wide|deep|grid|wide-ci|wide-csv|target|custom&rows=<int>&cols=<int>&seed=<int>&viz=on|off&mode=load|sql&marks=on|off`.
`gen=custom` requires `rows`+`cols`. `gen=target` forces `mode=sql` (until Phase 10 flips it).
Invalid params → panel `data-state="error"` + message in `[data-metric="error"]`; never a
dialog.

`installPerfHarness`: mounts its **own** `createDataTable` (always `persistence: false`;
`visualizations` per `viz` param) into the demo's table container, then per `mode`:

- `load` (default): `tierTableSQL` into a scratch table via `table.bridge.query` →
  `exportToBuffer(SELECT * FROM scratch ORDER BY col_0, 'parquet')` → `DROP` scratch (before
  loading, so two copies never coexist) → `table.loadData(buf.buffer, { sourceFormat:
'parquet' })`. `ORDER BY col_0` makes `__rowid__ === i`, keeping the row oracle true.
  `wide-csv`: `tierCSV` string → `loadData`.
- `sql`: for `target` — run `targetCopySQL`, then probe via `read_parquet` (COUNT, DESCRIBE,
  windowed fetch); table area stays empty.

Readout: `<section id="dt-perf-panel" data-state="idle|generating|exporting|loading|ready|error">`
appended to `document.body`, with `data-metric` fields `tier rows cols genMs exportMs loadMs
firstPaintMs vizReadyMs queryCount cacheHits domNodes heapMB error` and a Refresh button. JS
mirror `window.__dtPerf = { snapshot(), refresh(), marks(), resetQueryStats(), table }` returning
raw numbers. `firstPaintMs`/`vizReadyMs` come from the `dt:load:*` measures; `queryCount`/
`cacheHits` from `bridge.__getStatsForTests()`; `domNodes` counts `.dt-root` subtree; `heapMB`
from `performance.memory` when present else `n/a`.

Dev-only by construction: the dynamic import + `import.meta.env.DEV` guard keeps it out of the
built demo; it lives outside `src/` so the library bundle is untouched.

### 4.5 Playwright helpers + specs

- `tests/browser/helpers/wideTable.ts` (new): `mountTierTable(page, { tier, rows?, cols?,
seed?, viz?, rowHeight? })` following the `bigTable.ts` mount skeleton (in-page library
  import, 600 px host, `persistence: false`, stage marker, `window.__t` stash);
  `installColumnInvariantProbe` / `readColViolations` — MutationObserver + rAF sampler asserting
  (a) rendered header `data-column` sequence equals the expected slice of
  `state.visibleColumns.get()` (pinned handled separately), (b) `aria-colindex` consecutive and
  consistent, (c) one sampled resolved cell's text equals `cellOracle(row, col)` (injected via
  `ORACLE_FN_SOURCE`). Pre-column-virtualization the expected slice is "all columns", so the
  probe is green now and load-bearing from Phase 3 on. Also `readVisibleGrid(page)` (rect-based,
  keyed by `data-column`) and `sweepHorizontal(page, positions)`.
- `tests/browser/helpers/metrics.ts` (new): `domNodeCount`, `installListenerCensus` (init-script
  monkeypatch of `EventTarget.prototype.add/removeEventListener`; net counts at
  `window.__dtListeners`), `installObserverCensus` (wraps `ResizeObserver` / `MutationObserver`
  / `IntersectionObserver` constructors + `disconnect`; gauges at `window.__dtObservers`),
  `frameSampler` (rAF deltas → `{frames, p95DeltaMs, maxDeltaMs, over50Count}`),
  `bridgeStats(page)` / `resetBridgeStats(page)`, `readSubscriberCounts(page)` (via
  `table.state.<signal>.subscriberCount()`).
- Specs:
  - `tests/browser/tiers.smoke.spec.ts` — **default/CI**, WIDE_CI with `viz=off`, target ≤ 90 s:
    COUNT/DESCRIBE match spec; converted types present in `state.schema` (proves the real load
    path ran detection); scroll storm with row-oracle violations = 0; column probe violations
    = 0; readout `loadMs` vs measured wall-clock within ±20%; `queryCount` equals
    `__getStatsForTests().sent.query` exactly.
  - `tests/browser/tiers.full.spec.ts` — `RUN_BROWSER_PERF=1` self-skip: WIDE (viz on + off),
    GRID, DEEP mounts with both oracles + bridge-stats snapshots; TARGET generation +
    `read_parquet` COUNT/DESCRIBE + a windowed 128-row fetch at row 4,999,000 with
    oracle-correct probe columns. `test.setTimeout(600_000)`.
  - `tests/browser/perf-baseline.spec.ts` — `RUN_BASELINE=1` self-skip: capture per §4.7.
- CI: only `tiers.smoke.spec.ts` may run in the default `test:browser`; the others self-skip via
  `test.skip(process.env.RUN_BROWSER_PERF !== '1', …)` — **no `playwright.config.ts` or
  `ci.yml` edits needed**.

### 4.6 Budgets — `tests/budgets.ts` (new)

Named constants, imported by vitest and Playwright suites. Phase 0 ships the harness's own:
`WIDE_CI.DOM_NODES_MAX` (record actual + headroom; expect ~120K pre-optimization at 300 cols —
document the measured number), `WIDE_CI.ORACLE_VIOLATIONS = 0`,
`READOUT_TOLERANCE = 0.2`, plus placeholder namespaces later phases fill (`LOAD`, `VIZ`,
`COLVIRT`, `INTERACTION`, `DEEPROWS`, `BIGDATA`, `EXPORT`, `STATE`). Rule (repeat in the file
header): default-run budgets are machine-independent counts/invariants only; wall-clock numbers
live behind `RUN_*` env gates.

### 4.7 Baseline capture

`perf-baseline.spec.ts` records per tier (WIDE_CI; WIDE viz=on and viz=off; GRID; DEEP; TARGET
probes only): `{tier, vizMode, gitSha, date, genMs, exportMs, loadMs, workerMs, firstPaintMs,
vizReadyMs, queryCount, cacheHits, domNodes, canvasCount, liveResizeObservers,
liveMutationObservers, sortSignalSubscribers, heapMB, oneSortMs, oneFilterMs,
scrollStormFrameP95}` → writes `plans/scaling/baselines/baseline-<tier>-<viz>-<shortsha>.json`
(spec code runs in Node; `fs` is available). `scripts/perf-baseline-report.mjs` (new) merges all
JSONs into `plans/scaling/baselines/README.md` — one column per capture SHA. Baseline JSONs are
append-only (README §8.6).

npm scripts to add: `"test:browser:perf": "RUN_BROWSER_PERF=1 playwright test"`,
`"perf:baseline": "RUN_BASELINE=1 playwright test tests/browser/perf-baseline.spec.ts"`,
`"perf:baseline:report": "node scripts/perf-baseline-report.mjs"`.

### 4.8 Risk notes / fallbacks

- **WIDE with viz=on under the current code is pathological by design** (~2K serialized viz
  queries): budget generous timeouts; if it cannot complete within the spec timeout, record the
  fact (that _is_ the baseline) with a truncated capture at `cols=500` and note it in
  STATUS.md — do not "fix" the product in this phase.
- If classes 15–17 fail to trigger a detection pass (regex mismatch), fix the tier expression,
  not the loader.
- If the api-surface snapshot flags the `__…ForTests` members, update it (`npx vitest -u`) and
  verify the diff contains only `@internal` `__`-prefixed entries.
- If TARGET's `COPY` overruns memory, lower `ROW_GROUP_SIZE` first, then bulk-column count —
  record what worked.

## 5. Implementation milestones (commit at each)

1. `tests/fixtures/tiers.ts` + unit tests (oracle determinism; SQL text golden checks; a Node
   DuckDB round-trip at a micro tier, e.g. 40×1,000, asserting COUNT/DESCRIBE/type classes +
   `cellOracle` agreement). — _commit: "Add parametric dataset tier builders with cell oracle"_
2. Bridge stats seam + `tests/data/WorkerBridge.stats.test.ts` (counts, cacheHits, reset,
   maxInFlight vs the mock worker). — _commit: "Add test-only query statistics to WorkerBridge"_
3. Load-stage marks + a jsdom test asserting mark/measure names appear and clear per load. —
   _commit: "Mark load stages with performance marks"_
4. `demo/perf.ts` + `demo/main.ts` guard. — _commit: "Add dev-only perf harness to the demo"_
5. Playwright helpers (`wideTable.ts`, `metrics.ts`) + `tiers.smoke.spec.ts` green locally and
   in default `test:browser`. — _commit: "Add tier mount helpers, column oracle, and smoke spec"_
6. `tiers.full.spec.ts` + `budgets.ts` + negative-control test for the probes (a deliberately
   mismatched cell must produce exactly 1 violation). — _commit: "Add gated full-tier specs and
   budget constants"_
7. Baseline capture spec + report script + first committed baselines + docs touches (§10). —
   _commit: "Capture pre-optimization baselines for all tiers"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage                  # includes the new unit tests; coverage gate must hold
npm run build && npm run size          # library bundle must be unaffected by demo/tests
npm run docs:api:check
npm run test:browser                   # includes tiers.smoke.spec.ts
RUN_BROWSER_PERF=1 npx playwright test tests/browser/tiers.full.spec.ts
npm run perf:baseline && npm run perf:baseline:report
```

Phase-specific asserts (inside the suites): tier COUNT/DESCRIBE == spec; schema shows
timestamp/date/time for classes 15–17 (real load path proof); both oracles 0 violations +
negative control fires; readout vs measured ±20%; `queryCount` == bridge stat exactly; TARGET
probe returns 5,000,000 / 1,000 and an oracle-correct deep window; `npm run size` budgets
unchanged.

## 7. Manual verification (Claude in Chrome) — bootstrap variant

This phase builds the harness the [template](./templates/verification-chrome.md) assumes, so run
the template end-to-end **as its own acceptance test**, at `?gen=wide-ci&viz=on`:

- Steps 1–3: server up; `#dt-perf-panel` reaches `ready`; snapshot asserts rows=20,000,
  cols=300, `queryCount` > 0 and equal to the panel's own bridge-stat readback; screenshot #1.
- Step 4: deep scroll + jump; no stuck placeholders; row oracle spot-checks pass; screenshot #2.
- Step 5: horizontal sweep; header sequence equals the full `visibleColumns` list (no windowing
  yet); one sampled cell matches `window.__dtPerf`-injected oracle.
- Steps 6–8: one sort (order visually correct; record the query-count delta in STATUS.md — it is
  baseline data, not a budget yet), one histogram brush filter + chip removal, one resize + pin
  - hide + undo/redo cycle.
- Step 9: page-side `exportToBuffer` of 1,000 rows returns a plausible byteLength.
- Steps 10–12: theme flip (expect it slow at high column counts — record, don't fail), zero new
  console errors overall, cleanup.

Additionally dry-run `?gen=bogus` → panel `data-state="error"` with a message, no dialog.
Attach the final snapshot JSON + 3 screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green; library bundle size budgets untouched.
- [ ] `tiers.smoke.spec.ts` runs in default `test:browser` in ≤ ~90 s locally.
- [ ] Heavy specs self-skip without env vars (verify: default run logs the skips).
- [ ] Both oracles proven able to fail (negative control) and passing on real mounts.
- [ ] Baselines committed for WIDE_CI, WIDE (both viz modes, or documented truncation), GRID,
      DEEP, TARGET probes; report README generated.
- [ ] Demo human path byte-identical without `?gen=` (open plain demo URL; no panel, no perf
      imports in the network tab).
- [ ] Chrome template executed end-to-end and evidence attached to STATUS.md.
- [ ] STATUS.md row + handoff section filled (include measured pre-optimization numbers — later
      phases cite them).

## 9. Out of scope

Any behavior/perf fix to the library itself (that's Phases 1–11); CI workflow changes; committing
any generated dataset; public API additions (the stats seam is `@internal`); Phase 10's `target`
load mode (`gen=target` stays `mode=sql`).

## 10. Docs / changeset obligations

- `DEVELOPMENT.md` → Testing: add "Dataset tiers and perf harness" (tier table, `?gen=` grammar,
  `RUN_*` gates, baseline procedure).
- `docs/performance.md` → "Measuring your workload": document the `dt:load:*` mark names.
- **No changeset** (no public API or behavior change). If the API-surface snapshot moves, the
  diff must be only `__`-prefixed `@internal` entries.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: the measured baseline headline numbers
(WIDE load ms viz=on/off, queryCount at load, domNodes, observer counts), any tier-expression
adjustments made to satisfy the loader regexes, the exact budget constants shipped, and any
truncations (e.g. WIDE viz=on captured at reduced cols) the next phases must know about.
