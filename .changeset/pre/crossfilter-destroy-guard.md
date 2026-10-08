---
'@jeyabbalas/data-table': patch
---

Destroying a table while a filter's row count is still being counted no longer logs an error.

- Destroying a table while a filter's row-count query is still running no longer logs `[CrossfilterCoordinator] Failed to update filtered row count` when the terminated worker rejects that query. `CrossfilterCoordinator.destroy()` now also discards a count that settles afterwards: it no longer writes `state.filteredRows` or fires `onFilterCycleComplete` — relevant to `/advanced` users who drive the coordinator directly.
