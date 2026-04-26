# Performance

`@jeyabbalas/data-table` is designed to scale to ~1M rows in a single
table on a typical laptop. This doc covers the architectural limits,
what to watch for when scaling up, and the methodology for measuring
your own workload.

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
roughly `⌈height / rowHeight⌉ + buffer` rows at any moment — on a 1000 px
tall container, that's about 35 rows visible, regardless of whether the
underlying data has 1K rows or 10M.

**Implication:** initial paint and scroll latency don't scale with row
count. The cost moves elsewhere — to DuckDB query times and to memory
holding the loaded data.

### DuckDB in WASM

DuckDB runs in a Web Worker. By default it uses the single-thread bundle
(`mvp`); cross-origin-isolated pages (COOP/COEP headers) can use `coi`
with `SharedArrayBuffer` for multi-thread execution.

**Implication:** aggregations over millions of rows are fast (DuckDB is
column-oriented and vectorized), but not CPU-parallel in the default
setup. The `coi` bundle is the big lever if you're consistently seeing
10M+ row queries.

### Query cache

`WorkerBridge` has an LRU query cache, default size 100 entries. Cached
queries return instantly. The cache is invalidated automatically on any
mutation (filter / sort / derived column) that changes the result set.

**Implication:** filter-change → visualization-refresh loops stay fast
because repeated "unchanged" viz queries hit the cache. Tuning the cache
size can help if you have many visualizations and a lot of histogramming.

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

Approximate ranges from architectural reasoning — not measured:

| Dataset scale     | Expected experience                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| < 100 K rows      | Fully interactive, all features snappy. Filter changes < 50 ms                                                                           |
| 100 K – 1 M rows  | Interactive with faint cost on filter changes (100–300 ms). Virtualized scroll remains smooth. This is the design target                 |
| 1 M – 10 M rows   | Filter/sort latency becomes noticeable (300 ms – 2 s). Initial load takes seconds. Still workable for analytics, not for live dashboards |
| 10 M – 100 M rows | Outside the design target. Consider server-side aggregation; use this library for the summary layer                                      |
| > 100 M rows      | Don't                                                                                                                                    |

Memory usage grows roughly linearly with row count × column count. A
useful rule of thumb: expect ~50–100 bytes per cell in DuckDB, plus the
CSV/JSON/Parquet raw bytes during load.

## Tuning levers

### Row height

Default is 32 px. Taller rows show more content per row but the scroller
renders fewer at a time; shorter rows show more rows but cram content.
Changing `--dt-row-height` has no performance effect — just visual.

### Query cache size

Pass `bridgeOptions.cache: { size: 200 }` to increase the cache. Default
100 is fine for most apps; raise if you have many visualizations driving
lots of repeated queries.

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
  expressionFilter: false, // no raw-SQL filter (drops CodeMirror)
});
```

For a read-only display table, turning these off reduces initial JS +
CSS footprint measurably.

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

- **WorkerBridge.query** — DuckDB query time + message round-trip
- **VirtualScroller renderRange** — row re-rendering on scroll
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

### Reloading data without destroy-first

```ts
// Each loadData() keeps the previous DuckDB table until overwritten.
// Memory accumulates across loads.
await table.loadData(largeSource1);
await table.loadData(largeSource2);
await table.loadData(largeSource3);

// Prefer destroy + recreate when loading a very different dataset:
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
- All DOM is removed
- Signal subscriptions are disposed
- IDB connections close (if owned; shared stores are your responsibility)

Don't manually remove the container's children before `destroy()` — the
library expects to do that itself. Call `destroy()`, await it, and then
remove the container if you need to.

## Known slow paths (as of v0.1.0)

- **Initial schema detection on very wide tables.** Tables with hundreds of columns spend measurable time in `DESCRIBE` queries during load.
- **First-run WASM compilation.** A cold browser takes a few seconds to compile DuckDB's WASM. Subsequent loads hit the HTTP cache.
- **Filter changes that shrink the dataset to near-zero.** Some visualizations (e.g., date histogram) recalculate bins, which has a fixed cost that dominates when the result set is tiny. Usually < 300 ms total; on 10M-row datasets it can approach 1 s.

## Future benchmark tracking

Planned for a follow-up release:

- A benchmark harness measuring load time, filter latency, visualization refresh for fixed workloads (100 K, 1 M, 10 M rows; CSV vs Parquet)
- A reference-machine configuration so numbers are comparable across releases
- CI integration so regressions surface in PRs

Until that's in place, this doc stays methodology-first. If you
measure something interesting about your workload, share it in an issue
— it helps calibrate the thresholds here.

## Related

- Architecture: [Architecture concept doc](./concepts/architecture.md)
- Derived columns: [Derived columns guide](./guides/derived-columns.md) — expression vs vector trade-offs
- CSP / offline: [CSP and offline guide](./guides/csp-and-offline.md) — `coi` bundle for multi-thread execution
- Session persistence: [Session persistence guide](./guides/session-persistence.md) — IDB quota considerations
