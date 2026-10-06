---
'@jeyabbalas/data-table': patch
---

### Fixed

- A list or fixed-size array column (`INTEGER[]`, `VARCHAR[3]`, …) no longer leaves rows loading for good.
  - **Before:** the worker could not send a list value to the page, and the query waited for a reply that never came. On a wide table, dragging the horizontal scrollbar to the list columns blanked every body cell, and no scroll brought them back. `loadData` on a JSON file with an array field in its first screen never resolved. `bridge.query`, `actions.getColumnValues` and the CSV, JSON and clipboard exports hung the same way on a list column.
  - **Now:** list values reach the page as arrays: `bridge.query` returns `BIGINT[]` items as numbers and `STRUCT(…)[]` items as objects, and the exports and `getColumnValues` read list columns without hanging.
- A worker error whose code is not a string, such as a `DOMException`'s number, now rejects its query with a `QueryError` whose code is `QUERY_RUNTIME`. The bridge threw `code.startsWith is not a function` instead, and the query stayed pending for good. An error reply the bridge cannot read at all rejects with `WORKER_PROTOCOL_VIOLATION`.
- Nested columns (lists, arrays, structs, maps, unions, VARIANT) show in the grid as DuckDB's text for them: `[56, 3, 91]`, `{'x': 1.25, 'y': 0.58, 'tier': bronze}`, `{k1=1, k2=2}`. Sorting a nested column still orders by value.
  - **Before:** a struct cell showed `[object Object]`, and so did a BLOB, BIT, GEOMETRY or BIGNUM cell; an ENUM cell was empty, its values read as `null`; and a table with a VARIANT column failed every row fetch with `Unsupported Arrow type VARIANT`.
  - **Now:** each shows DuckDB's text, bounded so that a cell costs about a screenful of text whatever its value holds. A list, a map, or an array of more than 32 items shows its first 32 and then how many more: `[1, 2, …, 32, … +968]`, `{k1=1, … +568}`. Text past 1,000 graphemes is cut and ends `…`, only when something was cut, and never inside an emoji. A BLOB shows its first 256 bytes, then `… +N`, under the same 1,000-grapheme cap: DuckDB writes a byte that is not printable ASCII as four characters (`\x89`), so a BLOB of almost nothing else shows 250 bytes and ends `…`. A 128-row block of a `FLOAT[768]` embedding column is about 50 KB, where its whole text was 1.18 MB.
- A table with numeric `months` and `days` columns no longer shows `null` in every cell. Each of its rows was taken for an interval value and turned into text such as `1 year 1 month 1 day`.
