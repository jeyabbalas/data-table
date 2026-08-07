# Phase 5 — Column-clipped row fetch and cache byte-bounding

Size: **M** · Depends on: **Phases 3–4** (the column window exists and is authoritative) ·
Blocks: **Phase 6** (interaction sweep) and **Phase 10** (hard prerequisite — Parquet
column-chunk pruning needs clipped projections)

---

## 1. Context

Read [`README.md`](./README.md) (whole file) and [`STATUS.md`](./STATUS.md) first — especially
the Phase 3 and Phase 4 handoff notes, which name the column-window accessors this phase consumes.
After Phases 3–4 the DOM renders only the visible column window (+ pinned) behind flexbox spacers,
but every row fetch still `SELECT`s **all** visible columns: 128 rows × 1,001 properties per block
are drained out of Arrow, structured-cloned across the worker boundary, and cached — for a
viewport that renders a few dozen columns. This phase clips the projection to a padded column
window (~25× fewer values per block at WIDE: 1,001 → ≤ ~40–96 columns), teaches the row cache to
merge partially-covered rows, fetches missing columns on horizontal scroll, and byte-bounds both
caches so 1K-column rows cannot blow memory.

Relevant README sections: §5.D last bullet (the fan-out being cut), §5.H (block pipeline, epoch
idiom, test seams), §9 (Arrow IPC deferred — this phase records the evidence for that decision),
Glossary (column window, column oracle, budgets).

## 2. Problem statement

- `buildRowQuery` projects **every** entry of `state.visibleColumns`
  (`src/table/TableBody.ts:972-1001`, projection loop at `:991-1001`). At WIDE that is a
  1,001-column SELECT per 128-row block regardless of what is on screen.
- The worker drains each Arrow result to plain JS objects row by row — `row.toJSON()` +
  `convertBigInts` per row (`src/worker/duckdb.ts:197-220`, conversion loop `:213-219`) — and the
  dispatcher structured-clones the array back (`src/worker/dispatcher.ts:230-242`). ~128K values
  per block today; the transfer/serialization cost scales with columns, not with the viewport.
- `rowDataCache` is keyed by row index with no notion of column coverage
  (`src/table/TableBody.ts:148`), eviction is whole-block by row count only (`:928-961`), and
  block dedupe keys are the block start alone (`:667-686`) — none of it can represent "this row is
  cached for columns 0–95 only".
- `rowCacheRows` (default 2048, `src/DataTable.ts:277-286`) counts rows: 2048 × 1,000 columns ≈
  2M cached values (tens–hundreds of MB) where the same option on a 20-column table holds 40K.
- `QueryCache` is 100 entries LRU with **unbounded bytes** (`src/data/QueryCache.ts:29-32`); one
  accidentally cached wide result is worth thousands of narrow ones. Invalidation is a total flush
  on any of filters/sort/derived/totalRows/tableName (`attachCacheInvalidation`,
  `src/data/QueryCache.ts:114-130`).
- Two subscriptions assume "every column is always fetched" and will silently break under
  clipping: the `visibleColumns` order-only branch re-renders without re-fetching (`:416-425`),
  and the `pinnedColumns` subscription only re-renders sticky styles (`:482-486`). A reorder or a
  pin can now rotate an **uncovered** column into the render need.

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- `src/table/TableBody.ts` — the whole fetch pipeline, in this order: fetch state machine doc
  (`:155-190`), `epoch`/`inFlightBlocks`/`prefetch` fields (`:192-212`), `rowCacheRows` resolution
  (`:271-273`), `visibleColumns` subscription + `sameColumnSet` (`:113-120`, `:416-425`),
  `pinnedColumns` subscription (`:482-486`), `invalidateCacheAndRefresh` (`:587-617`),
  `handleScroll` (`:647-660`), `blockStartOf`/`missingBlocks` (`:667-686`), `ensureFetched`
  (`:699-772`; vertical prefetch candidate `:747-767`), `fetchBlock` (`:793-908`; `cache: false` +
  priority at `:826-829`; stale guard `:834-836`; density valve `:846-869`; cache writes
  `:870-877`), `evictDistantBlocks` (`:928-961`), `buildRowQuery` (`:972-1065`; fast path
  `:1024-1031`; ORDER BY tiebreaker `:1054-1062`), `renderVisibleRows` (`:1112-1230`),
  `isPlaceholderRow` (`:1352-1358`), `updateRowContent` cell loop (`:1408-1530`, per-cell writes
  from `:1469`).
