# 08 — Custom visualization

Replace the default `ValueCounts` on a `state` column with a **US-states choropleth**, rendered by [Observable Plot](https://observablehq.com/plot/) over [`us-atlas`](https://github.com/topojson/us-atlas) topology. Each state is shaded by frequency of occurrence in the loaded rows.

## Run

```bash
npm run example
# open http://localhost:5173/08-custom-visualization/
```

## API surface

- [`BaseVisualization`](../../docs/api-reference.md#visualization-internals) — abstract class to subclass
- [`VisualizationOptions`](../../docs/api-reference.md#visualization-internals) — the `{ tableName, bridge, filters, … }` passed to the constructor
- [`VisualizationRegistry`](../../docs/api-reference.md#visualizations) — per-instance registry; subclassed here to override `create()` (see below)

## Data

181 rows × 5 columns — [`tests/fixtures/datasets/csv/us_customer_orders.csv`](../../tests/fixtures/datasets/csv/us_customer_orders.csv). Columns: `order_id`, `state` (USPS 2-letter, two nulls), `product_category`, `order_total_usd`, `order_date`. The state distribution is deliberately skewed (CA/TX/NY/FL heavy, Mountain West light) so the choropleth renders with a clear gradient.

## What to observe

1. The `state` column header shows a US map, not a `ValueCounts` bar. Hover any state for `Name: count`.
2. Other string columns (`product_category`) still show the built-in `ValueCounts`. Numeric (`order_total_usd`) shows `Histogram`. Date (`order_date`) shows `DateHistogram`. The custom registration is scoped to exactly one column.
3. The choropleth color scale is `[--dt-bg → --dt-primary]`: load this example on top of example 06's terracotta theme (or flip to dark mode) and the map recolors to match.

## The canvas-escape pattern

`BaseVisualization` unconditionally creates a `<canvas>` inside `container` — a subclass cannot opt out. This example **hides** the canvas and appends an SVG sibling produced by `Plot.plot()`:

```ts
constructor(container, column, options) {
  super(container, column, options);
  this.canvas.style.display = 'none';   // canvas is still in the DOM, just invisible
  void this.fetchData();
}
```

Then `destroy()` must be overridden to clean up the SVG; the parent's `destroy()` removes the canvas and its observers but knows nothing about sibling nodes the subclass added:

```ts
destroy() {
  if (this.svg?.parentNode) this.svg.parentNode.removeChild(this.svg);
  super.destroy();
}
```

## Per-column registration — subclass the registry

`VisualizationRegistration.isApplicable(type)` only receives the column's DataType — it cannot see the column name. To restrict the choropleth to *just* the `state` column (so `product_category` keeps `ValueCounts`), subclass `VisualizationRegistry` and override `create`:

```ts
class StateAwareRegistry extends VisualizationRegistry {
  create(container, column, options) {
    if (column.name === 'state') return new StateChoropleth(container, column, options);
    return super.create(container, column, options);
  }
}
```

Pass the subclass instance as `visualizationRegistry`. Built-ins still handle everything else.

## TopoJSON source

Fetched at runtime from jsDelivr — no asset committed to the repo:

```
https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json
```

`topojson-client`'s `feature()` converts it to a GeoJSON `FeatureCollection` whose `id` is the **2-digit FIPS string** (e.g. `"06"` for California). Customer rows use USPS codes (`CA`), so the example hardcodes a 51-entry `ABBR_TO_FIPS` map to join them.

The fetch is cached at module scope: multiple choropleth instances on a page share a single network call.

## Why no interaction handlers

The six abstract methods `handleMouseMove`, `handleClick`, `handleMouseLeave`, `handleMouseDown`, `handleMouseUp`, `handleKeyDown` still have to exist or TypeScript refuses to compile — but they're empty no-ops here. Mouse events on the canvas are received but discarded (the canvas is hidden, so the user can't trigger any). Plot's own `title` attribute gives native `<title>` tooltips without needing JS listeners.

## Adapting the pattern

- **Europe / world**: swap the TopoJSON URL and the FIPS map. `world-atlas` gives countries; `europe-atlas` gives NUTS regions.
- **US counties**: `us-atlas/counties-10m.json` — ~3 000 features, still performant at 200×100 px.
- **Interactive filtering**: implement `handleClick` to call `this.options.bridge` and emit a `SetFilter` on the column.
