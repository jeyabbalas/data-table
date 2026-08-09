# Execution status

One row per phase. The executing agent updates its row at session start (`in progress`) and
session end (`done`), and appends a handoff section below. Keep rows terse; put substance in the
handoff notes. Do not edit other phases' handoff sections.

| Phase | Doc                                                                          | Status      | Started    | Finished   | Agent notes (one line)                   |
| ----- | ---------------------------------------------------------------------------- | ----------- | ---------- | ---------- | ---------------------------------------- |
| 0     | [phase-00-harness.md](./phase-00-harness.md)                                 | done        | 2026-08-08 | 2026-08-08 | Harness, instrumentation, baselines      |
| 1     | [phase-01-load-path.md](./phase-01-load-path.md)                             | done        | 2026-08-08 | 2026-08-08 | 1 CTAS/load, 2× faster, real progress    |
| 2     | [phase-02-lazy-visualizations.md](./phase-02-lazy-visualizations.md)         | done        | 2026-08-08 | 2026-08-08 | Charts cost the viewport, not the schema |
| 3     | [phase-03-body-column-windowing.md](./phase-03-body-column-windowing.md)     | done        | 2026-08-08 | 2026-08-08 | Body renders the column window only      |
| 3.5   | _(no doc — review-driven)_                                                   | done        | 2026-08-08 | 2026-08-08 | Hardening: 6 defects, comments, anchors  |
| 4     | [phase-04-header-column-windowing.md](./phase-04-header-column-windowing.md) | not started | —          | —          | —                                        |
| 5     | [phase-05-projection-clipping.md](./phase-05-projection-clipping.md)         | not started | —          | —          | —                                        |
| 6     | [phase-06-interaction-sweep.md](./phase-06-interaction-sweep.md)             | not started | —          | —          | —                                        |
| 7     | [phase-07-rank-index.md](./phase-07-rank-index.md)                           | not started | —          | —          | —                                        |
| 8     | [phase-08-selection-model.md](./phase-08-selection-model.md)                 | not started | —          | —          | —                                        |
| 9     | [phase-09-persistence-undo.md](./phase-09-persistence-undo.md)               | not started | —          | —          | —                                        |
| 10    | [phase-10-direct-scan-mode.md](./phase-10-direct-scan-mode.md)               | not started | —          | —          | —                                        |
| 11    | [phase-11-bulk-transfer.md](./phase-11-bulk-transfer.md)                     | not started | —          | —          | —                                        |
| 12    | [phase-12-docs-integration.md](./phase-12-docs-integration.md)               | not started | —          | —          | —                                        |

Statuses: `not started` · `in progress` · `done` · `blocked (see notes)`.

---

## Handoff notes

Append a `### Phase N — <title>` section when you finish (or block on) your phase. Required
content:

- **Assumption drift**: file:line anchors from the phase doc that had moved or changed meaning,
  and what you did about it.
- **Files created/renamed/deleted** beyond what the phase doc predicted.
- **Budgets**: names + values you added to `tests/budgets.ts` or tightened.
- **Baselines**: tiers re-captured, before → after headline numbers.
- **Deviations** from the phase doc, with reasons.
- **For the next phases**: anything that changes their stated assumptions (be specific: file,
  symbol, new line anchor).
- **Manual verification**: final `window.__dtPerf` snapshot JSON (or the phase's equivalent) and
  where screenshots were saved, per the Chrome template.

<!-- Append handoff sections below this line. -->

### Phase 0 — Scale test harness, instrumentation, and baselines

No product behavior changed. Everything below is measurement apparatus plus the first recorded
numbers. Two `src/` files were touched — `WorkerBridge.ts` (an `@internal` stats seam) and
`DataTable.ts` (five `performance.mark` calls) — neither of which alters what a user sees.

#### Assumption drift (phase-doc anchors that had moved)

- **Loader type-detection matchers are at `src/worker/loaders/common.ts:63-129`, not `:144-278`.**
  The doc's range is the `detect*Columns` probe helpers; the regexes themselves
  (`:72`, `:79`, `:87`) sit above them. Only exactly-`VARCHAR` columns are probed, at a 0.95 match
  ratio over `SELECT DISTINCT … LIMIT 100`, and each triggered pass is a full
  `CREATE TABLE … AS SELECT … ORDER BY "__rowid__"` → `DROP` → `RENAME`.
- **`WorkerBridge.sendMessage` has no `await`.** It returns the executor promise directly, and
  that promise settles at five separate sites. The stats seam therefore wraps it: the old body
  became `private dispatch(...)`, and `sendMessage` increments the counters, then attaches one
  `.finally()` to decrement the in-flight gauge. `cancel` never passes through `sendMessage`;
  `dropTable`'s `DROP` does, and counts as `sent.query`.
- **`DataTable.ts:1267`'s `Promise.all([whenBodyReady, pendingVizInit])` was restructured, not
  annotated.** The two branches are now marked separately (`markLoad('firstPaint')` /
  `markLoad('vizReady')`) before being awaited together, because they race and a single
  annotation could only have recorded whichever won.
- **`dt:load:workerDone` is not a pure worker boundary.** Session restore and the derived-column
  VIEW rebuild happen before it, so a slow `dt:load:worker` on a table with derived columns is
  not necessarily a slow ingest. Documented in `docs/performance.md`.
- **`aria-colindex` is `columnOrder.indexOf(col) + 1`** (`TableContainer.ts:1361-1372`), so it
  ascends strictly but is only _consecutive_ while nothing is hidden. The column oracle asserts
  strictly-ascending plus agreement with `columnOrder`, not consecutiveness.
- **The API-surface snapshot did not move.** It records runtime module-level exports via
  `Object.keys`; `BridgeStats` is a type and the `__…ForTests` members are instance methods, so
  no `npx vitest -u` was needed. §4.8's fallback did not fire.

#### Files created

| File                                                                | What                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `tests/fixtures/tiers.ts`                                           | Tier specs, `cellOracle`, `ORACLE_FN_SOURCE`, `tierTableSQL`, `tierSelectSQL`, `targetCopySQL`, `tierCSV` |
| `tests/fixtures/tiers.test.ts`                                      | 23 tests incl. a real Node-DuckDB round trip at a 40 × 1,000 micro tier                                   |
| `tests/budgets.ts`                                                  | `DT_BUDGET` + the empty namespaces later phases fill                                                      |
| `src/core/loadMarks.ts`                                             | `markLoad` / `clearLoadMarks`                                                                             |
| `tests/core/loadMarks.test.ts`, `tests/DataTable.loadMarks.test.ts` | 11 tests                                                                                                  |
| `tests/data/WorkerBridge.stats.test.ts`                             | 10 tests over the stats seam                                                                              |
| `demo/perf.ts`                                                      | The `?gen=` harness, `#dt-perf-panel`, `window.__dtPerf`                                                  |
| `tests/browser/helpers/wideTable.ts`                                | Tier mount, column+row oracle probe, horizontal sweep                                                     |
| `tests/browser/helpers/metrics.ts`                                  | DOM/listener/observer/frame/bridge/subscriber instruments                                                 |
| `tests/browser/tiers.smoke.spec.ts`                                 | CI-weight WIDE_CI spec (3 tests)                                                                          |
| `tests/browser/tiers.probe-controls.spec.ts`                        | Negative controls for the probes + censuses (2 tests)                                                     |
| `tests/browser/tiers.full.spec.ts`                                  | Gated heavy tiers (5 tests)                                                                               |
| `tests/browser/perf-baseline.spec.ts`                               | Gated baseline capture (6 tiers)                                                                          |
| `scripts/perf-baseline-report.mjs`                                  | Merges captures into the baselines README                                                                 |
| `plans/scaling/baselines/`                                          | 6 capture JSONs + generated README                                                                        |

`tierSelectSQL` is beyond what the doc predicted; see the memory deviation below.

#### Budgets shipped (`tests/budgets.ts`)

| Name                                  | Value  | Basis                                                         |
| ------------------------------------- | ------ | ------------------------------------------------------------- |
| `DT_BUDGET.WIDE_CI.DOM_NODES_MAX`     | 18,000 | measured 15,051 (15,352 in the baseline run) + ~20 % headroom |
| `DT_BUDGET.WIDE_CI.ORACLE_VIOLATIONS` | 0      | a breach is a correctness bug                                 |
| `DT_BUDGET.READOUT_TOLERANCE`         | 0.2    | measured drift 3.3 %                                          |

Empty namespaces reserved: `LOAD VIZ COLVIRT INTERACTION DEEPROWS BIGDATA EXPORT STATE`.

The doc's §4.6 estimate of ~120K DOM nodes at 300 columns was ~8× high: row virtualization
already bounds the body, so the count is ~50 nodes per column. The _column_ axis is what is
unbounded — 51,052 nodes at 1,000 columns — and Phases 3–5 are what will cut it.

#### Baselines captured

Six captures at `970698e`, all on one machine (darwin, 10 cpus, node v22.23.2) — the full
matrix, no tier dropped. Tables in `plans/scaling/baselines/README.md`; raw JSON beside it.

| Tier                    |            genMs | loadMs | workerMs | firstPaintMs | vizReadyMs |   queries |    DOM | canvases |        live RO/MO | sortColumns subs |      oneSort |   oneFilter | frame p95 | heapMB |
| ----------------------- | ---------------: | -----: | -------: | -----------: | ---------: | --------: | -----: | -------: | ----------------: | ---------------: | -----------: | ----------: | --------: | -----: |
| WIDE_CI 300 × 20K       |            1,689 |  1,448 |  1,447.6 |      1,447.7 |    1,447.6 |         4 | 15,352 |        0 |             1 / 1 |              305 |        114.9 |       120.5 |      12.1 |   19.6 |
| WIDE 1,000 × 60K off    |           14,414 |  8,336 |  8,334.4 |      8,334.7 |    8,334.5 |         4 | 51,052 |        0 |             1 / 1 |            1,005 |        391.9 |       381.1 |      38.0 |  227.9 |
| WIDE 1,000 × 60K **on** |           14,461 | 18,884 |  8,673.7 |        8,674 | **18,884** | **2,004** | 55,052 |    1,000 | **1,001 / 1,001** |            1,005 | **10,514.6** | **8,274.7** |      44.8 |  227.9 |
| GRID 200 × 500K         |           23,954 | 10,943 | 10,936.4 |     10,936.6 |   10,936.4 |         4 | 10,252 |        0 |             1 / 1 |              205 |        167.1 |       102.3 |       9.5 |   17.4 |
| DEEP 20 × 5M            |           21,063 | 11,192 | 11,191.7 |     11,191.9 |   11,191.8 |         4 |  1,072 |        0 |             1 / 1 |               25 |        124.8 |        38.9 |       9.3 |  347.1 |
| TARGET 1,000 × 5M       | 591,514 (`COPY`) |      — |        — |            — |          — |         4 |      — |        — |                 — |                — |            — |           — |         — |   19.6 |

`exportMs` is `null` everywhere — see deviation 3. WIDE is truncated — see deviation 1. TARGET is
probes only: `read_parquet` returned 5,000,000 rows / 1,000 columns and an oracle-correct 128-row
window at row 4,999,000, with a JS heap of 19.6 MB because nothing is materialized.

All oracle counts were zero on every tier, on both axes, through vertical scroll storms and
horizontal sweeps.

#### Deviations from the phase doc

1. **WIDE is captured at 60,000 rows, not 100,000** — all 1,000 columns kept. `exportToBuffer`
   builds `COPY (…) TO '<file>' (FORMAT PARQUET)` with no row-group option
   (`src/worker/dispatcher.ts:358-360`), so DuckDB uses its 122,880-row default; at 1,000 columns
   the whole tier buffers as one row group and dies with `Out of Memory Error: Allocation
failure` inside the ~3.1 GiB WASM heap. Bisected: 95,000 OOMs, 85,000 works, 60,000 chosen for
   headroom because `viz=on` adds 1,000 canvases on the same heap. §4.8 suggested truncating to
   `cols=500`; the row axis was cut instead, because the column axis is what this tier exists to
   test and Phases 2–6 target, while depth is already covered by GRID and DEEP.
   **TARGET is the control**: same 1,000 columns, 50× deeper, streams fine — because
   `targetCopySQL` sets `ROW_GROUP_SIZE 30720` itself. Truncated runs announce it in the log and
   in the capture's `notes`; `DT_WIDE_ROWS` overrides.
2. **The tier harness streams instead of materializing.** The doc's shape was
   `CREATE TABLE … AS SELECT` → `exportToBuffer` → `loadData`. That left the whole tier resident
   while the parquet writer needed room of its own, and it is what killed GRID (200 × 500,000)
   outright. `tierSelectSQL` feeds the generator `SELECT` straight to `exportToBuffer`, so
   DuckDB streams `range()` into the writer and nothing is materialized. GRID went from OOM to a
   clean 24 s build. `tierTableSQL` is kept and still unit-tested — Phase 10 may want a
   materialized tier.
3. **`genMs` and `exportMs` collapsed into one number.** There is no seam between generate and
   encode on the streamed path. `genMs` is the parquet-source build; `exportMs` is `null` in
   every capture (the field is kept — §4.7 names it — so a phase that reintroduces a separate
   export stage has a slot). The demo panel dropped its `exportMs` row rather than show a
   permanent `—`.
4. **`measureLoad` folded into `markLoad`.** The doc specified two functions; one covers both,
   and the library bundle is under a brotli size budget.
5. **The `recent` ring was dropped from `BridgeStats`.** It cost exactly 130 B brotli and pushed
   the bundle from 8.06 kB to 8.21 kB against an 8.1 kB cap. The doc's own risk row says to drop
   redundant fields rather than raise the cap, and no phase 1–12 reads `recent`.
6. **`bootMs` added to the demo readout.** `createDataTable` is ~1.7 s of worker spawn and DuckDB
   boot that has nothing to do with tier size; folding it into `genMs` would have made every
   baseline's generate number a measure of two unrelated things.
7. **`TEXT_COMPARABLE_CLASSES` widened from the doc's 7 classes to 18** (everything but 15 and
   18), by census against a real mount rather than by assumption.
