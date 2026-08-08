# Visualizations

The row of tiny charts above each column header in `@jeyabbalas/data-table`
is rendered by a pluggable visualization system. Five built-in classes cover
numeric, date, time, interval, and categorical columns. You can register
custom classes to add new chart types or override a built-in for a specific
column type.

## You'll learn how to

- Understand which built-in visualization applies to which column type
- Know when a chart is created, and how to wait for the visible ones to draw
- Register a custom visualization class
- Override a built-in for specific columns
- Share a single registry across multiple tables, or scope per-table

## Prerequisites

- Read: [API reference — `BaseVisualization`, `VisualizationRegistry`](../api-reference.md#visualizations)
- Runnable example: [`examples/08-custom-visualization`](../../examples/08-custom-visualization/)
- Helpful: familiarity with Canvas 2D rendering

## Built-in visualizations

Five classes are registered by default:

| Class               | Applicable column types       | Description                                       |
| ------------------- | ----------------------------- | ------------------------------------------------- |
| `Histogram`         | `integer`, `float`, `decimal` | Bucketed bars with brushable range selection      |
| `DateHistogram`     | `date`, `timestamp`           | Adaptive bin widths (day/week/month/quarter/year) |
| `TimeHistogram`     | `time`                        | Hour/minute/second bins                           |
| `IntervalHistogram` | `interval`                    | Bucketed by interval unit                         |
| `ValueCounts`       | `string`, `boolean`, `uuid`   | Top-N bars plus an "Other" bucket                 |

All five support crossfilter — brushing a range or clicking a category emits
a filter that's applied to the underlying data and propagated to every other
visualization.

To disable visualizations entirely:

```ts
await createDataTable({ container, source, visualizations: false });
```

With visualizations off, column headers still show column stats but no
chart.

## When charts are created

Charts are **lazy**. A column's chart is created — canvas, observers,
first query — when its header scrolls into view, not when the table
loads. A 1,000-column table paints a few dozen charts, not a thousand,
and the ones you never scroll to are never built.

The rules, if you need to reason about them precisely:

- One `IntersectionObserver` per table watches the `.dt-col-viz` slot in
  every header, rooted at the header's own horizontal scroll container.
- A chart is **created** when its header comes within **200 px** of that
  viewport — the create band. The overscan is why a slow scroll finds
  charts already drawn rather than watching them draw.
- Its canvas is **reclaimed** when the header passes **400 px** away —
  the keep band. The gap between the two thresholds is deliberate
  hysteresis: creating and destroying at the same distance would thrash
  on every pixel of scroll jitter, and a single sweep across a wide
  table would still have built every canvas by the end.
- **The data outlives the DOM.** Reclaiming a canvas snapshots the
  chart's data first, and scrolling the column back rebuilds the chart
  from that snapshot with **no query**. The same seam covers header
  rebuilds: hiding, showing, pinning, or moving a column throws away the
  entire header row and its chart instances, and costs zero
  visualization queries.
- Chart fetches run at the worker queue's **`'low'`** priority, below the
  grid's own queries, with at most four in flight. Scrolling the body
  never queues behind a wall of chart queries.

If the environment has no `IntersectionObserver` — jsdom, very old
browsers — every column is treated as visible and all charts are created
at load, which is what the library did before. Nothing silently loses its
charts.

### Waiting for the charts: `vizReady` and `whenVizReady()`

Because charts are lazy, the load promise no longer speaks for them.
`await createDataTable({ source })` and `await table.loadData(…)` resolve
at **first interactive paint** — the grid is painted and the filter
counts are correct — and `loadComplete` fires there too.

"The charts you can see are drawn" is a separate signal, available as
either an event or a promise:

```ts
const table = await createDataTable({ container, source });
// The grid is interactive here; charts may still be fetching.

await table.whenVizReady();
// Now the charts whose headers were visible at load have data.
```

```ts
table.on('vizReady', ({ vizCount }) => {
  console.log(`${vizCount} column charts drawn`);
});
```

`vizReady` fires once per load. `vizCount` is the size of that first
wave — the visible columns plus overscan, not the column count — and it
is `0` when nothing was visible or when `visualizations: false`.
`whenVizReady()` is replaced on every `loadData` call, so call it after
starting the load you care about; a failed load settles it without
firing `vizReady`, so an awaiter never hangs.

**In a hidden document the wave is empty.** A background tab or a
`display: none` host gets no `IntersectionObserver` callbacks from the
browser, so nothing is visible, nothing is created, and `vizReady` fires
immediately with `vizCount: 0`. That is the platform's behaviour, not a
stall — the charts are created when the table becomes visible. Use
`{ eager: true }` below if you need charts in a document that is never
shown.

### `visualizations: { eager: true }`

The option is `boolean | { eager?: boolean }`:

| Value                       | Behaviour                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `true` / `undefined` / `{}` | Lazy — the default described above                                                             |
| `false`                     | No charts at all; headers still show column stats                                              |
| `{ eager: true }`           | Every applicable column's chart is created and fetched during load, and the load promise waits |

`{ eager: true }` is the pre-lazy contract, kept for pipelines that
capture immediately after the await and have no chance to call
`whenVizReady()` — screenshots, PDF rendering, print stylesheets, a
hidden offscreen table:

```ts
const table = await createDataTable({
  container,
  source,
  visualizations: { eager: true },
});
// Every chart is drawn. `vizReady` already fired, before `loadComplete`.
```

It costs what it used to: roughly two full-table scans per applicable
column, serialized behind the load promise. On a wide table that is the
difference between a load measured in seconds and one measured in tens
of seconds — prefer `whenVizReady()` unless you genuinely need charts
for columns nobody will look at.

### Filter changes: visible now, stale later

When a filter changes, only the charts that are **currently visible**
refetch. An offscreen column is marked **stale** — no query — and
refetches when it scrolls back into view, arriving already
filter-correct with its brush or selection restored.

Two consequences worth knowing:

- A filter change on a wide table costs a couple of queries plus two per
  visible chart, not two per column.
- A chart created lazily **while a filter is active** costs one query or
  two more than the unfiltered case, because it has to fetch both the
  filtered series and the background series the crossfilter view draws
  behind it.

## Reading the column stats

Below each chart sits the column-stats text (`.dt-col-stats`). One rule
governs every number in it: **counts and percentages are always measured
against the full dataset total** — the denominator never changes meaning
from column to column or filter to filter.

**Line 1 — the row-count line, identical on every column.** With no
filters it reads `1,234 rows · 5 null`. While _any_ filter is active it
becomes `892 / 1,234 rows · 3 null`: rows passing **all** active filters,
out of the dataset total (nulls are counted within the filtered rows).
Every column shows the same fraction, and it stays visible during hover
and selection.

**Detail region — lines 2+.** Normally the type-specific summary
(`min · med · max`, `12 unique`, a date range …), computed on the
filtered rows. When the column's **own** filter has a chart
representation, the detail instead shows the committed selection:

```
1,500 / 10,000 rows        ← after all filters (same on every column)
Bin: 30 – 40               ← this column's selection
4,000 rows (40.0%)         ← what this filter alone matches, out of 10,000
```

The selection line counts matches in the **unfiltered** data, so it does
not move when other columns' filters change — with several filters
chained, each participant column tells you its own filter's selectivity
while line 1 tells you the combined result. The display is identical
whether the filter was created by brushing the chart, the funnel panel,
`actions.addFilter`, a preset, session restore, or undo/redo.

**Hover** temporarily swaps the detail region (line 1 stays put):
`Bin: 50 – 60` + `800 rows (8.0%)` — the hovered bin's share of the
dataset — plus `· 300 match` for the rows of that bin passing all active
filters. Mousing off restores the committed selection (or the default
summary). A hover survives filter activity elsewhere in the table: when
another column's filter triggers a refetch, the hovered bin's readout is
recomputed against the new data rather than replaced.

Some filters have no countable chart representation and therefore show no
committed detail — their columns keep the default summary, while line 1
and the funnel indicator still reflect them:

- **pattern** filters (contains/starts/ends/regex) and **raw-SQL**
  filters, which have no chart representation at all;
- on a categorical column, any filter naming a value that has been folded
  into the **Other** segment. A stacked bar keeps only the top categories
  as their own segment and rolls the rest into Other, whose total it knows
  but whose membership it does not — so `IN`/`=` on a folded value would
  undercount, and `NOT IN` would overcount by exactly that value's rows.
  Rather than state a wrong number, the detail is omitted. Filters built
  by the chart's own gestures are always countable, including the
  `NOT IN` that clicking Other emits.

A continuous histogram can only draw bin-aligned brushes, so a range
filter created through the panel or API snaps its drawn brush (and the
selection label) to bin boundaries; line 1 always reflects the exact
filter.

### Distinct counts are approximate above 100,000 rows

`12 unique` on a small table is an exact `COUNT(DISTINCT …)`. Above
**100,000 rows** the count comes from DuckDB's `approx_count_distinct`
(a HyperLogLog sketch) instead, because the exact form is a full scan
per column and it was the single most expensive thing in the stats
query. The line marks itself when it is an estimate:

```
~17,028 unique          ← above 100,000 rows: approximate
12 unique               ← at or below: exact
```

Measured error against known cardinalities: exact through 7 distinct
values, then 100 → 134, 20,000 → 17,028, 100,000 → 104,014. Close
enough to size a column, not a number to quote.

Two behaviours follow from the estimate being allowed to overshoot the
true count:

- The **"all unique"** shortcut is suppressed. That label is an
  exact-equality claim (`distinctCount === nonNullCount`, read as "this
  is an ID column"), and under HyperLogLog it would fire and misfire
  about equally often. Above the threshold you get the tilde-marked
  count instead.
- The `uuid` percentage is **clamped to 100**, since `(103%)` reads as a
  bug rather than as an approximation.

The histogram's own use of the distinct count — deciding whether a
numeric column has few enough values to draw as discrete bars — is
unaffected: it only cares about cardinalities in the single digits,
where the sketch is exact.

A custom stats panel sees this on the stats object as
`distinctCountApprox?: boolean`; render your own marker when it is set.

All of these strings are localizable via `messages.statistics.*` — see
the [i18n guide](./i18n.md).

## Per-instance registry

By default, `createDataTable()` uses a shared `defaultVisualizationRegistry`.
Pass a dedicated `VisualizationRegistry` to scope customizations to one
instance:

```ts
import { VisualizationRegistry } from '@jeyabbalas/data-table';

const registry = new VisualizationRegistry();
// … register customs on `registry` …

const table = await createDataTable({
  container,
  source,
  visualizationRegistry: registry,
});
```

Without `visualizationRegistry`, registrations go to the shared default and
affect every subsequent table on the page. Use per-instance registries in
multi-table dashboards where different tables need different chart types.

## Registering a custom visualization

```ts
import { createDataTable, VisualizationRegistry } from '@jeyabbalas/data-table';
import { BaseVisualization } from '@jeyabbalas/data-table/advanced';

class BoxPlot extends BaseVisualization {
  protected async fetchData() {
    const [{ q1, median, q3, min, max }] = await this.bridge.query<{
      q1: number;
      median: number;
      q3: number;
      min: number;
      max: number;
    }>(`
      SELECT
        quantile(${this.columnName}, 0.25) AS q1,
        median(${this.columnName})         AS median,
        quantile(${this.columnName}, 0.75) AS q3,
        min(${this.columnName})            AS min,
        max(${this.columnName})            AS max
      FROM ${this.tableName}
      ${this.whereClause()}
    `);
    return { q1, median, q3, min, max };
  }

  protected render({ q1, median, q3, min, max }) {
    // Draw on this.ctx using this.width, this.height
  }

  protected handleMouseMove(_event: MouseEvent) {
    /* hover tooltip */
  }
  protected handleClick(_event: MouseEvent) {
    /* optional: set a filter */
  }
  protected handleMouseLeave() {
    /* clear hover state */
  }
}

const registry = new VisualizationRegistry();
registry.register({
  name: 'box-plot',
  isApplicable: (type) => type === 'float' || type === 'integer',
  constructor: BoxPlot,
  priority: 10, // higher than built-ins (priority 0)
});

await createDataTable({ container, source, visualizationRegistry: registry });
```

### Registration fields

| Field                | Meaning                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `name`               | Unique identifier; registering a second time with the same name replaces the previous registration                    |
| `isApplicable(type)` | Return `true` if this viz can render the column type (`integer`, `string`, `date`, etc.)                              |
| `constructor`        | Class to instantiate. Must extend `BaseVisualization`                                                                 |
| `priority`           | Higher priority wins when multiple registrations match. Built-ins use `0`; custom classes commonly use `10` or higher |

## Overriding a built-in

Register a class with the same `isApplicable` matcher and higher priority:

```ts
registry.register({
  name: 'my-numeric-viz',
  isApplicable: (type) => type === 'integer' || type === 'float' || type === 'decimal',
  constructor: MyNumericViz,
  priority: 100, // beats the built-in Histogram (priority 0)
});
```

Or remove the built-in entirely:

```ts
registry.unregister('histogram');
```

## `BaseVisualization` contract

Subclasses implement five methods:

| Method                   | Purpose                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `async fetchData()`      | Query DuckDB via `this.bridge.query(...)`. Return arbitrary data the renderer consumes                               |
| `render(data)`           | Draw on `this.ctx` (the 2D context). Use `this.width` and `this.height` — canvas high-DPI scaling is already handled |
| `handleMouseMove(event)` | Called on hover. Typically updates a tooltip                                                                         |
| `handleClick(event)`     | Called on click. Typically emits a filter via `this.emitFilter(filter)`                                              |
| `handleMouseLeave()`     | Clear hover state                                                                                                    |

### Hit-testing rule

The built-in plots resolve an x-coordinate to a bar or segment by nearest
slot, not by exact bounds: every x inside the plot's horizontal extent
belongs to exactly one slot, and the gap between two neighbouring slots
splits at its midpoint (x at or left of the boundary belongs to the left
slot). The histogram's null bar is a slot too, so the gap before it splits
rather than falling wholly to the last bar. x outside the extent — the
paddings, the label band — belongs to nothing, which is what keeps
click-to-clear reachable.

Match it in a custom visualization and hover won't flicker as the cursor
crosses the gaps between your marks. `findSlotAtX(slots, x, min, max)` in
`src/visualizations/utils.ts` implements the rule for a left-to-right array
of `{ x, width }` slots.

### Emitting a filter from a visualization

Call the `onFilterChange` callback the registry wires up for you:

```ts
protected handleClick(e: MouseEvent) {
  const value = this.valueAtX(e.offsetX);
  this.emitFilter({
    type: 'point',
    column: this.columnName,
    value,
  });
}
```

Pass `null` to clear the filter this visualization owns:

```ts
this.emitFilter(null);
```

The library dedupes filter changes so the UI doesn't thrash, and the viz's
own brush state stays in sync with the external filter (undo/redo toggles the
filter back and forth and the brush follows).

### Reactive updates

The library calls `updateFilters(newFilters)` on every **live** visualization
when the active filter set changes — that is, on the columns currently in
view, not on every column in the table. A column with no live instance is
marked stale and refetches when it scrolls back in. Subclasses usually don't
need to override this — the default implementation triggers `fetchData()` +
`render()` on any change. Override it if you want to skip re-renders when the
filter is unrelated to your column.

### Optional: surviving a header rebuild

Every hide, show, pin, or reorder rebuilds the whole header row, which
destroys your instance and constructs a new one. Two optional methods let the
new instance start from the old one's data instead of re-querying:

| Method                  | Purpose                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `exportDataSnapshot()`  | Return a plain, serializable copy of what `render()` consumes, or `null`      |
| `importDataSnapshot(s)` | Adopt a snapshot from an instance of the same class; return `true` if adopted |

The base implementations return `null` and `false`, so a subclass that
ignores them simply refetches on rebuild — correct, just not free. Implement
the pair and a column move costs your chart no queries at all. The library
hands the snapshot back through `VisualizationOptions.initialSnapshot` on the
replacement instance; only ever accept a snapshot your own
`exportDataSnapshot` produced.

### Canvas scaling

`BaseVisualization` handles:

- High-DPI scaling (`devicePixelRatio`)
- Responsive resizing (`ResizeObserver`)
- Theme repaints on a dark/light flip
- Cleanup on `destroy()` (canvas removal, event listeners, observer
  unregistration)

Don't attach your own `resize` or global mouse listeners — the shared
`WindowListenerManager` singleton dispatches window-level `mouseup` and
`keydown` events to every registered instance so there's only one listener
per page, no matter how many visualizations are on screen.

The same collapse applies to theme changes. A table-owned watcher keeps
**one** `data-dt-color-scheme` `MutationObserver` for all of its charts
rather than one per chart, and the resolved `--dt-*` palette is cached per
table and invalidated on the flip — so a repaint after a hover, a resize, or
a data refresh costs no `getComputedStyle` lookups. Nothing is required of a
subclass to get this. A visualization you construct yourself from
`/advanced`, outside a table, gets no shared watcher and falls back to its own
private observer, exactly as before.

## Error surfacing

If `fetchData()` or `render()` throws, the library catches it, routes it to
the table's `error` event with `source: 'visualization'`, and keeps rendering
the other visualizations. Subscribe to handle gracefully:

```ts
table.on('error', ({ error, source }) => {
  if (source === 'visualization') {
    console.warn('Visualization failed:', error);
  }
});
```

## Recipes

### Scoped custom viz for one column

Check the column name inside `isApplicable`:

```ts
registry.register({
  name: 'spark-line-for-revenue',
  isApplicable: (type) => type === 'float', // coarse matcher
  constructor: class extends SparkLine {
    static shouldApply(column: { name: string; type: string }) {
      return column.name === 'revenue'; // fine-grained
    }
  },
  priority: 10,
});
```

`isApplicable` is keyed off type; for per-column behavior, use a coarse type
matcher and check the column name in your subclass's constructor (bailing out
to a no-op render if it's the wrong column).

### Shared base for many column-specific visualizations

Extract a common base class extending `BaseVisualization`, then register
several leaf classes with different `isApplicable` predicates and priorities.

### Disable a specific built-in for testing

```ts
registry.unregister('date-histogram');
// Now date/timestamp columns render stats only, no chart.
```

## Gotchas

- **Shared `defaultVisualizationRegistry` is global.** A registration done without a per-instance registry affects every subsequent table on the page. Use a dedicated `VisualizationRegistry` if you need scoped behavior.
- **Priority ties pick the first-registered.** Two registrations with the same priority are iterated in registration order. Be explicit about priority.
- **`loadComplete` does not mean the charts are drawn.** Await `whenVizReady()`, listen for `vizReady`, or pass `visualizations: { eager: true }`. See [Waiting for the charts](#waiting-for-the-charts-vizready-and-whenvizready).
- **A chart you can't see does not exist.** No canvas, no instance, no data — so nothing that walks the DOM for `.dt-root canvas`, or holds a reference to a visualization instance, can assume one per column. Scroll the column into view first.
- **Your instance is destroyed and rebuilt more often than you expect.** Any hide, show, pin, or reorder rebuilds the header row. Keep per-instance state either in `exportDataSnapshot()` or somewhere outside the instance.
- **`updateFilters` is called on every filter change _for live instances_.** Including filters on other columns. Subclasses that do expensive `fetchData()` should compare the incoming filters against a cached signature before re-querying.
- **Don't call `this.bridge.query()` outside `fetchData()`.** The canvas is only mounted during normal rendering; calls during teardown will be ignored or rejected.
- **`BaseVisualization.destroy()` is called by the library on table destroy.** Override it to clean up your own resources, but always call `super.destroy()`. It is also called whenever the column scrolls far out of view — treat it as routine, not terminal.
- **Canvas size can't be set directly.** Use `this.width` / `this.height`; the library recomputes them on resize. If you must override, do it inside `render()` and respect the DPR scaling.
- **Distinct counts above 100,000 rows are estimates.** `~17,028 unique`, not `17,028 unique`. Don't build logic on the number being exact — check `distinctCountApprox` first.

## Related

- Events: [Events guide — `vizReady`](./events.md#event-catalog), [`error` event, `visualization` source](./events.md#errors-warnings-and-load-failures)
- Performance: [Column visualizations](../performance.md#column-visualizations) for what lazy creation costs and saves
- Multi-table: [Multi-table dashboards](./multi-table.md) for per-instance registry across tables
- [Stats panels](./stats-panels.md) — sibling extension point for the `.dt-col-stats` slot below each visualization (replace the two-line stats display with your own DOM and DuckDB queries)
- API reference: [`BaseVisualization`, `VisualizationRegistry`](../api-reference.md#visualizations)
- Source: `src/visualizations/BaseVisualization.ts`, `src/visualizations/VizDataController.ts` (the lazy state machine), `src/visualizations/ThemeWatcher.ts`, `src/visualizations/VisualizationRegistry.ts:78-226`, `src/visualizations/utils.ts`, `src/visualizations/histogram/`, `src/visualizations/valuecounts/`
