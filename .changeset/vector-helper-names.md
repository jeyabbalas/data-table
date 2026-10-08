---
'@jeyabbalas/data-table': patch
---

Tables sharing a `WorkerBridge` keep their derived-column helper tables apart, and loads that are superseded, cleared or destroyed no longer leave tables in DuckDB or fire stale events.

- Two tables sharing a `WorkerBridge`, each with a vector derived column of the same name, no longer share one DuckDB helper table. Before, the second add replaced the first table's values with its own, and removing the column from either table broke the other's VIEW. Helper tables are now named per derived-column manager, and a manager is numbered per bridge. That also keeps a table's new helper tables apart from those of the manager it replaced on a new load or an undo.
- Destroying a derived-column manager, which a reset, a new load or an undo of a derived column does, now drops a helper table left by a vector add or edit that failed part-way through, instead of leaving it in DuckDB.
- `destroy()` on a table sharing its bridge now drops the table's derived-column VIEW and vector helper tables as well as its base table. It waits for a derived-column change still running to finish first, so the change cannot rebuild one after the drop. Before, they stayed in DuckDB for as long as the bridge lived.
- A `loadData()` still in flight when `clearSession()` is called no longer fires `loadComplete` with an empty `tableName` and a `rowCount` of 0 after the clear. The clear now deletes the snapshot of the table it empties, which is the one the load made. That table is also dropped once a load lands or on `destroy()`, instead of being left in DuckDB for good.
- A load that a newer `loadData()` or `clearSession()` supersedes before it ends now fires neither `loadComplete` nor `loadError`. Its promise still resolves, or rejects if the load itself failed. Each `loadStart` is followed by at most one of the two.
- A load that a newer `loadData()` supersedes no longer leaves its base table in DuckDB for good, even after `destroy()`; with 200K rows × 1,000 columns that was about 1.5 GB. `destroy()` during a load in flight, on a shared bridge, now drops both the table the load was replacing and the one it makes once it lands, instead of leaving both. Each load now reports the table it replaces as its turn begins, so whatever happens to the load, the next successful load or `destroy()` drops it.
- Two loads of the same `tableName`, neither awaited, no longer risk one dropping the table the other has just made.
- A table destroyed while a session restore rebuilds its derived columns no longer logs "Failed to restore derived columns"; the load rejects with `DestroyedError`, as a load destroyed at any other point does.
- `clearSession()` and `resetToInitial()` now fire `derivedChange` (with `kind: 'updated'`) when they drop the derived columns, so a SQL editor refreshing its completions on that event no longer offers the dropped columns.