8. **The row oracle is carried inside the column probe** as `kind: 'rowid'` rather than as a
   second observer. `bigTable.ts`'s row probe is bound to its own host and `grp` column, and the
   cell oracle is only meaningful once row identity holds, so one pass validating both is
   cheaper and better ordered.
9. **`ProbeOptions.exhaustive` / `manual` and `runColumnProbePass` added** so the negative
   controls can corrupt one thing and observe exactly one violation.
10. **Two gated tests exceed the doc's `test.setTimeout(600_000)`** (WIDE viz=on and TARGET, both
    1,800,000) under §4.8's "budget generous timeouts". TARGET's `COPY` alone measured 595 s.
11. **`test.describe.configure({ mode: 'default' })` in both gated specs.** The project sets
    `fullyParallel: true`, which would run four 10⁸-cell tiers concurrently and report an OOM
    that says nothing about the library. `'default'` rather than `'serial'` so one tier's failure
    does not abandon the rest. No `playwright.config.ts` or `ci.yml` edit.

#### Bugs found in the instruments themselves (both fixed here)

- **The observer census never worked.** It used a `#private` class field; Playwright compiles
  `addInitScript` callbacks through Babel, which lowers that to a `_classPrivateFieldInitSpec`
  helper it does not inject into the page. `new ResizeObserver` therefore threw inside
  `new TableContainer`, and _every_ gated tier failed at mount with a `ReferenceError` that
  looked like a library bug. Now a `WeakSet`. Keep `helpers/metrics.ts` to syntax that survives
  that transpile.
- **Nothing in the default suite exercised the censuses**, which is why the above went unnoticed
  through a whole milestone. `tiers.probe-controls.spec.ts` now mounts a real 8 × 200 table with
  all three censuses installed, in CI.

#### Pre-existing library quirks recorded, not fixed (out of scope, §9)

- `formatTimestampCore` (`src/table/Cell.ts:306-315`) trims trailing zeros with
  `/(\.\d*)0+$/ → '$1'`, whose greedy `\d*` renders a whole-second timestamp as
  `2020-01-01 00:00:16.00` instead of `…:16`. This is why class 18 is excluded from
  `TEXT_COMPARABLE_CLASSES`.
- CSV tier types differ from `classDuckDBType` because `read_csv_auto` sniffs ISO timestamps and
  dates natively rather than leaving them VARCHAR for the loader's detection passes.

#### Manual verification (Claude in Chrome, Browser 1)

Ran the [Chrome template](./templates/verification-chrome.md) end to end at
`?gen=wide-ci&viz=on` against `npm run dev -- --port 5173 --strictPort`, as the phase doc's own
acceptance test for the harness it builds. **All twelve steps passed, with zero console errors
across the session.** No native dialog, no download, and `#file-input` was never clicked.

Final `window.__dtPerf.refresh()` at load (steps 1-3):

```json
{
  "tier": "wide-ci",
  "rows": 20000,
  "cols": 300,
  "mode": "load",
  "viz": true,
  "state": "ready",
  "bootMs": 3001.9,
  "genMs": 10201.5,
  "loadMs": 17760.2,
  "firstPaintMs": 12972.4,
  "vizReadyMs": 17758.7,
  "queryCount": 604,
  "cacheHits": 0,
  "maxInFlight": 303,
  "domNodes": 17455,
  "heapMB": 53.1,
  "error": null
}
```

`queryCount` equalled the panel's own `__getStatsForTests().sent.query` readback exactly (604),
and `domNodes` 17,455 is inside `DT_BUDGET.WIDE_CI.DOM_NODES_MAX`. Wall-clock figures here are
inflated relative to the baselines because the gated Playwright suite was running concurrently;
the manual pass is a correctness check, not a timing one.

Screenshots (session-local temp dir, not committed):

- #1 first paint + readout — `screenshot-1786190996053-0.jpg`
- #2 deepest scroll position — `screenshot-1786192028777-1.jpg`
- #3 dark theme — `screenshot-1786192331762-2.jpg`

What each step established:

| Step                 | Result                                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 — deep scroll      | rows 9,989-10,010 at 50 %, 19,383-19,405 at 97 %, 19,983-**19,999** at max; no stuck placeholders; row oracle held at every spot check                                                                     |
| 5 — horizontal sweep | 300 headers at all five stops, a contiguous run of `visibleColumns`, `aria-colindex` ascending and equal to `columnOrder.indexOf + 1`; sampled `col_150` rendered `40,032`, byte-identical to `cellOracle` |
| 6 — sort             | none → asc → desc → none; values ordered both ways; row oracle correctly invalid while sorted (index 0 carried id 9,677) and restored on clear                                                             |
| 7 — histogram brush  | filter `col_1 133.38-666.68` created by drag, chip rendered, rows 20,000 → 10,431, removal via the chip restored 20,000 and the row oracle                                                                 |
| 8 — column ops       | resize, pin, hide, then undo/redo round-trip (299 → 300 → 299); `aria-colindex` still ascending and `columnOrder`-consistent afterwards                                                                    |
| 9 — export           | page-side `exportToBuffer` of 1,000 rows returned 1,231,457 bytes                                                                                                                                          |
| 10 — theme flip      | dark applied in under 1 ms, no stall, no errors                                                                                                                                                            |

**Interaction query costs, measured through the real UI at 300 columns with `viz=on`** — the
numbers Phase 2 and Phase 6 are accountable to, and the ones the baselines' wall clock could not
separate:

| Operation                | Queries | maxInFlight |
| ------------------------ | ------: | ----------: |
| Sort (any direction)     |   **1** |           1 |
| Resize a column          |   **0** |           0 |
| Filter (histogram brush) | **602** |          10 |
| Pin / unpin a column     | **601** |         300 |
| Hide a column            | **600** |         300 |
| Show a column            | **602** |         301 |

So sorting and resizing are already cheap; **pin, hide, show, and filter each rebuild every
visualization at ~2 queries per column.** That is `src/table/TableBody.ts:409-414`'s "534 queries
per column move at 266 columns" comment, confirmed and quantified at 300 columns. It is also the
mechanism behind the WIDE `oneFilterMs` of 8,275 ms — ~2,002 queries at 1,000 columns.

Caveat on one baseline number: `perf-baseline.spec.ts` settles between interactions with
`waitForTierSettled`, which waits on placeholders and DOM stability but **not** on
`bridge.inFlight === 0`. With `viz=on` the viz refetch from the preceding filter-removal can
still be draining when the sort begins, so **`oneSortMs` for `wide`/`on` (10,514.6 ms) should be
read as an upper bound**, not as the cost of sorting alone — the query counts above are the
cleaner signal. A phase that tightens these should add an in-flight condition to the settle.

Also verified: `?gen=bogus` fails the way it should — `data-state="error"`, the message
`Unknown tier "bogus". Expected one of: wide-ci, wide, wide-csv, grid, deep, target, custom.` in
`[data-metric="error"]`, no table mounted, no dialog.

One environment note for whoever runs this next: Chrome pauses `requestAnimationFrame` in an
occluded or minimized window, and the table's render loop is rAF-driven. With the window in the
background the scroller's `scrollTop` moves but no row ever re-renders, which looks exactly like
a virtualization bug. Check `document.visibilityState` before believing a rendering failure.

#### For the next phases

**All phases.** The instruments are `tests/browser/helpers/{wideTable,metrics}.ts`,
`tests/budgets.ts`, and `demo/perf.ts`. Mount a tier with `mountTierTable`, wrap the interesting
part in `installColumnInvariantProbe` → `readColViolations`, and read counts with
`bridgeStats` / `readObserverCensus` / `readSubscriberCounts` / `domNodeCount`. Anything you
assert in a default suite must be a machine-independent count; wall clock belongs behind
`RUN_BROWSER_PERF` / `RUN_BASELINE`. When you improve a number, tighten its cap in
`tests/budgets.ts` in the same commit and record before → after here.

**New line anchors** (both files moved):

- `src/data/WorkerBridge.ts` — `BridgeStats` at `:128`, `emptyStats` at `:140`; `query`'s cache
  early-return with `cacheHits++` at `:361`; `sendMessage` (the counting wrapper) at `:512`;
  `__getStatsForTests` at `:540`; `__resetStatsForTests` at `:554`; `private dispatch` (the
  former `sendMessage` body) at `:558`.
- `src/DataTable.ts` — `clearLoadMarks()` / `markLoad('start')` at `:1215-1216`;
  `markLoad('workerDone')` at `:1259`; the restructured paint/viz race at `:1282-1283`;
  `markLoad('complete')` at `:1288`.

**Phase 1 (load path).** `dt:load:worker` is essentially all of `dt:load:total` today —
8,334 ms of 8,336 on WIDE, 10,936 of 10,943 on GRID, 11,192 of 11,192 on DEEP. First paint
happens ~2 ms after the worker finishes, so anything you shave off ingest shows up one-for-one in
time-to-first-row. The three type-detection passes each do a full table rewrite; the tier trips
all three by construction (classes 15/16/17), and `tiers.smoke.spec.ts` asserts the converted
types, so a batched probe must keep them converting.

**Phase 2 (lazy visualizations).** The measured pathology at 1,000 columns, `viz=on` vs `viz=off`:
2,004 queries vs 4; 1,000 canvases; 1,001 live `ResizeObserver`s and 1,001 live
`MutationObserver`s vs 1 and 1; `vizReadyMs` 18,884 vs `firstPaintMs` 8,674 — i.e. `loadData`
withholds resolution for 10.2 s after the table is painted and readable. Interaction cost is
worse than load cost: **one sort takes 10,515 ms with viz on and 392 ms with it off; one filter
8,275 ms vs 381 ms.** Also note `maxInFlight` reaches **1,003** — viz queries are _not_
serialized at the bridge; they are all dispatched at once and the worker queues them, so a
concurrency cap is a real lever and `DT_BUDGET.VIZ.MAX_IN_FLIGHT` is the place to put it.

**Phases 3–5 (column windowing).** DOM nodes scale linearly with columns and nothing else:
15,352 at 300, 51,052 at 1,000 (55,052 with viz). Signal subscribers do too — `sortColumns` has
305 subscribers at 300 columns, 1,005 at 1,000, i.e. one per column plus five. `readVisibleGrid`
returns per-column rects with a `fullyVisible` flag, and the column probe already asserts the
rendered header sequence is a _contiguous run_ of `visibleColumns` (via `indexOf` on the first
rendered column), so it keeps working unchanged once the run stops being the whole list.

**Phase 6 (interaction).** Sort and filter are cheap without visualizations at every size —
392 ms / 381 ms at 1,000 columns, 167 ms / 102 ms on GRID, **125 ms / 39 ms on DEEP's 5,000,000
rows**. Scroll pacing is fine too (frame p95 9–10 ms on GRID and DEEP). The interaction problem
is visualizations, not the data layer.

**Phase 7 (rank index).** DEEP scrolls to row 4,999,999 correctly today, oracles clean, frame p95
9.3 ms, and a sort of 5M rows is 125 ms — so the rank index is about _sorted/filtered_ deep
scrolling, not about the unsorted case, which already works.

**Phase 10 (direct scan).** TARGET is real and reproducible: `COPY` writes 1,000 × 5,000,000 in
**595 s** with a JS heap of 19.6 MB, and `read_parquet` returns 5,000,000 / 1,000 plus an
oracle-correct 128-row window at row 4,999,000. The first 16 columns
(`TARGET_PROBE_COLUMNS`) carry the ordinary class cycle so `cellOracle` describes them exactly;
everything past them is run-length filler and is not oracle-checkable. `demo/perf.ts` forces
`mode=sql` for `gen=target` — flip that when direct scan lands.

**Phase 11 (bulk transfer).** `WorkerBridge.exportToBuffer` hard-codes
`COPY (…) TO '<file>' (FORMAT PARQUET)` with no options passthrough
(`src/worker/dispatcher.ts:358-360`). That single gap is what makes WIDE unbuildable at its
defined depth (deviation 1). Giving export a row-group / options seam would let the harness drop
`WIDE_MOUNT_ROWS` back to 100,000 — please retest and raise it when you do.

---

### Phase 1 — Load path: single-pass typed materialization, real progress, zero-copy ingest

The load path now issues a bounded number of statements, materializes the table **once**, reports
progress that corresponds to work actually happening, and hands the source bytes to the worker
instead of copying them. Behavior that users can observe changed in three places — a
caller-supplied `ArrayBuffer` is detached, invalid UTF-8 fails the load instead of loading as
mojibake, and type detection reads a head sample rather than the whole table — all three are in
the changeset.

#### Headline numbers

Statements and materializations at the budget tier (2,000 × 100, all three formats, counted
through a `LoaderContext` proxy in `tests/worker/loaders/queryBudget.test.ts`):

| Metric                       | Before                                                 | After                                       |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| Statements per load          | ~100 (detection alone was `3 × VARCHAR` = **90** here) | **6** — and **12** at 1,000 columns         |
| Full-table `CREATE TABLE AS` | up to **4** (ingest + one rewrite per triggered class) | **1**                                       |
| Detection cost vs. row count | three whole-table `SELECT DISTINCT` scans per column   | independent of rows (4,096-row head sample) |

Wall clock and peak heap, `perf-baseline.spec.ts`, macOS / 10 cores / Chromium, visualizations
off. Before = `970698e`, after = `5285b63`:

