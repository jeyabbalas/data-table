# Phase 3 — TableBody fetch-pipeline rewrite

> Part of [implementation-plan/README.md](./README.md) — read that first. You are
> on branch `fix-virtual-scroll-large-datasets`.

## Goal

Fix bug 2 (flicker/stale cells during rapid scroll) structurally: after this
phase, any screen position only ever shows **a placeholder or the correct final
data for the row index that belongs there** — never another row's data, never
values that change at rest. Also make deep-offset fetches fast and superseded
work cancellable. Mechanism map (see README for details): M1 render-skip, M2
stale-range replay, M3 no-abort, M5 stale-range eviction, M6 stale element
behind evicted entry, M7 QueryCache thrash, M8 OFFSET cost.

## Prerequisites

Phases 1 and 2 complete (check the README status table). Verify before starting:

- `VirtualScroller` has `getVirtualScrollTop()` and the capped/dual-mode mapping
  (Phase 1).
- `WorkerBridge.query(sql, signal?, options?)` accepts
  `{cache?: boolean; priority?: 'high'|'normal'}` and the worker dispatcher is a
  serial priority queue with real cancellation (Phase 2).
- `TableBody.fetchAndRender`'s `finally` currently replays
  `this.virtualScroller.getVisibleRange()` — Phase 1's transitional edit, which
  **you will delete** along with the whole pendingFetch mechanism.

## Targeted code review (do this before editing)

All in `src/table/TableBody.ts` unless noted (line refs are branch-point
anchors; re-locate by symbol):

1. Fields `:100-135` — `rowDataCache`, `currentRange`, `fetchInProgress`,
   `pendingFetch`, `fetchSequence` (read its long comment), `rowPool`,
   `rowElementMap`, `MAX_ROW_CACHE = 500`.
2. Constructor `:160-200` — options handling, scroller composition.
3. `initialize()` `:201-247` — the manual first fetch, the documented
   "resolves after first data paint" contract, and the `onScroll` subscription
   with the `isAnimatingScroll` branch (`:236-245`).
4. State subscriptions `:317-429` — which signals call
   `invalidateCacheAndRefresh` (visibleColumns set-change, sortColumns, filters,
   totalRows, pinnedColumns, tableName) and the visibleColumns
   reorder-vs-change classification.
5. `smoothScrollToTopAndRefresh` `:448-483` + `invalidateCacheAndRefresh`
   `:488-510`.
6. The fetch pipeline `:519-660` — `handleScroll`, `checkNeedsFetch`,
   `fetchAndRender`, `fetchRows` (seq guard, cache writes, catch-all
   `console.error`), `evictDistantRows`.
7. `buildRowQuery` `:671-735` — projection with `__rowid__` prepended, WHERE
   from `filtersToWhereClause`, ORDER BY with the `"__rowid__" ASC` tiebreaker
   (read the whole `:712-723` rationale comment — this determinism fix **must
   survive**), LIMIT/OFFSET.
8. Rendering `:782-930` — `renderVisibleRows` (the `if (!rowEl)` /
   `else if (rowData)` structure and its promotion branch `:837-846`; note the
   missing `rowEl && !rowData` branch), `insertRowInOrder`.
9. Pooling `:935-1050` — `getOrCreateRow`, `returnRowToPool` (placeholder
   detection via `dt-cell--placeholder` class at `:1016`).
10. `updateRowContent` `:1055-1130` — sets `data-row-index` (`:1062`),
    `aria-rowindex = index + 2` (`:1065`), `data-row-id` (`:1084`).
11. `createPlaceholderRow` `:1357-1380` — 1 cell, `aria-busy`,
    `data-row-index`, `aria-rowindex`.
12. `destroy()` `:1729-1772` — the `fetchSequence++` teardown.
13. `src/table/TableContainer.ts` — `TableContainerOptions` (top of file),
    the `new TableBody(...)` site (`:1427-1441`), `getTableBody()` (`:1972`).
14. `src/DataTable.ts` — `CreateDataTableOptions` (`:123+`), the
    `new TableContainer(...)` site (`:540`), how options are threaded.
