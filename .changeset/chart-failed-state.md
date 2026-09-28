---
'@jeyabbalas/data-table': minor
---

### Fixed

- A header chart whose data fails to load no longer keeps the detail of the bar or segment under the pointer, or of its brush or selection, in its stats slot. Nothing is drawn after a failure, so nothing is hovered and no detail shows. A selection's detail comes back with the next fetch that lands.
- Its stats slot no longer keeps the stats the chart reported for the filters before. It shows the table-wide row count, kept current, with "Failed to load" beneath it, until a fetch lands. A failure of a refetch a newer one superseded, or of a chart already destroyed, is reported but leaves the slot alone.
- `error` events with `source: 'visualization'` now always name the column, in `error.details.column`, and the stage that failed, when the chart reported it, in `error.details.stage`. Before, only some of the charts' queries put the column on the error, and a chart that threw while being built never did. The event carries a copy of the error the chart reported, so an error that several charts pass on names each one's column.

### Added

- A chart whose data failed to load draws "Failed to load" where its bars would be, and its `<canvas>` carries a `data-fetch-failed` attribute, so it no longer looks like one still loading. The text is `messages.statistics.chartFailed`.
- `VisualizationOptions.onError`'s context has `superseded: true` for a filter update that failed after a newer one had started.