| Tier                           | `loadMs` before → after | `heapMB` before → after  |
| ------------------------------ | ----------------------- | ------------------------ |
| WIDE (1,000 × 60,000, Parquet) | 8,336 → **4,065**       | 227.9 → **31.6**         |
| DEEP (20 × 5,000,000, Parquet) | 11,192 → **4,243**      | 347.1 → **16.3**         |
| WIDE-CSV (1,000 × 5,000, text) | — → **5,021**           | — → **110.6**            |
| WIDE_CI (300 × 20,000)         | 1,448 → **1,198**\*     | 19.6 → (not re-captured) |

\* WIDE_CI was not re-captured through `perf-baseline.spec.ts`. 1,198 ms is the figure
`tiers.smoke.spec.ts` logs on every default `npm run test:browser` run — same readout, same
machine, but a different harness than the row above it.

**WIDE-CSV has no "before".** The capture did not exist before this phase — every other tier
reaches the loader as Parquet, so the suite was measuring only the format where the reader hands
back native temporal types and projection pushdown makes a re-read cheap. Its first capture is
this phase's; the next phase to touch the load path has a comparison point.

#### Materialization strategy that shipped, per format

All three formats take the same shape, which is the M0 spike's verdict acted on: **probe the
reader relation, then materialize once with the casts folded in.**

```
DESCRIBE SELECT <cols> FROM read_xxx('<file>')      -- reserved-name guard + column/type list
[CREATE OR REPLACE TEMP TABLE __dt_probe_sample_N   -- only past PROBE_SAMPLE_THRESHOLD
   AS SELECT <varchars> FROM <relation> LIMIT 4096]
WITH s AS MATERIALIZED (… LIMIT 4096) SELECT … UNION ALL …   -- ceil(V / 64) of these
[DROP TABLE IF EXISTS __dt_probe_sample_N]
CREATE OR REPLACE TABLE <t> AS SELECT row_number() …, TRY_CAST(…) …, … FROM <relation>
SELECT COUNT(*) FROM <t>
DESCRIBE <t>
```

Spike verdict, all confirmed against `@duckdb/duckdb-wasm@1.33.1-dev57.0` (engine `v1.5.4`,
threads = 1):

- `WITH s AS MATERIALIZED (… LIMIT 4096)` is supported against both a table and a `read_xxx()`
  relation. **No fallback path was needed** — the per-column fallback in `collectProbeSamples`
  exists only for a malformed _column_, not for a missing feature.
- **The head limit is load-bearing, not an optimization.** 200k × 50 VARCHAR: per-column probes
  354.7 ms per pass (≈1,064 ms for the three production passes), batched with the head limit
  31.4 ms, batched **without** it 568.7 ms — worse than the per-column baseline, because
  `MATERIALIZED` forces the whole projection to materialize.
- Batched probe output is **byte-identical** to the per-column probes it replaces on 47/47 VARCHAR
  columns of the datetime-stress fixture, across csv/json/parquet, at chunk 64 and chunk 8.
- The one real divergence class is a **false positive**: a low-cardinality column whose
  distribution changes past row 4,096 (`'2020-01-01'` for the head, garbage after) classifies as
  DATE on the head sample and stays VARCHAR on a whole-table scan. Head-limiting cannot produce
  false negatives on high-cardinality columns — the pre-existing whole-table probe was already
  head-biased, since `DISTINCT … LIMIT 100` without `ORDER BY` returns the earliest hash groups.
  Documented in `docs/guides/loading-data.md` §Type detection and in the changeset.

#### Deviations from the phase doc

1. **An extra commit between M3 and M4: `ec4b4ba` "Probe wide sources through a bounded sample
   table".** The doc left "which chunk size the relation path should use" open, to be folded in
   with its measurement. The measurement says the question has no answer: on CSV every probe
   statement re-parses the source head (~1,275 ms/statement + ~440 ms on a 1,000 × 5,000, 37 MB
   fixture), so 5 chunks cost 6,881 ms against a single 300-branch statement's 1,719 ms; on
   Parquet pushdown makes the source read ~140 ms regardless of chunking, so `UNION ALL` width
   dominates and the sweep is a clean U with its minimum exactly at 64 (317 ms at 64, 592 ms at
   300). No single chunk size is right for both. Past `PROBE_SAMPLE_THRESHOLD` (= 64) the probe
   now materializes a 4,096-row sample of the VARCHAR columns and chunks against that — one source
   read, then a table where chunk count is free: 1,516 ms on CSV (4.5×) and 325 ms on Parquet
   (within 2 % of the chunk-64 optimum). Below the threshold both shapes pay exactly one source
   read, so narrow sources — the overwhelming majority — are untouched.

2. **Progress bands as in §4.5's table, but the stages do not run in the order their names
   suggest.** `reading` 0–15 (main thread) → `parsing` 15–55 → `analyzing` 55–80 → `indexing`
   80–95 → exactly one `100`. `parsing` is the schema preflight (DuckDB reading the source),
   `analyzing` is the type probe, and `indexing` is the ingest CTAS plus the row count and schema
   read. That is execution order; the table in the phase doc reads as if `parsing` were the
   ingest. `analyzing` is the only band with real granularity — it advances per probe chunk.

3. **`.text()` never honoured a charset**, contrary to the assumption behind the doc's BOM guard.
   Both `Blob.text()` and `Response.text()` are defined as _UTF-8 decode_ and ignore
   `Content-Type: …; charset=`. So the byte path loses no charset handling, and the UTF-16 guard
   that shipped is strictly better than what it replaced (a BOM'd UTF-16 document previously
   reached DuckDB as UTF-8-decoded garbage either way). What the byte path _does_ change: invalid
   UTF-8 now reaches DuckDB intact and fails the load rather than being replaced with U+FFFD.
   Validating up front would mean a full scan of exactly the bytes this change exists to stop
   copying, so the error is the contract.

4. **M5's premise was wrong and the changeset does not repeat it.** CRLF NDJSON was **not**
   broken before the bounded sniff: a trailing `\r` is JSON whitespace, so `JSON.parse('{"a":1}\r')`
   succeeds and the old `split('\n')` worked by accident. Verified independently. The real win is
   not decoding and splitting the whole document to read line one; the `\r` trim that shipped is
   belt-and-braces, not a fix.

#### `preserve_insertion_order` — left at its default, with the evidence

Not set. Measured, not assumed:

- 200,000 rows through both the CSV and the Parquet loader, with the setting `false`: **zero**
  rows where `col_0 <> __rowid__` (`col_0` is `CAST(i AS INTEGER)`, i.e. the source row index).
  Same with it `true`. It changes nothing here because DuckDB-WASM runs single-threaded and the
  buffering it skips exists only to re-order parallel scan output.
- So the upside today is zero, and the downside is real: `__rowid__` comes from
  `row_number() OVER ()` over the scan, so the moment a threaded (`coi`) build is selected, row
  identity would silently depend on scan order — and no single-threaded test could catch it.
- The contract now has a live guard: `tests/worker/duckdbConfig.test.ts` "assigns `__rowid__` in
  source order", plus the row oracle in `tiers.smoke.spec.ts` and the Chrome session's step-4 spot
  checks (below), all clean.

#### `memory_limit` — 2.5 GB, and how it was validated

`src/worker/duckdb.ts:27` `DUCKDB_MEMORY_LIMIT = '2.5GB'`, applied at `:85` immediately after
`db.connect()`, inside a try/catch that warns and continues — configuration must never be why a
table fails to open. `getConfiguredMemoryLimit()` (`:38`) exposes what was accepted; **Phase 10's
estimator should read that rather than hard-code a number.**

- Default (unset) is **3.1 GiB**, derived from the WASM heap; the first allocation DuckDB cannot
  satisfy is therefore also the browser's, and a WASM allocation failure aborts the worker with
  nothing to catch. A limit below the ceiling turns that into an ordinary `Out of Memory Error`
  that reaches `loadError` with the previous table still queryable. That conversion is the whole
  point — the number itself is a budget, not a guardrail.
- **The setting is advisory and unvalidated.** `'100TB'` is accepted and reads back 90.9 TiB.
  `'2.5GB'` reads back as 2.3 GiB (GB decimal, GiB binary). It is GLOBAL — a connection opened
  after the SET sees it. `max_memory` is an alias.
- Validated at the size that mattered: **WIDE still builds at 60,000 rows × 1,000 columns**
  (`RUN_BROWSER_PERF=1` run of `tiers.full.spec.ts`), loads in 3.9–4.1 s, both oracles clean. The
  phase doc's fallback to 3.0 GB was not needed.
- Confirmed in a real browser during the Chrome session, through the shipped worker:

  ```
  SELECT current_setting('threads'), current_setting('memory_limit'),
         current_setting('preserve_insertion_order'), version()
  → { threads: 1, memory_limit: "2.3 GiB", preserve_insertion_order: true, version: "v1.5.4" }
  ```

  `threads: 1` matters beyond this phase: it is the browser-side confirmation that the
  insertion-order reasoning below is about production, not just the Node harness.

#### Budgets added

`tests/budgets.ts`, `DT_BUDGET.LOAD`:

| Constant       | Value    | Basis                                                                    |
| -------------- | -------- | ------------------------------------------------------------------------ |
| `QUERIES_MAX`  | `15`     | measured 6 at 2,000 × 100 (all formats), 12 at 1,000 columns             |
| `CTAS_MAX`     | `1`      | measured 1; **no headroom on purpose** — a second copy is the regression |
| `WIDE_LOAD_MS` | `30_000` | measured 4,065 ms; ~7× headroom, `RUN_BROWSER_PERF`-gated only           |
| `DEEP_LOAD_MS` | `60_000` | measured 4,243 ms; ~14× headroom, same gate                              |

The wall-clock caps are that loose deliberately: gated wall clock can still run on a shared
machine, and what is worth catching there is a load gone structurally quadratic (10× out), not a
slow afternoon (2× out). `queryBudget.test.ts` classifies the bounded detection sample apart from
the full-table copies `CTAS_MAX` counts — it is textually a CTAS but bounded by construction.

#### `.size-limit.cjs` — root entry 8.1 → 8.6 kB

Measured **8.14 kB** brotli (was 7.65 kB); the old cap had 38 B of headroom left. Raised to 8.6 kB
to restore the file's ~5 % convention. Worth knowing for later phases: **all** of that growth is
main-thread — the byte reporting and streaming URL read in `DataLoader`, the BOM guard, the
transfer list, the progress clamp. The loaders, the type planner and the dispatcher live in the
worker chunk, which no size-limit entry measures, so worker-side work is free at this gate.

#### `LoaderContext` — the shape later phases build on

`src/worker/loaders/common.ts:19`:

```ts
export interface LoaderContext {
  db?: AsyncDuckDB;
  conn?: AsyncDuckDBConnection;
  reportProgress?: ProgressCallback; // new in Phase 1
}
```

`reportProgress` is new, and `src/worker/dispatcher.ts:275` is **the first `LoaderContext`
production has ever constructed** — before this phase the seam existed for tests only. Phases 7
and 10 that plan to thread state through it are extending a live object, not introducing one.

#### Deleted symbols — read this if your phase doc names them

- **`enhanceSchemaTypes` and `applyTypeConversions` no longer exist.** Both were deleted in M3
  (`3c7173c`) when the conversion rewrites were folded into the ingest CTAS.
  **`phase-10-direct-scan-mode.md:61` and `:188` reference `enhanceSchemaTypes` by name.** The
  replacement is `planTypedIngestProjection(conn, relation, columnSelect?, onChunk?)`
  (`common.ts:604`), which returns a `SELECT` list rather than mutating a table — which is
  strictly better for Phase 10's purpose, since a view cannot be rewritten but a projection can be
  embedded in one. `phase-01-load-path.md:43,75,259` also name it, historically.

#### New line anchors