15. Fast-path premise: `src/worker/loaders/parquet.ts:93` (and the analogous
    lines in `csv.ts`, `json.ts`) — `__rowid__` = `row_number() OVER () − 1`,
    dense 0..N−1; `src/derived/DerivedColumnManager.ts:938-946` — the derived
    VIEW is `base t LEFT JOIN helper h ON t.__rowid__ = h.__rowid__` (density
    preserved).
16. Test harness patterns: `tests/table/TableBody.race.test.ts:70-118`
    (deferred mock bridge), `tests/table/TableBody.scrollOverlap.race.test.ts`
    (its `parseLimitOffset`), `TableBody.tieBreaker.test.ts`,
    `TableBody.placeholderPromotion.race.test.ts`,
    `tests/helpers/duckdbNode.ts` + `tests/helpers/nodeBridge.ts` (real DuckDB
    in Node), `tests/performance/memory-leaks.test.ts` (cache/pool bounds).

## Design specification

### State: remove / add

**Remove:** `fetchInProgress`, `pendingFetch`, `fetchSequence` (and Phase 1's
transitional replay).

**Add:**

```ts
private epoch = 0;                       // state identity; bumped by invalidateCacheAndRefresh()
                                         // and destroy(). Successor of fetchSequence — keep (and
                                         // adapt) its rationale comment.
private inFlightBlocks = new Map<number, { controller: AbortController; epoch: number }>();
                                         // key = block start index
private prefetch: { blockStart: number; controller: AbortController } | null = null;
private lastScrollDirection: 1 | -1 = 1;
private rowidFastPathDisabled = false;   // runtime safety valve, see fetchBlock
private readonly fetchBlockSize: number; // option, default 128, clamped to [16, 1024]
private readonly rowCacheRows: number;   // option, default 2048, rounded UP to whole blocks,
                                         // floor 4 blocks (replaces MAX_ROW_CACHE = 500)
private readonly prefetchEnabled: boolean; // option, default true
private static readonly MAX_INFLIGHT_BLOCK_FETCHES = 2;
```

### `handleScroll(range: VisibleRange)` — now synchronous

```
if destroyed → return
lastScrollDirection = range.start >= currentRange.start ? 1 : −1
currentRange = range            // ONLY ever a scroller-originated VisibleRange
                                // (scroll callback or virtualScroller.getVisibleRange()).
                                // No synthesized ranges may remain anywhere in TableBody.
renderVisibleRows()             // UNCONDITIONAL — fixes M1. Missing rows render as
                                // placeholders; the viewport transform and row content
                                // can never disagree again.
if (!isAnimatingScroll) void ensureFetched()
```

The `onScroll` subscription in `initialize()` collapses to
`(range) => this.handleScroll(range)`; the current animation special-case
(`:237-243` — render from cache, no fetches for intermediate positions) is
subsumed by the `isAnimatingScroll` check above.

### `ensureFetched(): Promise<void>` — the reconciler

1. Bail if `destroyed`, no `tableName`, or `visibleColumns.length === 0`.
2. `needed = missingBlocks(currentRange)` — block starts
   (`blockStartOf(i) = floor(i / fetchBlockSize) * fetchBlockSize`) intersecting
   `[currentRange.start, currentRange.end)` where ≥1 index is missing from
   `rowDataCache`, ordered viewport-top-first. (Replaces `checkNeedsFetch`.)
3. **Abort superseded:** every `inFlightBlocks` entry whose block does not
   intersect `currentRange` padded by ±1 block → `controller.abort()`, delete.
   Abort `prefetch` too if its block is now needed (let the visible fetch
   re-issue it) or direction flipped.
4. **Top up:** while `inFlightBlocks.size < MAX_INFLIGHT_BLOCK_FETCHES` and an
   un-in-flight needed block remains → new `AbortController`, register, start
   `fetchBlock(b, this.epoch, controller, false)`.
5. **Prefetch:** if `prefetchEnabled && needed.length === 0 &&
inFlightBlocks.size === 0 && prefetch === null`: the next block beyond
   `currentRange` in `lastScrollDirection`, if uncached and within
   `[0, totalRows)` → start as prefetch.
6. Return `Promise.allSettled` of the fetches **started in this call**.
   `initialize()` awaits it (preserving the resolves-after-first-paint
   contract); scroll callers void-cast.

### `fetchBlock(blockStart, epochAtStart, controller, isPrefetch)`

