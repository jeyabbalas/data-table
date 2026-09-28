---
'@jeyabbalas/data-table': patch
---

### Fixed

- Two tables sharing a `WorkerBridge`, each with a vector derived column of the same name, no longer share one DuckDB helper table. Before, the second add replaced the first table's values with its own, and removing the column from either table broke the other's VIEW. Helper tables are now named per derived-column manager, and a manager is numbered per bridge. That also keeps a table's new helper tables apart from those of the manager it replaced on a new load or an undo.
- Destroying a derived-column manager, which a reset, a new load or an undo of a derived column does, now drops a helper table left by a vector add or edit that failed part-way through, instead of leaving it in DuckDB.
