---
'@jeyabbalas/data-table': minor
---

Column charts are created and fetched as their headers scroll into view, and `loadData()` now resolves at first interactive paint rather than waiting for every chart.

Measured on 1,000 columns × 60,000 rows (macOS, 10 cores, Chromium), with visualizations on, before → after:

| Metric                   | Before    | After    |
| ------------------------ | --------- | -------- |
| Queries at load          | 2,004     | 20       |
| Canvases                 | 1,000     | 8        |
| Live `ResizeObserver`s   | ~1,001    | 9        |
| Live `MutationObserver`s | 1,001     | 2        |
| `loadData` resolves      | 18,884 ms | 3,743 ms |
| One sort                 | 10,515 ms | 450 ms   |
| One filter               | 8,275 ms  | 506 ms   |

Turning charts on cost ten seconds of load, and every later sort and filter went on paying for the 990-odd columns nobody was looking at. The same table with visualizations **off** loads in 3,859 ms and sorts in 402 ms on that machine today, so charts are now effectively free at load and cost tens of milliseconds per interaction rather than tens of seconds.

The counts are viewport-dependent by design — 8 canvases is what a 1,280 px window shows. A wider monitor builds proportionally more charts and no more than that.

**Changed**

- **`loadData()` resolves — and `loadComplete` fires — at first interactive paint.** The grid is painted and the filter counts are correct; the per-column charts are not necessarily drawn yet. Previously the load promise waited for every visualization's first fetch. See **Migration** below.
- **Charts are created lazily.** A column's chart is created when its header comes within 200 px of the header viewport, and its canvas is reclaimed when the header passes 400 px away. The gap between the two bands is deliberate hysteresis: without it a chart would be built and destroyed on every scroll wobble. Only the columns you can see hold a canvas, a `ResizeObserver`, and chart data.
- **Chart data outlives the chart's DOM.** Reclaiming a canvas snapshots its data; scrolling the column back rebuilds the chart from the snapshot with no query. Hiding, showing, pinning, or moving a column rebuilds the whole header row and now issues no visualization queries at all.
- **A filter change refetches only the charts that are currently visible.** Offscreen columns are marked stale and refetch when they scroll back into view. A chart created lazily while a filter is active costs one query or two more than the unfiltered case, because it has to fetch both the filtered series and the background series.
- **Chart and column-stats queries run at a new `'low'` worker-queue priority**, below the grid's own queries, under a shared cap of four fetches in flight. Scrolling the body no longer queues behind a wall of chart queries.
- **`visualizations` accepts `boolean | { eager?: boolean }`.** `true` / `undefined` / `{}` is the lazy default; `false` is unchanged; `{ eager: true }` restores the previous behaviour exactly — every applicable column's chart is created and fetched during load, and the load promise waits for all of them.
- **Above 100,000 rows the distinct-value count in the column-stats line is an estimate.** It comes from DuckDB's `approx_count_distinct` (HyperLogLog) instead of a full `COUNT(DISTINCT …)` scan, and the line says so: `~17,028 unique` rather than a precise-looking figure. Measured accuracy: exact through cardinality 7, then 100 → 134, 20,000 → 17,028, 100,000 → 104,014. Because the estimate can exceed the true count, the "all values unique" shortcut — which reads `distinctCount === nonNullCount` as "this is an ID column" — is suppressed whenever the count is approximate, and the `uuid` percentage is clamped to 100. At or below 100,000 rows counts are exact, as before.
- **One `data-dt-color-scheme` `MutationObserver` per table** replaces the one every chart used to install: at 1,000 columns, 1,000 observers collapse to one. Palette resolution is cached per table too, so a repaint after a hover, a resize, or a data refresh costs zero `getComputedStyle` lookups instead of about fifteen. Visualizations composed standalone from `@jeyabbalas/data-table/advanced` get no shared watcher, keep their private observer, and are unaffected.
- Where no `IntersectionObserver` exists (jsdom, very old browsers) every column is treated as visible — the pre-existing eager behaviour — so no environment silently loses its charts.
- **Escape clears the most recent interaction among the charts currently on screen.** It used to walk every chart on the table. Reclaiming a canvas takes that column off the undo stack — its filter stays, but Escape no longer reaches it — and scrolling the column back puts it on top of the stack rather than at its original position. Remove such a filter from its chip instead; the chips are unaffected and still list every active filter.
- **The main entry grew 8.12 → 10.82 kB brotli.** The visibility controller and the facade wiring around it are reachable from `createDataTable` whether or not you use charts, so `visualizations: false` pays for them too. The chart classes themselves stay in their existing lazy chunk, which moved only 73.57 → 74.65 kB. Called out rather than absorbed because it is the largest single-release move this entry has made.

