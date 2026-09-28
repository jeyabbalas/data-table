---
'@jeyabbalas/data-table': minor
---

### Fixed

- A header chart whose data fails to load no longer keeps the detail of the bar or segment under the pointer, or of its brush or selection, in its stats slot. Nothing is drawn after a failure, so nothing is hovered and no detail shows. A selection's detail comes back with the next fetch that lands.
- Its stats slot no longer keeps the stats the chart reported for the filters before. It shows the table-wide row count, kept current, until the chart reports stats again. A failure of a refetch a newer one superseded, or of a chart already destroyed, is reported but leaves the slot alone.
- A column whose chart has no stats of its own, before its first fetch lands or for a custom chart that reports none, keeps its table-wide row count current through filter changes. It kept the count from when the chart was made.
- `error` events with `source: 'visualization'` now always name the column, in `error.details.column`, and the stage that failed, when the chart reported it, in `error.details.stage`. Before, only some of the charts' queries put the column on the error, and a chart that threw while being built never did. The event carries a copy of the error the chart reported, a native error of the same class, so an error that several charts pass on names each one's column.

### Added

- A chart whose data failed to load no longer looks like one still loading. Its stats slot says "Failed to load" (`messages.statistics.chartFailed`) beneath the row count until the chart reports stats again, for a chart that reports them, and a built-in chart's `<canvas>` carries a `data-fetch-failed` attribute until a fetch lands.
- `VisualizationOptions.onError`'s context has `superseded: true` for a filter update that failed after a newer one had started.
- `BaseVisualization.reportsDefaultStats`, true for the built-in charts, says a chart reports its stats through `onDefaultStatsChange` each time a fetch lands. The stats slot says a chart's fetch failed only for a chart that reports stats, since only new stats take the line back. A custom chart that reports its stats after every fetch can set it, so that a failure of its first fetch is said too.
