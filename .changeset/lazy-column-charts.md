---
'@jeyabbalas/data-table': minor
---

### Changed

- Column-header charts are built only for columns near the view. A chart is created when its header scrolls within 200 px of the visible header row and removed once the header is 400 px away, and a filter change refreshes only the charts that exist. A column scrolled into view later gets its chart built with the filters in force then. On a 50,000-row × 1,000-column Parquet file in Chrome, `loadData` drops from 20.4 s to 6.2 s (2,004 queries to 22), a filter from 4.4 s to 0.5 s, and hiding a column from 20.6 s to 2.2 s.
- `loadData`, and `await createDataTable({ source })`, now wait for the charts in view to draw their first data rather than every column's. In a hidden tab they don't wait for charts, and in a page the browser isn't rendering, such as a hidden iframe, they stop waiting after one second. Without `IntersectionObserver` (jsdom, for example), every column's chart is built at once, as before.
- A custom visualization is now constructed each time its column comes within reach, and destroyed when the column leaves. Header rebuilds still re-create the ones near the view.

### Added

- `InteractionManager.replaceVisualization(columnName, viz)` points a column's brush or selection at another visualization without moving it on the Escape stack. Escape now still clears the most recent brush or selection when its column has scrolled out of view.

### Fixed

- A chart's brush or selection is now always drawn from its column's filter. Hiding, showing, pinning or reordering any column used to put back a saved brush or selection, which after the filter was removed with its chip or Clear all drew a brush that no longer filtered anything.
- `loadData` no longer resolves before the charts of a header rebuild that happens while it waits, such as a column change during the load.
