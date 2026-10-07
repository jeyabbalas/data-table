# Visualizations

The row of tiny charts above each column header in `@jeyabbalas/data-table`
is rendered by a pluggable visualization system. Six built-in classes cover
numeric, date, time, interval, categorical, and nested columns. You can register
custom classes to add new chart types or override a built-in for a specific
column type.

## You'll learn how to

- Understand which built-in visualization applies to which column type
- Know when a column's chart is built, and what that means on wide tables
- Register a custom visualization class
- Override a built-in for specific columns
- Share a single registry across multiple tables, or scope per-table

## Prerequisites

- Read: [API reference — `BaseVisualization`, `VisualizationRegistry`](../api-reference.md#visualizations)
- Runnable example: [`examples/08-custom-visualization`](../../examples/08-custom-visualization/)
- Helpful: familiarity with Canvas 2D rendering

## Built-in visualizations

Six classes are registered by default:

| Class                        | Applicable column types       | Description                                                  |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `Histogram`                  | `integer`, `float`, `decimal` | Bucketed bars with brushable range selection                 |
| `DateHistogram`              | `date`, `timestamp`           | Adaptive bin widths (day/week/month/quarter/year)            |
| `TimeHistogram`              | `time`                        | Hour/minute/second bins                                      |
| `IntervalHistogram`          | `interval`                    | Bucketed by interval unit                                    |
| `ValueCounts`                | `string`, `boolean`, `uuid`   | Top-N bars plus an "Other" bucket                            |
| `NestedSummaryVisualization` | `nested`                      | Non-null / null share bar and the type outline; no filtering |

All six redraw for the filters on other columns. The first five also make
filters: brushing a range or clicking a category emits a filter that's
applied to the underlying data and propagated to every other visualization.
The nested summary makes none.

### Nested columns

A LIST, ARRAY, STRUCT, MAP, UNION or VARIANT column has `type: 'nested'`,
and its chart is `NestedSummaryVisualization` (registry entry
`nested-summary`, priority 0). Grouping such values the way `ValueCounts`
does took 18–21 s on a 200,000-row `FLOAT[768]` column, with the worker, and
so the grid, frozen meanwhile. The summary reads ungrouped
`COUNT(*), COUNT(c)` scans instead, in one query: one of every row and, with
filters on, one of the rows passing them, with the filters in its `WHERE` as
the other charts put them, so a raw-SQL filter counts the rows the grid
shows. It draws:

- an 18 px bar of the column's non-null share (`--dt-primary`, labelled
  with its percentage when wide enough) and null share (`--dt-accent`,
  labelled `∅`), sized by the unfiltered counts, and with filters on, the
  share of each passing them drawn solid over a faded segment;
- the column's type outline under the bar: `{x, y, tier}`, `[integer]`,
  `{varchar → integer}`.