**Added**

- `vizReady` event, payload `{ tableName: string; vizCount: number }`. Fires once per load, when the charts whose headers were visible at load time have finished fetching. `vizCount` is the size of that wave — the visible set plus overscan, not the column count. It is `0` when nothing was visible (a table mounted in a hidden tab panel, say) and when `visualizations: false`. It lands after `loadComplete` under the lazy default, and before it under `{ eager: true }` or `visualizations: false`.
- `table.whenVizReady(): Promise<void>` — the promise form of the same moment. Replaced on every `loadData` call, so call it after starting the load you care about. A failed load settles it without emitting `vizReady`, so an awaiter never hangs.
- `QueryOptions.priority` accepts `'low'` alongside `'high'` and `'normal'`. The worker's serial queue drains strictly `'high'` → `'normal'` → `'low'`. Use it for full-table scans your users are not waiting on.
- `Strings.statistics.approxUniqueCount(count)` and `Strings.statistics.approxUniquePercent(count, pct)`, English defaults `~1,234 unique` and `~1,234 unique (98%)`. Runtime-compatible for all consumers (deep-merge defaults); consumers hand-authoring a **complete** `Strings` literal must add the two keys to satisfy the type. Keep a marker for "approximate" in a translation — the tilde is the only thing distinguishing an estimate from an exact count.
- `BaseVisualization.exportDataSnapshot()` and `importDataSnapshot(snapshot)`, plus `VisualizationOptions.initialSnapshot`. Default to `null` / no-op, so a custom visualization that ignores them refetches on rebuild instead of being seeded — correct either way. Implement the pair to make column moves free for your chart too.
- `VisualizationOptions.useApproxDistinct`, and `distinctCountApprox?: boolean` on `NumericColumnStats` and `CategoricalColumnStats`. A custom stats panel should render its own approximation marker when it sees the flag.

**Migration**

`await table.loadData(…)` and `await createDataTable({ source })` no longer mean "the charts are drawn". If you were relying on that — to take a screenshot, to measure, to hide a spinner, to run a visual-regression snapshot — pick one of three:

```ts
// 1. Wait for the charts explicitly.
const table = await createDataTable({ container, source });
await table.whenVizReady();
await page.screenshot();

// 2. Or react to the event instead of the promise.
table.on('vizReady', ({ vizCount }) => hideSpinner(vizCount));

// 3. Or keep the old semantics exactly: every chart fetched before
//    the load promise resolves.
const table = await createDataTable({
  container,
  source,
  visualizations: { eager: true },
});
```

One caveat on `whenVizReady()` and `vizReady`: in a hidden document — a background tab, a `display: none` host — the browser never delivers `IntersectionObserver` callbacks, so nothing is ever visible, the wave is empty, and it settles immediately with `vizCount: 0`. The charts are created when the table becomes visible. `{ eager: true }` is the option to use if you need charts drawn in a document that is never shown.

Nothing else changes. `visualizations: false` behaves as before, `loadStart` / `loadProgress` / `loadError` are untouched, the five `dt:load:*` User Timing marks keep their names (`dt:load:vizReady` simply starts landing after `dt:load:complete` instead of before it), and code that never awaited the load promise for chart-drawn-ness needs no change.
