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
each index (`renderVisibleRows`, `src/table/TableBody.ts:1112`) and
fetches the lot in 128-row blocks, at most 2 in flight (`ensureFetched`,
`TableBody.ts:699`).

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

One consequence worth knowing: nothing in the library subscribes to the
container's `ResizeObserver` to recompute the range, so the visible range
is refreshed on scroll and on state changes rather than on resize alone. A
container that changes height while the table sits idle can hold a stale
range until the next interaction. Sizing the container before mount, and
letting CSS resolve the height rather than assigning it imperatively
afterwards, sidesteps this.

The column axis is windowed the same way, and that is the axis a wide
table feels. A body row used to carry one cell per visible column, so 300
columns × ~15 rendered rows put ~4,500 cells in the DOM whether or not
you could see them, and 1,000 columns put ~30,000 there. A row now
renders its pinned columns, the columns whose pixel span intersects the
horizontal viewport (overscanned by one viewport per side, floored at 10
columns), and two empty spacer elements standing in for the combined
width of everything skipped — so the horizontal scroll extent and every
cell's x-position are exactly where they were before.

Measured in Chromium at 1280 × 720 on 300 columns × 20,000 rows: the
`.dt-root` subtree fell from 15,051 nodes to 11,136, and `.dt-cell`
elements under `.dt-body` from ~4,500 to 255–420. Cells per row is 17 at
rest and 28 mid-scroll — the same figures at 60 columns as at 300.
Header and body stayed aligned to 0.000 px at every stop of a horizontal
scroll sweep.

**Implication:** body DOM cost stops tracking column count, so a wide
table pays for a viewport rather than for a schema — the same bargain
row virtualization already made on the other axis.

The header row is windowed from the same model, so the whole grid — not
just the body — now pays for a viewport rather than for a schema. On the
same 300 × 20,000 tier the `.dt-root` subtree fell again, from 11,136
nodes to 970 at rest, with 17 headers mounted instead of 300. The window
is widened a little for three columns — the keyboard cursor's, any
header holding real DOM focus, and the column of an open Shift+F2 layout
gesture — so a small scroll does not destroy the element that focus, or
`aria-activedescendant`, was pointing at. That widening is capped at ten
columns, deliberately: a cursor parked far off screen must not drag its
neighbourhood back into the DOM. Beyond the cap the grid degrades
instead of breaking — the `aria-activedescendant` attribute is dropped
rather than left dangling, and real focus is handed to the grid rather
than to `<body>`.

Two costs disappear with it. Header state updates are now diffed instead
of rebuilt, so hiding, showing, pinning or reordering a column keeps
every surviving header's element — and with it its chart, its listeners
and its popovers — where it previously destroyed and reconstructed the
entire row. And a header no longer subscribes to state signals itself:
it used to register seven of its own, so the fan-out grew with the
column count and a scroll sweep churned registrations in and out as
headers mounted. The container now holds one subscription per signal and
fans it out to the mounted headers.

At 1,000 columns those figures do not move: 36,356 elements before and
970 after, and 1,005 subscribers on `sortColumns` — one per column, every
one of them woken by every sort — down to 5. The same 5 the 60-column and
300-column tables report.

**Implication:** DOM cost, subscription cost and chart cost all stop
tracking column count. A 1,000-column table costs what a 60-column one
does, plus arithmetic.

The caveat is that cells _and headers_ for horizontally off-screen
columns are no longer in the DOM.
`root.querySelector('[data-column="revenue"]')` finds nothing until that
column is scrolled into view, and `getColumnHeaders()` on `/advanced`
returns the mounted window rather than one header per column.
`aria-colindex` stays absolute over the column order, so a windowed row
reports a gapped index run rather than a renumbered one. On `/advanced`,
`TableBody.getColumnSpan(column)` and `getPinnedWidthPx()` give you the
offset to scroll to, and `refreshColumnWindow()` — on `TableContainer`
for both axes, or on `TableBody` for the body alone — makes the cells
for a freshly written `scrollLeft` exist synchronously rather than one
frame later.