- **Phases 3–4 artifacts via STATUS.md handoffs**: the exact symbol that exposes the body's column
  window (start/end over `visibleColumns` + overscan), how pinned columns are folded in, and the
  moment a window move is committed (that is your fetch trigger). If Phase 3 shipped a
  column-window budget in `DT_BUDGET.COLVIRT`, derive `PROJECTED_COLS_MAX` from it (§4.7).
- `src/worker/duckdb.ts:132-157` (`convertBigInts`), `:197-220` (`executeQueryCancellable`),
  `:222-229` (`__setConnForTests` — the seam the Node spike drives).
- `src/data/WorkerBridge.ts:51-64` (`QueryOptions.cache`), `:69-71` (`WorkerBridgeOptions.cache`),
  `:314-345` (query cache read/write around `sendMessage`), `:418-421` (`clearQueryCache`).
- `src/data/QueryCache.ts` — whole file (130 lines).
- `src/DataTable.ts:225` (`bridgeOptions`), `:263-296` (`fetchBlockSize`/`rowCacheRows`/`prefetch`
  JSDoc — you are amending the `rowCacheRows` interpretation), `:475` (bridge construction).
- Test seams: `tests/helpers/tableBodyHarness.ts` (jsdom harness; captures every SQL),
  `tests/helpers/rowFetchBridge.ts` (`rowsFor` synthesizes **all** provided columns at `:148-166`
  — must become projection-aware, §4.8), `tests/helpers/duckdbNode.ts`, Phase 0's
  `tests/budgets.ts` (`DT_BUDGET.COLVIRT` namespace), `tests/browser/helpers/wideTable.ts`
  (`mountTierTable`, column probe, `sweepHorizontal`), the demo `?gen=` harness + `window.__dtPerf`.