1. `limit = min(fetchBlockSize, virtualScroller.getTotalRows() − blockStart)`.
2. `sql = buildRowQuery(…, blockStart, limit, …)`;
   `rows = await this.bridge.query<RowData>(sql, controller.signal,
{ cache: false, priority: isPrefetch ? 'normal' : 'high' })` — scroll SQL
   **bypasses QueryCache** (fixes M7; `rowDataCache` is the authoritative row
   store, invalidated in lockstep with `epoch` — a second SQL-keyed copy with
   its own TTL/LRU is a second staleness domain, and the bypass stops the
   100-entry LRU thrash that evicts stats/histogram results).
3. On resolve: guard `if (destroyed || epochAtStart !== epoch ||
controller.signal.aborted) return;` (epoch mirrors the old seq guard; the
   aborted check covers mocks that resolve after abort — the real bridge
   rejects).
4. Write to cache — **fast path keys by `Number(row[ROWID_COLUMN])`**, OFFSET
   path by `blockStart + i`. Fast-path defensive check: if
   `rows.length !== limit` or any rowid falls outside
   `[blockStart, blockStart + limit)` → `rowidFastPathDisabled = true`,
   `console.warn` once, re-issue **this one block** via the OFFSET form, and
   return (converts a violated density premise into slow-but-correct, never
   wrong).
5. `evictDistantBlocks()`.
6. If the block intersects `currentRange` → `renderVisibleRows()` (promotes
   placeholders in place).
