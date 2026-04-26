# 13 — Custom stats panel

Replace the library's built-in two-line column stats display (`min · med · max`, `12 unique`, etc.) with your own rendering and DuckDB queries. Mirrors the per-instance, registry-based extensibility pattern from example 08 — only this time the slot we're swapping out is `.dt-col-stats`, not the visualization canvas.

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/13-custom-stats-panel/
```

## API surface

- [`BaseStatsPanel`](../../docs/api-reference.md#stats-panel-internals) — abstract class to subclass; lifecycle is `update(stats) → updateFilters(filters) → setHoverStats(text) → destroy()`
- [`StatsPanelOptions`](../../docs/api-reference.md#stats-panel-internals) — the `{ tableName, bridge, filters, messages, onError }` passed to the constructor and refreshed on every filter change
- [`StatsPanelRegistry`](../../docs/api-reference.md#stats-panel-registry) — per-instance registry; same shape (`name`, `isApplicable`, `constructor`, `priority`) as `VisualizationRegistry` but starts empty (no library built-ins)

## Data

The same 181-row × 5-column [`us_customer_orders.csv`](../../tests/fixtures/datasets/csv/us_customer_orders.csv) used by example 08. Columns: `order_id` (integer), `state` (string), `product_category` (string), `order_total_usd` (float), `order_date` (date).

## What to observe

1. The two numeric columns (`order_id`, `order_total_usd`) show `<n> rows · μ <mean> · σ <stddev>` instead of the default `min · med · max`. Mean / stddev come from a panel-issued `SELECT AVG(...), STDDEV_POP(...)` query, not from `ColumnStatsData`.
2. The two string columns (`state`, `product_category`) show `top: <value> (<pct>%)` — most-common value and its share. The panel runs its own `GROUP BY ... ORDER BY COUNT DESC LIMIT 1` query on every filter change.
3. `order_date` keeps the library's default `2025-01-01 – 2025-12-31` line. We never registered a panel for `date` columns, so the default HTML formatter renders unchanged.
4. Brush `order_total_usd`, click a state segment, or otherwise filter — both panels re-query in lockstep, and the row counts shrink to match the visible subset.
5. Hover a histogram bin or value-counts segment: the panel's bottom line briefly shows the visualization's hover snippet, then snaps back when you mouse off. Custom panels keep the standard hover-preview UX by routing `onStatsChange` through `setHoverStats(text)`.

## Lifecycle quickstart

```ts
class MeanStdPanel extends BaseStatsPanel {
  constructor(container, column, options) {
    super(container, column, options);
    // build your DOM once, then …
    void this.fetch();   // initial query
  }

  // Library hands you the same ColumnStatsData visualizations emit.
  update(stats) { /* render row counts, distinct, etc. */ }

  // Library hands you the new filter array on every change.
  // Default impl just stashes filters; override to query DuckDB.
  async updateFilters(filters) {
    await super.updateFilters(filters);
    await this.fetch();
  }

  // Library hands you the visualization's hover string (or null to clear).
  setHoverStats(text) { /* swap line 2 in/out */ }

  destroy() {
    this.container.replaceChildren();
    super.destroy();
  }
}
```

## Registration

Just like `VisualizationRegistry`, the registry is per-instance — pass it on `createDataTable`:

```ts
const statsPanelRegistry = new StatsPanelRegistry();
statsPanelRegistry.register({
  name: 'mean-std',
  isApplicable: (type) => type === 'integer' || type === 'float' || type === 'decimal',
  constructor: MeanStdPanel,
  priority: 10,
});

await createDataTable({
  container,
  source,
  statsPanelRegistry,
});
```

To restrict a panel to a specific column **name** (not just a type), subclass the registry and override `create()` — same pattern as example 08's `StateAwareRegistry`:

```ts
class NameAwareRegistry extends StatsPanelRegistry {
  create(container, column, options) {
    if (column.name === 'order_total_usd') return new RevenuePanel(container, column, options);
    return super.create(container, column, options);
  }
}
```

## Responding to filters

`StatsPanelCoordinator` (composed for you by `createDataTable`) subscribes to `state.filters` and calls `updateFilters(filters)` on every registered panel — including panels mounted on columns *without* a visualization (e.g. `uuid`). Panels that only re-render existing `ColumnStatsData` need not override `updateFilters` at all; the library will still call `update(stats)` whenever the column's visualization (if any) refreshes its query. Panels that compute their own statistics override `updateFilters` to issue their queries via `options.bridge`.

```ts
async updateFilters(filters) {
  await super.updateFilters(filters);   // refresh this.options.filters
  const where = filtersToWhereClause(this.options.filters);
  const sql = `SELECT AVG("${col}") FROM "${tableName}" ${where ? 'WHERE ' + where : ''}`;
  // …
}
```

## Adapting the pattern

- **Stale results**: the example uses a per-panel `fetchSeq` counter so a slow query that resolves after a fresh filter change is dropped instead of overwriting the new render.
- **Errors**: route fetch failures through `this.options.onError(err, { source: 'stats-panel', column, phase })`. The facade re-emits these on its `error` event so `table.on('error', …)` listeners catch panel failures alongside load / query / persistence ones.
- **Fallthrough**: leave a column type *unregistered* and the library renders its built-in formatter — opt-in is granular, you don't have to handle every type.
- **Hover integration**: override `setHoverStats(text)` to pin the visualization's hover preview into your layout; ignore it if your panel design doesn't need a bin-by-bin readout.
- **No viz columns**: panels work on `uuid` and other types that have no visualization. The coordinator still broadcasts filter changes, so the panel can refresh its DuckDB stats independently.
