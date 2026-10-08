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

**Where the numbers come from.** This doc explains the limits from the
architecture and shows how to measure your own workload. Most of its
numbers were measured; the threshold tiers are reasoned, and so are a few
round figures such as a worker's base memory and the annotation headroom.
[Reference numbers](#reference-numbers) collects the main measurements,
each with where and when it was taken. What measures performance in this
repository:

- **`npm run test:perf`** runs the seven files in `tests/performance/`
  with `RUN_DUCKDB_PERF=1` and `RUN_LIFECYCLE_STRESS=1` set
  (`vitest.perf.config.ts`): 47 tests, in about 7 seconds on an Apple M1
  Pro. Three files run only there. `benchmarks.duckdb.test.ts` times real
  DuckDB, duckdb-wasm's Node build in `worker_threads`: its start-up,
  loading the 100,000-row `nyc_taxi` fixtures from Parquet and CSV, cached
  and uncached queries, range, set and pattern filters over 1M rows, and
  200 `__rowid__`-range block fetches over 1.6M rows.
  `nestedCells.bench.duckdb.test.ts` times the grid's reads of nested
  columns over 200,000 rows, and `lifecycle-stress.test.ts` runs 1,000
  create/destroy cycles. The other four files run in every `npm test` as
  well: `memory-leaks.test.ts` (subscriptions, cache and row-cache bounds,
  a shared bridge outliving one of its tables, 1,000 filter changes with
  autosave, 100 create/destroy cycles), `annotations.bench.test.ts`
  (`AnnotationStore` at 10,000 annotations), `scroll-handler.bench.test.ts`
  (the scroll handler's per-event budget at 1M and 50M rows) and
  `benchmarks.test.ts` (query-cache, SQL-generation and signal
  micro-benchmarks).
- **`npm run test:browser`** runs the Playwright suite: 32 spec files in
  Chromium, served by the demo's dev server. Besides keyboard and contrast
  checks, its large-table specs work at full scale in a real browser
  engine (scroll extents at 1.6M and 2M rows, a fetch storm at 200,000
  rows, a sweep of 1,000 columns, charts across 300 columns, 200,000 rows
  of nested values, Parquet `File` loads) and assert counts more than
  times: header elements, mounted columns, live charts, the queries a
  column change runs.
- **`npm run size`** checks the brotli size of the 13 files in
  `.size-limit.cjs` (the entries, the stylesheet and the lazy chunks)
  against their caps; the worker script has no budget. See
  [Bundle-size budgets](#bundle-size-budgets).
- **CI** runs, on every pull request and every push to `main`,
  `npm run test:coverage` (the whole unit suite, those four files
  included), the browser suite and the size budgets. No CI job runs
  `npm run test:perf`; see
  [How performance is tracked](#how-performance-is-tracked).

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
`height: 100%` (`src/styles/02-shell.css:11-26`), which against an
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

DuckDB runs in a Web Worker, on one thread by default. Unless you pass
`bridgeOptions.duckdbBundles`, the library hands duckdb-wasm's
`selectBundle` the jsDelivr bundles, which list `mvp` and `eh` only
(`initializeDuckDB`, `src/worker/duckdb.ts`). `selectBundle` picks `eh` in
a browser with WebAssembly exception handling, and `mvp` in one without
it. It picks the multi-threaded `coi` bundle only when your
`duckdbBundles` list one and the page is cross-origin isolated (COOP/COEP
headers) with WebAssembly threads and SIMD; see
[CSP and offline deployments](./guides/csp-and-offline.md#self-hosting-the-wasm-bundles).

**Implication:** aggregations over millions of rows are fast (DuckDB is
column-oriented and vectorized), but by default they run on one CPU core.
A `coi` bundle is the way to more threads. Nothing in this repository
measures it, and its pthread workers go without the library's fix for
files opened once DuckDB's memory passes 2 GiB
([Troubleshooting §32](./troubleshooting.md#32-too-small-to-be-a-parquet-file-or-prefetch-registered-for-bytes-outside-file--file-size-0)).

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
`src/data/WorkerBridge.ts:54`). The block-based row cache in `TableBody`
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
out at `'high'` and jump all queued work. `getCellValue`, the value
inspector's read and the row count of a filter change go out at
`'elevated'`, behind the queued fetches and ahead of queued stats and
histogram work, so a host that loops over `getCellValue` holds charts back
but not the rows of a scroll. Everything else is `'normal'`.

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
50,000-row × 1,000-column table a hide's synchronous work takes about
25 ms.

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
  the page reloads. Their brotli sizes: the `ValueInspector` chunk 8.44 kB,
  the `ExtractColumnPanel` chunk 4.98 kB, the `TreeView` chunk the two share
  2.80 kB, and the `extractExpression` chunk 2.78 kB, which both panels and
  `actions.addNestedFieldColumn` load. The shared chunk every table loads is
  100.88 kB, the stylesheet 22.87 kB, the root entry 11.05 kB and `/advanced`
  2.15 kB (`.size-limit.cjs` holds the caps).
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

Approximate ranges, reasoned from the architecture: the tiers have not
been measured one by one, and the points that have been are in
[Reference numbers](#reference-numbers). Scrolling is not the axis being
graded here: virtualization and the scrollbar stay correct throughout (the
scroller is exact at 50M+ rows), and unsorted, unfiltered scrolling reads
each block by a `__rowid__` range — a zonemap-pruned scan that takes
milliseconds at any scroll depth. What grows with scale is query latency:
filter and sort cost, and deep scrolls _while sorted or filtered_. Those
find a block's rows with `LIMIT … OFFSET` over the sort keys and
`__rowid__` alone, then read the columns of just those rows
(`buildRowQuery`, `src/table/rowQuery.ts`), so they get slower the further
down you are. That, plus the memory holding the loaded data, is what the
tiers grade:

| Dataset scale     | Expected experience                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| < 100 K rows      | Fully interactive, all features snappy. Filter changes < 50 ms                                                                                       |
| 100 K – 1 M rows  | Interactive with faint cost on filter changes (100–300 ms). Virtualized scroll remains smooth                                                        |
| 1 M – 10 M rows   | Filter/sort latency becomes noticeable (300 ms – 2 s). Initial load takes seconds. Still workable for analytics, not for live dashboards             |
| 10 M – 100 M rows | Scrolling stays correct; filter/sort latency and load-time memory dominate. Consider server-side aggregation; use this library for the summary layer |
| > 100 M rows      | Don't — the loaded data outgrows browser memory long before the scroller cares                                                                       |

The tiers count rows, and a wide table pays more for each step. On 1,000
columns, a filter change took 0.5 s at 50,000 rows and 0.77 s at 200,000,
with 20 queries each, most of them the charts in view refetching.

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
const t = performance.now();
const off = table.on('filterChange', ({ filteredRowCount }) => {
  off();
  console.log(`${filteredRowCount} rows counted in ${(performance.now() - t).toFixed(1)} ms`);
});
table.actions.addFilter({ type: 'range', column: 'fare_amount', min: 10, max: 50 });
```

This times the filter → row-count round-trip. `filterChange` does not wait
for the column charts, which refetch alongside the count and can take
longer on a large table.

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

## Known slow paths

As of 0.9.0, with the source of each:

- **Deep pages of a sorted or filtered table.** Each block of a sorted or
  filtered view finds its rows with `LIMIT … OFFSET` over the sort keys and
  `__rowid__` (`buildRowQuery`, `src/table/rowQuery.ts`), so the cost grows
  with depth. A block halfway down a sorted 5M-row × 40-column table took
  about 0.9 s in the [memory spike](./dev/memory-envelope.md), and a block
  at row 150,000 of 200,000, sorted by a `FLOAT[64]` embedding, about 0.4 s
  (`tests/performance/nestedCells.bench.duckdb.test.ts`). Unsorted,
  unfiltered blocks take milliseconds at any depth.
- **Exact and pattern filters on nested columns.** A pattern filter, and
  an exact filter with `valueType: 'text'` as the filter panel makes on a
  nested column, compare `CAST(col AS VARCHAR)` (`src/filters/FilterSQL.ts`),
  so DuckDB formats every row's whole value in each query the filter is in:
  about 1.7 s a query on 20,000 rows of `FLOAT[768]` embeddings in
  duckdb-wasm under Node, and 2.3 s with a pattern filter. Filter on a part
  of the value added as a column instead; see
  [Nested columns](#nested-columns).
- **Charts on wide, deep tables.** A column's chart is built when its
  header comes within 200 px of the view, four charts at a time
  (`src/visualizations/LazyVizController.ts`), and its two to four queries
  wait behind the row fetches in DuckDB's one queue. `loadData` waits for
  the charts in view: on the [wide Parquet file](#loading-a-wide-parquet-file)
  below, those charts, the first rows and the session lookup took about
  0.3 s together. A sideways scroll builds the charts of each screen it
  stops on, and at 200,000 rows they took seconds to arrive while their
  queries queued. A filter change refetches every live chart: 0.77 s and
  20 queries at 200,000 rows × 1,000 columns.
- **Large CSV and JSON exports.** They read the rows in batches of 10,000,
  each found with `LIMIT … OFFSET` over the view
  (`src/export/ExportQuery.ts`), and build the file as one string on the
  main thread. Chrome caps a string at about 537 million characters, some
  36,000 rows of a 768-float embedding
  ([Troubleshooting §34](./troubleshooting.md#34-exporting-an-embedding-column-to-csv-or-json-fails)).
  A Parquet export runs as one `COPY … TO` in DuckDB's worker and builds no
  text.
- **A horizontal scroll right after a filter change.** When the body is
  already scrolled sideways, then for a second after a filter change the
  table puts its horizontal position back every frame (`FILTER_HOLD_MS`,
  `src/table/ColumnWindowController.ts`), against the clamps that filter
  changes used to cause. A wheel, key, pointer press or touch in the table
  ends the hold, but a scroll your page makes in code during that second
  is undone.
- **Parquet `ArrayBuffer` sources, and CSV and JSON files.** A Parquet
  `File`, `Blob` or URL is read from disk as the table is built. An
  `ArrayBuffer` is first copied into DuckDB's memory whole
  (`src/worker/loaders/parquet.ts`), so the file and the table share the
  4 GiB: in the memory spike, 200,000 rows × 1,000 columns of random data
  ran out of memory that way where a `File` loaded 250,000, and copying a
  file in took 0.4–2.4 s. CSV and JSON files are read as text, then copied
  in the same way (`src/data/DataLoader.ts`).
- **Parquet files near the memory limit.** When the table's estimated peak
  leaves no room for a whole row group, DuckDB reads one column chunk at a
  time (`fitParquetRead`, `src/worker/loaders/memoryBudget.ts`), two to four
  times slower: see [What fits in memory](#what-fits-in-memory).
- **The first load in a new browser profile.** `createDataTable()`
  downloads the 36 MB `duckdb-eh.wasm` from jsDelivr, and the first load
  downloads DuckDB's `icu` extension and, for Parquet, its `parquet`
  extension, one after the other. The first load of the wide Parquet file
  took 12.9 s against 11.2 s warm, about 0.9 s of it those two downloads.
  The browser caches all three afterwards; to serve them yourself, see
  [CSP and offline deployments](./guides/csp-and-offline.md).

## Reference numbers

Measured for 0.9.0, or during the work that went into it, each with where
and when. They describe those runs, not guarantees. The maintainer
notes [Memory envelope](./dev/memory-envelope.md) and
[Column virtualization](./dev/column-virtualization.md) keep the full
records.

### Loading a wide Parquet file

A 1.1 GB Parquet file (1,127,189,255 bytes) of 200,000 rows × 1,000
columns: 740 numeric, 62 date, 10 time, 183 categorical and 5 nested, in 4
row groups of 50,000 rows, Snappy-compressed. It was picked as a `File` in
the demo's production build, and the time is the demo's own, taken around
`await table.loadData(file)`:

| Load                                                                                                   | Time                 |
| ------------------------------------------------------------------------------------------------------ | -------------------- |
| Warm, the median of three runs                                                                         | 11.2 s (11.1–11.4 s) |
| Cold, the first in a new browser profile, which also downloads DuckDB's `icu` and `parquet` extensions | 12.9 s               |

- **What it covers.** The worker builds the table, then `loadData` waits
  for the first rows and the first data of the 8 header charts in view.
  About 97 % of the time is DuckDB building the table, at about 100 MB of
  Parquet a second; the session lookup, the rows and the charts take the
  last 0.3 s. Starting DuckDB, in `createDataTable()`, came before the
  timer and took 0.8–1.0 s more, including a fresh download of
  `duckdb-eh.wasm`, which the browser's temporary profile did not cache.
- **Read mode.** The loader estimates a 2,174 MiB table, and the load's
  peak, with the largest row group (269 MiB) read ahead, at 3,154 MiB of
  the 4,096, so DuckDB reads whole row groups: the fast path of
  [Large Parquet files](./guides/loading-data.md#large-parquet-files).
- **Where.** Google Chrome 154 in a headed window with a 1,280 × 720
  viewport, driven by Playwright, on an Apple M1 Pro with 16 GB running
  macOS 26.7.1, with the desktop's other applications open; `main` at
  `6b784f43` (`0.9.0-next.0`), DuckDB-WASM 1.33.1-dev57.0 with the `eh`
  bundle from jsDelivr; 7 October 2026.

### What fits in memory

WebAssembly memory stops at 4 GiB, and DuckDB's own `memory_limit`
defaults to 3.1 GiB. DuckDB does not compress a table in memory: the
spike below measured 10.6 to 11.6 bytes a cell for its mix of mostly
doubles, 2,208 MiB for 200,000 rows × 1,000 columns and 2,031 MiB for
5,000,000 × 40. Before a Parquet load, the loader estimates the table from
the file's footer and a sample of its rows, and picks how to read it
(`fitParquetRead`, `src/worker/loaders/memoryBudget.ts`):

- whole row groups read ahead, when the estimated peak plus the largest row
  group fits in 4 GiB;
- one column chunk at a time, when only the peak fits;
- neither: the load rejects with `LOAD_MEMORY_EXCEEDED` before anything is
  built, when the table would take more than 95 % of DuckDB's free memory
  or the peak would not fit.

Peak WebAssembly memory for 1,000 columns of random data, from the memory
spike: DuckDB alone, in headless Chromium 151 on macOS with 16 GiB,
DuckDB-WASM 1.33.1-dev57, recorded on 26 September 2026.

| Rows | File size | `File`, a column chunk at a time | `ArrayBuffer`, copied in |
| ---: | --------: | -------------------------------: | -----------------------: |
| 100K |   732 MiB |                        1,960 MiB |                2,764 MiB |
| 150K | 1,102 MiB |                        2,536 MiB |                3,709 MiB |
| 200K | 1,464 MiB |                        3,114 MiB |            out of memory |
| 250K | 1,837 MiB |                        3,692 MiB |            out of memory |
| 300K | 2,196 MiB |                    out of memory |  cannot be read into one |

At 200,000 rows, reading whole row groups (with DuckDB's external file
cache off, as the loader sets it) took 9.9 s and peaked at 3,642 MiB, and a
column chunk at a time took 34 s. Through `loadData`, with charts off, the
library reads that 1.5 GB file a column chunk at a time, since its first
row group alone is 898 MiB: in 28 to 40 s in Chromium, 26 September 2026
(machine not recorded).

### Wide tables in the browser

A 50,000-row × 1,000-column Parquet file (370 MiB, about 388 MB). The
load, DOM, fetch and column-change figures are from headless Chromium on
27 September 2026, the chart figures from Chrome on 26 September 2026; the
records name the browser, not the machine.

- **Load:** `loadData` took 5.4 s and 24 queries. In Chrome the day
  before, 0.8, which built a chart for every column, took 20.4 s and 2,004
  queries.
- **DOM:** 11,088 elements under `.dt-root`: 1,000 header shells, 19 of
  them with their controls, and 475 body cells, 19 a row. A whole header
  for every column made 36,600 elements, and a cell for every column
  25,000 cells.
- **Row fetches:** a 128-row block took 7.8 ms with the 96 columns near
  the view selected, and 76 ms with all 1,000 (the median of nine blocks).
- **Column changes:** in that pass, a hide took 41 ms and 2 queries, a show
  55 ms and 2, a move 34 ms and none, a pin 82 ms and 2. Timed on its own,
  a hide's synchronous script is about 25 ms (see
  [Wide tables](#wide-tables)), where rebuilding the header row, as the
  table did before, took 182 ms and 24 queries.
- **Filters:** a filter took 0.5 s and 20 queries, where 0.8 took 4.4 s and
  2,002 queries. At 200,000 rows it took 0.77 s and 20 queries.

### The timed tests

One run of `npm run test:perf`, on an Apple M1 Pro with 16 GB, Node 22,
`main` at `6b784f43`, 7 October 2026. Each figure is the test's duration
as Vitest's JSON reporter records it: the load or the queries, plus the
fixture read in the two load tests and DuckDB's shutdown in the start-up
test, in Node, without a table around them. A filter change in the table
also fetches rows and refetches charts.

| Test                                                        | Budget    | Test duration |
| ----------------------------------------------------------- | --------- | ------------- |
| Start DuckDB (`createNodeDuckDB()`)                         | 4,000 ms  | 638 ms        |
| Load `nyc_taxi.parquet`, 100,000 rows × 19 columns          | 8,000 ms  | 505 ms        |
| Load `nyc_taxi.csv`, 100,000 rows × 19 columns              | 15,000 ms | 383 ms        |
| 100 uncached `COUNT(*)` queries, each with its own `WHERE`  | 3,000 ms  | 79 ms         |
| `COUNT(*)` under a range filter, 1M rows                    | 1,500 ms  | 3.6 ms        |
| `COUNT(*)` under a set filter of 10 values, 1M rows         | 2,000 ms  | 21 ms         |
| `COUNT(*)` under a starts-with pattern filter, 1M rows      | 4,000 ms  | 81 ms         |
| 200 blocks of 128 rows by `__rowid__` range, over 1.6M rows | 5,000 ms  | 185 ms        |
| `AnnotationStore.addMany` of 10,000 annotations             | 250 ms    | 44 ms         |
| 1,000 `getByCell` lookups among 10,000 annotations          | 500 ms    | 162 ms        |

The range filter's rows sit together at the start of its table, so DuckDB
skips almost all of it. Each scroll-handler test ran 1,000 events in 5 to
18 ms, setup included, against budgets of 1 ms an event at the median and
16.6 ms at the 99th percentile. The nested-cell medians are under
[Nested columns](#nested-columns).

### Bundle-size budgets

`npm run size` checks the brotli-compressed size of the 13 files in
`.size-limit.cjs` (the entries, the stylesheet and the lazy chunks) against
their caps, and fails when one passes it. The worker script
(`assets/worker-*.js`) and two chunks under 0.5 kB have no budget. The
sizes below are the ones CI measured on `main` at `6b784f43` on 7 October
2026, after the 0.9.0 "nice to have" fixes; each cap is 0.4–6.4 % above
its size.

| Budget                                                             | Size      | Cap     |
| ------------------------------------------------------------------ | --------- | ------- |
| Root entry · ESM                                                   | 11.05 kB  | 11.4 kB |
| `/advanced` entry · ESM                                            | 2.15 kB   | 2.25 kB |
| Stylesheet                                                         | 22.87 kB  | 23.7 kB |
| Shared `VisualizationRegistry-*` chunk ("lazy ExportDialog chunk") | 100.88 kB | 104 kB  |
| Lazy `SQLFilterModal` chunk                                        | 2.56 kB   | 2.6 kB  |
| Lazy `DerivedColumnModal` chunk                                    | 3.80 kB   | 3.95 kB |
| Lazy `DerivedColumnEditPanel` chunk                                | 3.22 kB   | 3.3 kB  |
| Lazy `FilterPresetPanel` chunk                                     | 2.69 kB   | 2.7 kB  |
| Lazy CodeMirror editor chunk                                       | 5.19 kB   | 5.5 kB  |
| Lazy `extractExpression` chunk                                     | 2.78 kB   | 2.95 kB |
| Lazy `ValueInspector` chunk                                        | 8.44 kB   | 8.9 kB  |
| Lazy `ExtractColumnPanel` chunk                                    | 4.98 kB   | 5.3 kB  |
| Lazy `TreeView` chunk                                              | 2.80 kB   | 2.85 kB |

The budget still named "lazy ExportDialog chunk" measures the shared
`VisualizationRegistry-*` chunk, which holds most of the table: header,
body, keyboard navigation. The root entry imports it, so every table loads
it up front; the dialogs and panels below it load the first time one opens.
Parquet export runs in DuckDB's worker (`COPY TO`), not in a chunk of its
own. ESM only: the CJS bundles were dropped in 0.4.0.

### Tarball composition

`npm pack --dry-run` at `6b784f43` (`0.9.0-next.0`, 8 October 2026) lists
316 files: a 1.52 MB tarball that unpacks to 6.09 MB. Source maps are
4.09 MB of that, 67.3 %: the JavaScript maps 3.86 MB (63.4 %) and the
declaration maps 0.23 MB (3.9 %). The JavaScript itself is 1.00 MB
(16.4 %), the declarations 0.83 MB (13.6 %) and the stylesheet 0.14 MB
(2.3 %). The library deliberately ships its source maps so consumers can
debug into library source frames in DevTools. Trimming them is a deferred
consumer-DX trade-off — open an issue if your environment requires it.

## How performance is tracked

| Command                 | When it runs                                                      | What it guards                                                                                                            |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:coverage` | CI's Test (Node 22) job, on every pull request and push to `main` | The four files of `tests/performance/` that need no flag: leaks, annotation budgets, the scroll handler, micro-benchmarks |
| `npm run test:browser`  | CI's Browser accessibility suite job, on the same events          | Behaviour at scale in Chromium, and counts: header elements, mounted columns, live charts, queries per column change      |
| `npm run size`          | CI's Bundle size budgets job, once the tests pass                 | The brotli size of the 13 files in `.size-limit.cjs` against their caps                                                   |
| `npm run test:perf`     | By hand; no CI job runs it, and a pull request does not need it   | The DuckDB timing budgets and the 1,000-cycle create/destroy stress                                                       |

The timing budgets sit 3 to 417 times above the test durations in
[The timed tests](#the-timed-tests), most of the DuckDB ones 16 to 95
times, so that slower machines pass. They catch only large regressions,
such as a query whose cost starts to grow with depth. The
[Reference numbers](#reference-numbers) were measured by hand, in the
conditions each states; to compare two releases, repeat a measurement in
the same conditions.

Not automated:

- a scheduled run of `npm run test:perf`;
- timing in a real browser: frame times, DuckDB's start-up and the large
  Parquet load are measured by hand. The browser suite holds a few bounds
  on time: the value inspector opens within 3 s the first time and 1 s
  after that, and paints a bucket's 100 rows within 0.5 s
  (`value-inspector.spec.ts`), and at 200,000 rows the nested columns'
  charts draw within a second of a jump to them (`nested-wide.spec.ts`);
- filter and sort latency at 10M rows: the deepest table measured is
  5M rows × 40 columns, so the tiers above that stay reasoned.

If you measure something interesting about your workload, share it in an
issue — it helps calibrate the thresholds here.

## Related

- Architecture: [Architecture concept doc](./concepts/architecture.md)
- Derived columns: [Derived columns guide](./guides/derived-columns.md) — expression vs vector trade-offs
- CSP / offline: [CSP and offline guide](./guides/csp-and-offline.md) — `coi` bundle for multi-thread execution
- Session persistence: [Session persistence guide](./guides/session-persistence.md) — IDB quota considerations
