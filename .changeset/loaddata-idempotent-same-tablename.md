---
'@jeyabbalas/data-table': patch
---

Fix: calling `loadData` twice with the same `tableName` no longer throws a DuckDB "Catalog Error: Table with name 'X' already exists!".

The CSV / JSON / Parquet worker loaders now use `CREATE OR REPLACE TABLE` instead of `CREATE TABLE`, so a reload under the same name atomically replaces the previous registration. This came up in the demo when re-uploading a file whose content hash drove the same `tableName` as the prior load — the `loadData` call hit the conflict before the library could surface a useful error.

Behavior with a brand-new `tableName` is unchanged.