Hovering a segment shows its counts in the stats slot ("Category: non-null ·
{x, y, tier}", then the rows and the share). It has no click-to-filter,
brush or keyboard selection: filter a nested column from its filter panel.
A `JSON` column is `'string'` and keeps `ValueCounts`.

A registration whose `isApplicable` accepts `'string'` does not receive
nested columns. To chart them yourself, accept `'nested'`, or use
`isNestedType` from `/advanced`, at a priority above 0; read the column's
`originalType` (with `parseDuckDBType` from `/advanced`) to tell a list from
a struct.

To disable visualizations entirely:

```ts
await createDataTable({ container, source, visualizations: false });
```

With visualizations off, column headers still show column stats but no
chart.

## Charts on wide tables

A column's chart exists only while its header is in view or close to it.
It is built when the header scrolls within 200 px of the visible header
row, and removed once the header is 400 px away. The gap between the two
means a small scroll back and forth rebuilds nothing.

This ties the cost of charts to the viewport, not the column count. Each
chart runs two to four queries when it is built and about two on every
filter change. On a 50,000-row × 1,000-column Parquet file in Chrome:

|                           | Chart for every column (0.8) | Charts near the view |
| ------------------------- | ---------------------------- | -------------------- |
| `loadData`                | 20.4 s                       | 6.2 s                |
| Queries during `loadData` | 2,004                        | 22                   |
| One filter                | 4.4 s, 2,002 queries         | 0.5 s, 20 queries    |
| Hiding a column, filtered | 20.6 s, 3,998 queries        | 2.2 s, 38 queries    |

What to expect:

- **Loading.** `loadData`, and `await createDataTable({ source })`, wait
  for the charts in view to draw their first data, not for every column's.
- **Before its data.** A new chart stays blank until its data arrives, at
  load and when its column scrolls into view. "No data"
  (`messages.statistics.noData`) means the column has no values the chart
  can draw and no nulls: see the values a chart leaves out, under
  [Reading the column stats](#reading-the-column-stats).
- **Filtering.** A filter change refreshes only the charts that exist. A
  column scrolled into view later gets its chart built with the filters in
  force then, so it is correct when it appears. Until then its stats show
  the table-wide row count, and a custom stats panel gets `update(null)`
  when the chart goes away.
- **Brushes and selections.** A rebuilt chart draws its brush or selection
  from the column's filter, so it matches the filter however that changed
  while the column was out of view. Escape still clears the most recent
  one, even when its column has scrolled out of view.
- **Hide, show, pin, reorder.** Every other column keeps its chart. The
  column shown gets a new one, as does any column the change brings into
  reach.
- **Background tabs.** A hidden page has nothing in view, so `loadData`
  does not wait for charts; they are built when the page is shown. A page
  the browser is not rendering, such as a hidden iframe, gets the same
  treatment after one second.
- **Without `IntersectionObserver`** (jsdom, for example), every column's
  chart is built at once, as before.

A custom visualization is constructed each time its column comes within
reach and destroyed when the column leaves. Keep its constructor cheap, and
keep nothing in the instance that has to survive scrolling away.

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
filtered rows; for a nested column, its type (`x double · y double · tier
varchar`). When the column's **own** filter has a chart
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

**Values a chart leaves out.** A chart draws the values that have a place
on its axis. A numeric column's `NaN`, `Infinity` and `-Infinity` have
none, so its histogram leaves them out of its bars, of `min`, `med` and
`max`, and of the distinct count that decides whether it draws a bar per
value. Line 2 ends with how many it left out of the rows passing the
filters: `min 0.57 · med 71.61 · max 142.71 · 30 non-finite`
(`messages.statistics.nonFiniteCount`). They are values, not nulls, so
line 1 and every percentage still count them. A column with no finite
values draws "No data", or its null bar when it has nulls, and line 2 is
the count alone. A brush never selects them, as its bounds are finite.
Two filters the chart draws as a brush do match them: the filter panel's
`>` and `>=` (`"v" >= 100` holds for `NaN`, which DuckDB sorts above every
number, and for `Infinity`; `<` and `<=` hold for `-Infinity`), and a
`not-null` filter, drawn over every bar. Line 1 then counts those rows,
while the committed selection, which sums the bars under the brush, does
not. To see only them, add a raw-SQL filter, `NOT isfinite(v)`.

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
| `isApplicable(type)` | Return `true` if this viz can render the column type (`integer`, `string`, `date`, `nested`, etc.)                    |
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

The library calls `updateFilters(newFilters)` on every visualization that
exists — the charts in or near view — when the active filter set changes.
While a derived-column change that can drop or rebuild the table's relation
runs (a removal, an edit or a replacement, an undo or redo, a reset or a
restore), the call waits for the change to settle, and a chart whose filters
changed more than once meanwhile gets one call, with the filters then in
force. Subclasses usually don't need to override this —
the default implementation triggers `fetchData()` + `render()` on any change.
Override it if you want to skip re-renders when the filter is unrelated to
your column.

### Canvas scaling

`BaseVisualization` handles:

- High-DPI scaling (`devicePixelRatio`)
- Responsive resizing (`ResizeObserver`)
- Cleanup on `destroy()` (canvas removal, event listeners)

Don't attach your own `resize` or global mouse listeners — the shared
`WindowListenerManager` singleton dispatches window-level `mouseup` and
`keydown` events to every registered instance so there's only one listener
per page, no matter how many visualizations are on screen.

## Error surfacing

A chart's failures reach the table's `error` event with
`source: 'visualization'`, and the other charts carry on:

- a built-in chart reports each query that fails, with stage `'fetch'`;
- a custom chart's `fetchData()` that throws during a filter update is
  caught and reported for it, with stage `'filter'`;
- a chart constructor that throws is caught, and the column gets no chart
  until new data or a new header.

Nothing else is caught for a custom chart: report a failure in its first
fetch, or in `render()`, through `options.onError`. Each error names its
column in `error.details.column`, and the stage that failed in
`error.details.stage` when the chart reported one.

When a chart's fetch fails, its stats slot drops what the chart reported
before, and any hover or selection detail, and shows the table-wide row
count, kept current. Beneath the count it says "Failed to load"
(`messages.statistics.chartFailed`) until the chart reports stats again,
for a chart that reports them: a built-in chart, which does each time a
fetch lands, and a custom chart that has reported stats through
`onDefaultStatsChange`, or that sets `reportsDefaultStats` to say it will
after every fetch, its first included. A custom chart that reports no stats
of its own gets no such line, whatever stage it reports, since nothing would
take it back. A built-in chart draws nothing after a failed fetch, and its
`<canvas>` carries a `data-fetch-failed` attribute until a fetch lands. A
failure of a refetch a newer one superseded, or of a chart already
destroyed, is reported but leaves the slot alone. Subscribe to handle
gracefully:

```ts
table.on('error', ({ error, source }) => {
  if (source === 'visualization') {
    console.warn(`Chart for ${String(error.details?.column)} failed:`, error);
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
- **`updateFilters` is called on _every_ filter change.** Including filters on other columns, on every chart in or near view. Subclasses that do expensive `fetchData()` should compare the incoming filters against a cached signature before re-querying.
- **Don't call `this.bridge.query()` outside `fetchData()`.** The canvas is only mounted during normal rendering; calls during teardown will be ignored or rejected.
- **`BaseVisualization.destroy()` is called by the library whenever a chart goes away:** when its column scrolls out of reach, when the header row is rebuilt, and on table destroy. Override it to clean up your own resources, but always call `super.destroy()`.
- **Canvas size can't be set directly.** Use `this.width` / `this.height`; the library recomputes them on resize. If you must override, do it inside `render()` and respect the DPR scaling.

## Related

- Events: [Events guide — `error` event, `visualization` source](./events.md#errors-warnings-and-load-failures)
- Multi-table: [Multi-table dashboards](./multi-table.md) for per-instance registry across tables
- [Stats panels](./stats-panels.md) — sibling extension point for the `.dt-col-stats` slot below each visualization (replace the two-line stats display with your own DOM and DuckDB queries)
- API reference: [`BaseVisualization`, `VisualizationRegistry`](../api-reference.md#visualizations)
- Source: `src/visualizations/BaseVisualization.ts`, `src/visualizations/VisualizationRegistry.ts:57-262`, `src/visualizations/utils.ts`, `src/visualizations/histogram/`, `src/visualizations/valuecounts/`, `src/visualizations/nested/`
