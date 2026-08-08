# Execution status

One row per phase. The executing agent updates its row at session start (`in progress`) and
session end (`done`), and appends a handoff section below. Keep rows terse; put substance in the
handoff notes. Do not edit other phases' handoff sections.

| Phase | Doc                                                                          | Status      | Started    | Finished   | Agent notes (one line)                |
| ----- | ---------------------------------------------------------------------------- | ----------- | ---------- | ---------- | ------------------------------------- |
| 0     | [phase-00-harness.md](./phase-00-harness.md)                                 | done        | 2026-08-08 | 2026-08-08 | Harness, instrumentation, baselines   |
| 1     | [phase-01-load-path.md](./phase-01-load-path.md)                             | done        | 2026-08-08 | 2026-08-08 | 1 CTAS/load, 2× faster, real progress |
| 2     | [phase-02-lazy-visualizations.md](./phase-02-lazy-visualizations.md)         | not started | —          | —          | —                                     |
| 3     | [phase-03-body-column-windowing.md](./phase-03-body-column-windowing.md)     | not started | —          | —          | —                                     |
| 4     | [phase-04-header-column-windowing.md](./phase-04-header-column-windowing.md) | not started | —          | —          | —                                     |
| 5     | [phase-05-projection-clipping.md](./phase-05-projection-clipping.md)         | not started | —          | —          | —                                     |
| 6     | [phase-06-interaction-sweep.md](./phase-06-interaction-sweep.md)             | not started | —          | —          | —                                     |
| 7     | [phase-07-rank-index.md](./phase-07-rank-index.md)                           | not started | —          | —          | —                                     |
| 8     | [phase-08-selection-model.md](./phase-08-selection-model.md)                 | not started | —          | —          | —                                     |
| 9     | [phase-09-persistence-undo.md](./phase-09-persistence-undo.md)               | not started | —          | —          | —                                     |
| 10    | [phase-10-direct-scan-mode.md](./phase-10-direct-scan-mode.md)               | not started | —          | —          | —                                     |
| 11    | [phase-11-bulk-transfer.md](./phase-11-bulk-transfer.md)                     | not started | —          | —          | —                                     |
| 12    | [phase-12-docs-integration.md](./phase-12-docs-integration.md)               | not started | —          | —          | —                                     |

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