### DuckDB in WASM

DuckDB runs in a Web Worker. By default it uses the single-thread bundle
(`mvp`); cross-origin-isolated pages (COOP/COEP headers) can use `coi`
with `SharedArrayBuffer` for multi-thread execution.

**Implication:** aggregations over millions of rows are fast (DuckDB is
column-oriented and vectorized), but not CPU-parallel in the default
setup. The `coi` bundle is the big lever if you're consistently seeing
10M+ row queries.

### The load path

One `loadData()` call costs **one** full-table materialization and a small,
fixed number of statements — measured at six for a 2,000 × 100 source and
twelve at 1,000 columns, whatever the format. Two things about that shape
are worth knowing when you are sizing a load:

**Detection reads a head sample, not the table.** Which text columns hold
dates, times, or timestamps is decided from the first 4,096 rows, so
detection costs the same on five million rows as on five thousand. The
trade-off is explicit: a column that only starts looking like a timestamp
after row 4,096 stays `VARCHAR`. There is no per-column override — if you
know the types, load Parquet, where they are already in the file.

**The source is transferred, not copied.** An `ArrayBuffer` you pass to
`loadData()` is handed to the worker and **detached** — its `byteLength`
becomes `0` and you cannot read it again. This is what keeps a 200 MB source
from peaking at 400 MB across the two threads. If you need to keep your own
copy, pass `buffer.slice(0)`.

```ts
const bytes = await file.arrayBuffer();
await table.loadData(bytes);
bytes.byteLength; // 0 — the worker owns it now

await table.loadData(other.slice(0)); // keeps `other` usable
```

DuckDB is given a **2.5 GB memory limit** at startup. Left unset it would
inherit the WASM heap ceiling, where the first allocation it cannot satisfy
aborts the worker outright; the limit turns that into an ordinary
out-of-memory rejection you can catch on `loadError`, with the previous
table still queryable.