7. `catch`: rejection with code `QUERY_ABORTED`/`QUERY_CANCELLED` → **silent**;
   anything else → `console.error` (today's behavior).
8. `finally`: deregister from `inFlightBlocks` (guard on controller identity —
   a re-issued block must not delete its successor's entry) or clear
   `prefetch`; then `void this.ensureFetched()` — the live-range top-up is the
   replacement for the deleted pendingFetch replay (fixes M2: reconciliation
   always reads the **current** viewport, never a stored range).

### `buildRowQuery` — add the fast path (fixes M8)

```ts
const useRowidRange =
  filters.length === 0 && sortColumns.length === 0 && !this.rowidFastPathDisabled;
if (useRowidRange) {
  sql +=
    ` WHERE ${quoteIdentifier(ROWID_COLUMN)} >= ${offset}` +
    ` AND ${quoteIdentifier(ROWID_COLUMN)} < ${offset + limit}`;
  sql += ` ORDER BY ${quoteIdentifier(ROWID_COLUMN)} ASC`; // scan order is not guaranteed
  sql += ` LIMIT ${limit}`; // defensive cap only
} else {
  // existing branch, UNCHANGED: WHERE from filters, ORDER BY user sorts with
  // the "__rowid__" ASC tiebreaker (preserve the whole rationale comment),
  // LIMIT/OFFSET
}
```

Premise (verified, cite in a comment): loaders materialize `__rowid__` densely
(0..N−1) and the derived-column VIEW preserves it, so with no WHERE and no user
sort, positional index ≡ `__rowid__` and the range predicate returns exactly
the OFFSET window — but as a zonemap-prunable scan (~ms at any depth) instead
of a top-(offset+limit) sort. Sorted/filtered paths keep OFFSET (no closed form
for position there); they still gain block dedupe, cancellation, priority, and
the larger cache. Keyset pagination for sorted mode is out of scope (note as
future work).

### `evictDistantBlocks()` (replaces `evictDistantRows`; fixes M5)

Group cache keys by block; while total cached rows > `rowCacheRows`, drop the
whole block with the greatest
`min(|blockStart − currentRange.start|, |blockEnd − currentRange.end|)` —
distance measured from **`this.currentRange`**, never from a fetch's own
bounds. Whole-block granularity guarantees surviving blocks are fully populated
(no partial blocks perpetually re-triggering `missingBlocks`), and with the
4-block floor the visible range can never be evicted.

### `renderVisibleRows` — close M6 + robust placeholder marker

Current structure per index: `if (!rowEl) {…} else if (rowData) {…}`. Add the
missing third branch — element exists, **is a data row**, but its cache entry
is gone (evicted/invalidated): recycle it and insert a placeholder:

```ts
} else if (!isPlaceholderRow(rowEl)) {
  this.moveFocusToGridBeforeRemoval(rowEl);
  rowEl.remove();
  this.returnRowToPool(rowEl);
  rowEl = this.createPlaceholderRow(i);
  this.rowElementMap.set(i, rowEl);
  this.insertRowInOrder(viewport, rowEl, i);
}
```

Placeholder detection today is cell-count-based
(`rowEl.children.length !== visibleColumns.length` at the promotion branch),
which is ambiguous for single-column tables. Introduce a durable marker:
`createPlaceholderRow` sets `data-placeholder="1"`; `updateRowContent` removes
it. Use it both here and in the `:837` promotion branch (fixing the
pre-existing 1-column hazard); `returnRowToPool`'s placeholder refusal
(`:1010-1020`) can keep its class check or switch to the marker — your call,
but behavior must stay: placeholders are never pooled.

### `invalidateCacheAndRefresh()`

1. `this.epoch++;` (adapt the existing rationale comment from `fetchSequence`).
2. **Abort** all `inFlightBlocks` controllers and `prefetch`; clear both (stop
   wasting worker time; the epoch guard remains belt-and-braces).
3. Clear `rowDataCache`; recycle `rowElementMap` (existing code, unchanged).
4. `this.currentRange = this.virtualScroller.getVisibleRange();` (existing
   re-read — geometry-safe).
5. `this.renderVisibleRows();` — **new**: immediate placeholders instead of a
   stale/blank viewport while the re-fetch runs.
6. `void this.ensureFetched();`

### `initialize()` / `destroy()`

- `initialize()`: the manual first fetch becomes
  `this.currentRange = this.virtualScroller.getVisibleRange();
this.renderVisibleRows(); await this.ensureFetched();` — the documented
  contract (resolves after first data paint) and the auto-fire-as-warm-no-op
  behavior survive; update the comment.
- `destroy()`: abort all `inFlightBlocks` + `prefetch` **before** the epoch
  bump (renamed from `fetchSequence++`); abort rejections must be swallowed
  (existing race test asserts a clean destroy during in-flight fetch).

### Fetch state machine (document as a comment near the fields)

| State       | Definition                                                                    |
| ----------- | ----------------------------------------------------------------------------- |
| IDLE        | `inFlightBlocks` empty; every index of `currentRange` cached (or range empty) |
| FETCHING    | ≥1 visible-block fetch in flight                                              |
| PREFETCHING | `prefetch !== null`, no visible-block fetches                                 |
| DESTROYED   | terminal                                                                      |

Transitions: **scroll** (any state): assign range → render → reconcile (abort
out-of-window blocks, top up, maybe prefetch) — never skips render, never waits
on an old fetch. **Block completes, epoch matches, not aborted**: write → evict
→ render-if-intersecting → deregister → reconcile. **Completes stale (epoch
mismatch)**: dropped entirely. **Aborted**: rejection swallowed; deregistered in
`finally`; reconciler may legitimately re-issue the same block later as a fresh
query. **Invalidation mid-fetch**: epoch++ → abort all → clear → re-read live
range → placeholders → reconcile (the filter-change scroll animation is
unchanged: cache-only renders during the 300 ms animation, invalidation fires at
its end). **Destroy mid-fetch**: guards drop late resolutions; aborts are
silent. **Worker mirror**: abort → bridge rejects locally + posts `cancel` →
dispatcher dequeues (zero DuckDB work) or interrupts the running pending-query;
the eventual `QUERY_CANCELLED` response finds no pending request at the bridge
and is dropped — no double-settle.

Why the old `fetchInProgress` gate is deleted rather than kept: it existed to
bound DB load and serialize cache writes. Load is now bounded properly by the
worker's serial queue + the 2-block in-flight cap; write consistency by
block-granular dedupe (an in-flight block is never re-issued) + the epoch
guard. What the gate _additionally_ did — skip rendering, prevent cancellation,
and replay stale ranges — is exactly bug 2.

### Public options (maintainer decision: expose)

- `TableBodyOptions` += `fetchBlockSize?: number`, `rowCacheRows?: number`,
  `prefetch?: boolean` (JSDoc: defaults 128 / 2048 / true; block size clamped
  to [16, 1024]; cache rounded up to whole blocks with a 4-block floor).
- `TableContainerOptions` += the same three, forwarded at the
  `new TableBody(...)` site.
- `CreateDataTableOptions` += the same three, forwarded at the
  `new TableContainer(...)` site. Full JSDoc on all (typedoc + jsdoc test).

Sizing rationale (JSDoc-worthy): block 128 ≈ 3–4× a realistic viewport (~30–48
rows), so the viewport spans 1–2 blocks; OFFSET-path cost is dominated by the
offset, not the limit; power-of-two alignment gives stable dedupe keys. Cache
2048 rows = 16 blocks ≈ 2–4 MB at typical widths — instant scroll-back across
±900 rows with zero queries (this replaces the QueryCache's reuse role).
In-flight cap 2: the worker is serial anyway; 2 overlaps materialization with
execution while keeping abort turnaround ≤1 running + 1 queued.

### Test hook

`/** @internal */ __verifyDomOrderForTests(): boolean` — viewport children's
`data-row-index` strictly ascending and exactly covering
`[currentRange.start, currentRange.end)`. No production-path cost.

## Ordered tasks

1. Implement the `TableBody.ts` rewrite (state, handleScroll, ensureFetched,
   fetchBlock, evictDistantBlocks, renderVisibleRows branch + marker,
   invalidate/initialize/destroy, state-machine comment, test hook).
2. Add the fast path to `buildRowQuery`.
3. Thread the three options through `TableContainer` and `DataTable` with
   JSDoc.
4. Add `tests/helpers/rowFetchBridge.ts`; update the four existing race tests +
   `memory-leaks.test.ts`; add the nine new suites + the real-DuckDB parity
   test.
5. Full verification; manual smoke; commits; README status flip.

## Tests

### Shared helper — `tests/helpers/rowFetchBridge.ts`

Deferred-queue mock bridge (extend the `TableBody.race.test.ts:70-118` pattern):
captures `(sql, signal, options)` per call; each call returns a deferred the
test resolves/rejects; when a captured signal aborts, the deferred auto-rejects
with `QueryError('Operation aborted', { code: 'QUERY_ABORTED' })` (mirrors the
real bridge). Export a `rowAt(i, columns)` row synthesizer.

### Updates to existing tests

- `TableBody.race.test.ts` — after `filters.set`, the new fetch is issued
  immediately (superseded call's signal aborted) instead of after the old
  resolves; cache-pollution and pending-SQL-carries-WHERE assertions survive
  with adjusted call indices; destroy test additionally asserts every captured
  signal is aborted.
- `TableBody.scrollOverlap.race.test.ts` — pass `fetchBlockSize: 16` for
  readable numbers; sorted case keeps `parseLimitOffset` with block-aligned
  offsets; the unsorted case's SQL moves to the fast-path shape (add a
  `parseRowidRange` helper); the overlap `__rowid__`-agreement invariant is
  unchanged.
- `TableBody.tieBreaker.test.ts` — sorted/filtered ORDER-BY-composition
  assertions unchanged; no-user-sort expectations move to
  `ORDER BY "__rowid__" ASC` + range predicate, no OFFSET.
- `TableBody.placeholderPromotion.race.test.ts` — re-script the timeline (no
  pendingFetch; the widened range issues its block fetch immediately); all four
  final invariants (cell counts, populated cells, clean pool, listeners on
  promoted rows) unchanged.
- `tests/performance/memory-leaks.test.ts` — add: after a long scroll walk,
  `rowDataCache.size ≤ rowCacheRows` (+ ≤1 block slack mid-write).

### New suites (names → what they assert)

1. `TableBody.renderNeverSkipped.test.ts` — with a fetch parked on a deferred,
   move the scroller to a disjoint range; **synchronously** (nothing resolved):
   `rowElementMap` keys equal the new range; missing rows are placeholder rows
   (marker attribute, `aria-busy`); no element carries an out-of-range
   `data-row-index`. (M1.)
2. `TableBody.supersededAbort.test.ts` — scroll A→B disjoint: A's captured
   signal aborted; B's query issued without awaiting A; B resolves → DOM
   correct; A's rejection is silent (spy: no `console.error`) and writes
   nothing. (M3.)
3. `TableBody.staleRangeNotRestored.test.ts` — fetch for R1 in flight; scroll
   R2 then R3; resolve all in issue order → final `currentRange` deep-equals
   `virtualScroller.getVisibleRange()` (R3) and every rendered data row's
   `data-row-id === data-row-index`. (M2.)
4. `TableBody.evictionBlockDistance.test.ts` — `fetchBlockSize: 16,
rowCacheRows: 64`; scroll through many blocks resolving each → survivors are
   whole blocks nearest `currentRange`; every visible index retains data. (M5.)
5. `TableBody.evictedBehindElement.test.ts` — delete a cached entry behind a
   live data row, `renderVisibleRows()` → that element is replaced by a
   placeholder. (M6.)
6. `TableBody.fastPathSql.test.ts` — no sort/filter → range-predicate SQL
   (no OFFSET); with sort or filter → LIMIT/OFFSET + tiebreaker; a fast-path
   result that violates density (short row count) → one `console.warn`, one
   OFFSET re-issue of the same block, fast path disabled for subsequent
   fetches. (M8 + safety valve.)
7. `TableBody.blockQuantization.test.ts` — scrolling within a cached block
   issues zero queries; crossing a boundary issues exactly one, block-aligned
   (`offset % fetchBlockSize === 0`, limit ≤ block size).
8. `TableBody.prefetch.test.ts` — after visible blocks resolve and idle:
   exactly one `priority:'normal'` fetch for the next block in scroll
   direction; direction flip aborts it; prefetched rows land in cache without
   touching `rowElementMap`; `prefetch: false` disables it.
9. `TableBody.rapidScrollStress.test.ts` — seeded 40-step random walk; every
   mock query is a deferred resolved in **shuffled** order with synthesized
   `rowAt(i)` rows; after draining: `__verifyDomOrderForTests()` true; every
   data row's `data-row-id === data-row-index`; no placeholder rows for cached
   indices; cache ≤ cap; `rowElementMap` keys exactly the final range.
10. `tests/table/rowidFastPath.duckdb.test.ts` — **real DuckDB** via
    `tests/helpers/duckdbNode.ts`/`nodeBridge.ts`: on a
    `generate_series`-created table, fast-path SQL and OFFSET SQL return
    identical rows for several ranges, including through a derived-column-style
    VIEW (`CREATE VIEW v AS SELECT t.*, h.x FROM base t LEFT JOIN helper h ON
t.__rowid__ = h.__rowid__`).

## Verification criteria

```bash
npx vitest run tests/table tests/data tests/worker tests/performance/memory-leaks.test.ts
npm run test:coverage
npm run typecheck && npm run lint && npm run format:check
npm run build && npm run size && npm run docs:api:check   # public options changed the API surface
npm run test:browser
```

All green. Manual smoke (required): `npm run dev` →
`http://localhost:5173/data-table/` → load
`tests/fixtures/datasets/parquet/nyc_taxi.parquet` (100K rows) via the file
input → scroll fast with the wheel and by dragging the thumb; sort a column and
repeat; filter and repeat. Expect placeholders that resolve quickly, no stale
values, no console errors (aborted fetches silent).

## Commit guidance

Three commits:

1. `Render every scroll frame and fetch rows in cancellable aligned blocks`
   (core rewrite + helper + new/updated unit tests)
2. `Fetch unsorted unfiltered rows by rowid range instead of OFFSET`
   (fast path + safety valve + parity test)
3. `Expose fetchBlockSize, rowCacheRows, and prefetch options`
   (options threading + JSDoc)

Flip Phase 3's row in `implementation-plan/README.md` in the final commit.

## Seams & out of scope

- Do not modify `VirtualScroller` (Phase 1 owns it) beyond consuming its API.
- Do not add Playwright specs (Phase 4) or docs/changeset (Phase 5).
- Preserve untouched: the `"__rowid__" ASC` tiebreaker + its comment; focus
  rescue (`moveFocusToGridBeforeRemoval`) call sites; `onRowsRendered`
  callback; aria attributes (`aria-rowindex = index + 2`); pooling caps;
  `insertRowInOrder`'s algorithm (with removal-then-ascending-insert its
  invariant holds — the new test hook asserts it).
- `QueryCache` internals stay as-is; scroll queries merely bypass it.
