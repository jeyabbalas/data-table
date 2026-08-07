# Phase 2 — Decouple visualizations from load: lazy, cached, staleness-aware viz

Size: **L** · Depends on: **Phase 0** (query-count assertions are the primary verification;
independent of Phase 1) · Blocks: **Phase 4**
([phase-04-header-column-windowing.md](./phase-04-header-column-windowing.md)), **Phase 10**
([phase-10-direct-scan-mode.md](./phase-10-direct-scan-mode.md))

---

## 1. Context

Read [`README.md`](./README.md) (whole file) and [`STATUS.md`](./STATUS.md) first. This phase
kills the dominant load-time cost on wide tables (README §5.A): `loadData` resolves when the grid
is **interactive** (schema + first row block), not after ~2,000 serialized per-column viz
queries. Visualization data acquisition becomes a per-column state machine — created lazily when
its header is visible (IntersectionObserver), fetched at low priority with bounded concurrency,
marked stale on filter change and refetched only when visible — with viz **data** lifecycle
decoupled from header DOM lifecycle so Phase 4 can churn headers freely.

**This phase changes the public `loadComplete` contract.** That is user-approved (README §2.1:
new defaults, not opt-in flags) and ships with a changeset + migration note + a
`visualizations: { eager: true }` opt-out for screenshot/PDF pipelines.

Relevant README sections: §2.1 (defaults decision — do not relitigate), §5.A (the fan-out
findings this phase fixes), §5.H (assets to build on), §8 (protocol). Phase 0 artifacts you
consume: `tests/fixtures/tiers.ts`, `bridge.__getStatsForTests()` / `__resetStatsForTests()`,
the `dt:load:*` marks, the demo `?gen=` harness (`#dt-perf-panel`, `window.__dtPerf`),
`tests/browser/helpers/wideTable.ts` + `metrics.ts`, `tests/budgets.ts`.

## 2. Problem statement

All anchors verified at the branch point (commit `5b2dd49`); re-locate before coding.

- The public load promise gates on every viz's first fetch:
  `await Promise.all([tableContainer.whenBodyReady(), pendingVizInit])` (`src/DataTable.ts:1267`);
  `attachVisualizations` (`src/DataTable.ts:716-1032`, per-column loop `:788-1016`) pushes
  `viz.waitForData()` per column into `initPromises` (`:970`) plus both coordinators'
  `syncExistingFilters` (`:1025,1029`), aggregated via `Promise.allSettled` (`:1031`) into
  `pendingVizInit` (`:653`).
- Every viz fetches eagerly in its constructor: `this.dataPromise = this.fetchData()` at
  `src/visualizations/histogram/SharedHistogramBase.ts:186` and
  `src/visualizations/valuecounts/ValueCounts.ts:206` (`dataPromise` seam:
  `src/visualizations/BaseVisualization.ts:162-167`). Each column ≈ 2 full-table scans
  (histogram: stats + bins; value counts: stats + top categories) → ~2,000 serialized scans at
  1K columns, all behind the load promise.
- Both scans include exact `COUNT(DISTINCT col)`: the stats SQL at
  `src/visualizations/histogram/HistogramData.ts:188-200` (`COUNT(DISTINCT …)` at `:197`) and
  `src/visualizations/valuecounts/ValueCountsData.ts:91-99` (`:96`).
- Filter changes refresh **all** registered vizzes: `CrossfilterCoordinator.onFiltersChanged`
  (`src/visualizations/CrossfilterCoordinator.ts:105-127`) maps every registration into
  `runLimited` tasks (cap 4 = `DEFAULT_VIZ_CONCURRENCY` `:32`; `runLimited` `:133-146`,
  duplicated at `src/visualizations/StatsPanelCoordinator.ts:143-155`, cap `:42`) — the cap
  bounds in-flight, not total.
- Any schema/visibleColumns/tableName change destroys + recreates **every** viz and stats panel:
  `scheduleAttach` subscriptions at `src/DataTable.ts:1161-1175`. Measured precedent: one
  keyboard column move at 266 columns = 534 DuckDB queries (comment at
  `src/table/TableBody.ts:409-414`).
