# Implementation plan: correct virtual scrolling at millions of rows

This directory is the working plan for fixing two related virtual-scrolling bugs that
appear on large datasets (reported at 1.5M rows). Each phase is executed **one at a
time, in order, by a separate Claude Code instance**. If you are one of those
instances: read this README first, then your phase file fully, then perform the
targeted code review your phase file prescribes **before editing anything**.

| Phase                                        | File                                                                   | Status                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — VirtualScroller scroll-space compression | [phase-1-scroll-compression.md](./phase-1-scroll-compression.md)       | [x] done — spacer capped at 15M px with dual-mode linear/proportional mapping; Playwright spec proves the 2M-row bottom is reachable (fails on unfixed code)                                                                                                                                                                                                                                          |
| 2 — Worker serial queue + real cancellation  | [phase-2-worker-cancellation.md](./phase-2-worker-cancellation.md)     | [x] done — explicit two-priority FIFO with out-of-band cancel (queued → dequeued, running → real interrupt via conn.send() pending-query path); WorkerBridge.query gains {cache, priority}                                                                                                                                                                                                            |
| 3 — TableBody fetch-pipeline rewrite         | [phase-3-fetch-pipeline.md](./phase-3-fetch-pipeline.md)               | [x] done — every scroll frame renders (placeholders); epoch-guarded, abortable 128-row block fetches with live-viewport whole-block eviction + rowid-range fast path (density valve); fetchBlockSize/rowCacheRows/prefetch exposed. Two flagged deviations: eviction exempts just-written + visible blocks (prefetch↔evict livelock); scrollOverlap invariant asserts the union (blocks are disjoint) |
| 4 — Large-scale browser e2e suite            | [phase-4-browser-e2e.md](./phase-4-browser-e2e.md)                     | [ ] not started                                                                                                                                                                                                                                                                                                                                                                                       |
| 5 — Docs, changeset, manual verification     | [phase-5-docs-and-verification.md](./phase-5-docs-and-verification.md) | [ ] not started                                                                                                                                                                                                                                                                                                                                                                                       |

Each phase agent flips its row to `[x] done` (with a one-line result note) in its
final commit.

## The bug report

A user embedded the table and loaded `bugs/scroll/data_with-county_2022.parquet`
(**1,510,911 rows × 9 columns**, 2.8 MB — present locally but **git-ignored** via
`.gitignore`'s `bugs/` entry; it must never be referenced from committed code or
tests). Two symptoms:

1. Dragging the scrollbar to the bottom shows rows that are **not** the actual
   bottom rows.
2. Rapid scrolling shows rendering artifacts: cells display values, the user
   scrolls away and back to the same spot and **different** content is displayed;
   during rapid scrolling cell values visibly change in place.

Neither reproduces at ≤100K rows (the largest committed fixture). Users
increasingly load millions of rows, so the fix targets **50M+ rows**, not just
1.5M.

## Root causes (verified against source; line refs from branch-point `main`)

### Bug 1 — browser max-element-height clamp

`VirtualScroller.setTotalRows` (`src/table/VirtualScroller.ts:295-312`) sets the
scroll spacer to `totalRows × rowHeight` px on both `.dt-virtual-content` and (in
external-scroller mode) `.dt-body`. At 1,510,911 rows × 32 px that requests
**48,349,152 px**. Browsers silently clamp element heights:

- Blink/WebKit (Chrome, Edge, Safari): ≈ **33,554,431 px** (LayoutUnit saturation)
- Gecko (Firefox): ≈ **17,895,697 px**

