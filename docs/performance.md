# Performance

`@jeyabbalas/data-table` is designed to scale to ~1M rows in a single
table on a typical laptop. This doc covers the architectural limits,
what to watch for when scaling up, and the methodology for measuring
your own workload.

**Prerequisite: the mount container needs a bounded height.** Every number
in this doc assumes one. The table renders only the rows that fit in the
container, so the container's height is what caps the per-frame work; give
it no height and the scroller's "visible region" becomes the whole dataset,
which fetches and renders every row. That single mistake dominates every
other tuning lever here, and it is by far the most common cause of a
"slow" table. See [The virtual scroller](#the-virtual-scroller) below and
[Sizing the container](../README.md#sizing-the-container) in the README.

**Status of numeric benchmarks.** A reference-machine benchmark harness
is not yet in place for v0.1.x. This doc is methodology-first: it
explains the observable performance thresholds drawn from the
architecture, and shows you how to measure your own scenario. Concrete
numbers against a reference workload are on the roadmap for a follow-up
release.

## Architectural characteristics

### The virtual scroller

The table body renders only the visible row range. Given a fixed row
height (default 32 px) and the container's height, the scroller renders
roughly `⌈height / rowHeight⌉ + buffer` rows at any moment (the buffer is
5 rows above and below) — on a 1000 px tall container, that's about 35
rows, regardless of whether the underlying data has 1K rows or 10M.

**Implication:** initial paint and scroll latency don't scale with row
count. The cost moves elsewhere — to DuckDB query times and to memory
holding the loaded data.

**This holds only while the container's height is bounded.** The height is
read as `clientHeight` off the internal scroll element
(`src/table/VirtualScroller.ts:245`), and that element inherits its size
from the element you mount into. There is no `height` option and no
fallback height in the library: sizing is entirely the host page's job.

When the mount container has no resolved height, the chain collapses in a
way that is easy to miss because nothing errors. The library's root carries
`height: 100%` (`src/styles/02-shell.css:11-19`), which against an
auto-height parent resolves to `auto`, making the root content-sized. The
scroll element (`flex: 1; min-height: 0`) then grows to its own content —
and that content has an explicit `rowCount × rowHeight` height written onto
it so the scrollbar is proportioned correctly
(`VirtualScroller.ts:300-308`). So `clientHeight` comes back as the height
of the _entire dataset_, the computed visible range covers every row, and
the body issues a single `LIMIT <totalRows>` query
(`src/table/TableBody.ts:732`) and builds a DOM row for each one
(`TableBody.ts:812`).

At 1M rows that is a 32,000,000 px element, one query materializing 1M rows
into the row cache, and 1M rows of DOM — instead of ~35 rows and a
35-row query. Virtualization is not degraded, it is gone, and the numbers
in the [thresholds table](#observable-thresholds) no longer apply.

Two things make this hard to catch. It scales invisibly: on a 500-row
development fixture, rendering everything is fine, so the bug ships and
only shows up on production-sized data. And it is silent — the library
warns on a container that is _zero_-tall at mount (see
[troubleshooting](./troubleshooting.md)), but an unbounded container has a
perfectly ordinary non-zero height, just the wrong one, so no warning
fires.

The fix is CSS, not configuration: an explicit height (`height: 600px`,
`70vh`) or a flex/grid child with `flex: 1; min-height: 0`. The
`min-height: 0` matters — a flex item defaults to `min-height: auto` and
will not shrink below its content, which reproduces the unbounded case
inside a container that looks correctly sized. Full detail and copy-
pasteable CSS in [Sizing the container](../README.md#sizing-the-container).

One consequence worth knowing: nothing in the library subscribes to the
container's `ResizeObserver` to recompute the range, so the visible range
is refreshed on scroll and on state changes rather than on resize alone. A
container that changes height while the table sits idle can hold a stale
range until the next interaction. Sizing the container before mount, and
letting CSS resolve the height rather than assigning it imperatively
afterwards, sidesteps this.

### DuckDB in WASM

DuckDB runs in a Web Worker. By default it uses the single-thread bundle
(`mvp`); cross-origin-isolated pages (COOP/COEP headers) can use `coi`
with `SharedArrayBuffer` for multi-thread execution.

**Implication:** aggregations over millions of rows are fast (DuckDB is
column-oriented and vectorized), but not CPU-parallel in the default
setup. The `coi` bundle is the big lever if you're consistently seeing
10M+ row queries.

### Query cache

`WorkerBridge` has an LRU query cache, default size 100 entries. Cached
queries return instantly. The cache is invalidated automatically on any
mutation (filter / sort / derived column) that changes the result set.

**Implication:** filter-change → visualization-refresh loops stay fast
because repeated "unchanged" viz queries hit the cache. Tuning the cache
size can help if you have many visualizations and a lot of histogramming.

### Derived columns

- **Expression columns** cost only the VIEW creation (metadata, cheap)
  plus whatever DuckDB takes to evaluate the expression on each query.
- **Vector columns** store N values in a DuckDB helper table, where N =
  base row count. Memory cost is `sizeof(type) * N` plus some
  overhead.

**Implication:** for 1M rows, a `float` vector column is ~8 MB of extra
memory. A `string` vector is harder to estimate (varies with value
length). Prefer expression columns when feasible.

### Session snapshots

Snapshots persist to IndexedDB on a debounced save. A snapshot includes
the filters, sort, columns, derived columns, undo stack, vector
value pool, and (in `SNAPSHOT_VERSION` 5+) the `annotations` overlay
plus `columnHeaderTooltips`.

**Implication:** large vector columns plus deep undo stacks can push
snapshots into megabytes. IDB quotas vary by browser (Safari ≈ 1 GB,
Chrome ≈ 60% of disk). For heavy use, monitor `navigator.storage.estimate()`.

### Annotations

`AnnotationStore` keeps four secondary indexes (`byId`, `byRow`,
`byColumn`, `byCell`), so `getByRow` / `getByColumn` / `getByCell` are
O(1) regardless of total annotation count. `getByCell(rowId, column)`
returns the row + column + cell union and sorts in O(k log k) on the
small intersection — not a bottleneck.

Memory cost scales with the annotation count, not row × column count:
each annotation is one small object (a few hundred bytes including
indexes). Practical headroom up to ~50 000 annotations on commodity
laptops; beyond that, `toJSON` size dominates and IndexedDB writes get
heavier.

**Implication:** annotation-heavy apps (e.g. row-level JSON-Schema
validation across 100 000-row tables) should batch additions via
`addMany` (single `change` event), audit the `toJSON` size before
enabling persistence, and prefer `clear(scope?)` over individual
removals when wiping a category.

**View-only filtering is free.** `setSeverityFilter({ info: false })`
flips a boolean — it does not touch the store's data, just changes
what the rendering layer paints. Use it instead of removing-and-re-
adding annotations to toggle visibility.

## Observable thresholds

Approximate ranges from architectural reasoning — not measured:

| Dataset scale     | Expected experience                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| < 100 K rows      | Fully interactive, all features snappy. Filter changes < 50 ms                                                                           |
| 100 K – 1 M rows  | Interactive with faint cost on filter changes (100–300 ms). Virtualized scroll remains smooth. This is the design target                 |
| 1 M – 10 M rows   | Filter/sort latency becomes noticeable (300 ms – 2 s). Initial load takes seconds. Still workable for analytics, not for live dashboards |
| 10 M – 100 M rows | Outside the design target. Consider server-side aggregation; use this library for the summary layer                                      |
| > 100 M rows      | Don't                                                                                                                                    |

Memory usage grows roughly linearly with row count × column count. A
useful rule of thumb: expect ~50–100 bytes per cell in DuckDB, plus the
CSV/JSON/Parquet raw bytes during load.

## Tuning levers

### Row height

Default is 32 px. Taller rows show more content per row but the scroller
renders fewer at a time; shorter rows show more rows but cram content.
Either way the rendered-row count stays proportional to the container's
height, so this is a legibility choice rather than a performance lever —
the container's height is the term that actually bounds the work.

### Query cache size

Pass `bridgeOptions.cache: { size: 200 }` to increase the cache. Default
100 is fine for most apps; raise if you have many visualizations driving
lots of repeated queries.

### Combine multi-filter changes into one step

Adding filters one at a time triggers a re-query per call. When a single
user action (e.g. "apply this preset") needs to change several filters at
once, call `actions.loadFilterPreset(filters, sortColumns?)` — it replaces
the filter set atomically, fires one `filterChange` event, and captures
one undo snapshot. `StateActions` handles the internal batching; the
façade does not expose a separate `batch` primitive.

### Derived columns: expression over vector

SQL expressions execute in DuckDB (fast, vectorized); vectors sit in a
helper table and get joined in. Both work; expressions are cheaper both
in memory and in query time when the derivation is expressible as SQL.

### Disable unused features

Feature toggles reduce mount cost and memory:

```ts
await createDataTable({
  container,
  source,
  visualizations: false, // no column-header charts
  presets: false, // no preset panel
  exportDialog: false, // no export modal
  expressionFilter: false, // no raw-SQL filter button
  derivedColumns: false, // no "+" add-column button / f(x) edit icon
});
```

For a read-only display table, turning these off reduces initial JS +
CSS footprint measurably.

With both `expressionFilter: false` and `derivedColumns: false`, the modals
that bind CodeMirror are unreachable, so consumers can drop the
`@codemirror/*` and `@lezer/highlight` peer dependencies entirely. See
[`README.md` → Skipping CodeMirror](../README.md#skipping-codemirror) for the
full peer-dep list. The corresponding programmatic APIs
(`actions.addFilter({ type: 'raw-sql' })`, `actions.addDerivedColumn`,
`FilterPresetManager`) keep working in this mode.

## Measuring your workload

### Time a query

```ts
const t0 = performance.now();
const result = await table.bridge.query('SELECT COUNT(*) AS n FROM trips WHERE …');
const ms = performance.now() - t0;
console.log(`Query took ${ms.toFixed(1)} ms`);
```

Use this to compare expression-column definitions, raw-SQL filters, or
any SQL-driving code.

### Time a filter change

```ts
table.on('filterChange', () => {
  const t = performance.now();
  table.on(
    'filterChange',
    () => {
      console.log(`Filter change rendered in ${(performance.now() - t).toFixed(1)} ms`);
    },
    { once: true },
  );
});
```

This approximates the filter → re-query → re-render round-trip.

### Profile in DevTools

The Performance tab in Chrome / Firefox DevTools shows where time is
spent — worker messages, DOM updates, canvas rendering. Typical hot paths:

- **WorkerBridge.query** — DuckDB query time + message round-trip
- **VirtualScroller renderRange** — row re-rendering on scroll
- **BaseVisualization.render** — canvas drawing for the viz row

### Monitor memory

```ts
// In Chrome only:
console.log(performance.memory.usedJSHeapSize / 1024 / 1024, 'MB heap');

// Cross-browser:
const estimate = await navigator.storage.estimate();
console.log('IDB quota used:', estimate.usage, '/', estimate.quota);
```

Keep an eye on `usedJSHeapSize` across a session; if it climbs steadily,
either your code is leaking references to destroyed tables, or derived
vector columns are accumulating.

## Common performance pitfalls

### An unbounded container height

The one that dwarfs everything else on this list. Symptoms: the tab hangs
for seconds after load, memory climbs into the gigabytes, scrolling is
unusable, and a DevTools profile shows enormous time in DOM work rather
than in `WorkerBridge.query`. Cause: the mount container has no bounded
height, so the scroller measures the whole dataset as its viewport and
renders every row (see [The virtual scroller](#the-virtual-scroller)).

Check it in the console:

```ts
const el = document.getElementById('my-table')!;
const rendered = el.querySelectorAll('.dt-row').length; // default classPrefix
console.log(el.clientHeight, 'px container,', rendered, 'rows in the DOM');
// Healthy: a few hundred px, tens of rows.
// Broken:  a container as tall as rowCount × rowHeight, and thousands of rows.
```

Fix it in CSS — `height: 600px` on the container, or `flex: 1;
min-height: 0` if it should fill a flex parent.

### Peak memory during a large dataset swap

`loadData()` drops the previous DuckDB base table after the new one
is live (or replaces it atomically when the `tableName` matches), so
the catalog does not accumulate orphans across reloads. While the
new load is in flight, both buffers coexist briefly — for very large
dataset swaps where peak main-thread memory matters, `destroy()` +
recreate releases the previous buffers earlier than `loadData()`:

```ts
// Both buffers coexist briefly during the swap.
await table.loadData(largeSource1);
await table.loadData(largeSource2);

// Prefer destroy + recreate when peak memory matters more than
// preserving the table instance:
await table.destroy();
table = await createDataTable({ container, source: largeSource3 });
```

### Deep undo stacks with big vector columns

Each undo snapshot copies the vector value pool references. With a
1M-row vector column and dozens of undo entries, snapshot size balloons.
Consider `actions.undoManager?.clear()` periodically, or accept the
trade.

### Many small tables on a page

Every table owns its own worker + DuckDB instance. Ten tables = ten
workers = ten × ~30 MB base memory. Consider one table with derived
columns instead, or lazy-mount tables via `IntersectionObserver`.

### Rebuilding the table on every prop change

```tsx
// Bad — new source URL object on every render re-mounts the table
<Table source={{ url: '/data.csv' }} />

// Good — primitive dep
<Table source="/data.csv" />
```

See the [React](./integrations/react.md), [Vue](./integrations/vue.md),
and [Svelte](./integrations/svelte.md) integration guides for the
mount-once-reload-many pattern.

### Visualizations refetching on every filter

`BaseVisualization.updateFilters()` is called on every filter change,
even filters unrelated to the viz's own column. Custom visualizations
doing expensive `fetchData()` should compare incoming filters against a
cached signature before re-querying.

## Memory hygiene on teardown

`table.destroy()` is authoritative — after it resolves:

- The worker is terminated (unless shared)
- The DuckDB base table is dropped from the worker when the bridge
  is shared (i.e. you passed it in via `bridge: …`); when the table
  owns its bridge, `terminate()` discards the worker entirely so the
  drop is unnecessary
- All DOM is removed
- Signal subscriptions are disposed
- IDB connections close (if owned; shared stores are your responsibility)

Don't manually remove the container's children before `destroy()` — the
library expects to do that itself. Call `destroy()`, await it, and then
remove the container if you need to.

## Known slow paths (as of v0.2.0)

- **Initial schema detection on very wide tables.** Tables with hundreds of columns spend measurable time in `DESCRIBE` queries during load.
- **First-run WASM compilation.** A cold browser takes a few seconds to compile DuckDB's WASM. Subsequent loads hit the HTTP cache.
- **Filter changes that shrink the dataset to near-zero.** Some visualizations (e.g., date histogram) recalculate bins, which has a fixed cost that dominates when the result set is tiny. Usually < 300 ms total; on 10M-row datasets it can approach 1 s.
- **Sub-second `INTERVAL` bin assignment.** The histogram `min` value goes through `MIN(col)::VARCHAR + parseIntervalToSeconds` on the JS side while the bin SQL extracts seconds via `EXTRACT(...)`. The two paths can disagree at the 4th decimal for sub-second intervals; the resulting drift is locked behind `tests/visualizations/histogram/IntervalHistogram.duckdb.test.ts`. A future fix would compute `min_seconds` server-side so both paths agree by construction.

## Phase-9 benchmark snapshot (2026-04-26, 0.2.0 baseline)

These numbers were captured locally on an M1 MacBook Pro running Node 20 +
DuckDB-WASM 1.33.x. Treat them as an order-of-magnitude reference, not a
precise SLA — they vary 2-3× between hardware classes and 4-5× under CI
runners. The opt-in `npm run test:perf` (`RUN_DUCKDB_PERF=1
RUN_LIFECYCLE_STRESS=1`) re-runs the full perf suite locally.

### Real-DuckDB load + filter (fixtures shipped with the test suite)

| Scenario                                         | Local median | Per-test budget | Notes                                          |
| ------------------------------------------------ | ------------ | --------------- | ---------------------------------------------- |
| `createNodeDuckDB()` boot                        | 600–800 ms   | 4000 ms         | Node `worker_threads`; browser cold-start TBD  |
| `nyc_taxi.parquet` load (100 k × 19 cols)        | ~600 ms      | 8000 ms         | The recommended fixture for first-load testing |
| `nyc_taxi.csv` load (100 k × 19 cols)            | ~3500 ms     | 15 000 ms       | CSV parse is ~6× the Parquet path              |
| 100 cached `SELECT` round-trips                  | ~25 ms       | 150 ms          | Pure cache hit                                 |
| 100 uncached `COUNT(*)` queries                  | ~700 ms      | 3000 ms         | Distinct WHERE clause each iteration           |
| 1 M-row range filter `COUNT(*) WHERE BETWEEN`    | ~300 ms      | 1500 ms         | Synthetic `range(1_000_000)` table             |
| 1 M-row set filter `COUNT(*) WHERE col IN (10)`  | ~400 ms      | 2000 ms         | Same synthetic table                           |
| 1 M-row pattern filter `COUNT(*) WHERE LIKE 'x'` | ~800 ms      | 4000 ms         | Same synthetic table                           |

### Pure-JS micro-benchmarks (run on every `npm test`)

| Scenario                                  | Local median | Per-test budget | Notes                                                     |
| ----------------------------------------- | ------------ | --------------- | --------------------------------------------------------- |
| `AnnotationStore.addMany(10_000)`         | ~50 ms       | 250 ms          | Mixed row/column/cell scope                               |
| 1000 random `getByCell` against 10 k anns | ~120 ms      | 500 ms          | ~150 column-anns per col; sort by severity rank dominates |
| `VirtualScroller` scroll handler (median) | ~0.05 ms     | 1 ms            | `setTotalRows(1_000_000)` then 1000 synthetic dispatches  |
| `VirtualScroller` scroll handler (p99)    | ~0.2 ms      | 16.6 ms         | Synthetic 60 fps frame budget                             |

### Memory-leak gates (run on every `npm test`)

The default `tests/performance/memory-leaks.test.ts` covers signal sub/unsub
cleanup, TableState baseline subscriber counts, QueryCache bounds, DOM
pooling, shared-bridge ownership semantics, 1k-mutation autosave coalescing,
and 100 create/destroy cycles. The deeper 1000-cycle stress lives at
`tests/performance/lifecycle-stress.test.ts` (`RUN_LIFECYCLE_STRESS=1`).

### Bundle-size budgets

`npm run size` enforces brotli-compressed caps with ~5 % headroom. Phase-9
post-build actuals (2026-04-26):

| Entry                           | Actual   | Cap    |
| ------------------------------- | -------- | ------ |
| Root entry · ESM                | 7.33 kB  | 7.7 kB |
| Root entry · CJS                | 6.46 kB  | 6.8 kB |
| `/advanced` entry · ESM         | 2.36 kB  | 2.5 kB |
| `/advanced` entry · CJS         | 2.01 kB  | 2.2 kB |
| Stylesheet                      | 16.14 kB | 17 kB  |
| Lazy `ExportDialog` chunk · ESM | 77.43 kB | 81 kB  |
| Lazy `ExportDialog` chunk · CJS | 71.85 kB | 76 kB  |

The lazy `ExportDialog` chunk dominates because it pulls in the Parquet
encoder; the root entry stays tiny (under 8 kB) so consumers paying first
paint don't pay for export.

### Tarball composition

`npm pack --dry-run` shows 250 files, 1.4 MB tarball, 6.1 MB unpacked.
Sourcemaps account for ~4 MB of the unpacked size; the library deliberately
ships them so consumers can debug into library source frames in DevTools.
Trimming sourcemaps is a deferred consumer-DX trade-off — open an issue if
your environment requires it.

## Future benchmark tracking

Planned for a follow-up release:

- A reference-machine configuration so numbers are comparable across releases
- A Playwright nightly job for real-browser frame timing and WASM cold-start
- 10 M-row scaling profiles (today the docs assume 100 K – 1 M)

Until that's in place, this doc stays methodology-first. If you
measure something interesting about your workload, share it in an issue
— it helps calibrate the thresholds here.

## Related

- Architecture: [Architecture concept doc](./concepts/architecture.md)
- Derived columns: [Derived columns guide](./guides/derived-columns.md) — expression vs vector trade-offs
- CSP / offline: [CSP and offline guide](./guides/csp-and-offline.md) — `coi` bundle for multi-thread execution
- Session persistence: [Session persistence guide](./guides/session-persistence.md) — IDB quota considerations