| File                           | Anchor                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/worker/loaders/common.ts` | `LoaderContext` `:19` · bands `:46-59` · `createLoadProgress` `:79` · `DETECT_SAMPLE_ROWS` `:246` · `PROBE_CHUNK_COLUMNS` `:258` · `PROBE_SAMPLE_THRESHOLD` `:298` · `ProbeChunkCallback` `:327` · `planTypeConversions` `:453` · `planTypeConversionsViaSample` `:512` · `planTypedIngestProjection` `:604` |
| `src/worker/dispatcher.ts`     | `case 'load'` `:258` · the `LoaderContext` it builds `:275`                                                                                                                                                                                                                                                  |
| `src/data/WorkerBridge.ts`     | transfer list `:410` · `sendMessage` `:521` · `dispatch` `:568` · `postMessage(msg, transfer)` `:614`                                                                                                                                                                                                        |
| `src/data/DataLoader.ts`       | `READING_BAND_END` `:49` · `emitReading` `:56` · `readResponseBytes` `:86` · `toArrayBuffer` `:126` · `prepareTextBytes` `:159` · `load(source, options, onProgress?)` `:190`                                                                                                                                |
| `src/DataTable.ts`             | monotonic clamp + `emit('loadProgress')` `:1262-1265`                                                                                                                                                                                                                                                        |
| `src/worker/duckdb.ts`         | `DUCKDB_MEMORY_LIMIT` `:27` · `getConfiguredMemoryLimit` `:38` · the `SET` `:85` · the insertion-order note `:97`                                                                                                                                                                                            |

#### Files created

| File                                        | What                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `tests/worker/loaders/typePlanner.test.ts`  | batched-vs-per-column parity, chunk boundaries, per-column fallback      |
| `tests/worker/loaders/queryBudget.test.ts`  | statement and CTAS counting through a `LoaderContext` proxy              |
| `tests/worker/loaders/loadProgress.test.ts` | honest-sequence invariants for all three loaders                         |
| `tests/worker/duckdbConfig.test.ts`         | memory-limit value, and the `__rowid__`-in-source-order contract         |
| `tests/data/WorkerBridge.transfer.test.ts`  | the load message's transfer list                                         |
| `tests/DataTable.loadProgress.test.ts`      | the reconnected chain end to end, in jsdom                               |
| `tests/browser/load-transfer.spec.ts`       | real detachment against a real `Worker` (runs in default `test:browser`) |
| `tests/browser/load-progress.spec.ts`       | `loadProgress` through the real IPC round trip (same)                    |

#### Traps found along the way

- **`db.dropFile()` does not delete anything on the Node target.** `COPY (…) TO '<name>'` under
  duckdb-node writes to the **real** filesystem relative to the process CWD, and `dropFile` only
  unregisters the virtual handle — so a test that exports a fixture litters the repo root with
  `.parquet` / `.json` files _and_ DuckDB's `tmp_`-prefixed staging siblings, on every run.
  `queryBudget.test.ts` and `loadProgress.test.ts` write into an `os.tmpdir()` scratch directory
  removed in `afterAll`. **`tests/helpers/nodeBridge.ts:67` still has the bare-filename pattern**
  — pre-existing, not fixed here, worth picking up by whichever phase next touches that helper.
- **`db.registerFileBuffer` detaches the `ArrayBuffer` it is handed**, independently of
  `postMessage`. A caller that registers a buffer and then reads it is already broken today.
- **`instanceof ArrayBuffer` is realm-sensitive under vitest's jsdom environment.**
  `new TextEncoder().encode(x).buffer` is a Node-realm buffer and fails `instanceof` against the
  jsdom global, so `WorkerBridge.loadData`'s transfer check silently declines to transfer it. A
  browser has one realm; the failure mode is a copy, never a correctness bug. Noted in
  `WorkerBridge.transfer.test.ts`.
- **`UNION ALL` silently implicit-casts mixed branch types** — an INTEGER branch and a VARCHAR
  branch coerce to VARCHAR without error, so DuckDB will not catch a planner bug that included a
  non-VARCHAR column. The `DESCRIBE`-derived column list on the JS side is the real guard.

#### For Phase 10 (direct-scan mode) specifically

The measurement that motivated deviation 1 is also a warning about direct scan's premise. At
`wide-csv` shape (1,000 × 5,000, 300 VARCHAR), the **old** ingest-then-rewrite baseline beats
every direct-relation strategy end to end — 1,801 ms vs the best relation shape's 2,986 ms on CSV,
and a dead heat on Parquet (670 vs 671 ms). The rewrite that direct scan exists to eliminate is
only **181 ms of that 1,801 ms (10 %)** on CSV and 166 of 670 (25 %) on Parquet, because 5M cells
is a cheap in-memory copy; meanwhile folding the `TRY_CAST`s into the ingest CTAS is _free_
(typed CTAS 1,458–1,562 ms vs plain ingest 1,461 ms). **Direct scan's case at TARGET scale has to
rest on the 2× transient memory of the rewrite, not on wall clock** — at this tier it is a
wall-clock regression, and the entry ticket on CSV (one extra source parse) costs 8× the prize.

#### Manual verification (Claude in Chrome)

Dev server on 5173 (Playwright owns 5199), two tiers, both `viz=off`, per
`plans/scaling/templates/verification-chrome.md`. Server stopped and the port confirmed free at
the end. Zero console errors and zero library warnings across the whole session — the only
console output on either tier was four `DEBUG` lines from a browser extension
(`chrome-extension://ljflmlehinmoeknoonhibbjpldiijjmm`), which is the established noise set.

**Environment caveat, stated up front because it bounds what was verifiable.** The tab reported
`document.visibilityState === 'hidden'` for the entire session — the Chrome window was never
frontmost — which is the trap Phase 0 recorded. Chrome pauses `requestAnimationFrame` in a hidden
tab, so the virtual scroller commits nothing: `scrollTop` moves, the scroll handler runs, and the
DOM never updates. A real `resize_window` forces one layout pass and _does_ commit, which is how
the 50 % sample below was obtained; a synthetic `resize` event does not. Steps 5 (horizontal
sweep) and 8 (column operations) depend on the same commit path and could not be driven. Their
coverage stands automated instead, and it is stronger than a spot check: `tiers.full.spec.ts`
sweeps all 1,000 columns at five scroll stops and asserts the column oracle at each, and both it
and `tiers.smoke.spec.ts` run a scroll storm with the row oracle. All of that passed in this
phase's gated run.

**Tab 1 — `?gen=wide&viz=off&rows=60000`** (the `rows` override is mandatory; `?gen=wide` defaults
to 100,000 and `exportToBuffer` has no `ROW_GROUP_SIZE` option).

Ready in 32 s. Load snapshot: `loadMs` **3,542** — 2.35× the 8,336 ms Phase 0 baseline and well
inside `WIDE_LOAD_MS` (30,000). `rows: 60000`, `cols: 1000`, `queryCount: 3` at mount.

Step 4 — deep vertical scroll, the load-bearing check. At 50 % depth the rendered window was rows
**29,989–30,010**, 0 stuck placeholders, and for three sampled rows:

- `data-row-id === data-row-index` for all three
- `col_0` (`CAST(i AS INTEGER)`, the source row index) equalled the row index
- `col_1`, `col_12`, `col_16`, `col_17` matched `cellOracle(idx, c, seed=2)` **exactly** —
  e.g. row 29,989: `296.78`, `Z`, `2022-03-18`, `08:20:08`
- `col_15` is not text-comparable by construction (`TEXT_COMPARABLE_CLASSES`), so the oracle
  returns `null` for it and it is not asserted

**Zero oracle violations, zero density-valve warnings.** Deeper positions could not be committed
for the reason above.

Step 6 — sort by `col_1` through `actions.setSort`: **2 queries**, values ordered
(`0, 0.03, 0.04, 0.05, 0.06`), invert and `clearSort` both clean, `sortColumns` back to `[]`.
Step 9 — `exportToBuffer(… LIMIT 1000, 'parquet')` returned **4,057,476 bytes**, inside the
10⁵–10⁷ range. Step 10 — theme flip to dark applied `data-dt-color-scheme="dark"` in ~0.7 s and
reverted cleanly.

Final `window.__dtPerf.refresh()`:

```json
{
  "tier": "wide",
  "rows": 60000,
  "cols": 1000,
  "viz": false,
  "state": "ready",
  "bootMs": 3255.7,
  "genMs": 39215.5,
  "loadMs": 3541.9,
  "firstPaintMs": 3540.4,
  "vizReadyMs": 3539.6,
  "queryCount": 7,
  "cacheHits": 0,
  "maxInFlight": 1,
  "domNodes": 57058,
  "heapMB": 35.8,
  "error": null
}
```

Screenshots: `/var/folders/8l/pbcwnq316rz5v5pnyv_sydmn2fsdlk/T/claude-chrome-screenshots-rsdhx4/screenshot-1786206371188-3.jpg`
(first paint) and `…/screenshot-1786206778656-4.jpg` (end of session).

**Tab 2 — `?gen=wide-csv&viz=off`** (1,000 × 5,000 as in-page CSV — the text-format path).

Panel reached `ready`; the harness reported `loadMs` **26,515**, which is _not_ comparable to the
5,021 ms baseline and should not be read as one. It is a cold first load in a throttled hidden
tab, on top of the demo harness building a 35 MB CSV string on the main thread. Re-loading the
same 35 MB, 1,000-column CSV in the same page immediately afterwards measured **4,959 ms**,
matching the baseline capture to within 1 %. Recorded here rather than quietly dropped, because a
`loadMs` from this harness under these conditions is a number someone could later mistake for a
regression.

That second load also produced the clearest end-to-end evidence of the progress work:

```
reading:15   @+0ms      parsing:15   @+22ms
analyzing:63 @+2168ms   analyzing:72 @+2199ms   analyzing:80 @+2210ms
indexing:80  @+2212ms   indexing:100 @+3444ms
```

Three `analyzing` reports is exactly `ceil(150 / PROBE_CHUNK_COLUMNS)` — DuckDB's CSV sniffer
types half the temporal classes natively, leaving 150 VARCHAR columns of the 1,000, which is past
`PROBE_SAMPLE_THRESHOLD` and so runs through the bounded sample table. The 2.2 s before the first
`analyzing` report is the `DESCRIBE` plus the one source parse the sample costs; the 1.2 s after
`indexing:80` is the ingest CTAS.

Progress honesty (step 2), a 2,000-row CSV with a timestamp column loaded through a live
`table.on('loadProgress', …)`:

```json
{
  "n": 5,
  "monotone": true,
  "lastPercent": 100,
  "hundreds": 1,
  "readingLoaded": 65793,
  "csvBytes": 65793,
  "stages": ["reading:15(c)", "parsing:15", "analyzing:80", "indexing:80", "indexing:100"]
}
```

`n > 4`, non-decreasing, exactly one terminal `100`, `reading` carries the source's exact byte
count, and `(c)` — `cancelable: true` — appears on `reading` alone.

Transfer check (step 3): `loadData(buf)` with a 5,788-byte `ArrayBuffer` → `buf.byteLength === 0`
afterwards and the table holding all 500 rows. The buffer was detached **because** the worker took
it, not instead of reading it.

Engine settings read through the shipped worker, which is the field validation for M7:

```json
{ "threads": 1, "memory_limit": "2.3 GiB", "preserve_insertion_order": true, "version": "v1.5.4" }
```

#### Gates

