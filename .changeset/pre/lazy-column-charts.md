---
'@jeyabbalas/data-table': minor
---

Header charts are built only for the columns near the view, and a chart's brush or selection no longer outlives the filter it made: `setOnFilterRemove` now fires for every way a filter can be dropped.

**Changed**

- Column-header charts are built only for columns near the view. A chart is created when its header scrolls within 200 px of the visible header row and removed once the header is 400 px away, and a filter change refreshes only the charts that exist. A column scrolled into view later gets its chart built with the filters in force then. On a 50,000-row × 1,000-column Parquet file in Chrome, `loadData` drops from 20.4 s to 6.2 s (2,004 queries to 22), a filter from 4.4 s to 0.5 s, and hiding a column from 20.6 s to 2.2 s.
- `loadData`, and `await createDataTable({ source })`, now wait for the charts in view to draw their first data rather than every column's. In a hidden tab they don't wait for charts, and in a page the browser isn't rendering, such as a hidden iframe, they stop waiting after one second. Without `IntersectionObserver` (jsdom, for example), every column's chart is built at once, as before.
- A custom visualization is now constructed each time its column comes within reach, and destroyed when the column leaves. Header rebuilds still re-create the ones near the view. One that throws in its constructor is reported once and not tried again until the next header rebuild. A custom stats panel gets `update(null)` again when its column's chart is removed.
- **`setOnFilterRemove` fires once per column that loses its filter, from every path that can drop one**: `removeFilter` (and so the chips, the filter panel, `removeRawSQLFilter`, and a chart clearing its own brush or selection), `clearFilters`, `loadFilterPreset` for columns the preset does not carry forward, plus the `undo` / `redo` / `resetToInitial` / derived-column paths that already fired. It is called synchronously once the signals have settled, so reading `state.filters` inside the callback shows the post-removal list.

  The documented contract was always the broad one ("called when a filter chip is removed"). The code implemented a narrower one: `StateActions.notifyRemovedFilters` was reachable only from `undo`, `redo`, `resetToInitial` and the derived-column paths. `removeFilter` and `clearFilters` — which is to say the filter chips, the filter panel, and a chart clearing its own selection — never called it, so anything keyed to a filter went stale the moment a user removed one by hand.

- **It still does not fire when a filter is merely replaced** — `addFilter` over a column that already has one, or a preset that hands that column a different filter. The column still has a filter, so state keyed to it is still live. Removal is judged per column, not per filter.
- **`removeFilter` and `clearFilters` are now idempotent.** Asking to remove a filter that is not there writes nothing, notifies no subscriber, and pushes no undo entry; previously it set `state.filters` to a fresh array with identical contents, which woke every subscriber and cost a full filter cycle, and it recorded an undo step that made the first `Ctrl+Z` look broken. `clearFilters` still resets `filteredRows` to `totalRows` unconditionally — that repairs the count whether or not there was anything to clear.

  This is what makes the wider callback safe rather than merely correct: clearing a chart's brush calls `onFilterChange(null)`, which the crossfilter coordinator routes straight back into `removeFilter` while the removal that triggered it is still unwinding. Without idempotence every chip click would have cost a duplicate filter cycle and a dead undo step, and clearing *n* filters would have cost *n* of each.

**Added**

- `InteractionManager.replaceVisualization(columnName, viz)` points a column's brush or selection at another visualization without moving it on the Escape stack. Escape now still clears the most recent brush or selection when its column has scrolled out of view.

**Fixed**

- A chart's brush or selection is now always drawn from its column's filter. Hiding, showing, pinning or reordering any column used to put back a saved brush or selection, which after the filter was removed with its chip or Clear all drew a brush that no longer filtered anything. For example: drag a brush on a histogram, remove the resulting filter from its chip, then hide any column. The header row rebuilt, the chart was re-created, and the brush came back, with the stats slot reading `60,000 rows` on line one and `24,271 rows (40.5%)` underneath.
- `loadData` no longer resolves before the charts of a header rebuild that happens while it waits, such as a column change during the load.

**If you registered `setOnFilterRemove`**

On `table.actions`, don't: the callback has one slot, and the table fills it to clear its charts' brushes and selections, so registering your own replaces that handler. Listen to the `filterChange` event instead.

On a `StateActions` you built yourself, you will now see calls you did not see before — one per column, on paths that previously stayed silent. Handlers should be idempotent and cheap: the callback fires synchronously inside the removal, and one user action can produce several calls. Removing a filter from inside the handler is safe.

Nothing else about removing filters changes. Filters, chips, presets, undo and redo behave as before; only the notification and the two no-op cases are different.
