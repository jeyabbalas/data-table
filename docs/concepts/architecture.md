# Architecture

A bird's-eye view of how `@jeyabbalas/data-table` fits together. The
library is a reactive-signal layer over a DuckDB-WASM worker. Every user
action — filter change, sort, derived column, export — flows through a
small number of coordinated components.

## You'll learn

- How the major components relate
- Where queries execute (hint: not on the main thread)
- How filter changes propagate to visualizations and the row count
- Why the mount container's height is a performance property, not a
  cosmetic one
- How scrolling stays exact past browser element-height limits
- How modals escape CSS containment via portals

Not a task-oriented guide. If you just want to use the library, skip to
the [guides index](../README.md#guides-task-oriented). Read this when you
want to understand _why_ the code is organized the way it is.

## 10-second summary

```
host app                                  main thread
─────────                                 ───────────────────────────────

createDataTable(options) ────► DataTable (facade)
                               │
                               ├─ TableState   (reactive signals)
                               │
                               ├─ StateActions (mutation layer, undo)
                               │
                               ├─ WorkerBridge ◄─── postMessage ───┐
                               │                                    │
                               ├─ TableContainer (DOM)              │
                               │   ├─ VirtualScroller               │
                               │   ├─ FilterPanel / ColumnHeader    │ worker thread
                               │   └─ KeyboardNavigator             │ ──────────────
                               │                                    │
                               ├─ CrossfilterCoordinator            │ DuckDB-WASM
                               │   └─ VizDataController             │  (SQL engine)
                               │      (lazy per-column chart state) │
                               ├─ DerivedColumnManager ─────────────┘
                               │
                               ├─ ModalHost    (body portal)
                               ├─ AnnotationPopover           (singleton)
                               ├─ ColumnHeaderTooltipPopover  (singleton)
                               ├─ SessionStore (IndexedDB)
                               ├─ UndoManager  (snapshot history)
                               ├─ AnnotationStore             (overlay metadata)
                               ├─ StatsPanelCoordinator       (filter-broadcast to BaseStatsPanel instances)
                               └─ FilterPresetManager
```

SQL runs on the worker. The main thread runs signals, DOM, and message
routing.

## Reactive core: signals

Every piece of observable state is a `Signal<T>` or `Computed<T>` (from
[`src/core/Signal.ts`](../../src/core/Signal.ts)):

- `signal.get()` returns the current value
- `signal.set(next)` replaces it and notifies subscribers (shallow equality check)
- `signal.subscribe(fn)` registers a callback, returns an unsubscribe
- `computed(() => fn, [dep1, dep2])` derives a value that recomputes when any dep changes
- `batch(() => { … })` defers notifications until the outer batch ends — updates happen immediately (readable via `get()`), subscribers fire once with the final value after the batch

Signals are intentionally tiny — a mutable value, a Set of callbacks, a
shallow equality check. They're not reactive like Solid or MobX in the
sense of automatic dependency tracking; you explicitly list a computed's
dependencies. This keeps the reactivity model easy to reason about and
cheap to debug.

The signal primitives (`createSignal`, `computed`, `batch`) are
implementation details — not exported from the public surface. Consumers
interact with the state indirectly via `table.on(...)` events, by reading
signals through `table.state.<field>.get()` / `.subscribe()`, and by
writing via `table.actions.*`.

### Batching and shallow equality

`SignalImpl.set` compares with `!==`. Mutating a `Set`, `Map`, or array in
place and calling `.set(sameRef)` is a no-op — subscribers won't fire. The
library (and your code) must construct a new reference to notify:

```ts
state.selectedRows.set(new Set(state.selectedRows.get()).add(5));
```

`batch()` is useful when one logical change touches several signals. The
library uses it in `StateActions` around filter+sort updates and inside
undo/redo reconciliation.

## State: `TableState`

All table state lives on a single `TableState` object ([`src/core/State.ts:22-72`](../../src/core/State.ts)).
See the [state model](./state-model.md) for the field inventory. Briefly:

- **Data signals** — `tableName`, `schema`, `totalRows`, `derivedColumns`
- **Filter signals** — `filters`, `filteredRows`, `filtersByColumn` (computed)
- **Sort signal** — `sortColumns`
- **Column layout signals** — `visibleColumns`, `columnOrder`, `columnWidths` (Map), `pinnedColumns`, `hiddenColumnInfo`
- **Selection signal** — `selectedRows` (Set)
- **UI signals** — `hoveredRow`, `hoveredColumn`, `focusedCell`

The signals are the single source of truth. Every UI component subscribes
to what it needs and re-renders when notified.

## Mutations: `StateActions`

Direct signal writes are discouraged — the public API routes through
[`StateActions`](../../src/core/Actions.ts). Why:

1. **Undo snapshots.** Each method starts by calling `captureForUndo()` so every mutation pushes a snapshot onto the history stack.
2. **Cross-coordinated writes.** Some actions touch multiple signals; doing them outside a `batch` would fire multiple events.
3. **Derived-column reconciliation.** Async actions like `addDerivedColumn` need to talk to DuckDB and update the VIEW before the state changes become visible.

The guideline: **read through `state`, write through `actions`**.

## Worker bridge: `WorkerBridge`

DuckDB runs in a Web Worker. [`WorkerBridge`](../../src/data/WorkerBridge.ts)
is a thin Promise-based RPC wrapper:

- **Messages.** Every request gets a unique id; the bridge maintains a
  map of `pendingRequests`. The worker replies with the same id, which
  resolves the corresponding Promise.
- **Types.** `init`, `query`, `load`, `export`, `cancel`, `progress`.
- **Query cache.** SELECTs are cached by SQL text (LRU with configurable
  size/TTL). Non-SELECTs bypass. Cache is invalidated automatically on
  mutation via `attachCacheInvalidation`. Individual queries can opt out
  or jump the queue through a `QueryOptions` third parameter on
  `query(sql, signal?, options?)`
  ([`src/data/WorkerBridge.ts:51-78`](../../src/data/WorkerBridge.ts)):
  `cache: false` bypasses the SQL-text cache — viewport row fetches use
  it, since their rows already live in `TableBody`'s row cache (see
  [Row fetching](#row-fetching)) — and
  `priority: 'high' | 'normal' | 'low'` picks the worker queue.
- **Serial priority queue.** The worker runs one query at a time,
  drained from three explicit FIFOs in strict order — `'high'` for
  viewport row fetches, `'normal'` for everything interactive, `'low'`
  for header charts and column-stats scans
  ([`src/worker/dispatcher.ts`](../../src/worker/dispatcher.ts)).
  Serialization costs nothing real — SQL already executes serially
  inside DuckDB-WASM's single-threaded worker — and buys truthful
  cancel targeting, free cancellation of still-queued work, and
  priority. Starvation is accepted at both ends of the range for the
  same reason: `'high'` is bounded by scroll activity and `'low'` by the
  visible column set, so neither can monopolize the queue.
- **Abort support.** Every async method takes an optional
  `AbortSignal`; aborts reject the pending Promise locally and send a
  `cancel` message to the worker. `cancel` bypasses the queue: a queued
  target is dequeued without DuckDB ever seeing it, and a running query
  is genuinely interrupted through the connection's pending-query path
  (`conn.send()` + `cancelSent()`). Running `load`/`export` work is not
  interruptible; for those, cancellation remains delivery suppression —
  late replies to aborted ids are dropped.
- **Lifecycle.** `initialize()` boots the worker and DuckDB; `terminate()`
  kills the worker and rejects all pending promises. See
  [CSP and offline guide](../guides/csp-and-offline.md) for construction
  customization.

The bridge is the _only_ place the main thread talks to DuckDB. Every
derived column, every visualization fetch, every export goes through it.

## Crossfilter: `CrossfilterCoordinator`

When a filter changes:

1. `state.filters` signal fires
2. `CrossfilterCoordinator` is subscribed; it receives the new filter list
3. The coordinator recomputes `filteredRowCount` by querying DuckDB with
   the updated WHERE clause
4. The fan-out goes through `VizDataController`, which refreshes only the
   visualizations that currently exist — the columns in view — via their
   `updateFilters(filters)` method, and marks every other column stale
   without issuing a query
5. The `filterChange` event fires on the event bus

The coordinator batches rapid-fire filter changes (histogram brushes can
fire continuously during a drag) so the expensive count query runs only
on settle.

**`VizDataController`** is the per-column state machine that makes step 4
sparse. It owns one `IntersectionObserver` rooted at the header's
horizontal scroll container, and keeps each column in one of four states
(`empty` / `fetching` / `fresh` / `stale`) with the filter epoch its data
was fetched under. A column's chart instance is created when its header
enters the create band and destroyed when it leaves the wider keep band;
its _data_ is snapshotted across that boundary, so a header rebuild —
which `TableContainer.render()` performs wholesale on every hide, show,
pin, or reorder — costs no queries. Fetches are stamped with the epoch,
so a result that lands after a newer filter has been applied is discarded
rather than rendered. `CrossfilterCoordinator` and
`StatsPanelCoordinator` both take the scheduler as an _optional_ hook: a
coordinator composed standalone from `/advanced` fans out to every
registration exactly as before.

Visualizations can _own_ a filter: `Histogram`'s brush selection is a
`range` filter on its column. When the user drags the brush, the viz
emits a filter through the `onFilterChange` callback; the coordinator
feeds it back into `state.filters`; the signal fires; all other viz
receive the update.

## Virtual scroller

The table body renders only visible rows. Given:

- `rowHeight` (default 32 px)
- `state.totalRows` / `state.filteredRows`
- the container's scroll position

The `VirtualScroller` computes `[firstVisibleRow, lastVisibleRow]` and
`TableBody` paints that range immediately — cached rows with content,
uncached rows as placeholders — while fetching whatever is missing from
DuckDB in block-aligned queries (see [Row fetching](#row-fetching)).
Rows are re-rendered as the user scrolls. Datasets too tall for a
browser to represent as a single element scroll through a compressed
spacer (see [Scroll-space compression](#scroll-space-compression)).

### The height chain

How _many_ rows that slice contains comes from a single measurement:
`clientHeight` on the internal scroll container `.dt-body-scroll`
([`src/table/VirtualScroller.ts:360`](../../src/table/VirtualScroller.ts)).
The rendered count is `⌈clientHeight / rowHeight⌉ + 2 × bufferRows`, with
`bufferRows` defaulting to 5
([`src/table/VirtualScroller.ts:373-381`, `:148`](../../src/table/VirtualScroller.ts))
— roughly 29 rows in a 600 px viewport at the default `rowHeight`.
`bufferRows` is not reachable through `createDataTable`; only a direct
`VirtualScroller` construction from `/advanced` can change it.

That `clientHeight` is whatever CSS hands the scroller, and the stylesheet
deliberately delegates the decision upward
([`src/styles/02-shell.css`](../../src/styles/02-shell.css)):

```
.dt-root         { height: 100% }                           /* :11-23   */
.dt-grid         { flex: 1; min-height: 0 }                 /* :33-38   */
.dt-body-scroll  { flex: 1; overflow: auto; min-height: 0 } /* :448-452 */
```

No link in that chain introduces a height of its own. `.dt-root` takes the
mount container's, `.dt-grid` takes what is left inside the root, and
`.dt-body-scroll` takes what is left inside the grid. The mount container
is the only place a concrete number can enter — and the library never
styles it, because it belongs to the host page. `container` is an
`HTMLElement` the host provides; the library only appends its own root
into it.

### Column windowing

The height chain bounds the row axis; nothing bounded the column axis. A
body row carried one `.dt-cell` per visible column, so a 1,000-column
table put ~30,000 cells in the DOM regardless of how many a user could
see. A row's children are now exactly:

```
[P pinned cells][left spacer][W window cells][right spacer]
```

`P` is the leading run of pinned columns in `state.visibleColumns` —
pinned columns are sticky, so they are on screen at every horizontal
offset and are rendered outside the window. `[start, end)` is the window:
the columns whose pixel span intersects the horizontal viewport,
overscanned by one viewport per side and widened to a floor of ten
columns per side (`MIN_OVERSCAN_COLUMNS`,
[`src/table/ColumnWindow.ts:47`, `:50`](../../src/table/ColumnWindow.ts)).
The floor is what carries a viewport that measures 0 — jsdom, and the
frame before first layout — where the pixel term collapses to nothing.
The two spacers are `div.dt-col-spacer` with `role="presentation"`,
`aria-hidden="true"`, `data-col-spacer="left" | "right"` and an inline
`flex: 0 0 Npx`
([`src/table/TableBody.ts:1711-1719`](../../src/table/TableBody.ts)).
They stand in for the total width of the columns not rendered, which is
what keeps the horizontal scroll extent and every rendered cell's
x-position identical to the un-windowed layout.

Each row stamps its own structure as `data-window="P:W"`
([`src/table/TableBody.ts:338-339`](../../src/table/TableBody.ts)) — a
_structure_ signature, never a position one. A window that slides at
constant size leaves every mounted row's shape valid, so those rows are
repainted in place; only a change in `P` or `W` reshapes a row. The cell
for absolute visible-column index `absIdx` sits at
`absIdx < P ? absIdx : absIdx - start + P + 1`
([`src/table/TableBody.ts:1738-1741`](../../src/table/TableBody.ts)),
which is how a row's DOM is read and written without scanning it.

The arithmetic lives in
[`src/table/ColumnWindow.ts`](../../src/table/ColumnWindow.ts) and is
pure — it measures nothing and reads no element. `ColumnWindowModel`
keeps prefix sums over per-column occupied width in a `Float64Array`, so
the span of `[i, j)` is one subtraction and the visible range is two
binary searches
([`src/table/ColumnWindow.ts:302-380`, `:432-445`](../../src/table/ColumnWindow.ts)).
The sums are rebuilt only when the `visibleColumns` array identity, the
`columnWidths` map identity, or the box overhead changes — all three are
replaced wholesale by the state layer rather than mutated, so identity is
a sound cache key and every other call is a pointer comparison.

Two preconditions are what make a DOM-free model possible. `.dt-cell` and
`.dt-col-header` declare `box-sizing: border-box`
([`src/styles/05-data-grid.css:220`](../../src/styles/05-data-grid.css),
[`src/styles/03-columns.css:15`](../../src/styles/03-columns.css)), so a
configured width _is_ the occupied width and the per-column box overhead
is the constant 0 rather than a quantity to measure. And declared widths
are rounded to integers before they are summed
([`src/table/ColumnWindow.ts:197-201`, `:333-338`](../../src/table/ColumnWindow.ts)) — a
fractional width is reachable, since `setColumnWidth` does not round and
a mouse resize under page zoom passes a fractional `clientX`. The header
snaps each column box independently, so a sub-pixel residue stays
sub-pixel there; one body spacer covers ~990 columns at 1,000 and would
carry every one of those residues at once. Round the inputs, sum
exactly, never round the spacer itself.

Recompute is driven by a passive, rAF-throttled `scroll` listener on the
body scroll container
([`src/table/TableBody.ts:812-822`](../../src/table/TableBody.ts)): a
second listener on the same element rather than a hook into the
scroller's own, because `VirtualScroller.onScroll` fires only when the
_row_ range moves, which a purely horizontal scroll never does. It
returns after one property read when only `scrollTop` moved, so vertical
scrolling stays free, and it re-renders only when
`(start, end, pinnedCount)` actually changed. `refreshColumnWindow()`
([`src/table/TableBody.ts:2694-2725`](../../src/table/TableBody.ts)) is
the synchronous form, called after every programmatic `scrollLeft` write
— keyboard navigation, the filter-change scroll pin, the scroll restore
after a re-render — because the browser does not dispatch `scroll` until
the current task ends, and the frame in between would otherwise show
cells built for the previous offset.

Measured in Chromium at 1280 × 720 on 300 columns × 20,000 rows, the
`.dt-root` subtree fell from 15,051 nodes to 11,136 and the `.dt-cell`
count under `.dt-body` from ~4,500 to 255–420, with header and body
agreeing to 0.000 px at every stop of a horizontal sweep. A row holds 17
cells at rest and 28 mid-scroll — the same numbers at 60 columns as at
300, which is the property being bought. What is left at 300 columns is
dominated by the 300 eagerly built column headers; the header row is not
windowed yet.

The one user-visible consequence is that body cells for horizontally
off-screen columns are no longer in the DOM, so code that selects
`[data-column="…"]` inside the body must scroll the column into view
first. `aria-colcount` / `aria-colindex` stay _absolute_ over
`columnOrder`, so a windowed row reports a gapped, non-1-based colindex
run — which is exactly what the ARIA grid pattern prescribes for a
partially rendered row. `/advanced` exposes the geometry rather than
making callers re-derive it: `refreshColumnWindow()`,
`getColumnWindow()`, `getColumnSpan(column)` and `getPinnedWidthPx()` on
`TableBody`, with the `ColumnWindow` type re-exported from
[`src/advanced.ts`](../../src/advanced.ts).

### Scroll-space compression

A spacer of `totalRows × rowHeight` px stops working at some point,
because browsers silently saturate element heights — Blink/WebKit at
≈33,554,431 px, Gecko at ≈17,895,697 px. Past the clamp, writing a
taller height changes nothing: at the default 32 px row height the
scrollbar would stop reaching rows past ~1,048,576 in Chrome and
~559,240 in Firefox. `setTotalRows()` therefore writes
`min(totalRows × rowHeight, 15,000,000)` px. The cap — the
module-private `DEFAULT_MAX_VIRTUAL_HEIGHT = 15_000_000`
([`src/table/VirtualScroller.ts:73`](../../src/table/VirtualScroller.ts))
— leaves margin under the tightest engine's clamp and stays below the
range where float32 arithmetic quantizes positions by a pixel or more.

Below the cap — up to 468,750 rows at the default 32 px — nothing
changes: the physical scroll position _is_ the virtual position, the
mapping is the identity, and `scrollHeight` is never read. Above it, the
scroller keeps one virtual anchor, `virtualScrollTop`, and updates it
once per scroll event with a dual-mode mapping
([`src/table/VirtualScroller.ts:318-349`](../../src/table/VirtualScroller.ts)):

```
delta     = scrollTop − lastScrollTop
maxScroll = scrollHeight − viewportHeight     // measured, not requested
maxVTop   = totalRows × rowHeight − viewportHeight

if scrollTop ≤ 0:                   vTop = 0        // top reconciliation
else if scrollTop ≥ maxScroll − 1:  vTop = maxVTop  // bottom reconciliation
else if |delta| ≤ viewportHeight:   vTop = clamp(vTop + delta, 0, maxVTop)   // linear
else:                               vTop = (scrollTop / maxScroll) × maxVTop // proportional
```

Wheel ticks, trackpad momentum frames, and arrow/PageDown presses all
move less than one viewport height per event, so they take the _linear_
branch: rows move exactly as far as the user scrolled — native feel at
any dataset size. Scrollbar thumb drags, `Home`/`End`, and programmatic
jumps move farther and take the _proportional_ branch, which maps the
physical position across the full virtual range, dividing before
multiplying because `scrollTop × maxVTop` can exceed 2^53 at 50M+ rows.
The edge branches reconcile the two spaces exactly. The top one is
mandatory: without it, accumulated linear drift could strand the user
above row 0 with `scrollTop` already at 0, and no further scroll event
would ever fire to close the gap. The bottom one lands the last row
exactly flush with the viewport's bottom edge (the `− 1` tolerates
fractional `scrollTop` on hidpi screens). `maxScroll` derives from the
_measured_ `scrollHeight` at event time — falling back to the requested
height where measurement reports 0, as in jsdom — so when an engine
clamps the spacer below the cap (Chrome does at high zoom), the mapping
self-corrects to the extent that actually exists.

Both modes then derive the range from the virtual position —
`rawStart = ⌊vTop / rowHeight⌋`,
`rawEnd = ⌈(vTop + viewportHeight) / rowHeight⌉`, buffered and clamped —
and position the viewport container at
`offsetY = scrollTop − vTop + start × rowHeight`. That is what
`VisibleRange.offsetY` now means
([`src/table/VirtualScroller.ts:46-51`](../../src/table/VirtualScroller.ts)):
the physical Y offset at which the viewport container is positioned
inside the (possibly height-capped) content element, equal to
`start × rowHeight` whenever the dataset fits under the cap. The offset
is applied as an inline `style.top` rather than
`transform: translateY(…)`
([`src/table/VirtualScroller.ts:399-411`](../../src/table/VirtualScroller.ts)):
`top` resolves through layout, which is fixed-point and exact at these
magnitudes, while compositor transforms are float32, which quantizes by
more than a pixel above ~8.4M px.

Two operations touch the anchor directly. `scrollToRow()` computes its
target in virtual space and writes the anchor rather than inverting the
lossy proportional map, so any index lands exactly even above the cap
([`src/table/VirtualScroller.ts:515-571`](../../src/table/VirtualScroller.ts)).
`setTotalRows()` writes the newly capped height, then re-anchors
preserving the current position — never proportionally re-deriving it,
which would teleport a linearly-scrolled user
([`src/table/VirtualScroller.ts:433-471`](../../src/table/VirtualScroller.ts)).
`getVirtualScrollTop()` exposes the anchor: the virtual-space
counterpart of `getScrollTop()`, identical below the cap. The cap itself
is configurable only as `maxVirtualHeight` on `VirtualScrollerOptions` —
like `bufferRows`, not reachable through `createDataTable`. It exists so
tests can exercise compression at human scale; raising it past Gecko's
clamp breaks Firefox.

One cosmetic trade-off is accepted: during sustained linear scrolling in
compressed mode the scrollbar thumb can drift from true proportion — the
rows on screen are exactly right, the thumb position only approximately.
Top and bottom reconciliation are exact, so the drift never turns into
unreachable rows.

### Row fetching

Scrolling never waits on data. Every range change paints immediately:
rows present in `TableBody`'s in-memory row cache render with content,
missing rows render as placeholders, and a placeholder is replaced whole
when its block arrives (a row whose cache entry was evicted or
invalidated demotes back to a placeholder — stale paint never persists).
Fetching is reconciliation that happens after the paint, never a
precondition for it; the full state machine is documented at
[`src/table/TableBody.ts:183-218`](../../src/table/TableBody.ts).

Fetches are quantized to aligned blocks of `fetchBlockSize` rows
(default 128, clamped to [16, 1024]) so overlapping scroll positions
dedupe onto the same query and an in-flight block is never re-issued.
The reconciler
([`src/table/TableBody.ts:878-951`](../../src/table/TableBody.ts)) keeps
at most 2 block fetches in flight — the worker executes serially, so
that is one running query and one queued — each with its own
`AbortController`. Blocks that no longer intersect the viewport padded
by one block on each side are aborted mid-flight, and an epoch counter
bumped on every filter/sort/data change makes late results from a
previous state drop instead of landing in the cache. Aborted fetches
settle silently as cancellations. When nothing visible is missing or in
flight, one speculative block beyond the viewport in the current scroll
direction is prefetched (`prefetch`, default true) at `'normal'` worker
priority, so visible-block fetches (`'high'`) always jump ahead of it.

Fetched rows land in a cache of `rowCacheRows` rows (default 2048,
rounded up to whole blocks with a floor of 4 blocks). Over the cap,
whole blocks are evicted farthest-from-the-viewport-first, exempting
blocks that intersect the live viewport and the block just written
([`src/table/TableBody.ts:1107-1140`](../../src/table/TableBody.ts)).
Scroll SQL bypasses the bridge's SQL-text query cache (`cache: false` —
see [Worker bridge](#worker-bridge-workerbridge)): the row cache is
invalidated in lockstep with the epoch, and a second SQL-keyed copy with
its own TTL/LRU would be a second staleness domain.

The SQL itself has two shapes. With no filters and no user sort, a block
is fetched by a range predicate on the dense synthetic row id —
`WHERE "__rowid__" >= start AND "__rowid__" < end ORDER BY "__rowid__" ASC LIMIT n`
([`src/table/TableBody.ts:1203-1209`](../../src/table/TableBody.ts)) —
which DuckDB prunes via zonemaps, so a block fetch costs about the same
at any scroll depth, where `LIMIT/OFFSET` grows with the offset. Every
loader materializes `__rowid__` densely, and a runtime density valve
verifies each fast-path result: any violation permanently switches the
instance to OFFSET pagination with a single `console.warn` — slow but
correct, never wrong rows. Sorted or filtered fetches keep
`ORDER BY … LIMIT n OFFSET k`, always appending `"__rowid__" ASC` as a
tiebreaker
([`src/table/TableBody.ts:1233-1241`](../../src/table/TableBody.ts)) —
DuckDB's `ORDER BY` is non-deterministic for ties, and two block queries
that permute ties differently would duplicate some rows across block
boundaries and drop others.

Unlike `bufferRows` and `maxVirtualHeight`, the pipeline knobs are
public: `fetchBlockSize`, `rowCacheRows`, and `prefetch` are accepted by
`createDataTable`.

### Why an unbounded container defeats virtualization

`setTotalRows()` writes an explicit
`height: min(rowCount × rowHeight, 15,000,000)` px onto the body content
element `.dt-body`
([`src/table/VirtualScroller.ts:439-451`](../../src/table/VirtualScroller.ts))
so the scrollbar reflects the whole dataset (see
[Scroll-space compression](#scroll-space-compression) for the cap). That
tall element is the content `.dt-body-scroll` is asked to hold, and
`overflow: auto` clips it only while the scroller itself is constrained
from above.

If the mount container is content-sized, it is not. `.dt-root`'s
`height: 100%` resolves against an auto-height parent and becomes
content-sized in turn, so sizing runs the other way: `.dt-body`'s capped
height propagates outward, `.dt-body-scroll` grows to fit it rather than
clipping it, and `clientHeight` ends up equal to the height of the
entire (possibly capped) content. The computed visible range then spans
everything the spacer can hold. At 1M rows and `rowHeight: 32` that
saturates at the cap — ~468,750 rows fetched block by block
([Row fetching](#row-fetching)) and one DOM row rendered per row
([`src/table/TableBody.ts:1291`](../../src/table/TableBody.ts)) behind a
15,000,000 px element.

Nothing errors and nothing warns. The scroller measured correctly; it was
handed the wrong viewport. The only height the library complains about is
zero: `calculateVisibleRange()` returns an empty range when `clientHeight`
is 0
([`src/table/VirtualScroller.ts:363-365`](../../src/table/VirtualScroller.ts)),
and `TableContainer` logs a one-shot `console.warn` at construction
([`src/table/TableContainer.ts:392-399`](../../src/table/TableContainer.ts)).
An unbounded container has a perfectly good non-zero height, so it trips
neither check.

The consequence for the host page is that the mount container must have a
bounded height, and that is a performance requirement rather than a
styling preference — it is the only input that keeps the work each
scroll, filter, and sort does proportional to what the user can see (the
height cap merely saturates the damage; it does not make it usable). There is no `height` / `maxHeight` /
`autoHeight` option to substitute for it; `rowHeight` (default 32) and
`headerHeight` (default 120) are the only size knobs, and `headerHeight`
only subtracts from the viewport. See
[Sizing the container](../../README.md#sizing-the-container) for the two
layouts that produce a bounded height and the failure modes when neither
is used.

Re-measurement is interaction-driven. The visible range is recomputed on
scroll and on state-change re-renders; nothing subscribes to the
container's `ResizeObserver` to recompute it on resize alone, so a
container whose height changes while the table is idle keeps a stale range
until the next interaction. Size the container before mounting.

### Fixed row heights

Fixed row heights are an assumption — content taller than `rowHeight`
will clip or overflow. That's the cost of virtualization; you opt out of
automatic layout in exchange for constant-time rendering regardless of
row count.

## Modal portals: `ModalHost`

Modals (export dialog, SQL filter editor, derived-column editor, the
CodeMirror autocomplete tooltip) render into `document.body` — not inside
the table's DOM. Why:

1. **Escape stacking contexts.** A table inside a CSS `transform` or
   `overflow: hidden` ancestor would clip modal content.
2. **Escape z-index battles.** Host apps often have their own modal
   layers; the library exposes `--dt-z-modal` so you can coordinate.
3. **Focus trap consistency.** Portalled modals capture focus on open and
   restore it on close.

[`ModalHost`](../../src/core/ModalHost.ts) manages the portal: it appends
the modal root to `portalTarget` (defaults to `document.body`), copies
the owning table's `data-dt-color-scheme` attribute so portalled modals
stay in light/dark sync, and sets `role="dialog"` with a focus trap.

## Derived columns: DuckDB VIEW reconciliation

Adding a derived column creates a DuckDB VIEW combining the base table
with the derived columns (expressions SQL'd inline, vectors stored in
helper tables). `state.tableName` flips from the base table to the VIEW
so every subsequent query — filters, visualizations, exports —
transparently routes through the combined view.

[`DerivedColumnManager`](../../src/derived/DerivedColumnManager.ts) owns
the VIEW lifecycle. Each mutation (add / update / remove) drops and
recreates the VIEW; undo/redo must reconcile the VIEW _before_ applying
the snapshot signals (otherwise `visibleColumns` could reference a column
the VIEW hasn't been rebuilt with yet).

See the [derived columns guide](../guides/derived-columns.md) for user-
facing behavior.

## Persistence: `SessionStore` + `AutoSave`

[`SessionStore`](../../src/persistence/SessionStore.ts) is a thin
IndexedDB wrapper. [`AutoSave`](../../src/persistence/AutoSave.ts)
subscribes to the relevant state signals and debounces writes to the
store.

Snapshots are keyed by `tableName` and JSON-serializable. Dates are
wrapped via `{ __date__: ISO8601 }` round-tripping. The schema version is
`4` as of this writing; older versions are upgraded transparently, newer
versions are rejected.

See the [session persistence guide](../guides/session-persistence.md).

## Undo/redo: `UndoManager`

[`UndoManager`](../../src/core/UndoManager.ts) is a pair of stacks (`undo`
and `redo`). `captureSnapshot(state)` grabs every persistable field into a
plain object; `applySnapshot(state, snap)` writes them back in one batch.

Every `StateActions` method calls `captureForUndo()` at its top to push
the pre-mutation state. `actions.undo()` pops the undo stack, pushes the
current state onto the redo stack, and applies the popped snapshot.

Derived-column changes add a wrinkle: the VIEW must be rebuilt before the
snapshot's `visibleColumns` apply. `undo()` and `redo()` are `async`
specifically to await that reconciliation.

## Annotation overlay (`AnnotationStore`)

[`AnnotationStore`](../../src/annotations/AnnotationStore.ts) holds
app-authored overlay metadata — row, column, and cell annotations with a
fixed three-level severity (`error` / `warning` / `info`). It is a
sibling of `TableState` rather than a field on it, for two reasons:

1. **No undo/redo.** Annotations come from app-side validators
   (JSON-Schema, quality-control rules), not from user view edits. A
   bulk-load of 10 000 annotations should not inflate the undo stack
   with 10 000 entries.
2. **Independent change channel.** The store emits its own
   `change` event — `kind: 'added' | 'updated' | 'removed' | 'cleared'
| 'filterChanged'`, plus the affected `ids[]`. The rendering layer
   (`TableBody` / `ColumnHeader`) subscribes to this event and
   invalidates only the affected rows / cells / headers, never the
   whole grid.

Internally the store keeps four indexes — `byId`, `byRow`,
`byColumn`, `byCell` — so `getByRow` / `getByColumn` / `getByCell` are
O(1) regardless of total annotation count. `getByCell(rowId, column)`
returns the union of row + column + cell annotations, sorted by
severity → `createdAt` → insertion order, so the popover always shows
the most-relevant entry first.

The store auto-persists into [`SessionSnapshot`](#persistence-sessionstore--autosave)`.annotations`
(v5+) via `AutoSave`. A single shared
[`AnnotationPopover`](../../src/table/AnnotationPopover.ts) instance is
reused across hover targets — created lazily, anchored on demand,
dismissed on `Escape` / blur / scroll / click outside. The
[`ColumnHeaderTooltipPopover`](../../src/table/ColumnHeaderTooltipPopover.ts)
is constructed and torn down alongside it but anchors on the
column-name span and uses a higher z-index so both can be visible
together.

`setSeverityFilter` is a view concern, not a data concern — it flips
flags that the rendering layer reads, but the underlying data is
unchanged. `getAll` / `getByRow` / `getByColumn` / `getByCell` always
return the full set; clearing a severity in the filter only changes
what gets painted (or popped).

## Stats panel coordination (`StatsPanelCoordinator`)

[`StatsPanelCoordinator`](../../src/visualizations/StatsPanelCoordinator.ts)
is a sibling of [`CrossfilterCoordinator`](#crossfilter-crossfiltercoordinator)
that broadcasts filter changes to every registered
[`BaseStatsPanel`](../../src/visualizations/BaseStatsPanel.ts). It is a
sibling rather than a hook on `CrossfilterCoordinator` for one decisive
reason: a stats panel can exist for a column that has no visualization
(e.g. `uuid` columns, which are never visualized). Parenting panel
broadcasts to visualization broadcasts would silently skip those columns
on every filter change.

The coordinator stamps a monotonically-increasing `filterSequence` on
every broadcast, captured per-panel before the `await panel.updateFilters(filters)`
call lands. If a fresh filter change arrives while an in-flight broadcast
is still fanning out, the stale call short-circuits before applying —
without this guard the base-class default's last-write-wins on
`this.options.filters` could land filter set F1's data on a panel after
filter set F2's broadcast had already completed. The same race-guard
pattern lives on `CrossfilterCoordinator`; the two coordinators stay in
sync deliberately. The rationale is captured in
[`StatsPanelCoordinator.ts:72–80`](../../src/visualizations/StatsPanelCoordinator.ts).

Fan-out is bounded — `DEFAULT_PANEL_CONCURRENCY = 4` — sized
independently of the visualization fan-out cap because a panel may issue
its _own_ DuckDB queries (mean+stddev, top-value, custom aggregates) and
flooding the single-threaded worker on a 200-column table is the
dominant failure mode. Per-panel rejections are swallowed at the
coordinator boundary so one panel's failure does not cascade across
columns; surfacing the error is the panel's responsibility (route
through `options.onError(err, { source: 'stats-panel', column, phase })`).

## Event bus: `EventEmitter`

[`EventEmitter`](../../src/core/EventEmitter.ts) is a tiny typed
pub/sub. The facade wraps it so subscribers call `table.on(event,
handler)` instead of poking at the signal layer directly.

The event bus is a convenience over the signals — consumers of the facade
don't need to know which signal holds which state. Power users can use
both: subscribe to `table.on('filterChange')` for callbacks, or
`table.state.filters.subscribe()` for fine-grained reactive updates.

See the [events guide](../guides/events.md).

## Data flow — end-to-end example

User drags a histogram brush:

1. `Histogram.handleMouseMove` / `handleMouseUp` on the visualization
2. Brush emits a `range` filter via `onFilterChange` callback (→ `CrossfilterCoordinator`)
3. Coordinator calls `state.filters.set(updatedList)`
4. Subscribers fire:
   - `CrossfilterCoordinator` itself → runs a `SELECT COUNT(*)` with the new WHERE clause → sets `filteredRows`
   - `VizDataController` → `updateFilters(newFilters)` on every **live** visualization (the columns in view) → re-runs its fetch query at `'low'` priority with the new WHERE → re-renders; offscreen columns are marked stale and refetch when scrolled back in
   - `AutoSave` → debounce → save snapshot to IDB
   - `filterChange` event → notifies the facade → runs host-app handlers
   - `UndoManager` (via `captureForUndo()` _before_ the set) → records undoable snapshot

Every step is either a signal notification (main thread, synchronous) or a
DuckDB query (worker thread, Promise). No global state, no hidden
singletons — just signals and a bridge.

## Where to go from here

- **Using the library** — start at [Quick start](../../README.md#quick-start)
- **State deep-dive** — [State model](./state-model.md)
- **Worker / WASM customization** — [CSP and offline](../guides/csp-and-offline.md)
- **Per-subsystem guides** — [filters](../guides/filters.md), [derived columns](../guides/derived-columns.md), [visualizations](../guides/visualizations.md), [events](../guides/events.md)