| Gate                                                                    | Result                                                                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` · `format:check` · `typecheck`                           | clean                                                                                                                                         |
| `npm run test:coverage`                                                 | 226 files, **4,272 passed / 10 skipped**; 86.5 % statements, 75.9 % branches, 89.5 % functions, 88.6 % lines — all above the configured gates |
| `npm run build && npm run size`                                         | passes after the root-entry cap change (8.14 kB vs 8.6 kB)                                                                                    |
| `npm run docs:api:check`                                                | 0 errors (1 pre-existing `CrossfilterCoordinatorOptions` warning)                                                                             |
| `npm run test:browser`                                                  | 38 passed / 12 skipped, including the two new load-path specs                                                                                 |
| `RUN_BROWSER_PERF=1 … tiers.full.spec.ts -g "WIDE\|DEEP"`               | 4 passed in 14.9 m — WIDE viz=off `loadMs` **3,405**, WIDE viz=on 13,837, DEEP **3,567**, TARGET `copyMs` 608,408                             |
| `npm run perf:baseline` (WIDE, WIDE-CSV, DEEP) + `perf:baseline:report` | 3 captures written, README regenerated                                                                                                        |

### Phase 2 — Lazy, cached, staleness-aware visualizations

Charts are no longer a function of the column count. A column's chart is created when its header
scrolls within 200 px of the header viewport and its canvas is reclaimed at 400 px; the data
outlives the DOM, so scrolling back costs no query; a filter refetches only what is on screen and
marks the rest stale. `loadData` resolves at first interactive paint and `vizReady` /
`whenVizReady()` carry "the charts you can see are drawn".

#### Headline — WIDE (1,000 × 60,000), visualizations on

Reference machine (macOS, 10 cores, Chromium, 1,280 px viewport). Before is
`baseline-wide-on-970698e.json`, after is `baseline-wide-on-51ba4ef.json`.

| Metric                   | viz off (today) | viz on, before | viz on, after |
| ------------------------ | --------------- | -------------- | ------------- |
| Queries at load          | 4               | 2,004          | **20**        |
| Canvases                 | 0               | 1,000          | **8**         |
| Live `ResizeObserver`s   | 1               | ~1,001         | **9**         |
| Live `MutationObserver`s | 1               | 1,001          | **2**         |
| `loadData` resolves      | 3,859 ms        | 18,884 ms      | **3,743 ms**  |
| One sort                 | 402 ms          | 10,515 ms      | **450 ms**    |
| One filter               | 424 ms          | 8,275 ms       | **506 ms**    |

WIDE_CI (300 columns) reports the same 20 queries and 8 canvases, which is the claim: cost tracks
the viewport, not the schema. The same WIDE_CI mount under `{ eager: true }` costs 604 queries and
300 canvases — the control is measured in the same run as the number it frames
(`tests/browser/viz-lazy.spec.ts`), not quoted from here.

#### Assumption drift

- **`.dt-body-scroll` cannot be the IntersectionObserver root.** The phase doc offered it as a
  fallback. An IO root must be an ancestor of its targets and the body scroller is the header
  subtree's _sibling_, so it is impossible, not merely worse. `.dt-header-scroll` is the only
  viable root — and it is created once by `TableContainer` and survives every `render()`, which is
  what lets one observer serve the table's whole life.
- **The phase doc's `QUERIES_AT_LOAD_MAX = 66` arithmetic was wrong** (it assumed 2 queries per
  histogram; the real figure is 2 or 3, and 4 for a chart created under an active filter). The cap
  survives at 66 for a different reason: it covers a viewport ~3× wider than the one measured.
- **`state.tableName` is not a proxy for "the headers were rebuilt"** in either direction — it
  re-renders only when `gridSemanticsActive` flips. Header-rebuild detection is per-entry container
  identity instead, so `VizSyncOptions` has no `headersRebuilt` flag.
- **A base constructor runs before subclass field initializers.** Kicking the first fetch from
  `SharedHistogramBase` would have wiped any hydrated `initialData`, so the four concrete
  histograms each kick their own — which also fixes a latent ordering hazard that predates this
  phase.

#### Files created

`src/visualizations/VizDataController.ts`, `src/visualizations/ThemeWatcher.ts`,
`src/core/concurrency.ts` (all internal — none exported from `index` or `advanced`);
`tests/browser/viz-lazy.spec.ts`, `tests/visualizations/VizDataController.test.ts`,
`tests/visualizations/ThemeWatcher.test.ts`, `tests/visualizations/palette.cache.test.ts`,
`tests/DataTable.nonVizStats.coalesce.test.ts`, `tests/DataTable.vizSharedCost.test.ts`,
`tests/DataTable.staleInteraction.test.ts`, and two `*.approxDistinct.test.ts`.

#### Budgets

All new, under `DT_BUDGET.VIZ`, each with its measurement in place:
`QUERIES_AT_LOAD_MAX 66`, `CANVAS_COUNT_MAX 40`, `FETCH_CONCURRENCY 4`, `MAX_IN_FLIGHT 16`,
`NONVIZ_QUERIES_PER_FILTER 3`, `QUERIES_PER_VIZ_PER_FILTER 2`, `QUERIES_PER_VIZ_CREATE 2`,
`QUERIES_PER_VIZ_CREATE_FILTERED 4`, `INTERSECTION_OBSERVERS_MAX 1`, `MUTATION_OBSERVERS_MAX 4`,
`APPROX_DISTINCT_ROW_THRESHOLD 100_000`, `LOAD_MS_WIDE_MAX 15_000` (gated).

Two depart from the phase doc's stated values. **`MAX_IN_FLIGHT` is 16, not 4**: the controller
bounds concurrent _fetches_ at 4 (now its own entry, `FETCH_CONCURRENCY`), and since a histogram
fetch is 2–3 statements the bridge's high-water mark is a different quantity — measured 5 at load,
4 on a sweep, 10 during a filter fan-out. **`NONVIZ_QUERIES_PER_FILTER` is 3, not 2**, measured
against a viz=off control.

`tiers.full.spec.ts`'s WIDE viz=on test moved from recording to asserting.

#### Size

The visualization chunk barely moved (73.57 → 74.65 kB brotli), but **the root entry went
8.12 → 10.82 kB** — the largest single-phase move it has made. `VizDataController` and its facade
wiring are statically reachable from `createDataTable`, so `visualizations: false` pays for them
too. Not obviously reducible: the controller must exist synchronously when `attachVisualizations`
runs, so moving it behind the dynamic `import()` that already lazies the chart classes would turn a
synchronous seam asynchronous. Recorded in `.size-limit.cjs` for a later phase that revisits the
attach seam. Caps raised to 11.4 kB and 78.5 kB.

#### Deviations

- **Queries in flight are bounded by bounding _creation_.** The built-ins fetch in their
  constructors, so a persistent in-controller pump (not a one-shot `runLimited`) is what bounds
  them. `src/core/concurrency.ts` is still used by the coordinators.
- **A stale entry re-creates _without_ its snapshot.** Seeding wrong data and then correcting it
  would be two steps and one wrong frame; a plain fetch is correct in one.
- **`panelScheduler` is a second entry point**, not a shared one. Both coordinators broadcasting
  through `refreshOnFilters` would bump the filter epoch twice per user-visible cycle and discard
  the first cycle's own fetches as stale.
- **`refreshNonVizStats` widened and then coalesced.** Its predicate is now "has a live instance"
  (an offscreen chart column has none, and its row count used to freeze at the attach-time value);
  the wider sweep runs once per cycle behind a `queueMicrotask` latch.

#### Defects found after the implementation was green

Recording these because all seven were invisible to a green suite, and four of them were found by
the two verification steps rather than by writing the code.

Manual Chrome pass, at 1,000 columns:

1. **`whenVizReady()` never settled in a hidden document.** A background tab gets no rendering
   opportunity, so no IntersectionObserver callback is delivered and the wave never closed.
   Measured: load resolved at 3,637 ms, `dt:load:viz` at 57,151 ms — i.e. when the tab was
   foregrounded 53 s later, and never at all if nobody looks. Now closes immediately with 0, which
   is what four of the five documents already promised; the `whenVizReady` JSDoc was the odd one
   out and is corrected.
2. **A brush outlived the filter it created.** Drag-brush, remove the filter via its chip, hide any
   column: the rebuild restores the brush, and the slot reads "60,000 rows" over "24,271 rows
   (40.5 %)". Root cause is older than this phase — `StateActions.notifyRemovedFilters` was
   reachable only from `undo`, `redo` and `resetToInitial`, so `setOnFilterRemove` never fired for
   `removeFilter` or `clearFilters`, which is every removal a user performs — but before charts
   were re-created constantly the stale map entry was unreachable. Guarded on the restore side
   here; the root cause was fixed after the phase closed (see the entry below).

Code review over the diff:

3. `settleFetch` marked an entry `'fresh'` when its instance had been reclaimed mid-fetch, seeding
   a superseded snapshot into the next chart, which then issued no query and never self-corrected.
4. A sync with nothing to observe hung the wave forever — reachable through the public
   `visualizationRegistry` option with a registry matching no column type.
5. `invalidateAll` refetched against the _previous_ relation (`updateFilters` replaces
   `options.filters`, never `options.tableName`) on instances the following `sync()` destroys.
6. `stalePanels` / `panelRefresh` survived a sync, dispatching into a destroyed coordinator.
7. A throwing custom `refresh` abandoned the columns queued behind it and surfaced an unhandled
   rejection.

#### For the next phases

- **Phase 3–4 (column windowing).** Headers still exist for all 1,000 columns — `domNodes` is
  unchanged at ~52,000 and `sortColumns` still has 1,005 subscribers. When the header row becomes a
  window, `VizDataController.sync` needs the _windowed_ column list, and its container-identity
  rebuild detection (`VizDataController.ts`, `sync`) already handles headers coming and going. The
  one observer re-points via `disconnect()` + `observe()` on each sync, which the observer census
  in `tests/browser/helpers/metrics.ts` now counts correctly.
- **Phase 5 (projection clipping).** `waitForTierSettled` gained an `inFlight === 0` term; any new
  async paint path must be visible to the bridge counter or the settle will race it.
- **Phase 6 (interaction sweep).** Escape now walks only the charts on screen — see the changeset.
  If the interaction stack should survive a canvas being reclaimed, that is Phase 6's call;
  `saveInteractionState` / `restoreInteractionState` in `src/DataTable.ts` are the seam.
- **Anyone touching filters.** ~~`setOnFilterRemove` never fires for ordinary filter removals.~~
  **Resolved after the phase closed**, in its own commit and changeset
  (`.changeset/filter-removal-callback.md`). Two corrections to what this document said while the
  item was open: `notifyRemovedFilters` was never dead code — it had three callers (`undo`, `redo`,
  `resetToInitial`) and the gap was that `removeFilter` and `clearFilters` were not among them.
  And wiring it turned out to need `removeFilter` / `clearFilters` to become idempotent first:
  clearing a chart's brush calls `onFilterChange(null)`, which the coordinator routes back into
  `removeFilter` while the removal is still unwinding, so the callback re-enters its own caller.
  `setOnFilterRemove` can now be relied on for user-driven removals; the paths that write
  `state.filters` directly (session restore, `resetTableState`) still bypass it.
- **Phase 11 (streaming exports).** Unchanged: `exportToBuffer` still has no `ROW_GROUP_SIZE`
  option, so WIDE is still truncated to 60,000 rows.

#### Manual verification (Claude in Chrome)

`http://localhost:5173/data-table/?gen=wide&viz=on&rows=60000`, 1,000 × 60,000, Chromium 1512 × 736. Zero console errors across the session.

```json
{
  "tier": "wide",
  "rows": 60000,
  "cols": 1000,
  "mode": "load",
  "viz": true,
  "state": "ready",
  "bootMs": 529.5,
  "genMs": 14285.7,
  "loadMs": 3309,
  "firstPaintMs": 3308.9,
  "vizReadyMs": 4032.4,
  "queryCount": 24,
  "cacheHits": 0,
  "maxInFlight": 10,
  "domNodes": 55085,
  "heapMB": 41.8,
  "error": null
}
```

- **Step 3** — `loadMs 3309 < vizReadyMs 4032` (the load-gate change, in the demo); 24 queries
  against a 66 budget; 10 canvases against 40.
- **Step 4** — no stuck placeholders and the row oracle clean at 50 %, 97 % and the very bottom
  (row 59,999); canvas count flat at 10, so vertical scrolling creates nothing.
- **Step 5** — the chart set follows the viewport across the sweep: col_0–9 → col_246–257 →
  col_494–505 → col_742–753 → col_990–999, canvases 10–12 throughout, ~24 queries per jump
  (12 new charts × 2). Header sequence invariant held at every stop.
- **Step 6** — one sort: 498 ms, **1 query**, no chart refetch.
- **Step 7** — a brush on col_0 filtered 60,000 → 24,000 for **exactly 22 queries** = the budgeted
  `2 + 2 × 10 visible charts`. Then a jump to an unvisited region: 12 charts appeared at 4.1
  queries each, every one already filter-aware (`24,000 / 60,000 rows`) with no fan-out to the
  other 988 columns.
- **Step 8** — resize + pin + hide + reorder together: 7 queries, all grid re-projection.
- **Step 9** — `exportToBuffer` of 1,000 rows × 1,000 cols: 3.87 MB.
- **Step 10** — theme flip applied in 0 ms; charts repainted on the dark palette.

Screenshots (session-local, `/var/folders/.../claude-chrome-screenshots-rsdhx4/`):
`screenshot-1786216161903-5.jpg` first paint — histograms on visible columns only;
`screenshot-1786216218436-6.jpg` col_992–999 after the sweep — charts streamed in at the far end;
`screenshot-1786216335619-7.jpg` col_615–622 filtered — foreground/background split in a region
the initial wave never reached; `screenshot-1786216440173-8.jpg` dark theme.

#### Gates

| Gate                                                               | Result                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `npm run lint` · `format:check` · `typecheck`                      | clean                                                                                       |
| `npm run test:coverage`                                            | 237 files, **4,429 passed / 10 skipped**; all coverage gates met                            |
| `npm run build && npm run size`                                    | passes; root entry 10.82 kB vs 11.4 kB cap, viz chunk 74.65 kB vs 78.5 kB                   |
| `npm run docs:api:check`                                           | 0 errors (10 warnings, all "referenced but not documented" for internal types)              |
| `npm run test:browser`                                             | **47 passed / 13 skipped**, including 9 new `viz-lazy` specs at WIDE_CI                     |
| `RUN_BROWSER_PERF=1 … viz-lazy.spec.ts tiers.full.spec.ts`         | WIDE viz=on 20 queries / 8 canvases / `loadMs` 3,546; GRID, DEEP, TARGET all pass unchanged |
| `npm run perf:baseline` (WIDE both modes) + `perf:baseline:report` | 2 captures written at `51ba4ef`, README regenerated                                         |
| `/code-review` at high effort over `9acecc2..HEAD`                 | 11 confirmed findings; 5 correctness fixes + 6 accuracy corrections landed in `c11e931`     |

### Phase 3 — Body column windowing

A body row used to carry one cell per visible column, whatever the viewport. It now carries
`[P pinned cells][left spacer][W window cells][right spacer]`, where `[start, end)` is the run of
columns whose pixel span intersects the horizontal viewport, overscanned one viewport per side and
floored at ten columns per side. The two spacers sum to exactly the width of what is not rendered,
so the scroll extent and every cell's x-position are unchanged.

#### Headline — WIDE_CI (300 × 20,000), visualizations off

Reference machine (macOS, 10 cores, Chromium), viewport now pinned to 1,280 × 720 in
`playwright.config.ts`.

| Metric                             | Before                | After                       |
| ---------------------------------- | --------------------- | --------------------------- |
| Elements under `.dt-root`          | 15,051                | **11,136**                  |
| Cells in one body row              | 300                   | **17** at rest, 28 scrolled |
| `.dt-cell` under `.dt-body`        | ~4,500                | **255–420**                 |
| The same row at **60** columns     | 60                    | **17** — the same number    |
| Header ↔ cell horizontal agreement | (one cell per column) | **0.000 px** at every stop  |

The fourth row is the claim: what a row costs is a function of the viewport, not of the schema. The
remaining 11,136 is dominated by the 300 eagerly built `ColumnHeader`s — **Phase 4's number to
cut**, and the reason this one did not fall further.

#### M1 — Alignment spike (§4.8), executed first

Throwaway: a `spikeWindowRow` post-processor in `TableBody` reshaped every rendered row into
`[2 pinned cells][left spacer][cells 10..29][right spacer]`, plus a temporary
`tests/browser/spike-alignment.spec.ts`. Both reverted; this section is the record. Custom tier
50 × 1,000, `viz=off`, 1280×720, Chromium.

**Gated numerically, not photographically** — no `toHaveScreenshot` infrastructure is committed
anywhere in `tests/browser/`, so the gate is `|header.getBoundingClientRect().x − cell.x| ≤ 1` for
every rendered column plus `scrollWidth` unchanged. Screenshots were taken as the artifact.

**Result: `maxDx = 0.000 px` and `maxDw = 0.000 px` at all three stops** (`scrollLeft` 0 / 3,253 /
6,506 = max), across 22 rendered columns including two pinned ones, with `scrollWidth` a constant
7,500 px and all 50 headers still rendered. Left spacer 1,200 px (8 × 150), right spacer 3,000 px
(20 × 150) — exact.

**What drives the scroll extent: the rows' natural overflow, not `setContentWidth`'s spacer.**
Measured by zeroing each declared width in turn on a live mount:

| declared widths                                             | `.dt-body-scroll.scrollWidth` |
| ----------------------------------------------------------- | ----------------------------: |
| baseline (spacer 7,500, content + viewport `min-width`)     |                         7,500 |
| width spacer → 0                                            |                         7,500 |
| width spacer → 0 **and** content + viewport `min-width` → 0 |                         7,500 |

`.dt-body` carries `min-width: fit-content` (`02-shell.css:456`), so the flex rows' own width
propagates all the way to the scroller and is what binds. **`VirtualScroller.ts:232-238`'s comment
— "the absolutely positioned viewport doesn't contribute to scrollWidth" — is stale**; it predates
`setContentWidth` writing `minWidth` on the viewport, and in any case the extent is
`max(spacer, natural overflow)` with the second term winning today.

