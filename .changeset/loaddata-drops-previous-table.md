---
'@jeyabbalas/data-table': patch
---

Fix: loading a new dataset (or destroying the DataTable on a shared bridge) now drops the previous base table from DuckDB instead of leaking it. Long-running dashboards that reload data many times in one page lifetime — or unmount tables in a multi-table dashboard — no longer accumulate orphan tables in the worker's DuckDB catalog.

- `loadData` captures `state.baseTableName` before the new load and, on success, issues `DROP TABLE IF EXISTS` for the previous name. Skipped when the new load reuses the same name (`CREATE OR REPLACE TABLE` already replaced it atomically). A failed load leaves the previous data queryable.
- `destroy()` drops `state.baseTableName` when the bridge is shared (`ownsBridge=false`). When the DataTable owns the bridge, `bridge.terminate()` discards the entire worker, so the drop is skipped.
- `clearSession()` is unchanged — it still clears UI state and the IndexedDB snapshot but leaves the DuckDB table queryable until the next `loadData`.

New API: `WorkerBridge.dropTable(tableName)`. Convenience for consumers managing ad-hoc tables via `bridge.query('CREATE TABLE …')`. Idempotent (uses `DROP TABLE IF EXISTS`) and quotes the identifier the same way the worker-side loaders do.