- Per-viz observer overhead: every viz installs its own theme `MutationObserver` on `.dt-root`
  watching `data-dt-color-scheme` (`src/visualizations/BaseVisualization.ts:236-249`) plus a
  `ResizeObserver` (`:215-216`); every histogram render re-resolves ~15 CSS variables via
  `getComputedStyle` (`getHistogramColors`,
  `src/visualizations/histogram/SharedHistogramBase.ts:53-74`, called per render at `:222`;
  `resolveColor` → `getComputedStyle` at `src/visualizations/palette.ts:11-12`).
- `refreshNonVizStats` iterates all headers on **both** `filters` and `filteredRows`
  (`src/DataTable.ts:1183-1203`, subscriptions `:1202-1203`) — twice per filter cycle.
- The dispatcher has only two priorities (`high`/`normal` queues, `src/worker/dispatcher.ts:73-75`,
  routing `:184`; `priority?: 'high' | 'normal'` at `src/worker/types.ts:37-38` and
  `src/data/WorkerBridge.ts:51-64`), so viz scans contend with viewport rows at `normal`. And
  **no `IntersectionObserver` exists anywhere in `src/` today** (verified: zero hits) — the IO
  plumbing and its jsdom test seam are new.

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- `src/DataTable.ts` — `attachVisualizations` (`:716-1032`): per-column panel + viz creation,
  `renderStatsSlot`, brush/selection save/restore, `initPromises`; `scheduleAttach`
  (`:1161-1175` — note the `queueMicrotask` coalescing idiom; reuse it); `refreshNonVizStats`
  (`:1183-1203`); `loadDataImpl` (`:1206-1318`: the `:1267` gate, `loadComplete` emit
  `:1271-1278`); the `DataTable` interface (`:330-419`); `visualizations?: boolean` (`:190-191`).
- `src/visualizations/BaseVisualization.ts` — constructor (canvas + observers `:182-229`),
  `setupColorSchemeWatcher` (`:236-249`), `waitForData` (`:458-460`), `updateFilters`
  (`:467-495` — the refetch path the staleness machine replaces for offscreen columns),
  `destroy`. Note `filterUpdateSequence` (`:160`) — the epoch idiom to copy.
- `src/visualizations/CrossfilterCoordinator.ts` and `StatsPanelCoordinator.ts` — whole files
  (~175 lines each). Both keep working when composed standalone from `/advanced` — your
  scheduler seams must be optional.
- `src/visualizations/histogram/SharedHistogramBase.ts:53-74,182-187,222`,
  `valuecounts/ValueCounts.ts:195-210`, `histogram/HistogramData.ts:19,175-230,441` (the
  `DISCRETE_BIN_THRESHOLD = 5` decision consuming `distinctCount`),
  `valuecounts/ValueCountsData.ts:80-150` — where fetches run and what SQL they issue.
- `src/statistics/ColumnStatsTypes.ts:31-47` (numeric/categorical `distinctCount` fields) and
  `src/statistics/StatsFormatters.ts:163-196` (the `allUnique` exact-equality shortcut at
  `:182` that approx counts must bypass); `src/core/strings.ts:421-455` (the
  `Strings['statistics']` interface for new keys) + English defaults `:820-822`.
