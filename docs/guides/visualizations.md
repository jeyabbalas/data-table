# Visualizations

The row of tiny charts above each column header in `@jeyabbalas/data-table`
is rendered by a pluggable visualization system. Five built-in classes cover
numeric, date, time, interval, and categorical columns. You can register
custom classes to add new chart types or override a built-in for a specific
column type.

## You'll learn how to

- Understand which built-in visualization applies to which column type
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

## Reading the column stats

Below each chart sits the column-stats text (`.dt-col-stats`). One rule
governs every number in it: **counts and percentages are always measured
against the full dataset total** — the denominator never changes meaning
from column to column or filter to filter.

**Line 1 — the row-count line, identical on every column.** With no
filters it reads `1,234 rows · 5 null`. While *any* filter is active it
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
summary).

Two filter kinds have no chart representation and therefore no committed
detail: **pattern** filters (contains/starts/ends/regex) and **raw-SQL**
filters. Their columns keep the default summary; line 1 and the funnel
indicator still reflect them.

A continuous histogram can only draw bin-aligned brushes, so a range
filter created through the panel or API snaps its drawn brush (and the
selection label) to bin boundaries; line 1 always reflects the exact
filter.

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

The library calls `updateFilters(newFilters)` on every visualization when the
active filter set changes. Subclasses usually don't need to override this —
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
- **`updateFilters` is called on _every_ filter change.** Including filters on other columns. Subclasses that do expensive `fetchData()` should compare the incoming filters against a cached signature before re-querying.
- **Don't call `this.bridge.query()` outside `fetchData()`.** The canvas is only mounted during normal rendering; calls during teardown will be ignored or rejected.
- **`BaseVisualization.destroy()` is called by the library on table destroy.** Override it to clean up your own resources, but always call `super.destroy()`.
- **Canvas size can't be set directly.** Use `this.width` / `this.height`; the library recomputes them on resize. If you must override, do it inside `render()` and respect the DPR scaling.

## Related

- Events: [Events guide — `error` event, `visualization` source](./events.md#errors-warnings-and-load-failures)
- Multi-table: [Multi-table dashboards](./multi-table.md) for per-instance registry across tables
- [Stats panels](./stats-panels.md) — sibling extension point for the `.dt-col-stats` slot below each visualization (replace the two-line stats display with your own DOM and DuckDB queries)
- API reference: [`BaseVisualization`, `VisualizationRegistry`](../api-reference.md#visualizations)
- Source: `src/visualizations/BaseVisualization.ts`, `src/visualizations/VisualizationRegistry.ts:78-226`, `src/visualizations/utils.ts`, `src/visualizations/histogram/`, `src/visualizations/valuecounts/`
