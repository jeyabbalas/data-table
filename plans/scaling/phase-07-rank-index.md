# Phase 7 — Deep sorted/filtered scrolling: rank index + count strategy

Size: **M/L** · Depends on: **Phase 0** (DEEP tier, budgets, perf harness), **Phase 1** (load
path/progress) · Independent of Phases 3–6 · Blocks: **Phase 10** (reuses the index build
contract), **Phase 11** (may reuse the index for export)

---

## 1. Context

Read [`README.md`](./README.md) (whole file) and [`STATUS.md`](./STATUS.md) first. This phase
makes sorted and/or filtered scrolling on a 5M-row table O(block) at any depth by materializing a
`__rowid__` → rank temp table per sort/filter epoch, and stops rapid filter changes from queuing
one full-table `COUNT(*)` scan each. It is README hazard §5.E plus the count half of §5.A, built
on the assets in §5.H (block fetch pipeline, epoch guard, dispatcher cancellation, `__rowid__`
tiebreaker discipline).

**The go/no-go spike in §4.1 is implementation step 1. Do not touch `src/` before the spike has
run and its findings are recorded** — the whole design rides on DuckDB-WASM-representative
numbers for rank-index build and rank-range fetch at 5M rows.

## 2. Problem statement

- Sorted or filtered block fetches emit `ORDER BY <sortcols>, "__rowid__" ASC LIMIT 128 OFFSET k`
  (`src/table/TableBody.ts:1054-1062`) — a top-(k+128) sort of the whole table **per 128-row
  block**, growing with scroll depth. The code comment at `TableBody.ts:1020-1023` explicitly
  defers keyset pagination as future work. The unsorted path is fine: `__rowid__` range +
  zonemaps (`:1024-1031`) with a density valve (`:838-869`).
- Every filter write triggers an immediate
  `SELECT COUNT(*) as cnt FROM <table> WHERE <filters>`
  (`src/visualizations/CrossfilterCoordinator.ts:157`) with no abort signal and no debounce
  (`:148-165`, subscription at `:66`) — N rapid filter changes queue N full scans behind the
  serial worker; the `filterSequence` guard (`:53,160`) only drops stale _results_, not the work.
- Export batching re-sorts per 10K-row batch too (`src/export/ExportQuery.ts:212-245`) — that is
  **Phase 11**; this phase only leaves the reuse note (§9).

At DEEP tier (Phase 0 baselines) each deep sorted block is a multi-second stall; a scrollbar
drag issues several of them.

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- `src/table/TableBody.ts` — the fetch pipeline end to end: `epoch` (`:199`, the guard you
  reuse), `useRowidFastPath` (`:780-782`), `ensureFetched` (`:699-772`), `fetchBlock`
  (`:793-908`; the `cache: false, priority` query call at `:826-829`, cache keying `:870-877`,
  identity-guarded deregister `:893-901`), `buildRowQuery` (`:972-1065`; INTERVAL→VARCHAR cast
  `:995-999`, tiebreaker rationale `:1041-1060`), `invalidateCacheAndRefresh` (`:587-617`), the
  sort/filter/tableName subscriptions (`:429-434`, `:437-459`, `:523-528`) and the 300 ms
  filter scroll-to-top animation (`:547-582`).
- `src/visualizations/CrossfilterCoordinator.ts` — whole file (176 lines). Note
  `syncExistingFilters` (`:86-94`) is awaited during `loadData`, and `onFilterCycleComplete`
  must fire **after** the count settles — `src/DataTable.ts:630-645` builds the public
  `filterChange` payload from it (comment at `:712`).
- Brush batching (verify the premise): histogram brushes commit their filter **only at mouseup /
  slide end** (`src/visualizations/histogram/SharedHistogramBase.ts:1238-1273`) — the count
  debounce targets rapid successive commits (chips, panel apply, undo), not drag frames.
- `src/worker/dispatcher.ts` — `query` tasks run via `executeQueryCancellable` (`:230-255`);
  `handleCancel` (`:405-444`): queued targets dequeue free, the running `query` is genuinely
  interrupted via `conn.cancelSent()` (`:429-440`). `src/worker/duckdb.ts:197-220` — the
  pending-query path; one module-level connection (`:47`), so a TEMP table created by one
  `query` message is visible to every later query and dies with the connection.
