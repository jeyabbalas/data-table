---
'@jeyabbalas/data-table': patch
---

A `tableName` holding a single quote, such as `O'Brien`, no longer breaks the load.

- A `tableName` containing a single quote (for example `O'Brien`) no longer breaks the load with a SQL parser error. Loaders used to register the source as `<tableName>.<ext>` and splice that name unescaped into `read_csv_auto('…')` / `read_json_auto('…')` / `read_parquet('…')`; the source file now gets a generated name, so the table name only ever reaches SQL as a quoted identifier.
- A failure while unregistering the source file after a load no longer replaces the load's own error, or fails a load that succeeded.