The consequence is the opposite of reassuring, and it is why V1.1 exists: the spacer arithmetic is
**load-bearing for scroll geometry**, not merely for looks. Wrong spacer widths would make
`scrollWidth` breathe with the window, clamp `scrollLeft`, fire a scroll, and oscillate — and
because `sweepHorizontal` derives its stop positions from `scrollWidth`, every other sweep
assertion would silently be sampling the wrong places. The changeset carries **no** scroll-extent
`Fixed` line: the extent is unchanged by construction, and the new assertion is what keeps it so.

**Box overhead is the constant 0, measured with a control.** `offsetWidth − parseFloat(style.width)`
over 12 sampled cells: `0` for all 12 as shipped, and `25` for all 12 with
`.dt-cell { box-sizing: content-box }` forced through an injected stylesheet. That is the number the
changeset's migration note quotes, and the uniform-box precondition (all 12 equal) is the assertion
that actually validates the model.

**Fractional widths — D10 confirmed, but not visible at 50 columns.** With every column set to
150.3 px and rows rebuilt so the spacers recompute, the worst delta is **0.297 px, at `col_1` — a
pinned column**, i.e. the sticky `left` write rounding, not the spacer. The left spacer measured
1,202.390625 px against 8 header boxes summing to 1,202.375 px: **0.016 px of drift over 8
columns**. Chrome snaps 150.3 to 150.296875 (1/64 px LayoutUnit), so the residue is 0.003125 px per
column — 3.09 px across the ~990 columns a left spacer covers at WIDE, which is triple
`ALIGNMENT_EPSILON_PX` and reachable only at that width. So the spike cannot show D10's failure and
does not refute it; D10 ships, and C8's alignment probe runs at 75 % and max with a fractional-width
negative control rather than only at 0.

**One coupling demonstrated live rather than by reading.** The first run of the fractional
measurement reported 2.375 px. The cause was not drift: `updateCellWidths` (`TableBody.ts:2019`)
pairs `cells[i]` with `visibleColumns[i]` positionally, so on a windowed row it wrote column widths
straight into the spacers. That is finding-list item §2's `updateCellWidths` coupling, observed as a
2.4 px misalignment before any of the fix work started.

Screenshots (session-local scratchpad, not committed): `spike-window-0.png` (`scrollLeft` 0),
`spike-window-1.png` (mid-scroll — pinned `col_0`/`col_1` painted over the window, `col_24`…`col_27`
sitting exactly under their headers), `spike-window-2.png` (max).

#### Design deltas D0–D10, as shipped

Recorded because each one departs from the phase doc's literal text, and a later phase reading the
doc rather than the code would be wrong about all eleven.

- **D0 — box overhead is the constant `0`, and it is still an input.** `.dt-cell` and
  `.dt-col-header` ship `box-sizing: border-box` (C1), so a configured width _is_ the occupied
  width. `ColumnWindow` keeps `boxOverheadPx` as an option field rather than baking the zero in, so
  the model can be driven — and unit-tested — against a host that changes it.
- **D1 — `getColumnWindow()` ships alongside `refreshColumnWindow()`**, and the `ColumnWindow`
  **type** is re-exported from `src/advanced.ts`. Type-only, so the `Object.keys` API snapshot does
  not move. `computeColumnWindow` stays private.
- **D2 — both `:last-child { border-right: none }` rules deleted** rather than replaced by a
  `--last` class. Under `border-box` the last column's border sits inside its declared width like
  every other; the rule only made that column's content 1 px wider.
- **D3 — keyboard navigation consumes shared accessors.** `scrollFocusedCellIntoView` calls
  `TableBody.getColumnSpan()` / `getPinnedWidthPx()`; its two O(N)-per-cursor-move loops
  (`KeyboardNavigator.ts:923-934`) are gone. §4.5's focused-cell fallback is **clamped to
  `MIN_OVERSCAN_COLUMNS`** — a cursor parked 900 columns away must not drag 900 cells into the DOM,
  and `syncActiveDescendant` already drops the attribute when the id resolves to nothing, which is
  the correct ARIA answer for a cursor scrolled out of view.
- **D4 — `tests/helpers/tableBodyDom.ts` landed in its own commit before the rewrite** (C4), green
  with zero product delta. That is what proves the helpers faithful rather than merely convenient:
  pre-windowing, `bodyCells` _is_ `children` and `spacerWidths` _is_ `{0, 0}`, so the migrated
  assertions mean the same thing on both sides of the change.
- **D5 — `readBodyWindow(page, opts)`** is a new browser reader, because `readVisibleGrid` reads
  `.dt-col-header` and the header row does not window until Phase 4. Asserting the body's window
  against a header-derived count would silently pass whatever the body did. `readAlignment` is its
  sibling, pairing cells to headers by `data-column`.
- **D6 — `tiers.smoke`'s text-oracle census is re-keyed by generator class (`c % CLASS_CYCLE`) and
  accumulated across the sweep.** Landed in **C6, not C8**: the old census read `col_0 … col_19` by
  name, and those columns do not exist at any scrolled position, so it threw on `undefined` the
  moment windowing went live. The silent `census.out[klass]!` is replaced by an explicit "this class
  was never rendered anywhere in the sweep" failure.
- **D7 — `waitForTierSettled` keys on each row's first _rendered_ `data-column`**, not the
  hardcoded `col_0`. Same reason, same commit; without it the settle key stopped seeing row content
  at all and reported "settled" while cells were still being painted.
- **D8 — `refreshColumnWindow()` at all four programmatic `scrollLeft` writers**:
  `KeyboardNavigator:939`/`:941` (one call after the branch, at `:951`), `TableContainer:1097`
  inside the existing `if` so the filter-scroll pin's steady state stays free (call at `:1103`),
  and `TableContainer:1580`, the blank body after any re-render at a scrolled-right offset (call
  at `:1590`). Deliberately **not** in `setupScrollSync`'s reverse handler (`:701`): that writes
  `bodyScroll.scrollLeft` from inside a real scroll event, so the body's own listener follows and
  a call there would recompute twice a frame.

  _Corrected at Phase 3.5_ — the four line numbers above were all one to ten lines off as written,
  and the list was one writer short. `TableContainer.scrollToRightEnd:1882` also writes body scroll
  position and has **no** `refreshColumnWindow()`. See Phase 3.5's record: it lands correctly today
  only because `behavior: 'smooth'` emits a stream of `scroll` events, which is a dependency
  nothing in that method acknowledges.

- **D9 — one shared pinned-width helper over `visibleColumns[0, P)`.** `pinnedOffsets()` in
  `ColumnWindow.ts` serves the body, the header and the demarcation line.
- **D10 — declared widths are quantized to integers at the render write sites**, not in `Actions`.
  Rounding in `setColumnWidth` would change a public value a host set; rounding at the write sites
  changes only what is drawn, which is where the requirement actually is.

#### Assumption drift

- **`ColumnWindow` carries eight fields, not §4.1's five.** `pinnedWidthPx`, `totalWidthPx` and
  `pinnedPrefixViolated` are additions. The first two are free (the prefix sums already have them)
  and remove two duplicate summations from `TableContainer`; the third names a state that is
  reachable through public API and would otherwise be silent.
- **`pinnedPrefixViolated` is reachable, and the sequence is exact.** `showColumn` splices through
  `computeRestoreIndex` without clamping to the pinned prefix, so
  `toggleColumnPin('A') → hideColumn('C') → toggleColumnPin('D') → showColumn('C')` yields visible
  `[A, C, D]` with pinned `[A, D]` — a pinned column behind an unpinned one. `resolvePinnedCount`
  falls back to "through the last pinned column", which is correct and merely renders more than it
  has to. Unit-tested through the real public API, not by constructing the state.
- **The test blast radius was ~140 sites, not the doc's estimate**: ~40 `getOrCreateRow` and ~39
  `updateRowContent` call sites plus ~59 `.children` reads, across six jsdom files. Three of them
  were **vacuous** — a pooled-row `firstElementChild` guard, a `lastElementChild` removal that would
  have hit the right spacer post-C5, and placeholder counters keyed on `children.length === 1` — and
  were re-keyed rather than migrated.
- **`VirtualScroller.ts:232-238`'s comment is stale** ("the absolutely positioned viewport doesn't
  contribute to scrollWidth"). See M1: the extent is `max(spacer, natural overflow)` and the second
  term binds today. Left in place, contradicted in the M1 record, and worth a cleanup in a phase
  that touches the scroller.

#### Files created

`src/table/ColumnWindow.ts` (internal; the type alone is re-exported from `/advanced`);
`tests/helpers/tableBodyDom.ts`, `tests/table/ColumnWindow.test.ts`,
`tests/table/TableBody.rowStructure.test.ts`, `tests/table/TableBody.columnWindow.test.ts`,
`tests/table/TableBody.rowPool.test.ts`, `tests/browser/column-window.spec.ts`.

`tests/helpers/tableBodyHarness.ts` gained `clientWidth` (**default absent — jsdom's `0` stands, so
every existing suite is unchanged**), a `schema` option, `wideHarnessSchema(n)`, `scrollToColumnPx`
/ `scrollToColumn`, `fireScroll`, and a queue-and-drain `requestAnimationFrame` stub installed only
when `clientWidth` is passed.

#### Budgets

New, under `DT_BUDGET.COLVIRT`: `WINDOW_COLUMNS_MAX 48` (measured 17 at rest / 28 mid-sweep,
identical at 60 and 300 columns), `BODY_CELLS_MAX 900` (measured 420), `HEADER_BODY_ALIGN_PX 1`
(measured 0.000).

Tightened: `WIDE_CI.DOM_NODES_MAX` **18,000 → 13,500**, against 15,051 → 11,136 measured.

`playwright.config.ts` now pins `viewport: { width: 1280, height: 720 }` — the value
`devices['Desktop Chrome']` already defaults to, so nothing moves, but a column window is a
function of viewport width and every count above would otherwise drift with a Playwright release.

#### Size

Root entry **10.82 → 10.83 kB** brotli. `ColumnWindow`'s prefix sums, binary search and window
arithmetic land there (`TableBody` is statically reachable from `DataTable`) and are offset almost
exactly by what the phase deleted: keynav's two per-move O(N) loops, the per-row `getComputedStyle`
and pinned-offset rebuild, and `returnRowToPool`'s `cloneNode` path. Cap unchanged at 11.4 kB.

Stylesheet **18.96 → 19.65 kB**, which put it 47 B over. The rules are three lines minus two
deleted blocks; the rest is comment prose, which `buildStylesPlugin` ships verbatim. Cap raised
19.6 → 20.7 kB to restore the file's ~5 % convention.

#### Deviations from the phase doc

- **The cursor ring is tracked by element reference, not by `(row, column)`.** Re-deriving the
  previous cursor through the _current_ window resolves it to a different column's cell — or to
  nothing — whenever a window moves at constant size, which is every horizontal scroll step. The
  class was left stranded on whatever now occupied that child position: a second cursor, in the
  wrong place. Found by the jsdom window suite, not by review.
- **`updateCellWidths` re-renders when a width change moves the window**, behind an `inWidthUpdate`
  re-entrancy flag. The doc has it patching incrementally only; a wide-enough column pushes the
  boundaries, and the rows in the DOM are then for the old window.
- **The window-mismatch branch pools its row and takes one straight back** rather than dropping it.
  A window that changes size does so for every mounted row at once, so the drop path allocated a
  full row per row per reshape. Same element, reshaped in place.
- **C7 is a pool rework, not only a listener rework.** `returnRowToPool`'s `cloneNode(true)` went
  with the anonymous listeners it existed to shed: it deep-copied every cell, text node and
  attribute of a row about to be overwritten wholesale — ~50 node copies per recycled row per
  scroll frame at a 24-column window — to produce an element indistinguishable from the original.
  Row handlers now hang off one `AbortController` per row.
- **The probe's new `window` check is deliberately narrower than "the right columns are
  rendered".** `installColumnInvariantProbe` runs on every rAF and every mutation, where a render
  one frame behind the scroll offset is legitimate. It asserts only frame-independent facts: the
  row matches its own `data-window` stamp, the spacers are where the stamp says, the cells are
  `visibleColumns[0, P)` followed by a contiguous run, and every rendered row was built for the same
  window. The frame-_dependent_ facts — every viewport-intersecting column is present, the spacers
  sum to the content width, headers and cells line up — are asserted at `sweepHorizontal`'s settled
  stops instead.
- **No scroll-extent `Fixed` line in the changeset.** M1 measured the extent to be driven by the
  flex rows' natural overflow, and it is unchanged by construction. The new invariance assertion is
  what keeps it so.

#### Defects found after the implementation was green

Recording these because a green suite saw none of them.

1. **`ColumnWindowModel.compute` answered `n - 1` for a band past the end of the content.**
   `upperBound` is bounded at `n`, so at `scrollLeft = 1,000,000` over 60 columns it reported the
   last column as the window start instead of `n`. Fixed with an explicit `x >= total` branch; the
   unit test that caught it drives the model past the end deliberately.
2. **The stranded cursor ring**, above.
3. **`updateRowContent` threw on a structurally-wrong row.** Reaching `children[abs - start + P + 1]`
   on a 1-child placeholder is `undefined`. `renderVisibleRows` guarantees the structure, but a
   direct `/advanced` caller does not, and rendering what fits beats throwing partway.
4. **The C2 spike's own fractional measurement was contaminated** — 2.375 px, which was not drift
   but `updateCellWidths` pairing `cells[i]` with `visibleColumns[i]` positionally and writing
   column widths into the spacers. Recorded in M1 as live evidence of the coupling the phase then
   removed.

#### For the next phases