- `src/data/WorkerBridge.ts` — `query()` (`:314-345`): only SELECTs are cached (`:321-322`), so
  a CTAS through `bridge.query` cannot pollute the cache; abort posts a targeted cancel.
- `src/derived/DerivedColumnManager.ts:908-978` — `recreateView` CTE structure, vector join on
  `__rowid__` at `:944`. `state.tableName` points at this VIEW when derived columns exist.
- `src/export/ExportQuery.ts:97-103` — `buildOrderByClause` is the tiebreaker idiom your rank
  `OVER (ORDER BY …)` must mirror. `src/filters/FilterSQL.ts:235` — `filtersToWhereClause`.
- A11y plumbing for the affordance: polite live regions + `announce` wiring
  (`src/table/TableContainer.ts:337-356,434`); announce-once precedent
  `src/table/ColumnHeader.ts:126-133`.
- Test seams: `tests/helpers/duckdbNode.ts` + `tests/helpers/nodeBridge.ts` (Node DuckDB),
  `tests/helpers/tableBodyHarness.ts` (captures every SQL — your shape asserts),
  `tests/table/rowidFastPath.duckdb.test.ts` + `tests/table/TableBody.fastPathSql.test.ts` (the
  shape-vs-semantics pairing you copy), `tests/performance/benchmarks.duckdb.test.ts:41-44`
  (`RUN_DUCKDB_PERF` gate pattern; `vitest.perf.config.ts` includes `tests/performance/**`).
- Phase 0 deliverables you consume: `tests/fixtures/tiers.ts` (`TIERS.deep` = 20 × 5,000,000,
  `tierTableSQL`, `cellOracle`), `tests/budgets.ts` (`DEEPROWS` namespace), the demo `?gen=`
  harness + `#dt-perf-panel`, `tests/browser/tiers.full.spec.ts`, `plans/scaling/baselines/`
  (DEEP `oneSortMs` and sorted-scroll numbers). Re-read Phase 0/1 handoff notes for drift.

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 Go/no-go spike — `tests/performance/rankIndex.duckdb.test.ts` (new; STEP 1, no `src/` changes)

Gated `RUN_DUCKDB_PERF=1` (copy the `describeIfPerf` pattern); generous `beforeAll` timeout; it
doubles later as this phase's standing perf gate. Setup: `createNodeDuckDB()`, then
`tierTableSQL(TIERS.deep, 't')` (5M rows), plus a derived-shaped VIEW `t_view` mirroring
`recreateView` (base CTE + expression layer + sparse `__rowid__` LEFT-JOIN helper — crib from
`rowidFastPath.duckdb.test.ts`). Measure median of 3 after 1 warmup via `performance.now()`:

- **(a) OFFSET baseline** — block at depth:
  `SELECT * FROM t ORDER BY "col_1" ASC, "__rowid__" ASC LIMIT 128 OFFSET 4900000`.
- **(b) rank build** —
  `CREATE OR REPLACE TEMP TABLE __dt_rank AS SELECT "__rowid__", row_number() OVER (ORDER BY "col_1" ASC, "__rowid__" ASC) - 1 AS "rank" FROM t ORDER BY "rank"`
  (0-based so rank ≡ positional index; `ORDER BY "rank"` makes insertion order monotone so
  zonemaps prune rank-range scans — DuckDB preserves insertion order by default).
- **(c) rank-join fetch** —
  `SELECT t.* FROM t JOIN __dt_rank r USING ("__rowid__") WHERE r."rank" >= 4900000 AND r."rank" < 4900128 ORDER BY r."rank"`.