- `src/table/TableContainer.ts:574` (`.dt-header-scroll` creation), `:693-705` (header↔body
  scrollLeft sync — the IO root is the header's own scroll container);
  `src/table/ColumnHeader.ts:309` (`.dt-col-viz`), `:1008-1010` (`getVizContainer`), `:1015`
  (`getStatsElement`).
- `src/worker/dispatcher.ts:46-108,184` and `src/data/WorkerBridge.ts:296-345` — the priority
  plumbing you extend with `'low'`.
- Tests encoding the old contract you deliberately change:
  `tests/DataTable.vizfirstpaint.race.test.ts` (its `HoldableViz`/registry pattern is the
  harness for your new tests) and `tests/DataTable.firstpaint.race.test.ts` (the body-gating
  half **stays true**). Also `tests/api-surface.snapshot.test.ts` behavior on new members.
- Phase 0 handoff in STATUS.md: measured WIDE baselines (viz=on/off load ms, queryCount, canvas
  and observer counts) — your before/after numbers cite them; note any viz=on truncation.

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 Load contract + `vizReady`

- `loadDataImpl` gates on `Promise.all([tableContainer.whenBodyReady(), coordinator.syncExistingFilters()])`
  — grid painted and `filteredRows` correct for restored filters (one COUNT). `pendingVizInit`
  no longer gates the load promise (except under `eager: true`, §4.7).
- New event in `src/core/TableEvents.ts`: `vizReady: { tableName: string; vizCount: number }` —
  fires once per load when the **initial visible wave** settles (every viz whose header was
  visible at load has data, + `statsPanelCoordinator.syncExistingFilters()`), after
  `loadComplete` in the lazy default, before it under `eager: true`. New member on the
  `DataTable` interface (`:330-419`): `whenVizReady(): Promise<void>` — a new `loadData` call
  swaps the promise (mirror the `pendingVizInit` reassignment pattern).
- Phase 0 marks are stable by design (its §4.3 anticipated this): `dt:load:vizReady` now lands
  when the initial wave settles — after `dt:load:complete`. Keep all five mark names unchanged.

### 4.2 `VizDataController` — per-column state machine above the DOM

New file `src/visualizations/VizDataController.ts`, one instance per DataTable (created only
when viz enabled), owning a `Map<columnName, VizColumnEntry>`:

```ts
interface VizColumnEntry {
  column: ColumnSchema;
  status: 'empty' | 'fetching' | 'fresh' | 'stale';
  filterEpoch: number; // epoch stamped at last successful fetch
  viz: BaseVisualization | null; // live instance, or null while unobserved
  snapshot: unknown | null; // last-known data, survives viz destroy
  visible: boolean; // last IO signal
}
```

- **Creation is IO-gated.** The controller owns one `IntersectionObserver` with
  `root: .dt-header-scroll` (the header's horizontal scroll container, `TableContainer.ts:574`),
  `rootMargin: '0px 200px'` (horizontal overscan), observing each header's `.dt-col-viz`
  element. First intersection → create the viz instance via the existing registry and enqueue
  its fetch. Headers exist for **all** columns until Phase 4, so this gating is what keeps
  canvas count O(visible) — canvases for scrolled-away columns must never be created.
- **jsdom seam.** jsdom has no IO: the controller takes an injectable
  `intersectionObserverFactory` (constructor option). When the global is absent and no factory
  is injected, fall back to treat-everything-visible — a safety net that also keeps existing
  jsdom suites deterministic. Unit tests inject a `FakeIntersectionObserver` to script
  visibility.
- **Data outlives DOM.** `BaseVisualization` gains `exportDataSnapshot(): unknown | null` /
  `importDataSnapshot(snapshot: unknown): void` (protected-friendly, default null/no-op); the
  five built-ins implement them over their existing `data`/`backgroundData` fields. On viz
  destroy the controller captures the snapshot; on re-create with `status === 'fresh'` and a
  current `filterEpoch` it seeds the new instance and skips the fetch. This is the seam Phase 4
  leans on when it unmounts headers.
- **Fetch scheduling.** Controller queue, visible-first FIFO, drained through the shared
  `runLimited` at concurrency 4; every viz/stats query goes to the worker at `priority: 'low'`
  (§4.3). Fetch resolution stamped with `filterEpoch`; stale-epoch results are discarded
  (`filterUpdateSequence` idiom, `BaseVisualization.ts:160`).
- `eager: true` bypasses IO entirely: create + fetch all columns at attach, as today.

### 4.3 Shared concurrency + a real `'low'` priority

- Hoist `runLimited` into `src/core/concurrency.ts` (internal, off the public API);
  `CrossfilterCoordinator.ts:133-146` and `StatsPanelCoordinator.ts:143-155` delegate to it
  (dedupe noted in README §5.H).
- Add `'low'` to the dispatcher: a third queue beside `highQueue`/`normalQueue`
  (`src/worker/dispatcher.ts:73-75`), pump order high → normal → low, routing at `:184`; widen
  `priority` at `src/worker/types.ts:37-38` and `QueryOptions` at
  `src/data/WorkerBridge.ts:51-64` (forwarding `:334`). Viewport rows stay `'high'`; viz/stats
  fetches send `'low'` (thread `{ priority: 'low' }` through the fetch helpers in
  `HistogramData.ts` / `ValueCountsData.ts` and the date/time/interval variants); everything
  else `'normal'`. Starvation is acceptable by the same argument as `high` (dispatcher comment
  `:69-71`): low work is bounded by the visible set.

### 4.4 Staleness on filter change (sparse-tolerant coordinators)

- `CrossfilterCoordinator` gains an optional `vizScheduler` hook (constructor option). When
  attached, `onFiltersChanged` (`:105-127`) calls `scheduler.refreshOnFilters(filters, seq)`
  **instead of** iterating registrations; the controller then bumps the global filter epoch,
  refetches visible entries immediately (bounded, low priority), marks offscreen entries
  `stale` (no query), and refetches stale entries on scroll-into-view. Without the hook
  (standalone `/advanced` composition) behavior is unchanged. `updateFilteredRowCount` +
  `onFilterCycleComplete` (the public `filterChange` contract) stay exactly as-is, the
  `filterSequence` guard (`:53,89-93,125`) preserved.
- A viz created later under active filters must come up correct: fetch with the current filter
  array, render the crossfilter foreground/background split, restore any saved
  brush/selection. This is the **sparse-registration invariant** — write its unit tests first
  (§4.8).
- `StatsPanelCoordinator` gets the identical optional hook and visible-only + stale semantics
  (panels share the header-visibility signal). The default registry ships no panels, but parity
  keeps custom-panel deployments from re-introducing O(columns) fan-out.

### 4.5 Incremental attach (diff-based)

Replace wipe-everything `attachVisualizations` with a diff against the controller's entry map,
keyed by column name + type + tableName:

- Column added/type-changed → create entry (instance still IO-gated); removed → destroy
  instance + entry; reorder/hide/show → untouched columns keep instances, data, and brush
  state (no query); `tableName` change (derived VIEW switch) → keep instances, mark **all**
  entries stale, refetch visible.
- Brush/selection save/restore (`:721-746,972-1015`) becomes per-recreated-column instead of
  global; the vizReady wave aggregate collects only the columns the diff actually scheduled.
  Acceptance precedent: a column move must issue **0** viz queries (vs 534 at 266 columns,
  `TableBody.ts:409-414`).

### 4.6 Query and observer cost reductions

- **Approx distinct.** In the two stats SQLs (`HistogramData.ts:188-200`,
  `ValueCountsData.ts:91-99`): use `approx_count_distinct(col)` when
  `totalRows > VIZ.APPROX_DISTINCT_ROW_THRESHOLD` (100,000; exact at or below). The facade
  passes `useApproxDistinct` into `VisualizationOptions` (it owns `state.totalRows`). Thread
  `distinctCountApprox?: boolean` through `ColumnStatsTypes.ts:31-47` into
  `StatsFormatters.ts:163-196`: skip the `allUnique` equality shortcut (`:182`) when approx,
  render via new `Strings.statistics` keys `approxUniqueCount(count)` (English:
  `` `~${count.toLocaleString()} unique` ``) and `approxUniquePercent(count, pct)` — interface
  `strings.ts:421-455`, English defaults `:820-822`. The `DISCRETE_BIN_THRESHOLD = 5` decision
  (`HistogramData.ts:19,441`) tolerates HLL error — effectively exact at tiny cardinalities;
  document as accepted.
- **One theme watcher + palette cache.** New `src/visualizations/ThemeWatcher.ts`: one
  `MutationObserver` per DataTable on `.dt-root` `data-dt-color-scheme` with
  `register/unregister(listener)`; `BaseVisualization` uses it when supplied via options,
  falling back to its private observer (`:236-249`) for standalone use. Cache
  `getHistogramColors` (and the `ValueCountsColors` twin) per `.dt-root` scope in a
  module-level `WeakMap`, invalidated by the watcher on theme flip — render goes from ~15
  `getComputedStyle` calls to zero on the hot path.
- **Coalesce `refreshNonVizStats`.** `filters` + `filteredRows` both fire it per cycle
  (`:1202-1203`); coalesce with the `queueMicrotask` flag idiom from `scheduleAttach`.

### 4.7 `visualizations` option widening

`visualizations?: boolean | { eager?: boolean }` (`DataTable.ts:190-191`): `false` = off
(unchanged); `true` / `undefined` / `{}` = lazy (new default); `{ eager: true }` = restore
wait-for-all semantics — all instances created + fetched at attach, load promise gates on the
full wave (for screenshot/PDF pipelines). Normalize once at the facade top.

### 4.8 Riskiest assumptions — validate in this order

1. **Coordinator/stats-panel invariants under sparse registration.** Write the
   sparse-registration unit tests FIRST (filters applied while 0 or few vizzes exist; late viz
   creation under active filters; epoch discard of a stale in-flight fetch), then build the IO
   plumbing against them.
2. **IO fires inside a horizontally scrolling container** with `display:flex` header children.
   Prototype in the demo (`?gen=wide-ci`) before wiring the controller: an IO with
   `root: .dt-header-scroll` logging entries during a manual sweep. If Chrome under-reports,
   fall back to `root: .dt-body-scroll` (same scrollLeft, `TableContainer.ts:693-705`) or a
   scroll-driven range computation from `scrollLeft` + column widths — record the choice.
3. If the snapshot import/export seam proves too invasive for a viz class, fall back (that
   class only) to refetch-on-recreate — correctness is unaffected; note it for Phase 4.

## 5. Implementation milestones (commit at each)

1. Hoist `runLimited` to `src/core/concurrency.ts`; add optional scheduler seams to both
   coordinators; sparse-registration unit tests
   (`tests/visualizations/CrossfilterCoordinator.sparse.test.ts`, `…StatsPanelCoordinator.sparse.test.ts`).
   — _commit: "Add coordinator scheduler seams and shared concurrency limiter"_
2. `'low'` dispatcher priority + bridge plumbing + dispatcher/bridge unit tests (pump order,
   routing, `QueryOptions` forwarding). — _commit: "Add low-priority tier to the worker query queue"_
3. `VizDataController` with injectable IO factory + snapshot seams on `BaseVisualization` +
   unit tests driven by a fake IO (state transitions, epoch discard, snapshot reuse); demo IO
   prototype validated (§4.8.2). — _commit: "Add lazy per-column visualization data controller"_
4. Facade wiring: diff-based attach, IO-gated creation, option widening + `eager` path;
   existing jsdom suites green via the visible-fallback. — _commit: "Create visualizations lazily as headers become visible"_
5. Load-gate change + `vizReady` + `whenVizReady()` + race-test updates
   (`DataTable.vizfirstpaint.race.test.ts` re-pins the NEW contract: the promise resolves while
   a held viz fetch is pending; `whenVizReady()` waits for it; `eager: true` restores the old
   gating) + API-surface snapshot. — _commit: "Resolve loadData at first interactive paint"_
6. Staleness: visible-only refetch on filter change, stale-on-scroll-into-view, coalesced
   `refreshNonVizStats`. — _commit: "Refetch only visible visualizations on filter change"_
7. Approx distinct + new Strings keys + shared ThemeWatcher + palette cache + their unit
   tests. — _commit: "Cut per-column distinct scans and observer overhead"_
8. `VIZ` budgets + `tests/browser/viz-lazy.spec.ts` + WIDE baseline re-capture (both viz
   modes) + docs + changeset (§10). — _commit: "Add lazy-visualization budgets and recapture baselines"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage
npm run build && npm run size          # library size may move slightly; keep within existing budgets
npm run docs:api:check
npm run test:browser                   # includes viz-lazy.spec.ts default-run assertions at WIDE_CI
RUN_BROWSER_PERF=1 npx playwright test tests/browser/viz-lazy.spec.ts tests/browser/tiers.full.spec.ts
npm run perf:baseline && npm run perf:baseline:report   # re-capture WIDE viz=on and viz=off; commit new JSONs
```

Budgets to add in `tests/budgets.ts` under the `VIZ` namespace (default-run =
machine-independent counts; wall-clock only behind `RUN_*` gates):

- `VIZ.QUERIES_AT_LOAD_MAX = 66` — bridge `sent.query` from load start to panel `ready`:
  2 × ~30 visible-plus-overscan headers + 6 fixed overhead (schema/DESCRIBE, first row block,
  count sync — document the measured fixed part). Asserted at WIDE_CI in CI, re-asserted at
  WIDE gated (today ~2,000 at WIDE).
- `VIZ.MAX_IN_FLIGHT = 4` — bridge stats `maxInFlight` across a viz-only window (reset stats
  after settle, horizontal sweep, read the high-water mark).
- `VIZ.CANVAS_COUNT_MAX = 40` — `.dt-root canvas` count at initial paint, WIDE and WIDE_CI
  (today 1,000 at WIDE): scrolled-away columns must have **no** canvas.
- `VIZ.NONVIZ_QUERIES_PER_FILTER = 2`, `VIZ.QUERIES_PER_VIZ_PER_FILTER = 2` — one filter
  change issues ≤ `2 + 2 × visibleVizCount` queries.
- `VIZ.APPROX_DISTINCT_ROW_THRESHOLD = 100_000` (mirror the value in src — never import
  `tests/` from the library bundle).
- Gated only: `VIZ.LOAD_MS_WIDE_MAX`, set from the recaptured baseline + headroom, asserted
  under `RUN_BROWSER_PERF=1`.

Phase-specific asserts inside the suites:

- Structural: `dt:load:complete` measure < `dt:load:vizReady` measure (lazy default; inverted
  under `eager: true`); `vizReady` fires exactly once per load with a plausible `vizCount`.
- Sparse tests (§4.8.1) green; the epoch test proves a stale in-flight fetch is discarded.
- Stale-refetch Playwright test: filter → scroll a far column's header into view → its
  histogram appears AND the bridge query delta is exactly its 2 fetch queries. Streaming:
  after a horizontal jump, new canvases appear and `sent.query` grows ≈ 2 × newly-visible viz
  columns.
- Column reorder issues 0 viz queries; hide/show keeps untouched instances (no refetch).
- Race suites re-pin the new contract (milestone 5); `firstpaint.race` (body gating) unchanged.
- Approx marker: above the threshold a categorical stats line renders the `~` form, at/below it
  the exact form; the `allUnique` shortcut is suppressed when approx.

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with:

- **URL**: `?gen=wide&viz=on` · `{{TIER}}` = `wide` (1,000 × 100,000)
- `{{READY_BUDGET_MINUTES}}` = 10 (generation + export dominate; the load itself must now sit
  near the Phase 0 **viz=off** WIDE baseline)
- `{{LOAD_MS_EXPECTATION}}` = within ~1.5× of the Phase 0 WIDE viz=off `loadMs` baseline;
  `{{QUERY_BUDGET}}` = `VIZ.QUERIES_AT_LOAD_MAX` (66); `{{DOM_BUDGET}}` = Phase 0's recorded
  WIDE value (unchanged by this phase)
- `{{SORT_COL}}` = `col_1` · `{{SORT_QUERY_BUDGET}}` = Phase 0's baseline delta (record, not a
  budget) · `{{FILTER_QUERY_BUDGET}}` = `2 + 2 × visibleVizCount` (first count page-side the
  headers whose `.dt-col-viz` contains a canvas)
- `{{RESIZE_EXPECTATION}}` / `{{THEME_EXPECTATION}}` = no multi-second stall; the theme flip
  should be visibly faster than baseline (one observer + cached palette) ·
  `{{EXPORT_SIZE_RANGE}}` = ~0.5–8 MB for 1,000 rows × 1,000 cols parquet

Phase-specific additions to the template steps:

- **Step 3**: also assert `loadMs < vizReadyMs`; `queryCount ≤ 66` at `ready`; canvas census
  via `javascript_tool` (`document.querySelectorAll('.dt-root canvas').length ≤ 40`). The
  panel reaches `ready` on the load promise — call `window.__dtPerf.refresh()` again after the
  viz wave settles to read the final `vizReadyMs`. Screenshot #1: histograms on visible
  columns only.
- **Step 5**: at each stop, poll until newly visible headers grow canvases (histograms
  **stream in**); `queryCount` grows ≈ 2 × newly-visible viz columns; no canvases for
  far-offscreen columns.
- **Step 7**: before brushing, `resetQueryStats()` and record `visibleVizCount`. After the
  brush: chip appears, visible histograms re-render with the foreground/background split,
  query delta ≤ `2 + 2 × visibleVizCount` — **not** ~2,000. Then scroll an unvisited region
  into view: stale columns refresh on entry, already filter-aware, with a small query delta.
- **Step 10**: histogram colors update on visible canvases (palette-cache invalidation); the
  flip is fast.

Steps 4, 6, 8, 9, 11, 12 run as templated. Attach the final `window.__dtPerf.refresh()`
snapshot + 3 screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green; `npm run size` within budgets.
- [ ] Load promise resolves at first interactive paint; `vizReady` + `whenVizReady()` live;
      `dt:load:*` mark names unchanged; `eager: true` restores wait-for-all (test-proven).
- [ ] `VIZ` budgets committed and asserted in default CI at WIDE_CI: `QUERIES_AT_LOAD_MAX`,
      `CANVAS_COUNT_MAX`, `MAX_IN_FLIGHT`, per-filter formula.
- [ ] Sparse-registration + epoch-discard unit tests exist and predate the IO plumbing in the
      commit history (milestone 1 before 3).
- [ ] Filter change refetches visible-only; offscreen columns marked stale and refresh on
      scroll-into-view (Playwright-proven); a column move issues 0 viz queries.
- [ ] Approx-distinct above 100K rows with `~` marker (exact at or below); new Strings keys
      have English defaults. One ThemeWatcher per table; per-render `getComputedStyle` gone
      from the palette path.
- [ ] WIDE baselines re-captured (both viz modes) and committed; report regenerated;
      before/after headline in STATUS.md. Chrome template executed; evidence attached.
- [ ] Changeset + migration note shipped (§10); API-surface snapshot diff is exactly the
      intended additions.

## 9. Out of scope

Header DOM windowing and incremental header rebuild (Phase 4 — headers still exist for all
columns after this phase); canvas pooling; `QueryCache` byte caps and cache-key work (Phase 5);
stats panels beyond coordinator staleness parity; OffscreenCanvas (README §9 — deferred);
row-fetch projection (Phase 5); any loader/ingest change (Phase 1).

## 10. Docs / changeset obligations

- **Changeset (minor)** with a prominent `Changed` section + `Migration` note: `loadComplete` /
  `await createDataTable` now resolve at first interactive paint (viz still loading); use the
  new `vizReady` event / `whenVizReady()` — or `visualizations: { eager: true }` — where the
  old semantics are required (screenshot/PDF pipelines); `visualizations` option widened; new
  `Strings.statistics` keys (`approxUniqueCount`, `approxUniquePercent`); new `'low'` query
  priority.
- `docs/api-reference.md` regen (`npm run docs:api`) and API-surface snapshot update
  (`npx vitest -u`, verify the diff).
- `docs/guides/visualizations.md`: lazy lifecycle, `eager` opt-out, approx-distinct marker.
- `docs/guides/events.md`: `vizReady` row + updated `loadComplete` wording + event-flow diagram
  (`loadComplete` row at `:40`, diagram at `:80`).
- `docs/guides/i18n.md`: new statistics keys in the key table.
- JSDoc with `@example` on every new public member (README §8.3).

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: before/after headline numbers (WIDE viz=on
`loadMs` and `queryCount` at load — expect ~2,000 → ≤ 66; canvas count 1,000 → ≤ 40); the IO
root you shipped (§4.8.2 outcome) and any snapshot-seam fallbacks; exact `VIZ` budget values;
new files (`VizDataController.ts`, `ThemeWatcher.ts`, `concurrency.ts`, new specs); line-drift
notes for `src/DataTable.ts` (Phases 3–6 cite `attachVisualizations` and the load pipeline
heavily) and for the coordinators (Phase 10 reuses the staleness machinery).
