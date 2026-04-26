# Stats panels

Replace the library's built-in two-line column-stats display — the
`min · med · max`, `<n> rows · <n> unique`, or `2025-01-01 – 2025-12-31`
text that sits in each column header below the visualization — with your
own DOM and DuckDB queries. The slot is `.dt-col-stats`; the extension
point is the `BaseStatsPanel` abstract class plus a per-instance
`StatsPanelRegistry`.

The pattern parallels [custom visualizations](./visualizations.md): both
mount into the column header, both can issue their own DuckDB queries via
`options.bridge`, and both receive filter-aware callbacks. The
visualization owns the canvas (the chart itself); a stats panel owns the
two text lines below it. They are independent extensibility points — you
can register one without touching the other, and a column without a
visualization (e.g. `uuid`) can still host a stats panel.

## You'll learn how to

- Subclass `BaseStatsPanel` and register it on a per-instance `StatsPanelRegistry`
- Issue DuckDB queries that re-run on every filter change
- Integrate with the visualization's hover overlay (line-2 swap)
- Surface panel errors through `options.onError` so they reach `table.on('error', …)`
- Scope a panel by column **name** (not just `DataType`) by subclassing the registry
- Drop stale query results when filters change faster than queries return
- Leave a column type **un**registered to fall through to the library's built-in formatter

## Prerequisites