**The load promise stops at first interactive paint.** `await loadData(…)`
resolves when the grid is painted and the filter counts are correct. Column
charts are not part of that gate — see
[Column visualizations](#column-visualizations) below and the
[`vizReady` event](./guides/events.md#event-catalog).

### Column visualizations

Charts cost two full-table scans per column: a stats query and a bins or
top-categories query. That is cheap on a normal table and ruinous on a wide
one, so charts are created **lazily** — a column's chart is built when its
header scrolls within 200 px of the header viewport, and its canvas is
reclaimed when the header passes 400 px away. Cost is proportional to the
columns you look at, not to the columns the table has.

Where that matters, measured on 1,000 columns × 60,000 rows (macOS,
10 cores, Chromium), before and after lazy creation:

| Metric                   | Visualizations off | On, before | On, now  |
| ------------------------ | ------------------ | ---------- | -------- |
| Queries at load          | 4                  | 2,004      | 20       |
| Canvases                 | 0                  | 1,000      | 8        |
| Live `ResizeObserver`s   | 1                  | ~1,001     | 9        |
| Live `MutationObserver`s | 1                  | 1,001      | 2        |
| `loadData` resolves      | 3,859 ms           | 18,884 ms  | 3,743 ms |
| One sort                 | 402 ms             | 10,515 ms  | 450 ms   |
| One filter               | 424 ms             | 8,275 ms   | 506 ms   |

Turning charts on used to more than double the load, and made every
subsequent sort and filter go on paying for 990 columns nobody was looking
at. It now costs roughly nothing at load and a few tens of milliseconds per
interaction.

Two caveats on reading that table. The "off" column is from the same capture
run as "now" but not the same run as "before" — the load path itself got
about twice as fast in the release before this one, so compare "before" and
"now" against each other for the visualization cost and against the "off"
column of their own era for the absolute figures. And the counts are
viewport-dependent: 8 canvases is what a 1,280 px window shows, so a wider
monitor sees proportionally more, which is the entire point.

Four things bound the cost now:

- **Creation is visibility-gated.** Only visible-plus-overscan columns hold a
  canvas, a `ResizeObserver`, and chart data.
- **Chart data outlives the canvas.** Reclaiming a canvas snapshots the data,
  and scrolling back rebuilds from the snapshot with no query. Hiding,
  showing, pinning, or reordering a column reconciles the header row keyed by
  column name, so a surviving column keeps the very same container element and
  its chart is never touched: measured 0 chart queries, where the same
  keyboard column move at 266 columns once cost 534.
- **A chart's lifetime is its header's.** Headers mount and unmount with the
  column window, and the mount hooks create the chart and hand its container to
  the `IntersectionObserver` on the way in, then destroy it on the way out — so
  scrolling past a column reclaims its canvas rather than leaving it live off
  screen.
- **Fetches run at `'low'` worker priority**, at most four in flight, so they
  can never delay a viewport row fetch.
- **A filter change refetches only visible charts.** Offscreen columns are
  marked stale and refetch on scroll-in. Budget roughly
  `2 + 2 × visibleCharts` queries per filter change, not `2 × columns`.

Two fixed-cost reductions ride along: one `data-dt-color-scheme`
`MutationObserver` per table instead of one per chart, and a per-table
palette cache that removes about fifteen `getComputedStyle` lookups from
every chart repaint. Together they are why a theme flip on a wide table is
no longer a visible stall.

**Above 100,000 rows the distinct-value count in the stats line is a
HyperLogLog estimate** (`approx_count_distinct`), rendered with a `~`
marker, rather than an exact `COUNT(DISTINCT …)` full scan — the most
expensive part of the stats query, removed for the tables where it hurt.
Detail in the
[visualizations guide](./guides/visualizations.md#distinct-counts-are-approximate-above-100000-rows).

If you need every chart drawn before the load promise resolves —
screenshots, PDF rendering, a table that is never scrolled — pass
`visualizations: { eager: true }` and accept the old cost. If you need the
grid interactive first and the visible charts soon after, which is the
default, `await table.whenVizReady()` is the seam.

### Query cache

`WorkerBridge` has an LRU query cache, default size 100 entries. Cached
queries return instantly. The cache is invalidated automatically on any
mutation (filter / sort / derived column) that changes the result set.

**Implication:** filter-change → visualization-refresh loops stay fast
because the visible charts' repeated "unchanged" queries hit the cache.
Tuning the cache size can help if you have many visualizations and a lot
of histogramming — though the cache is now the second line of defence:
charts that are offscreen do not re-query at all, and a chart rebuilt
after a header rebuild is seeded from a snapshot rather than from the
cache.

Viewport row fetches deliberately bypass this cache (`cache: false` on
`WorkerBridge.query` — see `QueryOptions`,
`src/data/WorkerBridge.ts:51`). The block-based row cache in `TableBody`
is the authoritative store for scroll data, invalidated in lockstep with
the fetch epoch; a second SQL-keyed copy would only add a second
staleness domain. Keeping scroll SQL out of the LRU also means a fast
scroll no longer evicts the header-stats and histogram entries the cache
exists to serve. The same options object carries
`priority: 'high' | 'normal' | 'low'`, and the worker's serial dispatch
queue drains strictly in that order: viewport row fetches go out at
`'high'`, interactive-but-not-scroll work (filter counts, exports, loads,
ad-hoc queries) at the default `'normal'`, and header charts and
column-stats scans at `'low'`. Scrolling therefore jumps every queued
chart query, and a chart query never delays a row. Starvation of `'low'`
is by design and safe only because low-tier work is bounded by the
visible column set — issue `'low'` for what is on screen, not for the
whole table.

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

Memory usage grows roughly linearly with row count × column count. A
useful rule of thumb: expect ~50–100 bytes per cell in DuckDB, plus the
CSV/JSON/Parquet raw bytes during load.

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
  derivedColumns: false, // no "+" add-column button / f(x) edit icon
});
```

For a read-only display table, turning these off reduces initial JS +
CSS footprint measurably.

`visualizations: false` is a blunter lever than it used to be. Charts are
already lazy, so leaving them on costs a couple of queries per column you
actually scroll to rather than two per column in the table; turn them off
because you don't want charts, not to make a wide table load. Conversely,
`visualizations: { eager: true }` opts back into the old
every-column-at-load cost — see
[Column visualizations](#column-visualizations).

With both `expressionFilter: false` and `derivedColumns: false`, the modals
that bind CodeMirror are unreachable, so consumers can drop the
`@codemirror/*` and `@lezer/highlight` peer dependencies entirely. See
[`README.md` → Skipping CodeMirror](../README.md#skipping-codemirror) for the
full peer-dep list. The corresponding programmatic APIs
(`actions.addFilter({ type: 'raw-sql' })`, `actions.addDerivedColumn`,
`FilterPresetManager`) keep working in this mode.

## Measuring your workload

### Load-stage marks

Every `loadData` call emits [User Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/User_timing)
marks and measures, so a load can be split into stages in DevTools'
Performance panel — or read programmatically — without instrumenting your
own code:

| Mark                 | Set when                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| `dt:load:start`      | the load begins, before `loadStart` is emitted                              |
| `dt:load:workerDone` | the worker has ingested the data and the schema is known                    |
| `dt:load:firstPaint` | the first viewport of rows is rendered                                      |
| `dt:load:vizReady`   | the column charts visible at load have finished fetching                    |
| `dt:load:complete`   | the load promise's gate is satisfied, just before `loadComplete` is emitted |

| Measure          | Span                   |
| ---------------- | ---------------------- |
| `dt:load:worker` | `start` → `workerDone` |
| `dt:load:paint`  | `start` → `firstPaint` |
| `dt:load:viz`    | `start` → `vizReady`   |
| `dt:load:total`  | `start` → `complete`   |

```ts
await table.loadData(file);

for (const m of performance.getEntriesByType('measure')) {
  if (m.name.startsWith('dt:load:')) {
    console.log(`${m.name}: ${m.duration.toFixed(0)} ms`);
  }
}
```

Three notes on reading them. `dt:load:vizReady` normally lands **after**
`dt:load:complete`, because the load promise stops at first interactive paint
and the charts settle behind it — `dt:load:viz` is the longer measure, and
that is the healthy shape. The ordering inverts under `visualizations: false`
and `{ eager: true }`, where the charts are done (or never start) before the
gate opens. `firstPaint` and `vizReady` still race with each other; neither
ordering between those two is a bug. And `workerDone` is not a pure worker
boundary: restoring a session and rebuilding derived columns happen before
it, so a slow `dt:load:worker` on a table with derived columns is not
necessarily a slow ingest.

Mark names have not changed and will not: `dt:load:vizReady` means the same
thing it always did, it simply lands later in the sequence now.

Marks are cleared at the start of each load, so what you read always
describes the most recent one. They cost a handful of microseconds and are
always on; if the browser has no User Timing support the calls are swallowed
and nothing else changes.

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
  query rides the worker's serial three-tier priority queue, drained
  `'high'` → `'normal'` → `'low'`: viewport row fetches go out at
  `'high'` and jump both lower tiers, header charts and column-stats
  scans sit at `'low'`, and an aborted fetch is dequeued for free — or
  genuinely cancelled mid-query via DuckDB's pending-query path
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

- **Type detection past 64 text columns.** Detection reads a bounded head sample and classifies in batches of 64 columns per statement, so cost grows with the number of `VARCHAR` columns rather than with rows. Past 64 the sample is materialized once and probed from there — see [The load path](#the-load-path) for what that costs and why.
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