- **Phase 4 (header windowing).** `pinnedOffsets()` and `resolvePinnedCount()` in
  `src/table/ColumnWindow.ts` are already shared with the header path
  (`TableContainer.updatePinnedColumnStyles`), and `ColumnWindowModel` is a per-`TableBody`
  instance — the header will need the same numbers, and a second model would be a second answer to
  "which columns are rendered". Consider hoisting it. `readVisibleGrid` in
  `tests/browser/helpers/wideTable.ts` reads `.dt-col-header` and currently asserts
  `toHaveLength(TIER.cols)` in `tiers.smoke.spec.ts:~200`; that assertion is Phase 4's to change,
  and `installColumnInvariantProbe`'s check (a) already tolerates a windowed header sequence.
  `WIDE_CI.DOM_NODES_MAX` is Phase 4's number to tighten again.
- **Phase 5 (projection clipping).** Untouched here on purpose: `buildRowQuery` and `rowDataCache`
  still fetch and cache the **full** row width. `TableBody.getColumnWindow()` is the seam — the
  window is published before any fetch is issued, and `refreshColumnWindow` is where a projection
  change would have to invalidate.
- **Phase 6 (interaction sweep).** Three things deliberately left:
  `ColumnResizer.ts:194` seeds a drag from `header.offsetWidth` rather than from state — correct
  now that cells are `border-box`, but still a measurement where a value exists; `showColumn` does
  not route through `clampUnpinnedIndex`, which is what makes `pinnedPrefixViolated` reachable at
  all; and the resize gesture still writes fractional widths that the render sites round (D10)
  rather than being quantized at the source.
- **Everyone.** Body cells for off-screen columns are **not in the DOM**. A spec that selects
  `.dt-cell[data-column="x"]` must scroll x into view first — `readBodyWindow` and
  `TableBody.getColumnSpan()` exist for that. `aria-colindex` remains absolute over `columnOrder`,
  so a windowed row's indices are gapped and do not start at 1.

#### Manual verification (Claude in Chrome)

`?gen=custom&rows=5000&cols=300&viz=off`, Chromium, 1,512 px window (body viewport 810 px). Zero
console errors across the whole session.

**A full horizontal sweep.** `scrollWidth` a constant **45,000 px** at every stop, and
`leftSpacer + Σ cell widths + rightSpacer` equal to it exactly at every stop:

| `scrollLeft` | window | first cell | left spacer | right spacer |    sum | worst header↔cell Δ |
| -----------: | :----- | :--------- | ----------: | -----------: | -----: | ------------------: |
|            0 | `0:18` | `col_0`    |           0 |       42,300 | 45,000 |        **0.000 px** |
|       10,951 | `0:28` | `col_63`   |       9,450 |       31,350 | 45,000 |        **0.000 px** |
|       21,902 | `0:28` | `col_136`  |      20,400 |       20,400 | 45,000 |        **0.000 px** |
|       32,853 | `0:28` | `col_209`  |      31,350 |        9,450 | 45,000 |        **0.000 px** |
|       43,804 | `0:18` | `col_282`  |      42,300 |            0 | 45,000 |        **0.000 px** |

**Keyboard navigation, the D8 path.** From a clicked cell at row 2:

| action            | `aria-activedescendant` | resolves | `scrollLeft` | rings |
| ----------------- | ----------------------- | -------- | -----------: | ----: |
| click `col_1`     | `…-cell-2-1`            | ✅       |            0 |     1 |
| 40 × `ArrowRight` | `…-cell-2-41`           | ✅       |        5,104 |     1 |
| `End`             | `…-cell-2-299`          | ✅       |       43,804 |     1 |
| `Home`            | `…-cell-2-0`            | ✅       |            0 |     1 |

Every cursor target **resolves to a live element** — that is `refreshColumnWindow()` running
synchronously inside the keystroke — and there is exactly one ring at every step, which is the
stranded-ring regression.

**Pinning, at `scrollLeft` 20,000.** `data-window="1:29"`; first rendered cell `col_0`
(`position: sticky`, `left: 0px`, `dt-cell--pinned`), second `col_123`; header and cell for `col_0`
agree to 0.000 px; demarcation at 150 px; `scrollWidth` still 45,000.

**A real resize drag** on `col_136`'s border, 150 → **373 px**: `scrollWidth` and the header row's
`min-width` both moved to **45,223** and agree exactly; the spacer identity still holds at 45,223;
alignment still 0.000 px on every rendered column; every declared cell width still an integer
(D10); the window narrowed 29 → 27 and every row was rebuilt for it.

**Re-render at a scrolled offset**, the blank-body flash. `hideColumn('col_299')` at
`scrollLeft` 20,000: after the rebuild the body is back at `scrollLeft` 20,000 with
`data-window="1:27"` and cells `col_0` + `col_123 … col_149` — the columns actually under the
viewport, not `col_0 … col_27`. Adding a range filter at the same offset likewise preserved both
the offset and the window (`filteredRows` 5,000 → 999).

Screenshots (session-local, not committed): the pinned-column state at `scrollLeft` 20,000 and the
same view after the `col_136` resize.

#### Baselines

Re-captured append-only at `202bb18`, reference machine (macOS, 10 cores, Chromium). Comparison is
against each tier's last capture — `51ba4ef` for WIDE (Phase 2), `970698e` for GRID and DEEP
(Phase 0), which is why the load times for the latter two also move: Phase 1 sits in the gap.

**DOM nodes under `.dt-root`, the number this phase exists to change:**

| Tier                           | Before |      After | Change    |
| ------------------------------ | -----: | ---------: | --------- |
| WIDE — 1,000 × 60,000, viz off | 52,052 | **36,356** | **−30 %** |
| WIDE — 1,000 × 60,000, viz on  | 52,076 | **36,380** | **−30 %** |
| WIDE_CI — 300 × 20,000         | 15,352 | **11,156** | **−27 %** |
| GRID — 200 × 500,000           | 10,252 |  **7,556** | **−26 %** |
| DEEP — 20 × 5,000,000          |  1,072 |      1,076 | +4        |

**DEEP is the control, and it is flat by construction.** At 20 columns the ten-column overscan
floor covers the whole axis, so every column is still rendered and a row's only new nodes are its
two spacers. A narrow table pays nothing for windowing, which is what makes the mechanism safe to
leave always on.

The 36,356 that remain at WIDE are ~1,000 eagerly built `ColumnHeader`s: the body is ~476 cells
where it was ~17,000. Phase 4's number to cut is the other 36,000.

**The interaction numbers moved more than the node count did**, and were not the point. WIDE_CI,
`970698e` → `202bb18`:

| Metric                 | Before   | After       |
| ---------------------- | -------- | ----------- |
| One sort               | 114.9 ms | **45.3 ms** |
| One filter             | 120.5 ms | **39.1 ms** |
| Scroll storm frame p95 | 12.1 ms  | **9.3 ms**  |
| Load                   | 1,448 ms | 913 ms      |

A sort or a filter repaints every mounted row, and a row is now 17–28 cells instead of 300 — so
the ~2.7× is the same ratio as the cell count, arriving as latency. (Load also carries Phase 1,
which sits between these two captures; the render numbers do not.)

`tiers.full.spec.ts` (gated, `RUN_BROWSER_PERF=1`): all five pass, including TARGET —
1,000 × 5,000,000 streamed to parquet and probed at row 4,999,999 — in 10.1 min at a 19.6 MB heap.
WIDE viz=on still costs 20 mount queries and 8 canvases for 1,000 columns; the column axis changing
underneath it moved nothing there.

#### Code review over the phase diff

Two reviews at high effort over `f0b10d6..202bb18`, one on correctness (which drove the real
`TableBody` in jsdom with an invariant oracle across ~30 scripted transitions) and one on
integration (which swept `src/`, `examples/`, `demo/` and the stylesheet for code still assuming the
old contract). **Seven defects, all fixed with regression tests in the final commit.** Every one was
invisible to a green 4,521-test suite, which is the point of recording them.

1. **`ColumnHeader.getColumnCells()` still resolved body cells by `:nth-child`** — the one
   positional read the C4 migration missed, and the highest-impact finding. `columnIndex + 1`
   against `[P cells][left spacer][W cells][right spacer]` lands on a spacer, on a different
   column's cell, or on nothing. Concretely: at 1,000 columns scrolled to column 400 the
   double-click width reset tagged **nothing** and the body snapped while the header glided over
   200 ms; at `scrollLeft = 0` it tagged the **previous** column's cells, which then carried a live
   `transition: width` into the row pool and sheared on the next horizontal scroll. Now matched by
   `data-column`, and matched in JS rather than interpolated into a selector — column names come
   from user data and a quote in one would reshape the query.
2. **`pinnedOffsets` made genuinely-unpinned columns sticky** in the `pinnedPrefixViolated` case.
   The permissive `pinnedCount` is the right answer for deciding what to _render_ and the wrong one
   for deciding what to _freeze_: an unpinned column caught in the span got `position: sticky` and
   the pinned background. Now filtered by `pinnedColumns` — it still occupies its width so the
   pinned columns after it sit correctly, it just is not sticky itself.
3. **A viewport that grew never recomputed the window.** The window is a function of `scrollLeft`
   **and** `clientWidth`, and only the first produced an event. Collapse a sidebar or maximize the
   window and the new width was bare right-spacer — measured at 60 columns: viewport 600 → 4,000
   left ~13 columns of blank. Worse, a cursor arrowed into that space took
   `scrollFocusedCellIntoView`'s "already visible" branch, so nothing scrolled, nothing refreshed,
   the cell was never mounted and `syncActiveDescendant` **dropped `aria-activedescendant`** — an
   invisible, unannounced cursor that every further keypress reproduced. `TableBody` now owns a
   `ResizeObserver` on its scroll container, keyed on `clientWidth` so a height-only resize costs a
   comparison. (The row axis has the same shape and always has — `VirtualScroller` reads
   `clientHeight` only on scroll. Left for Phase 6; touching it means touching scroll-space
   compression.)
4. **`extendWindowToFocus` widened the body window for a header-row cursor.** `focusedCell.row` was
   never checked, so a header cursor mounted up to ten columns of cells in every row for a ring the
   body can never draw — and moved `end`, so every mounted row reshaped whenever the header cursor
   crossed the boundary. One guard on `HEADER_ROW_INDEX`.
5. **A width write made from `onRowsRendered` during a window-moving render was silently dropped.**
   `inWidthUpdate` prevented recursion by discarding the nested notification, so the body kept
   painting the old width while `TableContainer.updateColumnWidths` — a separate subscription —
   moved the header. That is exactly the header/body disagreement this phase exists to remove, and
   `onRowsRendered` is a documented `/advanced` seam. Now recorded and replayed once after the
   outer pass unwinds; a host that writes on every render still terminates.
6. **A non-finite column width poisoned every prefix sum after it.** Reachable without malice —
   `setColumnWidth` validates nothing and a restored session snapshot copies `columnWidths` in
   wholesale — and silent, because `flex: 0 0 NaNpx` and `setContentWidth(NaN)` are both rejected
   by CSSOM, so the spacer and the scroll extent kept their previous values while the model
   believed something else. `getColumnSpan` then returned `NaN`, which passed keyboard navigation's
   `if (!span) return` and assigned `NaN` to `scrollLeft`, yanking the table to the far left on
   every arrow press past the bad column. Widths now fall back to the default unless finite.
7. **One unrounded width write left**, on the `/advanced` no-actions placeholder-header path — the
   last site that could put a header a growing fraction of a pixel from its own cells.

