---
'@jeyabbalas/data-table': patch
---

### Fixed

- A list or fixed-size array column (`INTEGER[]`, `VARCHAR[3]`, …) no longer leaves rows loading for good.
  - **Before:** the worker could not send a list value to the page, and the query waited for a reply that never came. On a wide table, dragging the horizontal scrollbar to the list columns blanked every body cell, and no scroll brought them back. `loadData` on a JSON file with an array field in its first screen never resolved. `bridge.query`, `actions.getColumnValues` and the CSV, JSON and clipboard exports hung the same way on a list column.
  - **Now:** list values reach the page as arrays. `bridge.query` and `getColumnValues` return them so: numbers for `BIGINT[]`, objects for `STRUCT(…)[]`.
- A worker error whose code is not a string, such as a `DOMException`'s number, now rejects its query with a `QueryError` whose code is `QUERY_RUNTIME`. The bridge threw `code.startsWith is not a function` instead, and the query stayed pending for good. An error reply the bridge cannot read at all rejects with `WORKER_PROTOCOL_VIOLATION`.
- Nested columns (lists, arrays, structs, maps, unions) show in the grid as DuckDB's text for them, as in the header chart's labels: `[56, 3, 91]`, `{'x': 1.0, 'y': 0.58, 'tier': bronze}`. A struct cell showed `[object Object]`. Sorting a nested column still orders by value.
- A table with numeric `months` and `days` columns no longer shows `null` in every cell. Each of its rows was taken for an interval value and turned into text such as `1 year 1 month 1 day`.