- Read: [API reference — Stats panels](../api-reference.md#stats-panels)
- Read (concept): [Architecture — Stats panel coordination](../concepts/architecture.md#stats-panel-coordination-statspanelcoordinator)
- Runnable example: [`examples/13-custom-stats-panel`](../../examples/13-custom-stats-panel/)
- Sibling extension point: [Visualizations guide](./visualizations.md)

## Minimal example

```ts
import { createDataTable, StatsPanelRegistry } from '@jeyabbalas/data-table';
import {
  BaseStatsPanel,
  type StatsPanelOptions,
  type ColumnStatsData,
} from '@jeyabbalas/data-table/advanced';
import type { ColumnSchema } from '@jeyabbalas/data-table';

class CountPanel extends BaseStatsPanel {
  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    this.update(null); // initial paint before any stats land
  }

  update(stats: ColumnStatsData | null): void {
    const n = stats?.nonNullCount ?? null;
    this.container.textContent = n == null ? '…' : `${n.toLocaleString()} rows`;
  }

  destroy(): void {
    this.container.replaceChildren();
    super.destroy();
  }
}

const statsPanelRegistry = new StatsPanelRegistry();
statsPanelRegistry.register({
  name: 'count',
  isApplicable: (type) => type === 'integer' || type === 'float' || type === 'string',
  constructor: CountPanel,
  priority: 10,
});

const table = await createDataTable({
  container,
  source: '/data.csv',
  statsPanelRegistry,
});
```

This panel reuses the `nonNullCount` already present in `ColumnStatsData`, so it
needs no DuckDB query of its own. Date / time / boolean columns receive no
registration, so the library renders its built-in formatter for them.

## Lifecycle

The library guarantees the following call ordering on every panel instance.
Subclasses can rely on every step happening exactly as described.

| Stage          | Method                                    | Notes                                                                                                                                                                                                 |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount          | `constructor(container, column, options)` | `container` is empty (the `.dt-col-stats` slot inside the column header). Build any persistent DOM here so later updates are simple `textContent` writes.                                             |
| Initial paint  | `update(null)`                            | Fires once on mount before any visualization stats have landed. Render a "loading" or empty state.                                                                                                    |
| Stats from viz | `update(stats)`                           | Fires whenever the column's visualization recomputes its data (after load, after filter change, after data reload). Columns without a visualization receive `update(null)` only.                      |
| Filter change  | `updateFilters(filters)`                  | Fires on every filter-array change, **before** any subsequent `update(stats)` from a viz refetch. The default implementation only refreshes `this.options.filters`; override to issue your own query. |
| Viz hover      | `setHoverStats(html \| null)`             | Fires when the visualization emits a hover snippet (e.g. histogram bin info), and again with `null` when the user mouses off. Default no-op. Columns without a visualization never trigger this.      |
| Teardown       | `destroy()`                               | Called exactly once on schema change or table destroy. Subclasses must clear DOM and call `super.destroy()`.                                                                                          |

Lifecycle quoted from `BaseStatsPanel`'s JSDoc
([`src/visualizations/BaseStatsPanel.ts:108-127`](../../src/visualizations/BaseStatsPanel.ts)).

## Registration

The registry is **empty by default**, including the module-scoped
`defaultStatsPanelRegistry`. Columns whose `DataType` doesn't match any
registration fall through to the library's built-in `formatDefaultStats`
HTML — opt-in is granular, you don't have to handle every type.

### Per-instance registry (recommended)

```ts
import { StatsPanelRegistry } from '@jeyabbalas/data-table';

const statsPanelRegistry = new StatsPanelRegistry();
statsPanelRegistry.register({
  name: 'mean-std',
  isApplicable: (type) => type === 'integer' || type === 'float' || type === 'decimal',
  constructor: MeanStdPanel,
  priority: 10, // higher wins on multi-match
});

await createDataTable({ container, source, statsPanelRegistry });
```

Same-name re-register **replaces** the existing entry. Pass a per-instance
registry to keep custom panels scoped to one table — multi-table dashboards
should give each instance its own registry to avoid leaking between
unrelated tables.

### Module-scoped fallback

```ts
import { defaultStatsPanelRegistry } from '@jeyabbalas/data-table';

defaultStatsPanelRegistry.register({
  /* … */
});
// Every table that omits `statsPanelRegistry` will use this registration.
```

The two registries do **not** layer. If you pass a `statsPanelRegistry` on
`createDataTable`, the per-instance registry is consulted exclusively — the
module-scoped default is ignored for that table.

### Panel options

The registry constructs each panel with `(container, column, options)`,
where `options` is:

```ts
interface StatsPanelOptions {
  tableName: string; // DuckDB table to query
  bridge: WorkerBridge; // run your own SELECTs against the worker
  filters: Filter[]; // refreshed on every updateFilters call
  messages: Strings; // resolved i18n strings — use these to localize text
  onError?: (error: DataTableError, context: StatsPanelErrorContext) => void;
}
```

`options.filters` is a snapshot at construction; subsequent filter changes
arrive via `updateFilters(filters)` (the default implementation reassigns
`this.options.filters` for you).

## Filter-aware queries

The whole point of `BaseStatsPanel` is that you can compute stats DuckDB's
default doesn't carry — mean, standard deviation, percentiles, top-value
percentages, custom domain-specific aggregates — and have them re-query
on every filter change.

Build the `WHERE` clause with [`filtersToWhereClause`](../api-reference.md#sql-authoring-helpers)
(re-exported at the root) and quote identifiers with
[`quoteIdentifier`](../api-reference.md#sql-authoring-helpers). The example
panel uses both:

```ts
import { filtersToWhereClause, quoteIdentifier, QueryError } from '@jeyabbalas/data-table';

class MeanStdPanel extends BaseStatsPanel {
  private fetchSeq = 0;

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    void this.fetch(); // kick off the initial query
  }

  update(_stats: ColumnStatsData | null): void {
    // (paint from existing fields if you want)
  }

  async updateFilters(filters: Filter[]): Promise<void> {
    await super.updateFilters(filters); // refresh this.options.filters
    await this.fetch();
  }

  destroy(): void {
    this.container.replaceChildren();
    super.destroy();
  }

  private async fetch(): Promise<void> {
    if (this.isDestroyed()) return;
    const seq = ++this.fetchSeq; // stale-result guard, see below
    const colId = quoteIdentifier(this.column.name);
    const tableId = quoteIdentifier(this.options.tableName);
    const where = filtersToWhereClause(this.options.filters);
    const sql = `
      SELECT AVG(${colId})::DOUBLE AS m, STDDEV_POP(${colId})::DOUBLE AS s
      FROM ${tableId}
      WHERE ${colId} IS NOT NULL ${where ? 'AND (' + where + ')' : ''}
    `;
    try {
      const [row] = await this.options.bridge.query<{ m: number | null; s: number | null }>(sql);
      if (this.isDestroyed() || seq !== this.fetchSeq) return; // dropped
      this.paint(row);
    } catch (err) {
      this.options.onError?.(
        new QueryError(err instanceof Error ? err.message : String(err), {
          code: 'QUERY_RUNTIME',
          cause: err,
        }),
        { source: 'stats-panel', column: this.column.name, phase: 'fetch' },
      );
    }
  }

  private paint(row: { m: number | null; s: number | null } | undefined): void {
    /* … */
  }
}
```

### Stale-result guard

Filter changes can arrive faster than DuckDB queries return. Without
defense, a query for filter set F1 that resolves _after_ F2's query has
painted will overwrite the new render with stale numbers. The library
guards the **broadcast** side — `StatsPanelCoordinator` stamps a
monotonically-increasing `filterSequence` on each broadcast and
short-circuits superseded `updateFilters()` invocations
(`src/visualizations/StatsPanelCoordinator.ts:50-58`) — but a panel that
runs its own per-call awaits still needs a **local** counter to drop
stale responses after they come back.

The pattern:

1. `private fetchSeq = 0;`
2. At the top of every `fetch()`: `const seq = ++this.fetchSeq;`
3. After every `await` inside `fetch()`: `if (seq !== this.fetchSeq) return;`

The full canonical implementation lives in
[`examples/13-custom-stats-panel/main.ts`](../../examples/13-custom-stats-panel/main.ts)
(lines 107–143).

## Hover integration

When a user hovers a histogram bin or a value-counts segment, the
visualization emits a hover snippet via `onStatsChange`. The library
forwards that snippet to your panel as `setHoverStats(html: string | null)`.
The default panel briefly swaps line 2 to display the bin / segment info,
then snaps back when the hover ends.

```ts
private hoverText: string | null = null;

setHoverStats(text: string | null): void {
  this.hoverText = text;
  this.paint();
}

private paint(): void {
  if (this.hoverText) {
    this.line2.innerHTML = this.hoverText;       // already escaped — see safety note
    return;
  }
  this.line2.textContent = `μ ${this.mean} · σ ${this.std}`;
}
```

### Safety note

`setHoverStats` receives an **HTML string**, not plain text — the same
pre-formatted markup the library's built-in panel renders in place of
line 2 (e.g. `<span class="stats-label">Bin:</span><br>10–20: 42 rows`).
The bundled `Histogram` and `ValueCounts` visualizations call
`escapeHTML` on every user-derived value before producing this string
([`src/statistics/StatsFormatters.ts`](../../src/statistics/StatsFormatters.ts)).

A custom visualization that emits its own hover snippet via
`onStatsChange` is responsible for escaping any user-derived text before
passing it. Panels that only want plain text — and don't trust the
visualization's escaping — should write the value via `textContent`,
which strips the markup safely (line breaks and label styling will be
lost, but XSS-safe by construction).

## Error surfacing

Errors thrown synchronously from any lifecycle method, or rejected from
`updateFilters` / a panel-issued `bridge.query`, should be routed through
`options.onError(error, context)`. The facade re-emits these on its
`error` event with `source: 'stats-panel'` so existing
`table.on('error', …)` listeners catch panel failures alongside load /
query / persistence ones.

```ts
table.on('error', ({ error, source }) => {
  if (source === 'stats-panel') reportPanelFailure(error);
  else if (error.code === 'PARSE_FAILED') toast('Could not read that file.');
  else reportToSentry(error);
});
```

The phase enum lets you distinguish where in the lifecycle the failure
landed:

| `phase`       | When                                                                  |
| ------------- | --------------------------------------------------------------------- |
| `'construct'` | Inside the constructor (after `super(...)` has wired the base state). |
| `'update'`    | Inside `update(stats)`.                                               |
| `'hover'`     | Inside `setHoverStats(html)`.                                         |
| `'fetch'`     | Inside a panel-authored DuckDB query (most common).                   |
| `'destroy'`   | Inside `destroy()`.                                                   |

The library's `StatsPanelCoordinator` deliberately swallows per-panel
`updateFilters` rejections so one panel's failure can't cascade across
the other columns. Surfacing those errors is the panel's job.

## Recipes

### Scope a panel by column name (not just `DataType`)

`isApplicable(type)` only sees the column's `DataType`. To restrict by
column **name**, subclass `StatsPanelRegistry` and override `create`:

```ts
class NameAwareRegistry extends StatsPanelRegistry {
  create(
    container: HTMLElement,
    column: ColumnSchema,
    options: StatsPanelOptions,
  ): BaseStatsPanel | null {
    if (column.name === 'order_total_usd') return new RevenuePanel(container, column, options);
    if (column.name === '__rowid__') return null; // skip the synthetic row id
    return super.create(container, column, options); // fall through to type-keyed lookup
  }
}
```

Returning `null` from `create()` is the same as having no registration —
the library renders its built-in formatter.

### Panel on a no-visualization column

`uuid`, `interval`, and other types without a registered visualization
still get filter-broadcast callbacks. The coordinator broadcasts to
**every** registered panel regardless of whether its column has a
visualization, so a panel can compute its own stats independently — for
example, a `uuid` panel that runs `SELECT COUNT(DISTINCT col)` on every
filter change.

### Sharing state across panels

If multiple panels query the same expensive aggregate, hoist the cache
above the panel layer — store a `Map<filterSetKey, Promise<…>>` in your
registration's closure or on a shared module-scoped object. `StatsPanelOptions.bridge`
is the same `WorkerBridge` instance across every panel on a given table,
so query-cache hits across panels are automatic when the bridge cache is
enabled.

## Gotchas

- **Don't `destroy()` yourself.** The library tracks active panels in a
  name-keyed map; a self-destroy leaves a dangling registration whose
  `.dt-col-stats` slot is no longer eligible for fallback rendering.
  Express loading / empty / error states inside `update` / `setHoverStats`
  instead, and let the library's lifecycle drive `destroy()` (quoted from
  [`BaseStatsPanel.destroy` JSDoc](../../src/visualizations/BaseStatsPanel.ts)).
- **The registry starts empty.** Listing zero registrations is a feature,
  not a bug — every column type whose registration you omit falls through
  to the built-in formatter. There are no library built-ins to override.
- **Use `textContent` for plain user-derived strings.** `innerHTML` is
  fine for the visualization's pre-escaped hover snippet, but anything
  the panel itself derives from row data (e.g. a categorical top-value)
  should be written via `textContent` or escaped first. The example
  panel includes a small `esc()` helper for this exact case.
- **Same-name re-register replaces.** Both `register({ name: 'mine', … })`
  calls win — the second one. Use distinct names if you want both panels
  to apply (and let `priority` resolve the multi-match tie).
- **`updateFilters` is async by default.** Awaiting `super.updateFilters(filters)`
  inside an override is good hygiene — it ensures `this.options.filters`
  is refreshed before your custom logic reads it.

## Related

- [Visualizations](./visualizations.md) — sibling extension point for the
  visualization canvas above the stats slot
- [API reference — Stats panels](../api-reference.md#stats-panels)
- [Architecture — Stats panel coordination](../concepts/architecture.md#stats-panel-coordination-statspanelcoordinator)
- Runnable: [`examples/13-custom-stats-panel`](../../examples/13-custom-stats-panel/)
- Source: `src/visualizations/BaseStatsPanel.ts`, `src/visualizations/StatsPanelRegistry.ts`, `src/visualizations/StatsPanelCoordinator.ts`
