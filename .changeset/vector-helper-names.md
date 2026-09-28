---
'@jeyabbalas/data-table': patch
---

### Fixed

- Two tables sharing a `WorkerBridge`, each with a vector derived column of the same name, no longer share one DuckDB helper table. Before, the second add replaced the first table's values with its own, and removing the column from either table broke the other's VIEW. Helper tables are now named per derived-column manager, and a manager is numbered per bridge. That also keeps a table's new helper tables apart from those of the manager it replaced on a new load or an undo.
- Destroying a derived-column manager, which a reset, a new load or an undo of a derived column does, now drops a helper table left by a vector add or edit that failed part-way through, instead of leaving it in DuckDB.
- `destroy()` on a table sharing its bridge now drops the table's derived-column VIEW and vector helper tables as well as its base table. It waits for a derived-column change still running to finish first, so the change cannot rebuild one after the drop. Before, they stayed in DuckDB for as long as the bridge lived.
- A `loadData()` still in flight when `clearSession()` is called no longer fires `loadComplete` with an empty `tableName` and a `rowCount` of 0 after the clear. The clear now deletes the snapshot of the table it empties, which is the one the load made. That table is also dropped at the next load or `destroy()`, instead of being left in DuckDB for good.
- `clearSession()` and `resetToInitial()` now fire `derivedChange` (with `kind: 'updated'`) when they drop the derived columns, so a SQL editor refreshing its completions on that event no longer offers the dropped columns.
