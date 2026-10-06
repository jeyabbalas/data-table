# Performance

`@jeyabbalas/data-table` keeps rendering virtualized at any practical
row count: the row DOM, the scrollbar, and the scroll mapping stay
correct at 50M+ rows. The practical ceilings live elsewhere — in DuckDB
query latency (filter and sort cost grows with data volume) and in
browser memory holding the loaded data. This doc covers those limits,
what to watch for when scaling up, and the methodology for measuring
your own workload.

**Prerequisite: the mount container needs a bounded height.** Every number
in this doc assumes one. The table renders only the rows that fit in the
container, so the container's height is what caps the per-frame work; give
it no height and the scroller's "visible region" becomes the whole dataset
(up to the height cap), which fetches and renders every row it can reach.
That single mistake dominates every
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

The scrollbar is proportioned by a spacer element whose height is
`min(totalRows × rowHeight, 15,000,000 px)` (`setTotalRows`,
`src/table/VirtualScroller.ts:434-443`). The cap exists because browsers
silently clamp element heights — Blink/WebKit saturate at ≈33,554,431 px,
Gecko at ≈17,895,697 px — so an uncapped spacer stops growing partway
through a large dataset and strands the scrollbar: before the cap, a
1.5M-row table at the default 32 px asked for more height than Chrome
honors, and scrolling bottomed out near row ~1,048,576. Datasets at or
below 468,750 rows at 32 px fit under the cap and scroll exactly as
before, with `scrollTop` as the virtual position. Above it, the scroller
maps physical scroll positions into virtual row space: deltas up to one
viewport height (wheel, trackpad, keyboard) move linearly so native
scrolling feels unchanged, larger jumps (scrollbar thumb drags) map
proportionally across the full range, and the two spaces reconcile
exactly at the edges — `scrollTop` 0 is row 0, max scroll puts the last
row fully in view. The mapping reads the measured `scrollHeight` at
event time, so an engine that clamps below 15M px anyway (Chrome at high
zoom) self-corrects. Rows are positioned with inline `top` rather than
`transform: translateY`, which is float32 and quantizes to whole pixels
above ~8.4M px.

**This holds only while the container's height is bounded.** The height is
read as `clientHeight` off the internal scroll element
(`calculateVisibleRange`, `src/table/VirtualScroller.ts:353`), and that
element inherits its size from the element you mount into. There is no
`height` option and no fallback height in the library: sizing is entirely
the host page's job.

When the mount container has no resolved height, the chain collapses in a
way that is easy to miss because nothing errors. The library's root carries
`height: 100%` (`src/styles/02-shell.css:11-19`), which against an
auto-height parent resolves to `auto`, making the root content-sized. The
scroll element (`flex: 1; min-height: 0`) then grows to its own content —
and that content has the explicit `min(rowCount × rowHeight,
15,000,000 px)` spacer height written onto it so the scrollbar is
proportioned correctly (`setTotalRows`, `VirtualScroller.ts:434-443`). So
`clientHeight` comes back as the height of the entire spacer, the computed
visible range covers every row under the cap, and the body treats that
range like any other: it builds a DOM row — or a placeholder row — for
each index (`renderVisibleRows`, `src/table/TableBody.ts:1449`) and
fetches the lot in 128-row blocks, at most 2 in flight (`ensureFetched`,
`TableBody.ts:954`).