Both reviewers independently cleared the areas that mattered most and said so with evidence: index
arithmetic at `P = 0` / `P = N` / `W = 0` / single-column; the binary search at every degenerate
input including NaN and Infinity viewports; cache invalidation (every writer of `visibleColumns` and
`columnWidths` in `src/` replaces the collection, so identity is a sound key); pool hygiene (no
attached element and no duplicate ever reaches `rowPool`); the cursor ring (exactly one ring in the
document iff the cursor's cell is mounted, across every transition); export, clipboard, reorder,
visualization and CSS paths; and the box-model change, where `ColumnResizer.ts:194`'s
`offsetWidth` seed is now correct rather than 25 px out.

One note taken and **not** acted on: `ColumnResizer`'s `minWidth: 50` / `maxWidth: 500` were
calibrated as content widths and are now occupied widths, so a 50 px column shows 25 px of text
rather than 50. That is the border-box change working as intended and the changeset says so; whether
the clamps should move is a product decision for Phase 6, not a defect.

Also declined, per the phase doc: `refreshColumnWindow()` in `setupScrollSync`'s reverse handler
(`TableContainer.ts:698-703`). It writes `bodyScroll.scrollLeft` from inside a real scroll event, so
the body's own listener follows and the lag is one frame that self-corrects; a call there would
recompute twice per frame for the whole duration of a header scrollbar drag.

### Phase 3.5 — Hardening pass before header column windowing

Not a phase from the plan. A short session between Phases 3 and 4, opened because a deep review
across Phases 0–3 (three parallel readers over the load path, the visualization controller and the
windowing code, plus a pass over the orchestration, docs, changesets and CSS) found six defects,
three of which live in files Phase 4 rewrites — and one of which is a guard Phase 3's own defect
list records as shipped, which had landed in exactly one of the eight places that needed it.

No design decision changed and no scope was taken from a later phase. Everything below is either a
defect closed with a regression test, a comment corrected so Phase 4 does not read it as truth, or
a record.

#### What was wrong, and where the fix landed

| #   | Severity | Defect                                                                                                       | Commit |
| --- | -------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| F1  | High     | The non-finite width guard covered the prefix sums and none of the eight sites that write a width to the DOM | C1     |
| F2  | Medium   | The ValueCounts "Other" segment was gated on an `approx_count_distinct` estimate                             | C2     |
| F3  | Medium   | `fallbackVisible` was a one-way latch a transient null root made permanent                                   | C3     |
| F4  | Low-Med  | `updateCellWidths`' replay was recursive, and its comment said it was not                                    | C4     |
| F5  | Low-Med  | `refreshPanels` never got the per-column error isolation `refreshOnFilters` has                              | C3     |
| F6  | Low      | `updateRowContent`'s spacer writes were not attribute-guarded                                                | C4     |

**F1 in detail, because Phase 4 depends on it.** `occupiedWidth` (now `resolveColumnWidth`) was
the only guarded reader. `TableBody.paintCell`, `TableBody.updateCellWidths`,
`TableContainer.updateColumnWidths`, the pinned-prefix sum, both `render()` header paths, the
`setContentWidth` sum and `ColumnHeader.getWidth` all read the raw map. `Math.round(NaN)` is `NaN`,
and `width: NaNpx` / `flex-basis: NaNpx` are rejected by CSSOM — so the element kept whatever width
it had (for a pooled row, some other column's) while the model believed 150, and everything right
of the bad column disagreed across the header, the body and the spacer. `paintCell`'s own comment
claimed it rounded "the same way the prefix sums round it so a cell and the spacer standing in for
its neighbours cannot disagree." It did not. Phase 4's premise is that the header consumes the same
geometry the body does; a width path that can silently disagree is the wrong thing to build that on.

The guard also widened. `Number.isFinite(-50)` is `true`, so a negative width summed into `prefix`
and made it non-monotonic, which puts `lowerBound` / `upperBound` outside the sorted-array
precondition they are only correct under — the window boundaries become arbitrary rather than
merely wrong. That failure mode did not exist before Phase 3 introduced the binary search.

#### Deviations from the hardening plan

- **The width guard rejects negative, not non-positive.** The plan specified
  `Number.isFinite(d) && d > 0`. `0` is a legitimate width that Phase 3 designed for and tested —
  `ColumnWindow.test.ts`'s "handles zero-width columns without excluding their neighbours" pins the
  behaviour, and `compute`'s JSDoc explains it. Zero keeps `prefix` non-decreasing and both binary
  searches correct, and `width: 0px` is a value CSSOM accepts, so it threatens nothing the guard
  exists to protect. Rejecting it would have deleted a designed behaviour and its test in a pass
  whose premise is that it changes no design decision. Shipped as `Number.isFinite(d) && d >= 0`.
- **`ColumnHeader.getWidth()` resolves through the same helper**, which the plan asked only to
  de-literalize. It is not a DOM write site, but it is the base of the next keyboard resize step,
  and `Math.max(50, Math.min(500, NaN))` is `NaN` — so a poisoned width would have made every
  subsequent resize a no-op. Strictly a superset of what the plan asked for.
- **C4's exhaustion notice is a `console.warn`, not a `warning` event.** `TableBody` has no
  emitter: `warning` is emitted only from `DataTable` and nothing plumbs an event seam down to the
  body. `TableBody.ts` already reports the analogous "a guard tripped, we degraded, here is why"
  case with `console.warn` (the `__rowid__` fast-path inconsistency), and `eslint.config.js` allows
  `warn` / `error`. Building a `TableBody → TableContainer → DataTable` warning seam is real API
  plumbing this pass did not budget, and Phase 4 rewrites these files. Consistency within the file
  won.
- **C2 also marks the approximate count, which needed a new string.** The plan asked to propagate
  `distinctCountApprox` "so the renderer can mark it, consistent with how the stats line already
  marks approximate counts with `~`". The renderer could already reach the flag
  (`(backgroundData ?? data).distinctCountApprox`), so no propagation was needed — but leaving the
  estimate bare one line under a `~N unique` would have been the inconsistency the plan named.
  Added `statistics.approxOtherCategory`, following the precedent
  `docs/guides/i18n.md` already sets for `approxUniqueCount`: its own string, because a translation
  of the exact form presents an estimate as a fact.
- **C5's F9 closed nine warnings, not six.** The plan diagnosed the typedoc regression as
  `ThemeWatcher` plus the five `*Snapshot` types. Measured against `main` (`git archive` into a
  scratch tree, `node_modules` symlinked), the pre-branch baseline is **1** warning
  (`CrossfilterCoordinatorOptions`) and nine are new — the plan's list misses
  `StatsPanelCoordinatorOptions` and `FilterFanOutScheduler`, and applying its prescription verbatim
  leaves three. Eight types exported, `themeWatcher` marked `@internal`, back to the baseline 1.
  `CrossfilterCoordinatorOptions` would take it to 0 and is the obviously correct end state, but it
  predates the branch and the acceptance criterion was "back to 1" — routed to Phase 6 with the
  other `CrossfilterCoordinator` item.
- **C5 shipped as four commits, not one.** Its scope (comment corrections, a typedoc/public-surface
  change, the `file:line` re-anchoring, and the ratchet plus changesets and this record) is four
  logical changes, and the repo convention is one per commit. Same content, split by subject.

#### Decisions recorded so they are not relitigated

- **`StateActions.setColumnWidth` still validates nothing.** Considered and declined, per Phase 3's
  D10: rounding or clamping a value a host set changes public state, while the requirement is about
  what is drawn. The render-site guard is where it belongs. Phase 6 owns the separate product
  question of whether `ColumnResizer`'s 50/500 clamps should move now that they are occupied widths.
- **F7's remaining duplication was left in place, for Phase 4.** `TableContainer` still re-sums the
  content width the model publishes as `totalWidthPx` (bypassing `TableBody.applyContentWidth`,
  which also writes `headerRow.style.minWidth`) and still re-sums the pinned prefix that
  `ColumnWindow.pinnedWidthPx` / `TableBody.getPinnedWidthPx()` already provide; `pinnedOffsets`
  sums without `boxOverheadPx` while `ColumnWindowModel.sync` adds it per column, and they agree
  only because `BOX_OVERHEAD_PX` is `0`. Phase 4 §4.1 hoists `ColumnWindowModel` onto
  `TableContainer`, which removes all three by construction. Fixing them here and again there is
  wasted motion. **If Phase 4's hoist is descoped, these come back.**

#### Comments, anchors and one record that were wrong

Six comments described the pre-windowing body and are corrected in place (see the commit for
each). All six were genuinely stale; none was a false alarm. Two are worth repeating here because
they are load-bearing beliefs rather than prose:

- **`this.columnWindow` has two writers, not one** — `renderVisibleRows` and `updateCellWidths`.
  The second publishes only on the branch where `start` / `end` / `pinnedCount` already compared
  equal, so it can never move what is mounted; but "one writer" is not a fact Phase 4 can build on.
- **`VirtualScroller`'s width spacer is not what gives the scroll container its horizontal
  extent.** Measured on a live 50-column mount: zeroing the spacer leaves `scrollWidth` at 7,500 px,
  and zeroing it together with both `minWidth` writes still leaves 7,500. `.dt-body`'s
  `min-width: fit-content` means the rows' own overflow is the binding term. The comment claimed
  the opposite.

**`docs/concepts/architecture.md` carried 34 `file:line` anchors; 26 had drifted** and one
(`ColumnWindow.ts:280`) pointed at a blank line. All 34 re-verified against the file they name; no
prose changed, because every surrounding claim still holds. The column-windowing anchors were
authored against `202bb18` rather than the phase's last commit, which is how they were stale on the
day they landed.

**D8's writer list was wrong on all four line numbers and one writer short.** Corrected in place
above. The missing writer is the one Phase 4 should look at:
`TableContainer.scrollToRightEnd:1882` writes `bodyScroll.scrollTo({ left, behavior: 'smooth' })`
and never calls `refreshColumnWindow()`. **It works today, but by accident, not by design** —
nothing in the method references the column window, and the three sites that do call
`refreshColumnWindow()` each carry a comment saying why, so the absence here reads as omission. It
lands correctly only because `behavior: 'smooth'` emits a stream of `scroll` events that
`TableBody.handleHorizontalScroll` picks up. That makes it fragile in three specific ways:
switching to `behavior: 'auto'` or a plain `scrollLeft =` write silently reintroduces the
blank-body frame the invariant exists to prevent; under `prefers-reduced-motion` the smooth scroll
degrades to an instant jump and the window is one frame stale; and jsdom fires no `scroll` event
for `scrollTo`, so no unit test can observe it landing. Left as-is (it is not broken, and Phase 4
touches this method anyway — it writes header `scrollLeft` at `:1881`), but **do not treat its
current correctness as intentional.** Its only caller is the derived-column `onCreated` hook
(`TableContainer:1738`).

#### Coverage

Thresholds ratcheted to actuals-minus-1pp, the file's standing convention, which three phases of
new tests had left 11 pp behind: statements 76 → 86, branches 63 → 75.5, functions 81 → 89,
lines 77 → 88. Phase 3.5 actuals: 87.07 / 76.54 / 90.16 / 89.18.

#### Inherited-issue register — real, out of scope here, routed to the phase that owns the seam

Per README §8.4 ("you own regressions you introduce, not inherited breakage"): all of these
predate the branch point at `c326e9e` and were re-verified against the current tree. Recorded here
so they are not rediscovered a fourth time.

| Issue                                                                                                                                                                                                                                                                                                                                     | Route to                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `tableName` is interpolated unescaped into the source relation — `fileName = \`${tableName}.csv\`` then `read_csv_auto('${fileName}')` (`csv.ts:62,118`; siblings `json.ts:212`, `parquet.ts:83`). It is caller-supplied and validated on no path, while the *table identifier* built from the same string goes through `quoteIdentifier` | **Phase 10** — it retargets exactly this `relation` seam   |
| The loaders' `finally { await db.dropFile(fileName) }` (`csv.ts:160-163` and siblings) is unguarded, so a cleanup failure replaces the real load error. The export path (`dispatcher.ts:363-367`) and the probe-sample cleanup (`common.ts:533-538`) both guard                                                                           | **Phase 10 or 11**, whichever touches the loaders first    |
| A CTAS that succeeds before `SELECT COUNT(*)` / `DESCRIBE` fails leaves the new table materialized and orphaned                                                                                                                                                                                                                           | **Phase 10** — memory guardrails                           |
| `WorkerBridge.ts:648-662` drops a malformed worker message with a `console.warn` and never rejects, so the request stays pending forever                                                                                                                                                                                                  | **Phase 11** — it owns the transfer path                   |
| `LoadPayload` carries only `data` / `format` / `tableName`, so every `CSVLoadOptions` / `JSONLoadOptions` / `ParquetLoadOptions` field — and the `LOAD_INVALID_OPTIONS` throws that validate them — is unreachable in production                                                                                                          | **Phase 12** — docs truth pass, or delete the dead options |
| `CrossfilterCoordinator.destroy()` (`:222`) has no `destroyed` flag, so `updateFilteredRowCount` can still write `state.filteredRows` post-destroy. `StatsPanelCoordinator` has one (`:63`) and guards three entry points with it                                                                                                         | **Phase 6**                                                |

#### For Phase 4 — carry into its targeted review, do not assume any of it

- **`TableBody.getColumnWindow()` is not the header's window.** It returns the _focus-extended_
  window (`TableBody.extendWindowToFocus`), which is body-cursor-specific, and
  `.dt-header-scroll.clientWidth` differs from `.dt-body-scroll.clientWidth` by the vertical
  scrollbar — so reusing the body's answer leaves a scrollbar-width sliver unrendered at the right
  edge of the header. §4.1's "hoist the computation" is the right call: put `ColumnWindowModel` on
  `TableContainer`, compute one window from the body's `scrollLeft` and the wider of the two client
  widths, and let each consumer derive its own anchor extension. `TableBody` also may not exist
  when `render()` builds headers, so the header cannot ask it.
- **Do not re-`sync()` the `VizDataController` on window shifts.** `sync()` destroys entries not in
  the column list, clears the fetch queue, resets `stalePanels` / `panelRefresh`, and starts a new
  wave. Called with the _mounted_ header list on every horizontal scroll step it would destroy
  charts still inside the 400 px keep band, discard in-flight-adjacent queued fetches, and re-arm
  `whenWaveSettled` per frame. Keep feeding `sync()` the full viz-applicable column list and use
  the mount/unmount hook §4.2 already specifies.
- `attachVisualizations` (`DataTable.ts`) is O(all headers) per attach and writes `statsEl.innerHTML`
  per column — §4.6's mount-hook work, and the reason a hide at 1,000 columns still costs 1,000 DOM
  writes. It also writes the placeholder stats line _before_ the `sync()` that re-creates the
  instance, so a column whose chart is about to be restored still takes one placeholder write.
- Body cells for off-screen columns are not in the DOM, and `aria-colindex` stays absolute and
  gapped. Both are already in the changeset and `docs/performance.md`.
- A rootless first `sync()` no longer latches (F3), but a header rebuild following a rootless sweep
  still re-creates every column once — seeded, zero queries — before the first intersection
  callback corrects `visible`. Self-correcting; noted because Phase 4 changes when headers rebuild.

#### Verification

All eight §8.4 gates green.

| Gate                     | Result                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- |
| `npm run lint`           | clean                                                                            |
| `npm run format:check`   | clean                                                                            |
| `npm run typecheck`      | clean                                                                            |
| `npm run test:coverage`  | **4,553 passed / 10 skipped**, 244 files (was 4,531 / 10) — +22 regression tests |
| `npm run build`          | clean, `check:css-vars` 74 variables in sync                                     |
| `npm run size`           | every limit under budget                                                         |
| `npm run docs:api:check` | 0 errors, **1 warning** (was 10)                                                 |
| `npm run test:browser`   | **51 passed / 13 skipped** — unmoved                                             |

`tests/browser/column-window.spec.ts` and `viz-lazy.spec.ts` specifically: unmoved, and
`HEADER_BODY_ALIGN_PX` still measures 0.000 at every stop.

**No baselines re-captured.** Nothing here is a performance claim, and `tests/budgets.ts` is
untouched.

**No manual Chrome pass.** No user-visible behaviour changes except the ValueCounts "Other"
segment, which the C2 unit tests cover exactly (an under-estimating sketch at 11 real categories,
the over-estimating mirror, and Σ segment counts = non-null rows).
