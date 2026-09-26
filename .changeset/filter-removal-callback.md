---
'@jeyabbalas/data-table': minor
---

`setOnFilterRemove` now fires for every way a filter can be dropped, not just undo, redo and reset — so a chart's brush no longer outlives the filter it created.

The documented contract was always the broad one ("called when a filter chip is removed"). The code implemented a narrower one: `StateActions.notifyRemovedFilters` was reachable only from `undo`, `redo`, `resetToInitial` and the derived-column paths. `removeFilter` and `clearFilters` — which is to say the filter chips, the filter panel, and a chart clearing its own selection — never called it, so anything keyed to a filter went stale the moment a user removed one by hand.

The visible symptom: drag a brush on a histogram, remove the resulting filter from its chip, then hide any column. The header row rebuilds, the chart is re-created, and the brush comes back — painting a selection for a filter that no longer exists, with the stats slot reading `60,000 rows` on line one and `24,271 rows (40.5%)` underneath.

**Changed**

- **`setOnFilterRemove` fires once per column that loses its filter, from every path that can drop one**: `removeFilter` (and so the chips, the filter panel, `removeRawSQLFilter`, and a chart clearing its own brush or selection), `clearFilters`, `loadFilterPreset` for columns the preset does not carry forward, plus the `undo` / `redo` / `resetToInitial` / derived-column paths that already fired. It is called synchronously once the signals have settled, so reading `state.filters` inside the callback shows the post-removal list.
- **It still does not fire when a filter is merely replaced** — `addFilter` over a column that already has one, or a preset that hands that column a different filter. The column still has a filter, so state keyed to it is still live. Removal is judged per column, not per filter.
- **`removeFilter` and `clearFilters` are now idempotent.** Asking to remove a filter that is not there writes nothing, notifies no subscriber, and pushes no undo entry; previously it set `state.filters` to a fresh array with identical contents, which woke every subscriber and cost a full filter cycle, and it recorded an undo step that made the first `Ctrl+Z` look broken. `clearFilters` still resets `filteredRows` to `totalRows` unconditionally — that repairs the count whether or not there was anything to clear.

  This is what makes the wider callback safe rather than merely correct: clearing a chart's brush calls `onFilterChange(null)`, which the crossfilter coordinator routes straight back into `removeFilter` while the removal that triggered it is still unwinding. Without idempotence every chip click would have cost a duplicate filter cycle and a dead undo step, and clearing *n* filters would have cost *n* of each.

**If you registered `setOnFilterRemove`**

You will now see calls you did not see before — one per column, on paths that previously stayed silent. Handlers should be idempotent and cheap: the callback fires synchronously inside the removal, and one user action can produce several calls. Removing a filter from inside the handler is safe.

Nothing else changes. Filters, chips, presets, undo and redo behave as before; only the notification and the two no-op cases are different.