- `docs/performance.md:126-142` ("Query cache") and `:232-261` ("Query cache size", "Scroll fetch
  pipeline") — both sections change. Note `:234` documents `cache: { size: 200 }`; the real field
  is `maxEntries` — fix while there.

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 Fetch column set (padded window) and clipped projection

Define, wherever Phase 3 computes the render window, a **fetch column set**:

- Render need = `windowColumns ∪ pinnedColumns` (names, in `visibleColumns` order).
- Padded window = render window extended by **one full window span on each side** (~3× the
  visible span — generous so horizontal jitter doesn't thrash; tune against baseline, §4.6), then
  **quantized outward to multiples of `COL_QUANTUM = 16`** and clamped to
  `[0, visibleColumns.length)`. Quantization keeps dedupe keys stable while the user wobbles ±1
  column, exactly like 128-row block alignment does vertically.
- Fetch set = `pinned ∪ visibleColumns.slice(qStart, qEnd)`, deduped; `__rowid__` is prepended by
  `buildRowQuery` as today (`:991`).

`buildRowQuery` gains a `fetchColumns: string[]` argument and projects only that (INTERVAL→VARCHAR
cast per projected column preserved, `:995-999`). Fast path, WHERE/ORDER BY/tiebreaker, and LIMIT
shapes are untouched — this phase changes the SELECT list only. `fetchSetId = "${qStart}:${qEnd}"`
namespaces in-flight dedupe: `inFlightBlocks` becomes keyed by `"${blockStart}:${fetchSetId}"`,
cap stays `MAX_INFLIGHT_BLOCK_FETCHES = 2`.

### 4.2 Coverage-tracking row cache — `src/table/RowCache.ts` (new, `@internal`, unexported)

Extract the row store from TableBody into a DOM-free class so the merge logic is directly
property-testable:

```ts
interface CoverageSet {
  readonly id: number;
  readonly names: ReadonlySet<string>;
} // interned
class RowCache {
  get(index: number): RowData | undefined;
  covers(index: number, need: readonly string[]): boolean;
  merge(index: number, row: RowData, coverage: CoverageSet): void; // assign + union
  deleteRow(index: number): void;
  clear(): void;
  readonly size: number; // rows
  readonly cellCount: number; // Σ per-row covered-column counts
}
```

- **Coverage is name-based, interned**: all rows landed by one fetch share a single frozen
  `CoverageSet`; unions are memoized by `(id, id)` pair so per-row memory is one reference. Names
  (not window indices) make coverage immune to `visibleColumns` reorder drift.
- **Merge**: shallow-assign the projected columns onto the existing `RowData`, union coverage. A
  landed fetch asserts coverage **only for columns it actually projected** — a late partial result
  can never mark unfetched columns covered. Merges run after the existing epoch/abort guard
  (`:834-836`), which stays the sole staleness authority; positional (OFFSET-path) keying stays
  valid because any sort/filter change bumps the epoch and clears the cache (`:587-617`).
- **Rejected alternative** (do not build): composite `(row × col-window)` cache keys — duplicates
  storage for pinned/overlap columns, makes "is this row resolved?" a multi-key scan, and turns
  whole-block eviction into cross-product bookkeeping. Record this rejection in code comments.
- **"Resolved for render"**: a row renders fully iff `covers(index, renderNeed)`. `missingBlocks`
  marks a block needed when any row in range is absent **or** fails that test; the resulting fetch
  projects the padded fetch set (a superset of the need).

### 4.3 `rowCacheRows` accounting in cells (~bytes)

Option semantics stay "rows", but eviction switches to **cell-count accounting**: budget =
`rowCacheRows × max(1, renderNeedSize)` cells, compared against `RowCache.cellCount`.
`evictDistantBlocks` keeps its shape — whole-block, furthest-from-viewport first, visible + just-
written blocks exempt (`:928-961`) — but loops until the cell budget is met. On a narrow table
coverage ≡ all columns, so the cap degenerates to exactly `rowCacheRows` rows (existing suites
must pass unchanged); on WIDE, rows that accumulated 2× the need via horizontal sweeps count
double, bounding memory instead of row keys. Cells × ~8–64 B/value is the approximate-bytes story;
counts are asserted (machine-independent), bytes are documentation.

### 4.4 Horizontal-scroll-triggered fetch

When the column window commits a move (Phase 3's recompute), TableBody re-renders immediately —
uncovered cells as per-cell placeholders (§4.5) — then calls `ensureFetched()`. The coverage-aware
`missingBlocks` makes the existing reconciler (`:699-772`) handle both axes: horizontal moves
issue block fetches at `'high'` priority exactly like vertical viewport fetches, same in-flight
cap, same abort/epoch machinery. In-flight abort rule gains one clause: abort when the row range
left the padded row window (existing, `:709-717`) **or** the fetch set no longer intersects the
current padded window (horizontal flight abandoned); partial overlap lands and merges.

The single `prefetch` slot (`:747-767`) becomes axis-aware via a `lastMoveAxis` field: after a
vertical move, today's candidate (next row block × current fetch set, `'normal'` priority); after
a horizontal move, the topmost visible block × the next `COL_QUANTUM`-aligned window step in that
direction. Still exactly one speculative fetch, still aborted on direction change or on becoming a
visible need (`:723-733`).

### 4.5 Per-cell placeholder semantics

Whole-row placeholders (`data-placeholder`, `:1352-1358`) remain for **absent** rows only. A
present row with partial coverage renders as a data row in which each uncovered cell gets class
`${classPrefix}-cell--pending`, attribute `data-pending`, `aria-busy="true"`, and empty text;
`updateRowContent` clears all three when coverage arrives. The row is never demoted: `data-row-id`
/ annotations / selection styling all key off already-covered `__rowid__`. Extend the fetch state
machine doc block (`:155-190`) with the per-cell coverage dimension. Add a minimal
`.dt-cell--pending` style in `src/styles/` (subtle shimmer/dim; run `npm run check:css-vars` if
you add variables).

Two subscriptions must now reconcile coverage instead of assuming it (§2 last bullet): the
order-only `visibleColumns` branch (`:420-421`) and the `pinnedColumns` subscription (`:482-486`)
each add a `void this.ensureFetched()` after their re-render. No epoch bump — cached names stay
valid; the reconciler tops up whatever the rotation/pin exposed.

### 4.6 Projection-cost spike and serialization-share measurement (evidence for README §9)

Before optimizing, validate the win end-to-end: `tests/performance/projection.duckdb.test.ts`
(`RUN_DUCKDB_PERF=1`-gated, per `tests/performance/benchmarks.duckdb.test.ts:10-12` rationale)
builds a 1,000-col × 20K-row table via `tierTableSQL` on `tests/helpers/duckdbNode.ts`, installs
the connection with `__setConnForTests`, and times 128-row blocks through the **real**
`executeQueryCancellable`: (a) full 1,001-column projection vs (b) a ~41-column clipped one,
splitting `conn.send()` resolution (execution) from the batch-drain loop (serialization). Record
absolute ms, the ratio, and the drain share. Expected ≥ ~10× total; if the drain dominates
regardless, record the numbers — the structured-clone size win stands either way. These numbers +
the browser-side before/after block latency (§6) are the evidence the Arrow-IPC deferral
(README §9) demands. Use them to tune the pad factor: if clipped fetches are cheap, keep 3×; only
shrink toward 2× if baseline shows padding cost, and record the choice.

### 4.7 QueryCache byte cap — `src/data/QueryCache.ts`

Add `maxBytes` to `QueryCacheOptions` (approximate, default **32 MiB**), reachable through the
existing `bridgeOptions.cache` (`src/DataTable.ts:225`, `WorkerBridge.ts:69-71`) with no new
plumbing. At `set()`: estimate entry size (JSON length × 2 of up to the first 32 rows, scaled by
`rows / sampled`, + 64 B/row overhead; try/catch → fallback `rows × cols × 16`); skip storing
entries whose lone estimate exceeds `maxBytes`; maintain `totalBytes`; after insert, evict
LRU-first while over budget. `maxEntries` and TTL semantics unchanged; `maxEntries: 0` still
disables. Expose `approxBytes` (getter) for tests. **Keep the total flush** in
`attachCacheInvalidation` (`:114-130`) — correct and cheap; note per-table/per-column tag
invalidation as a future refinement in a comment, and do **not** build it now (scope control).

### 4.8 Budgets (`DT_BUDGET.COLVIRT.*`) and test-double updates

- `COLVIRT.PROJECTED_COLS_MAX` — ceiling on any captured block-fetch SELECT-list length: quantized
  padded window (≤ 3× render window, rounded up to `COL_QUANTUM`) + pinned + 1 (`__rowid__`).
  Provisional **96**; compute from Phase 3's actual window + overscan and record the real value.
- `COLVIRT.BLOCK_VALUES_MAX = PROJECTED_COLS_MAX × 128` — cap on `rows × properties` of one block
  payload, asserted in the jsdom harness against synthesized results.
- `COLVIRT.QUERIES_PER_WINDOW_MOVE_MAX` — high-priority fetches per single horizontal window move:
  visible blocks + 1; provisional **4**.
- `rowFetchBridge.ts`: add a `projectedColumns(sql)` parser (read the SELECT list) and make
  `rowsFor` synthesize **only** the projected columns — otherwise every jsdom test would hide
  under-projection bugs by handing back full rows. Keep `rowAt` for callers that build full rows.

Fallback (README §8.2): if Phase 3/4 shipped no reusable window accessor, derive the window inside
TableBody from `scrollLeft` + `columnWidths` behind one private function and flag the duplication
in STATUS.md for Phase 6 — do not redesign Phase 3's ownership in this phase.

## 5. Implementation milestones (commit at each)

1. Projection spike: `tests/performance/projection.duckdb.test.ts` + numbers in STATUS.md. —
   _commit: "Measure projection and drain cost for clipped row fetches"_
2. `src/table/RowCache.ts` with **property-style tests first** (riskiest assumption): randomized
   interleavings of merge(A-cols)/merge(B-cols)/evict/clear against a model Map, asserting
   union-coverage, never-invented-coverage, whole-row eviction, exact `cellCount`. —
   _commit: "Add a coverage-tracking row cache with cell-count eviction"_
3. Clip `buildRowQuery` to the fetch set; fetch-set computation + quantization; dedupe keys;
   TableBody on RowCache; cell-budget eviction; harness tests assert SELECT lists + payload cells.
   — _commit: "Clip row fetch projections to the padded column window"_
4. Horizontal reconcile: window-move trigger, per-cell pending placeholders, order-only/pin
   subscription fixes, axis-aware prefetch; interleaved vertical+horizontal jsdom scripts with
   aborted fetches (oracle-checked), browser `wideTable` diagonal spec. —
   _commit: "Fetch missing columns when the column window moves"_
5. QueryCache `maxBytes` + unit tests + `docs/performance.md` cache sections + JSDoc/API
   snapshot/changeset. — _commit: "Bound the query cache by approximate bytes"_
6. Gated perf runs; re-capture WIDE (viz on+off) and GRID baselines (append-only); serialization
   share recorded; docs scroll-pipeline section updated. —
   _commit: "Re-capture WIDE and GRID baselines after projection clipping"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage
npm run build && npm run size
npm run docs:api:check
npm run test:browser                   # includes tiers.smoke + the new diagonal spec
RUN_DUCKDB_PERF=1 npx vitest run tests/performance/projection.duckdb.test.ts
RUN_BROWSER_PERF=1 npx playwright test tests/browser/tiers.full.spec.ts
npm run perf:baseline && npm run perf:baseline:report
```

Phase-specific asserts (default runs, machine-independent):

- Captured block-fetch SQL at wide harness configs: SELECT-list length ≤
  `DT_BUDGET.COLVIRT.PROJECTED_COLS_MAX`, **strictly less than** the total column count (never all
  1,000/300), and always ⊇ {window columns, pinned, `__rowid__`}; payload cells ≤
  `COLVIRT.BLOCK_VALUES_MAX`.
- Coverage merge: fetch A-cols then B-cols → row renders the union; eviction drops whole rows;
  `cellCount` exact; narrow-table suites (races, eviction, density valve) pass **unchanged**.
- Interleaved scroll scripts (vertical + horizontal + aborts): 0 row-oracle and 0 column-oracle
  violations; pending markers only on uncovered cells; no cell ever shows another column's value.
- Epoch/abort races: a late partial fetch from an old epoch writes neither data nor coverage; an
  aborted horizontal fetch leaves rows unresolved and the reconciler re-issues them; one
  horizontal window move issues ≤ `COLVIRT.QUERIES_PER_WINDOW_MOVE_MAX` high-priority queries.
- QueryCache: over-budget insert evicts LRU-first; oversized entry not stored; `approxBytes`
  tracks set/evict/clear; `maxEntries`/TTL behavior unchanged; `maxEntries: 0` still disables.

Gated asserts: WIDE block-fetch wall time and payload bytes improve versus the Phase 3/4 baseline
by at least the spike-predicted ratio (cite the baseline JSON in STATUS.md); serialization share
recorded before/after; GRID unregressed (aspect-ratio control, README §6).

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with
`{{TIER}} = wide`, `viz=on`, `{{READY_BUDGET_MINUTES}}` from the latest WIDE baseline;
`{{QUERY_BUDGET}}`/`{{DOM_BUDGET}}` from `DT_BUDGET` as tightened by Phases 2–4;
`{{SORT_COL}} = col_1`. Phase adjustments:

- Step 4/8 placeholder selector becomes
  `'.dt-root [data-placeholder], .dt-root .dt-cell[data-pending]'` — per-cell pending markers must
  also clear after settle.
- Step 5 (horizontal sweep) is load-bearing: at each stop, one sampled resolved cell must match
  `cellOracle` for its (row, column) — wrong-column data is an instant fail.
- **Phase step 5b — diagonal stress**: reset stats, then drive `scrollTop` and `scrollLeft`
  together (5 alternating steps of ~½ viewport each, ~1 s apart), ending mid-table. Assert after
  settle: zero stuck placeholders/pending cells; 3 column-oracle spot checks pass; `heapMB` within
  the same order of magnitude as the post-load snapshot after a long sweep (no monotone growth);
  then one isolated single-window horizontal move: query-count delta ≤
  `COLVIRT.QUERIES_PER_WINDOW_MOVE_MAX`.
- Steps 6–10 as templated (sort/filter/column ops/export/theme). Step 8's pin must resolve the
  newly pinned column's cells without a full-viewport refetch (watch the query-count delta).

Attach the final `window.__dtPerf.refresh()` snapshot + 3 screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green; `npm run size` unaffected beyond noise.
- [ ] No wide-table block fetch ever projects all columns (harness-asserted, budget-enforced).
- [ ] Partial-row merge proven by property tests written **before** the TableBody wiring landed.
- [ ] Narrow-table fetch-pipeline suites pass without modification (behavioral no-op below one
      window of columns).
- [ ] Spike + browser numbers recorded; Arrow-IPC deferral evidence (serialization share
      before/after) written into STATUS.md and `docs/performance.md`.
- [ ] WIDE + GRID baselines re-captured and committed (append-only) with before/after deltas.
- [ ] Chrome template + diagonal stress executed; evidence attached to STATUS.md.
- [ ] Changeset + JSDoc + API snapshot + docs updates per §10.
- [ ] STATUS.md row + handoff filled per §11.

## 9. Out of scope

Sorted-path query shape (keyset/rank pagination — Phase 7); Arrow IPC transport (deferred,
README §9 — only the measurement lands here); per-entry cache tagging / partial invalidation
(future refinement note only); header windowing changes (Phase 4); column picker and interaction
polish (Phase 6); `VirtualScroller` changes; any loader or worker-dispatcher changes beyond the
spike's test seam usage.

## 10. Docs / changeset obligations

- **Patch changeset** (internal perf): `Changed` — row fetches now project only the padded visible
  column window; `rowCacheRows` documented as a cell-budget multiplier (`rows × current render
need`) rather than a raw row-key cap; `Added` — `cache.maxBytes` (default 32 MiB) on
  `QueryCacheOptions`. No migration required; narrow tables behave identically.
- JSDoc: `DataTable.ts` `rowCacheRows` (`:277-286`) and `QueryCacheOptions` — then
  `npm run docs:api:check` / regenerate; API-surface snapshot diff must contain only the intended
  `QueryCacheOptions.maxBytes` (+ any `@internal` `__`-prefixed seams).
- `docs/performance.md`: "Scroll fetch pipeline" (`:238-261`) gains the clipped-projection model,
  measured payload before/after numbers, and the Arrow-deferral evidence note; "Query cache size"
  (`:232-236`) documents `maxBytes` and fixes the pre-existing `{ size: 200 }` →
  `{ maxEntries: 200 }` error.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: spike numbers (execution vs drain ms, clipped
ratio) and browser before/after block latency + payload bytes; the pad factor and `COL_QUANTUM`
shipped; final `COLVIRT` budget values (`PROJECTED_COLS_MAX`, `BLOCK_VALUES_MAX`,
`QUERIES_PER_WINDOW_MOVE_MAX`); files created (`src/table/RowCache.ts`, spike test, diagonal
spec); the `buildRowQuery` signature change and the fetch-set function name/location — **Phase 7
reshapes the sorted path around it and Phase 10 reuses it for Parquet column-chunk pruning**; any
line drift in `TableBody.ts` regions Phase 6 touches (resize/pin/keynav); serialization share
after clipping and the resulting recommendation on the Arrow-IPC deferral (README §9 says
re-evaluate only if still > 20% of block latency).