- **(d) two-step fallback** — `SELECT "__rowid__" FROM __dt_rank WHERE "rank" >= … ORDER BY
"rank"`, then `SELECT * FROM t WHERE "__rowid__" IN (<128 ids>)`, client-reordered by rank.
- **Variants**: (b)/(c) with a filter (`WHERE "col_12" = 'a'` or a `col_2` range, both from the
  tier's column classes); (b)/(c) over `t_view` (derived pushdown check); a mid-depth block
  (rank 2,500,000) for shape sanity.
- **Count timing**: filtered `SELECT COUNT(*)` on `t` at 5M — decides §4.5's approx-count
  question.
- **Cancellation probe**: start (b), `cancelSent()` mid-flight, then assert `__dt_rank` is
  absent from `duckdb_tables()` (CTAS is transactional — verify, don't assume).

**GO criteria: (c) or (d) beats (a) at depth by ≥5× AND the 5M build (b) completes ≤ ~5 s**
(base table; record the view number separately). Record every number in a new
`### 4.8 Spike findings` section you append to this doc, and in STATUS.md.

**If NO-GO**: do not build the index. Fallback design (record the decision + numbers): keyset
pagination for single-column sorts — remember the last delivered `(sortValue, __rowid__)` pair
per direction and fetch the next block with a row-value comparison
(`WHERE ("col", "__rowid__") > (v, id) ORDER BY … LIMIT 128`), which serves sequential scrolling
only; random scrollbar jumps and multi-column sorts stay on documented OFFSET with the §4.4
affordance. Milestones 2–4 then implement that instead; §4.5 (count) and §4.4 (affordance) land
unchanged.

### 4.2 Rank SQL builders — `src/table/rankIndex.ts` (new)

Pure, dependency-light functions (unit-testable; no TableBody imports):

- `rankIndexName(instanceId: string): string` — `__dt_rank_<sanitized-id-or-'default'>`
  (strip to `[A-Za-z0-9_]`; always emitted through `quoteIdentifier`).
- `buildRankIndexSQL(relation: string, sortColumns: SortColumn[], filters: Filter[], name: string): string`
  — the §4.1(b) shape: `CREATE OR REPLACE TEMP TABLE <name> AS SELECT "__rowid__",
row_number() OVER (ORDER BY <sort parts>, "__rowid__" ASC) - 1 AS "rank" FROM <relation>
[WHERE filtersToWhereClause(filters)] ORDER BY "rank"`. The `__rowid__` tail is skipped only
  when the user already sorts on `__rowid__` — mirror `buildOrderByClause`
  (`ExportQuery.ts:97-103`) exactly (README §5.H determinism). **Contract (stated in JSDoc,
  load-bearing for Phase 10): `relation` is any FROM-able relation name — base table, derived
  VIEW, or a Phase-10 `read_parquet` view — the builder never assumes a physical table.**
- `buildRankBlockSQL(relation, projection: string, name, blockStart, limit): string` — the
  spike's winning fetch shape, (c) or (d); `projection` is the caller-built column list so
  `buildRowQuery`'s INTERVAL casts (`TableBody.ts:995-999`) apply unchanged.
- `dropRankIndexSQL(name): string`.
- Always quote `"rank"` (window-function keyword). `"rank"` is never added to the row cache or
  projection handed to rendering.

Memory: 5M × two BIGINTs ≈ 80 MB plus overhead — acceptable against the ~3.2 GB practical
ceiling next to DEEP's ~1 GB table; document it (§10). If the spike says it matters, `CAST` both
to INTEGER (valid ≤ 2³¹ rows) and record.

### 4.3 Lifecycle in TableBody (build on epoch change only; scroll never rebuilds)

New private state:
`rankIndex: { key: string; name: string; state: 'building' | 'ready'; controller: AbortController } | null`,
where `key` is a stable serialization of `{ tableName, sortColumns, filters }` — the sort/filter
epoch identity. Decision predicate: `useRankIndex()` = NOT `useRowidFastPath(…)` AND
`state.totalRows.get() >= DT_BUDGET.DEEPROWS.RANK_MIN_ROWS` (start at 200_000; adjust from the
spike's crossover and record).

- **Fetch-time reconcile** (in `fetchBlock`/`buildRowQuery`, driven by the same reads at
  `:808-818`): key matches + `ready` → rank-range SQL; key matches + `building` → today's
  LIMIT/OFFSET (scrolling stays live during the build); key mismatch → kick off a build and use
  OFFSET meanwhile. Below threshold → OFFSET always (index not worth it; assert both branches).
- **Build**: abort any previous build controller, fire-and-forget `dropRankIndexSQL` for a
  superseded table, then `bridge.query(buildRankIndexSQL(…), controller.signal, { cache: false, priority: 'normal' })`
  — normal priority lets queued `'high'` viewport fetches run first; once the CTAS is _running_,
  the serial queue stalls behind it (README §3) up to the build budget — the §4.4 affordance
  covers exactly that window, it happens **once per sort/filter change**, and it replaces
  today's multi-second cost on _every_ deep block. On resolve, identity-guard on the controller
  (`fetchBlock`'s finally idiom, `:893-901`) and mark `ready`. **Do not invalidate on ready** —
  OFFSET and rank paths return identical windows (same total order, same tiebreaker): cached
  blocks stay valid and the shape switches on the next fetch. No flicker, no refetch storm.
- **Rebuild/drop triggers**: only a key change — sort, filter, or `tableName` write (derived
  VIEW create/drop, table swap). `invalidateCacheAndRefresh` itself does NOT touch the index
  (pin/visibleColumns/totalRows churn keeps it). Returning to the fast path, and `destroy()`,
  abort + eagerly drop (fire-and-forget; the TEMP table dies with the connection anyway, but
  eager drop frees ~80 MB now).
- **A new sort while building aborts and restarts**: the key mismatch at the next fetch does
  both; the abort genuinely interrupts the running CTAS (§3 dispatcher notes).
- Cache keying (`blockStart + i`), row-cache epoch invalidation, prefetch, dedupe, and the
  density valve all stay untouched.

### 4.4 Build affordance + cancellation surface

- TableBody sets `data-dt-rank-state="building" | "ready"` on its container while an index
  exists, and dispatches a bubbling `CustomEvent('dt-rank-index', { detail: { state, ms? } })`
  on it (`building` / `ready` / `cancelled`). Not part of the typed public event map — no
  api-surface change.
- TableContainer listens for that event and routes the existing polite `announce()`
  (`TableContainer.ts:434`) with new `Strings.a11y` entries (e.g. `sortIndexBuilding`,
  `sortIndexReady`) following the `columnWidthAnnouncement` pattern — announced at build
  start/end, never per poll. Follow the existing Strings merge conventions; if adding keys moves
  the api-surface snapshot, the diff must be only those entries (update `docs/guides/i18n.md`).
- No spinner UI this phase: the sort badge already flips instantly (state-driven); the data
  attribute is the styling hook for hosts. Anything more is Phase 12 polish.

### 4.5 Count strategy — CrossfilterCoordinator

Debounce + single-in-flight-with-abort for `updateFilteredRowCount` (`:148-165`):

- Members: `countTimer`, `countController`. On each filter cycle with filters present: abort the
  in-flight count (targeted cancel — dequeues or genuinely interrupts the running scan), clear
  the timer, schedule the COUNT after `DT_BUDGET.DEEPROWS.COUNT_DEBOUNCE_MS` (150–250 ms; pick
  and record). Issue with `bridge.query(sql, controller.signal)` — keep result caching (repeat
  filter sets hit the SQL cache). The `filterSequence` guard stays.
- **Contract preserved**: `onFiltersChanged`'s `Promise.all` (`:119`) must still resolve only
  after the _final_ scheduled count settles (or the cycle is superseded), so
  `onFilterCycleComplete` → the public `filterChange` payload (`DataTable.ts:630-645`) never
  carries a stale count. Superseded cycles resolve silently — the `seq` check at `:125` already
  handles emission.
- `syncExistingFilters` (`:86-94`) bypasses the debounce (immediate count) — `loadData` awaits
  it.
- The ~200 ms later `filteredRows` write only delays the scroller-extent update
  (`TableBody.ts:462-469`), which the 300 ms filter scroll-to-top animation already masks.
- **No two-tier approx count now** — debounce+abort first; adopt approx only if the spike's 5M
  COUNT timing dominates a filter cycle (> ~1 s); record the decision either way. Viz refresh
  fan-out (`runLimited`, cap 4) is Phase 2 turf — untouched here.

### 4.6 Verification seams

SQL-shape budgets run in the default suite via `tableBodyHarness` captured SQL (no wall-clock):
`DT_BUDGET.DEEPROWS.SORTED_SCROLL_NO_OFFSET` — with a ready index, sorted/filtered block SQL
contains no `' OFFSET '`; while building or below `RANK_MIN_ROWS`, it does (assert both
branches). Wall-clock budgets (`DEEP_FIRST_SORT_MS`, `DEEP_SORTED_BLOCK_MS`) live only in the
`RUN_DUCKDB_PERF` spike file (§6). Parity of rank vs OFFSET windows is proven on real DuckDB at
a 50K-row micro tier in the default run (the `rowidFastPath.duckdb.test.ts` pairing pattern).

### 4.7 Risk notes / fallbacks

- **CTAS stalls the serial queue**: bounded by the build budget, announced, once per epoch, and
  abortable by the next sort. If the spike's build exceeds ~5 s on the base table, that is the
  NO-GO branch — do not ship a worse-feeling first sort.
- **Cancelled build leaves a half table**: the spike's cancellation probe must show it doesn't;
  if DuckDB ever leaves one, `CREATE OR REPLACE` on the next build self-heals — still record it.
- **Zonemap pruning doesn't materialize on the join (c)**: use two-step (d); if neither beats
  OFFSET ≥5×, NO-GO.
- **Derived VIEW build much slower than base-table build**: keep the base-table budget; record
  the view number separately; if pathological, note for Phase 10 (whose Parquet-backed views
  differ anyway).
- **`filteredRows` vs rank cardinality**: the ready index's row count equals the filtered count
  — a free cross-check (Phase 10/11 asset) — but `filteredRows` stays owned by the coordinator's
  COUNT path this phase. Do not wire the index into state counts.

## 5. Implementation milestones (commit at each)

1. **Spike (no `src/` changes)**: `tests/performance/rankIndex.duckdb.test.ts` with all §4.1
   measurements as budget-asserting tests; append the `### 4.8 Spike findings` table to this doc
   and to STATUS.md; state GO or NO-GO explicitly. — _commit: "Add rank index go/no-go spike and
   record findings"_. **Stop and re-plan against §4.1's fallback if NO-GO.**
2. `src/table/rankIndex.ts` + `tests/table/rankIndex.test.ts` (golden SQL shapes; tiebreaker
   skipped when user sorts `__rowid__`; name sanitization) +
   `tests/table/rankIndexParity.duckdb.test.ts` (default-run, 50K rows: rank-path windows ≡
   OFFSET-path windows, on the base table AND a derived-shaped view, ties included). — _commit:
   "Add rank index SQL builders with parity tests"_
3. TableBody lifecycle + `buildRowQuery` integration + jsdom tests via the harness: shape
   asserts both branches; sort change mid-scroll → old build aborted, stale results dropped,
   exactly one rebuild; scroll during `building` uses OFFSET then switches without invalidation;
   drop on fast-path return and destroy. — _commit: "Fetch sorted blocks through a materialized
   rank index"_
4. Affordance + cancellation surface: `data-dt-rank-state`, `dt-rank-index` CustomEvent,
   announce wiring + Strings entries, tests (event sequence; announcement text; attribute
   lifecycle). — _commit: "Announce rank index builds and cancel superseded ones"_
5. Coordinator count debounce + abort + tests (fake timers: N rapid filter writes → ≤ 2 COUNT
   queries, last wins; `filterChange` fires once with the final count; `syncExistingFilters`
   immediate). — _commit: "Debounce filtered row counts with single-flight abort"_
6. Budgets (`DEEPROWS.*` values), DEEP additions to `tests/browser/tiers.full.spec.ts`, re-run
   DEEP baselines (append-only JSON + report), docs + changeset (§10). — _commit: "Record deep
   sorted-scroll budgets and baselines"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage                  # shape budgets, parity, epoch + debounce tests
npm run build && npm run size
npm run docs:api:check
npm run test:browser
RUN_DUCKDB_PERF=1 npx vitest run --config vitest.perf.config.ts tests/performance/rankIndex.duckdb.test.ts
RUN_BROWSER_PERF=1 npx playwright test tests/browser/tiers.full.spec.ts
npm run perf:baseline && npm run perf:baseline:report   # DEEP tier re-capture
```

Phase-specific asserts: `SORTED_SCROLL_NO_OFFSET` plus the OFFSET-while-building /
below-threshold branches; parity suite green including the derived view; count debounce ≤ 2
queries per burst, last wins; RUN-gated `DEEP_FIRST_SORT_MS ≤ 5000` (5M build) and
`DEEP_SORTED_BLOCK_MS ≤ 100` (block at rank 4.9M) with the OFFSET baseline (a) recorded
alongside; Playwright DEEP scenario — sort `col_1`, jump the scrollbar to ~97%, rows resolve
within budget with sampled `col_1` values monotonic (the row oracle is invalid while sorted);
DEEP baseline JSON committed showing before → after `oneSortMs` / sorted-scroll numbers.

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with
`?gen=deep&viz=on` (20 × 5M; `READY_BUDGET_MINUTES` from the Phase 0 DEEP baseline). Deltas from
the template:

- Step 4 as written (unsorted row oracle must still hold; screenshot at depth).
- Step 6 (the heart): sort `col_1` (double). Assert the building affordance appears
  (`document.querySelector('[data-dt-rank-state]')?.dataset.dtRankState === 'building'`, live
  region text updated) and settles to `ready` within the build budget order of magnitude. Then
  drag the scrollbar to ~97% depth: rows resolve without multi-second stalls; sampled `col_1`
  values non-decreasing top→bottom. Sort again to invert (assert abort+rebuild: state returns to
  `building` once); clear sort.
- Step 7: with the sort active, brush a histogram range on `col_2`. Assert the chip appears, the
  count settles once (debounced — remove/re-add the chip quickly and watch for a single final
  count), and sort+filter scrolling stays smooth after the rebuild completes.
- Extra step: clear sort and filter → fast path returns (`data-dt-rank-state` removed; scrolling
  instant; row oracle valid again). Steps 9–12 as written; zero new console errors across the
  session. Attach the final `window.__dtPerf.refresh()` snapshot + screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] Spike ran **first**; findings table + GO/NO-GO recorded in this doc and STATUS.md (with
      the NO-GO fallback decision written down if taken).
- [ ] All §6 commands green; library size budgets hold.
- [ ] Sorted/filtered block SQL provably OFFSET-free when the index is ready; OFFSET branches
      (building, below threshold) provably intact.
- [ ] Rank order deterministic: `__rowid__` tiebreaker inside the rank `OVER`, parity with the
      OFFSET path proven on real DuckDB including a derived VIEW.
- [ ] Sort change mid-build aborts and rebuilds exactly once; destroy drops the temp table;
      scroll never triggers a rebuild.
- [ ] Count debounce: rapid filter bursts issue ≤ 2 COUNTs, `filterChange` carries the final
      count, load-time sync path un-debounced.
- [ ] `buildRankIndexSQL` documents and honors the any-FROM-able-relation contract (Phase 10).
- [ ] DEEP baselines re-captured and committed; before → after sorted-scroll numbers in
      STATUS.md.
- [ ] Chrome template executed with the §7 deltas; evidence attached.
- [ ] STATUS.md row + handoff filled.

## 9. Out of scope

Selection model (Phase 8). Export throughput (Phase 11 — `ExportQuery.fetchBatchedRows` still
re-sorts per batch; leave a short comment there naming the rank index as the Phase 11 reuse
candidate, change nothing else). Direct-scan mode (Phase 10 — but the §4.2 relation contract is
designed for it; do not narrow it to physical tables). Approx/two-tier counts unless the spike
demands them (§4.5). New public API or events (the affordance is DOM-level). Any keyset
implementation on the GO path.

## 10. Docs / changeset obligations

- **Changeset: patch** (internal strategy change), Keep-a-Changelog `Changed`: deep
  sorted/filtered scrolling is now O(block) via a per-sort rank index; filtered row counts are
  debounced with single-flight abort. Note the transient ~80 MB temp-table footprint at 5M rows.
- `docs/performance.md`: add the measured depth-latency table (OFFSET baseline vs rank path at
  several depths, from the spike/baselines) and a rank-index explanation + memory note under
  "Architectural characteristics"; update "Observable thresholds" for sorted scrolling.
- `docs/concepts/architecture.md`: new rank-index section (build trigger, epoch identity,
  temp-table lifetime, fallback ladder: fast path → OFFSET while building/below threshold →
  rank).
- If Strings keys were added: `docs/guides/i18n.md` table + api-surface snapshot update with an
  entries-only diff.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: the full §4.8 findings table ((a)–(d) plus
filtered/view/count/cancel variants, machine noted) and the GO/NO-GO call; `RANK_MIN_ROWS`,
`COUNT_DEBOUNCE_MS`, and both RUN-gated budgets as shipped; DEEP before → after (`oneSortMs`,
deep sorted block latency); anchor drift you caused in `TableBody.ts` /
`CrossfilterCoordinator.ts` references that Phases 8, 10, and 11 cite; the exact `rankIndex.ts`
export names Phase 10/11 will import; and the §7 final snapshot + screenshot paths.