So Chrome's scrollbar bottoms out at `33,554,432 / 32 ≈ row 1,048,576` — the last
~462K rows are unreachable, exactly matching the report. `calculateVisibleRange`
(`:257`) and `scrollToRow` (`:350-373`, which clamps against the browser-clamped
`contentContainer.offsetHeight`) both assume `scrollTop` and `rowIndex × rowHeight`
live in one coordinate space — false past the clamp. Nothing in `src/`, `docs/`,
or `tests/` handles the limit; `tests/table/VirtualScroller.test.ts:743-762` even
asserts the unclamped `32,000,000px` value (jsdom doesn't clamp).

### Bug 2 — fetch-pipeline races (all latency-scaled)

Row fetches are `ORDER BY … LIMIT n OFFSET k` DuckDB-WASM queries; at k ≈ 1M they
take hundreds of ms, which opens race windows that are invisible at 100K rows:

- **M1 (primary):** `VirtualScroller.updateVisibleRange` (`:225-234`) repositions
  the viewport container **before** notifying `TableBody`. If a fetch is in
  flight, `TableBody.handleScroll` (`src/table/TableBody.ts:519-538`) stores the
  new range in the single-slot `pendingFetch` and **returns without rendering** —
  so rows for the _old_ range are displayed at the _new_ scroll offset (wrong data
  at screen positions) until the slow fetch resolves.
- **M2:** `fetchAndRender`'s `finally` (`:570-578`) replays the _stored_ pending
  range (possibly stale by then) and fabricates
  `offsetY: pending.start * this.rowHeight`.
- **M3:** row fetches never pass an `AbortSignal` (`:621`); superseded queries run
  to completion, serialized behind the `fetchInProgress` gate.
  **M3b (verified in duckdb-wasm dist):** the existing cancel plumbing is inert
  for these queries anyway — `conn.query()` executes via `runQuery`, which
  `cancelSent()`/`cancelPendingQuery` **cannot** interrupt. Real interruption
  requires the `conn.send()` pending-query path; no `conn.send(` exists in `src/`.
- **M4:** `src/worker/worker.ts:17-19` dispatches messages concurrently, but
  `src/worker/dispatcher.ts:33-40` documents serial dispatch and keeps a single
  `inFlight` slot — a `cancel` can match/miss the wrong query on the one shared
  DuckDB connection (`src/worker/duckdb.ts:8`).
- **M5:** `evictDistantRows` (`TableBody.ts:635, :646-660`, cap `MAX_ROW_CACHE =
500`) evicts by distance from the **fetched** range, not the live viewport → can
  evict currently-visible rows, re-triggering fetch churn.
- **M6:** `renderVisibleRows` (`:812-851`) has no branch for "element exists but
  cache entry evicted" → stale painted content persists.
- **M7:** every distinct scroll SQL enters the 100-entry, SQL-keyed `QueryCache`
  LRU (`src/data/QueryCache.ts:29-32`), thrashing header-stats/histogram entries;
  cached arrays are returned by reference.
- **M8:** OFFSET pagination is top-(k+n) in DuckDB → cost grows with scroll depth.
- Secondary: `translateY` values up to 33.5M px hit compositor float32
  quantization (≥1 px steps above ~8.4M px).

A previous flicker bug (non-deterministic ORDER BY ties across overlapping
windows) was already fixed with the `"__rowid__" ASC` tiebreaker
(`TableBody.ts:712-730`); that fix and its regression tests
(`tests/table/TableBody.scrollOverlap.race.test.ts`,
`TableBody.tieBreaker.test.ts`) must be preserved.

## Solution architecture

1. **Scroll-space compression** (Phase 1): cap the physical spacer at
   `MAX_VIRTUAL_HEIGHT = 15,000,000 px`. Below the cap: bit-for-bit identity
   (≤468,750 rows at 32 px — the overwhelmingly common case). Above: a dual-mode
   mapping with a single anchor (`virtualScrollTop`): physical deltas ≤ viewport
   height move **linearly** (wheel/keyboard feel unchanged at any scale); larger
   deltas (scrollbar thumb drags) map **proportionally**; exact reconciliation at
   the top (`scrollTop = 0 → row 0`) and bottom (`scrollTop = maxScroll → last row
fully visible`). Viewport positioned via `style.top` (layout units, exact)
   instead of `transform` (float32).
2. **Worker truthfulness + real cancellation** (Phase 2): explicit serial
   two-priority FIFO in the dispatcher; `cancel` handled out-of-band (queued
   target → free dequeue; running target → genuine interrupt by switching query
   execution to `conn.send()` streaming). `WorkerBridge.query` gains
   `{cache?, priority?}` options.
3. **Fetch-pipeline rewrite** (Phase 3): render on **every** range change
   (placeholders for missing rows — fixes M1); block-quantized fetches (128-row
   aligned) with per-block `AbortController`s and an `epoch` guard; superseded
   blocks aborted; whole-block eviction keyed to the live viewport; scroll SQL
   bypasses `QueryCache`; a `__rowid__` range fast path (`WHERE "__rowid__" >= s
AND "__rowid__" < e`, zonemap-pruned, ~ms at any depth) when no filters and no
   user sort — valid because every loader materializes `__rowid__` densely as
   `row_number() - 1` (`src/worker/loaders/parquet.ts:93`, `csv.ts`, `json.ts`)
   and the derived-column VIEW LEFT-JOINs on it (`src/derived/DerivedColumnManager.ts:938-946`);
   a runtime safety valve falls back to OFFSET if density is ever violated.
   Direction-aware prefetch of one block. Public options `fetchBlockSize`,
   `rowCacheRows`, `prefetch` on `createDataTable()` (maintainer decision).
4. **Proof at scale** (Phase 4): Playwright specs against a deterministic
   1.6M-row table built in-page through public APIs (`bridge.query` generate →
   `bridge.exportToBuffer` parquet → `table.loadData(buffer)` — the exact
   production load path). Oracle: with that data, `data-row-id ===
data-row-index` on every rendered row, always.

Phase 5 updates documentation, adds the changeset, verifies against the real bug
parquet in a live Chrome session, and runs the full PR gate.

## Working agreements (every phase)

- **Branch:** all work happens on `fix-virtual-scroll-large-datasets`. Never
  commit to `main`; do not push or open a PR unless the maintainer asks.
- **Order:** phases run strictly 1 → 5. Verify your prerequisites (listed in your
  phase file) before starting; if a prerequisite is missing, stop and report.
- **Review before editing:** each phase file lists a targeted code review. Do it
  first. Line numbers in these docs were verified at branch time but drift as
  phases land — treat them as anchors, re-locate by symbol name.
- **Tree green at phase end:** at minimum `npm run typecheck`, `npm run lint`,
  `npm run format:check`, `npm run test:coverage`, and `npm run test:browser`
  pass before your final commit (phase files list additions). The full PR gate is
  `npm run lint` · `npm run format:check` · `npm run typecheck` ·
  `npm run test:coverage` · `npm run build` · `npm run size` ·
  `npm run docs:api:check` · `npm run test:browser`.
- **Commits:** per `CONTRIBUTING.md` — imperative mood, sentence case, no
  `feat:`/`fix:` prefixes, subject ≤72 chars, one logical change per commit.
  Commit as you go; suggested messages are in each phase file.
- **`bugs/` is git-ignored.** The real bug parquet is for manual verification
  only (Phase 5). Committed tests use synthetic data.
- **Status:** update your row in the table at the top of this file in your final
  commit.

## Ground truth for the bug parquet (used in Phase 5)

Schema: `stateFips`, `countyFips`, `cause`, `race`, `sex` (strings), `deaths`
(int64), `population`, `crudeRate`, `ageAdjustedRate` (doubles). 1,510,911 rows.

| position         | stateFips | countyFips | cause                | race                                      | sex    | deaths | population  | crudeRate |
| ---------------- | --------- | ---------- | -------------------- | ----------------------------------------- | ------ | ------ | ----------- | --------- |
| 0 (first)        | All       | All        | All                  | All                                       | All    | 608371 | 330399396.0 | 184.1     |
| 755,455 (mid)    | 13        | 13127      | Lymphocytic Leukemia | Native Hawaiian or Other Pacific Islander | Male   | 0      | 47.0        | 0.0       |
| 1,510,908        | 56        | 56045      | Eye and Orbit        | Asian                                     | Male   | 0      | 32.0        | 0.0       |
| 1,510,909        | 56        | 56045      | Eye and Orbit        | Native Hawaiian or Other Pacific Islander | Female | 0      | 0.0         | NaN       |
| 1,510,910 (last) | 56        | 56045      | Eye and Orbit        | Native Hawaiian or Other Pacific Islander | Male   | 0      | 0.0         | NaN       |

Re-derive with:

```bash
python3 -c "import pyarrow.parquet as pq; t=pq.read_table('bugs/scroll/data_with-county_2022.parquet'); print(t.num_rows); print(t.to_pandas().tail(3))"
```

Caution: `crudeRate`/`ageAdjustedRate` are NaN in the last two rows — manual
checks should compare the string/int columns.

## Cross-phase seams

- Phase 1 makes a small **transitional** edit to `TableBody`'s pendingFetch
  replay; Phase 3 deletes that machinery entirely. Both docs say so.
- Phase 3 depends on Phase 2's `QueryOptions` and abort semantics.
- Phase 4's specs must not be written to pass before Phases 1–3 land.

## Accepted risks / known limitations (carry into PR description)

- A trackpad flick whose single-frame delta exceeds the viewport height takes the
  proportional branch (SlickGrid-parity behavior).
- During sustained linear scrolling in compressed mode the thumb position can
  drift from the true proportion (cosmetic; top/bottom reconciliation is exact).
  A `scrollend`-based re-sync is deliberate follow-up work, not in scope.
- `TableContainer.render()` saves/restores raw physical `scrollTop` across
  TableBody rebuilds; in compressed mode a rebuild (e.g. column operations
  mid-table) lands proportionally — rare and bounded.
- Chrome at ≥224% zoom clamps below 15M px; the mapping reads the **measured**
  `scrollHeight` at event time, so it self-corrects. Manual 250%-zoom spot check
  in Phase 5.
- CI runs Chromium only; the 15M px constant was chosen for Gecko's lower limit.
  A manual Firefox check is optional follow-up.
- If `conn.send()` shows result-parity problems for any query shape, Phase 2's
  fallback (queue-only cancellation) still removes most of the latency pathology.