The height cap saturates the damage rather than removing it: at the
default 32 px the degenerate "viewport" tops out at ~468,750 rendered rows
instead of the whole dataset, with the block pipeline grinding through
them 128 rows at a time — hundreds of thousands of DOM rows instead of
~35. Virtualization is not degraded, it is gone, and the numbers in the
[thresholds table](#observable-thresholds) no longer apply.

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

The visible range is worked out again on scroll, on state changes, and
whenever the body resizes, so a container whose height changes after mount
gets the rows its new height shows without a scroll.

### DuckDB in WASM

DuckDB runs in a Web Worker. By default it uses the single-thread bundle
(`mvp`); cross-origin-isolated pages (COOP/COEP headers) can use `coi`
with `SharedArrayBuffer` for multi-thread execution.

**Implication:** aggregations over millions of rows are fast (DuckDB is
column-oriented and vectorized), but not CPU-parallel in the default
setup. The `coi` bundle is the big lever if you're consistently seeing
10M+ row queries.

The worker builds a result's rows from its column vectors, by position,
rather than through the proxy Arrow makes for each row: 100,000 rows of 20
columns read in 0.28 s where they took 0.94 s, 2,000 rows of 1,000 columns
in 0.41 s where they took 1.11 s, and a 128-row grid block of 30 columns in
1.4 ms where it took 2.5 ms (`convertBatch`, `src/worker/duckdb.ts`).

### Query cache

`WorkerBridge` has an LRU query cache, default size 100 entries. Cached
queries return instantly. The cache is invalidated automatically on any
mutation (filter / sort / derived column) that changes the result set.

**Implication:** filter-change → visualization-refresh loops stay fast
because repeated "unchanged" viz queries hit the cache. Tuning the cache
size can help if you have many visualizations and a lot of histogramming.

Viewport row fetches deliberately bypass this cache (`cache: false` on
`WorkerBridge.query` — see `QueryOptions`,
`src/data/WorkerBridge.ts:51`). The block-based row cache in `TableBody`
is the authoritative store for scroll data, invalidated in lockstep with
the fetch epoch; a second SQL-keyed copy would only add a second
staleness domain. Keeping scroll SQL out of the LRU also means a fast
scroll no longer evicts the header-stats and histogram entries the cache
exists to serve. The batches of CSV, JSON and clipboard exports skip it
too, as `getCellValue`, the value inspector and `getColumnValues` of a nested
column do: nothing reads a batch twice, and a nested column's batch is
megabytes of JSON text (a 30,000-row CSV export of one `FLOAT[768]` column
left 460 MB in the cache when it went through it), which would also evict
the chart and stats results the cache is for.

The same options object carries `priority: 'high' | 'elevated' | 'normal'`,
the query's place in the worker's serial dispatch queue. Viewport fetches go
out at `'high'` and jump all queued work. `getCellValue` and the value
inspector's read go out at `'elevated'`, behind the queued fetches and ahead
of queued stats and histogram work, so a host that loops over `getCellValue`
holds charts back but not the rows of a scroll. Everything else is
`'normal'`.

### Column charts

A column's chart is built only while its header is in view or within
200 px of it, and removed once the header is 400 px away. Loading and filter
changes therefore run chart queries for about a screen's worth of columns,
however wide the table. A hide, show, move or pin keeps every other column's
chart, and a custom stats panel lives while its column is near the view, built
once scrolling pauses rather than for every column a scroll passes. On a
50,000-row × 1,000-column table, `loadData` dropped from 20.4 s to 6.2 s and
a filter from 4.4 s to 0.5 s. See
[Visualizations → Charts on wide tables](./guides/visualizations.md#charts-on-wide-tables).

### Wide tables

Body rows and the header render in full only the columns near the view:
the pinned columns, the columns in view and a viewport either side, and the
columns something is using (the keyboard cursor's, the one holding DOM
focus, one being resized or dragged, one whose panel is open). A row holds
cells for those only, with a spacer for each gap, and row fetches select
those columns and some either side. Every other column keeps a header
without its buttons, so each visible column still has its `columnheader`.
At 1,000 columns in a 1,200 px view, a row holds about two dozen cells and
the header about 10,500 elements, where they held 1,000 cells and 36,000
elements.

Hiding, showing, moving or pinning a column updates both in place: the other
columns keep their headers, and the rows keep what they fetched, so a hide or
a move fetches no rows and a column shown is read by itself. On a
50,000-row × 1,000-column table a hide takes about 25 ms.

### Nested columns

A LIST, ARRAY, STRUCT, MAP, UNION or VARIANT column costs more than a scalar
one, in ways each kept bounded (see
[Nested and JSON columns](./guides/loading-data.md#nested-and-json-columns)):

- **Row fetches.** The grid reads a nested column as DuckDB's text, cut to
  32 items of a list or map and to 1,000 graphemes and a `…` per cell, so a
  128-row block holds at most 128 such cells of each nested column (a
  grapheme can be several UTF-16 code units: an emoji sequence, a letter
  with its accents). A block of a `FLOAT[768]` embedding column is about
  50 KB; its whole text was 1.18 MB. DuckDB formats only what that text can
  reach: the items a cell shows are copied out of their list before the
  cast, and every list, array or map inside a value is cut to its first
  1,001 items, more than the cap can show. A 128-row block of
  `STRUCT(id BIGINT, v DOUBLE[])` with 200,000-item lists took 4.3–5.4 s
  when DuckDB formatted the whole values, and takes 34 ms. Still formatted
  whole: a UNION's or a VARIANT's value, a list inside one included, a map's
  keys, a struct with a field named with the empty string, and lists nested
  more than 16 levels deep in a value; and a value of several levels of long
  lists, such as a GeoJSON MultiPolygon, can still format some
  1,001 × 1,001 items.
- **Header charts.** A nested column's summary bar is one query of
  ungrouped `COUNT(*), COUNT(c)` scans: one of every row, and with filters
  on a second with the filters in its `WHERE`, as the other charts have
  them. `COUNT(c)` reads only the column's validity. Grouping the values, as
  the value counts do, took 18–21 s on a 200,000-row embedding column.
- **Exact filters.** A point, set or not-set filter with `valueType: 'text'`,
  as the filter panel makes on a nested column, compares
  `CAST(col AS VARCHAR)`, so DuckDB formats every row's whole value in each
  query the filter is in: every row block, the row count and every chart.
  On 20,000 rows of `FLOAT[768]`, each such query took about 1.7 s in
  duckdb-wasm under Node, where a filter on an integer column took under
  1 ms; on 200,000 rows of three-item `VARCHAR[]` lists, about 19 ms. A
  pattern filter casts the same way, and took about 2.3 s there, and a
  derived column of the text costs the same, since the VIEW computes it in
  each query. To filter on one part of a long value, add that part as a
  column ([`addNestedFieldColumn`](./guides/derived-columns.md#nested-columns))
  and filter it.
- **Sorting.** A sort compares whole values, and deep pages of a sorted table
  pay `OFFSET` as any sort does. A wide value such as an embedding is the
  expensive case.
- **Memory.** A nested value takes what its parts take, as DuckDB stores
  them: a list 8 bytes a row plus its items, a struct its fields, a
  `FLOAT[768]` embedding about 3 KB a row. The memory check before a Parquet
  load sizes them that way (`src/worker/loaders/memoryBudget.ts`).
- **The value inspector** reads one cell, by `__rowid__`, ahead of queued
  chart queries and behind the grid's row fetches (`priority: 'elevated'`),
  and at most the first 2,097,152 characters of its JSON text
  (8,388,608 for Copy JSON); its tree builds only the rows it shows, in
  buckets of 100.
- **Lazy chunks.** The inspector and the extract panel load the first time a
  table opens them. A load that fails is said in the live region and
  reported as an `error` event coded `CHUNK_LOAD_FAILED`, and the next open
  asks for the chunk again, which Chrome answers with the same failure until
  the page reloads. Their brotli sizes: the `ValueInspector` chunk 8.45 kB,
  the `ExtractColumnPanel` chunk 4.95 kB, the `TreeView` chunk the two share
  2.79 kB, and the `extractExpression` chunk 2.81 kB, which both panels and
  `actions.addNestedFieldColumn` load. The shared chunk every table loads is
  97.67 kB, the stylesheet 22.57 kB, the root entry 10.93 kB and `/advanced`
  2.50 kB (`.size-limit.cjs` holds the caps).
- **Value reads and exports.** `getCellValue`, `getColumnValues` and the CSV
  and JSON exports read nested values as exact JSON text, and none of those
  reads goes through the query cache, which must not keep megabytes of text.
  An export batch, a clipboard copy and a paged `getColumnValues` pick the
  page's `__rowid__`s first and read the values of those rows only, where
  one `SELECT` would compute the JSON of every row before keeping the page:
  a 10-row copy at row 30,000 of 100,000 `FLOAT[768]` rows went from 4.6 s
  to 4 ms, a 10,000-row export batch from about 4.5 s to 0.5 s, and
  `getColumnValues(name, { scope: 'filtered', limit: 1000 })` of 60,000 such
  rows from 2.3 s to 55 ms. A type built only from lists, arrays and named
  structs of integers up to `UINTEGER`, `FLOAT`s, `DOUBLE`s and `BOOLEAN`s,
  an embedding's for one, is read with `JSON.parse`, about twice as fast as
  the lossless reader the other types need. A 768-float embedding is some
  15,000 characters of JSON, so a CSV or JSON export of many of them can
  pass the browser's limit on a string; export them to Parquet.

Medians from `tests/performance/nestedCells.bench.duckdb.test.ts` on one
Apple-silicon machine (Node `worker_threads`), over 200,000 rows of 40 scalar
and 6 nested columns: a `FLOAT[64]` embedding, two lists holding 2,000 items
in 2% of rows, a struct, a map and a list of structs. They are one machine's
numbers, not guarantees:

| Operation                                                                 | Median                             |
| ------------------------------------------------------------------------- | ---------------------------------- |
| A 128-row block of all 46 columns, unsorted, at the top or at row 150,000 | ~11 ms                             |
| A deep page (row 150,000) sorted by the struct                            | ~35 ms                             |
| A deep page sorted by the `FLOAT[64]` embedding                           | ~400 ms                            |
| A nested column's header-chart counts                                     | ~2–4 ms (~42 ms for a `VARCHAR[]`) |
| The exact JSON of one 2,000-item list cell, as `getCellValue` reads it    | ~2 ms                              |
| A 128-row block of `FLOAT[768]` embeddings (20,000 rows)                  | ~12 ms                             |

A 2,000-item list cell reads `[0, 1, …, 31, … +1968]` in such a block.
Measure your own with `npm run test:perf`, or this benchmark alone with
`RUN_DUCKDB_PERF=1 npx vitest run --config vitest.perf.config.ts nestedCells`;
its budgets are 5–6× these medians, and 10–12× for the two that take a few
milliseconds (the projection's plan and the exact JSON read).

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

Approximate ranges from architectural reasoning — not measured. Scrolling
is not the axis being graded here: virtualization and the scrollbar stay
correct throughout (the scroller is exact at 50M+ rows), and unsorted,
unfiltered scrolling fetches blocks by `__rowid__` range — a
zonemap-pruned scan that takes milliseconds at any scroll depth. What
grows with scale is query latency: filter and sort cost, and deep scrolls
_while sorted or filtered_, which still page with `LIMIT … OFFSET` and
get slower the further down you are. That, plus the memory holding the
loaded data, is what the tiers grade:

| Dataset scale     | Expected experience                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| < 100 K rows      | Fully interactive, all features snappy. Filter changes < 50 ms                                                                                       |
| 100 K – 1 M rows  | Interactive with faint cost on filter changes (100–300 ms). Virtualized scroll remains smooth                                                        |
| 1 M – 10 M rows   | Filter/sort latency becomes noticeable (300 ms – 2 s). Initial load takes seconds. Still workable for analytics, not for live dashboards             |
| 10 M – 100 M rows | Scrolling stays correct; filter/sort latency and load-time memory dominate. Consider server-side aggregation; use this library for the summary layer |
| > 100 M rows      | Don't — the loaded data outgrows browser memory long before the scroller cares                                                                       |

Memory usage grows roughly linearly with row count × column count: DuckDB
takes 5–20 bytes per value for numbers, dates, and booleans, about 4
bytes plus the text for strings, and for a nested value what its parts take
(a 768-float embedding is about 3 KB). That memory lives in WebAssembly, which
browsers cap at 4 GiB, and DuckDB's own `memory_limit` defaults to 3.1 GiB,
so around 2.5 GiB of table is the practical ceiling — 200,000 rows × 1,000
numeric columns is about 2.2 GiB. Pass large Parquet files as a `File`,
`Blob`, or URL so DuckDB reads them from disk instead of holding the file
next to the table; a Parquet load that will not fit rejects with
`LOAD_MEMORY_EXCEEDED` before it starts (see
[Large Parquet files](./guides/loading-data.md#large-parquet-files)). CSV
and JSON are still read into memory as text first.

## Tuning levers

### Row height

Default is 32 px, set through the `rowHeight` option — not by overriding
`--dt-row-height`, which the library writes from that option (see
[Theming → Sizing](./guides/theming.md#sizing)). Taller rows show more
content per row but the scroller renders fewer at a time; shorter rows show
more rows but cram content. Either way the rendered-row count stays
proportional to the container's height, so this is a legibility choice
rather than a performance lever — the container's height is the term that
actually bounds the work.

### Query cache size

Pass `bridgeOptions.cache: { size: 200 }` to increase the cache. Default
100 is fine for most apps; raise if you have many visualizations driving
lots of repeated queries.

### Scroll fetch pipeline: `fetchBlockSize`, `rowCacheRows`, `prefetch`

Three `createDataTable` options shape how the body fetches rows while you
scroll. `fetchBlockSize` (default 128, clamped to 16–1024) is the
quantum: row fetches are block-aligned windows of this many rows, so
overlapping scroll positions dedupe onto the same query and a block
already in flight is never re-requested. Bigger blocks mean fewer, larger
queries per scroll distance; the default already spans a few viewports of
rows, so raise it mainly for very tall viewports, and lower it only when
rows are extremely wide and transfer size matters.

`rowCacheRows` (default 2048, rounded up to whole blocks with a floor of
4 blocks) caps the in-memory row cache. Eviction is whole-block, furthest
from the live viewport first, so raising it makes longer back-scrolls
repaint instantly with zero queries at the cost of memory. It never
affects correctness — only how often previously seen blocks are
re-fetched.

`prefetch` (default `true`) speculatively fetches one block beyond the
viewport in the current scroll direction while the pipeline is otherwise
idle. It runs at normal worker priority, so visible-row fetches always
jump ahead of it, and a direction change abandons it. Disable it to keep
query volume to the strict minimum — e.g. when the table shares its
DuckDB worker with heavier analytical queries.

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
  derivedColumns: false, // no "+" button, f(x) icon or nested extract buttons
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

- **WorkerBridge.query** — DuckDB query time + message round-trip. Every
  query rides the worker's serial three-level queue: viewport row fetches go
  out at `'high'` and jump all queued work, a cell read at `'elevated'`
  jumps queued `'normal'` work, and an aborted fetch is dequeued for free —
  or genuinely cancelled mid-query via DuckDB's pending-query path
- **TableBody.renderVisibleRows** — row painting on every scroll frame:
  cached rows paint as data, missing rows paint as placeholders that are
  replaced whole when their block fetch lands
- **TableBody.ensureFetched / fetchBlock** — the block fetch pipeline:
  block-aligned queries, aborts of blocks scrolled out of the window, the
  one-block prefetch
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
height, so the scroller measures the full (height-capped) spacer as its
viewport and renders every row under the cap (see
[The virtual scroller](#the-virtual-scroller)).

Check it in the console:

```ts
const el = document.getElementById('my-table')!;
const rendered = el.querySelectorAll('.dt-row').length; // default classPrefix
console.log(el.clientHeight, 'px container,', rendered, 'rows in the DOM');
// Healthy: a few hundred px, tens of rows.
// Broken:  a container as tall as min(rowCount × rowHeight, 15,000,000) px,
//          and rendered rows by the hundred thousand (saturating around
//          468,750 at the default 32 px).
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

`BaseVisualization.updateFilters()` is called on every filter change for
every chart in or near view, even filters unrelated to the viz's own
column. Custom visualizations
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
- 10 M-row scaling profiles for filter/sort latency (the scroller is
  already exact at that scale; the query-latency tiers above are the part
  still reasoned rather than measured)

Until that's in place, this doc stays methodology-first. If you
measure something interesting about your workload, share it in an issue
— it helps calibrate the thresholds here.

## Related

- Architecture: [Architecture concept doc](./concepts/architecture.md)
- Derived columns: [Derived columns guide](./guides/derived-columns.md) — expression vs vector trade-offs
- CSP / offline: [CSP and offline guide](./guides/csp-and-offline.md) — `coi` bundle for multi-thread execution
- Session persistence: [Session persistence guide](./guides/session-persistence.md) — IDB quota considerations
