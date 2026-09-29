---
'@jeyabbalas/data-table': minor
---

### Fixed

- Charts no longer refetch while a derived-column change can drop or rebuild the relation they query.
  - **Before:** a filter changed during a removal, an edit or a replacement, an undo or redo, a reset or a session restore made every chart in view query the VIEW the change had dropped, and each reported an `error` event with `source: 'visualization'`.
  - **Now:** their refetches wait for the change to settle, as the filtered-row count already did. A chart whose filters changed more than once meanwhile refetches once, with the filters in force then. Adding a derived column holds nothing back.
- Custom stats panels likewise: `updateFilters` waits out such a change, so a panel that queries the relation no longer reports an `error` event with `source: 'stats-panel'` for each filter change made during one.

### Added

- `StatsPanelCoordinator` takes the table's actions as an optional third argument. Given them, as the facade gives them, a broadcast waits out a derived-column change that can drop or rebuild the relation, and then goes once to the panels still registered. For `/advanced` users who drive the coordinator directly.
