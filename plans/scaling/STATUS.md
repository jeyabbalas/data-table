# Execution status

One row per phase. The executing agent updates its row at session start (`in progress`) and
session end (`done`), and appends a handoff section below. Keep rows terse; put substance in the
handoff notes. Do not edit other phases' handoff sections.

| Phase | Doc                                                                          | Status      | Started    | Finished   | Agent notes (one line)              |
| ----- | ---------------------------------------------------------------------------- | ----------- | ---------- | ---------- | ----------------------------------- |
| 0     | [phase-00-harness.md](./phase-00-harness.md)                                 | done        | 2026-08-08 | 2026-08-08 | Harness, instrumentation, baselines |
| 1     | [phase-01-load-path.md](./phase-01-load-path.md)                             | not started | —          | —          | —                                   |
| 2     | [phase-02-lazy-visualizations.md](./phase-02-lazy-visualizations.md)         | not started | —          | —          | —                                   |
| 3     | [phase-03-body-column-windowing.md](./phase-03-body-column-windowing.md)     | not started | —          | —          | —                                   |
| 4     | [phase-04-header-column-windowing.md](./phase-04-header-column-windowing.md) | not started | —          | —          | —                                   |
| 5     | [phase-05-projection-clipping.md](./phase-05-projection-clipping.md)         | not started | —          | —          | —                                   |
| 6     | [phase-06-interaction-sweep.md](./phase-06-interaction-sweep.md)             | not started | —          | —          | —                                   |
| 7     | [phase-07-rank-index.md](./phase-07-rank-index.md)                           | not started | —          | —          | —                                   |
| 8     | [phase-08-selection-model.md](./phase-08-selection-model.md)                 | not started | —          | —          | —                                   |
| 9     | [phase-09-persistence-undo.md](./phase-09-persistence-undo.md)               | not started | —          | —          | —                                   |
| 10    | [phase-10-direct-scan-mode.md](./phase-10-direct-scan-mode.md)               | not started | —          | —          | —                                   |
| 11    | [phase-11-bulk-transfer.md](./phase-11-bulk-transfer.md)                     | not started | —          | —          | —                                   |
| 12    | [phase-12-docs-integration.md](./phase-12-docs-integration.md)               | not started | —          | —          | —                                   |

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
