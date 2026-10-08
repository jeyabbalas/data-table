---
'@jeyabbalas/data-table': patch
---

Editing a derived column into another DuckDB type drops its filters, so a filter made for the old type no longer fails every query.

- Editing or replacing a derived column drops its filters whenever its DuckDB type changes, unless both types are integers or both are DECIMALs, which DuckDB compares by value.
  - **Before:** the filters went only when `ColumnSchema.type` changed. An edit from `json_extract_string` to `json_extract`, `VARCHAR` to `JSON`, kept a set filter `['active']` from a value-count bar, which DuckDB then read as JSON, and every grid, count and chart query failed with `Malformed JSON` until the chip was removed. A change to `BIT`, `BIGNUM` or `GEOMETRY` failed the same way, and a STRUCT made a LIST, or `INTEGER[]` made `BIGINT[]`, kept filters made for another shape.
  - **Now:** `DOUBLE` made `FLOAT`, `TIMESTAMP` made `TIMESTAMP WITH TIME ZONE` and any change between nested types drop the filters too. `INTEGER` made `BIGINT`, or `DECIMAL(12,3)` made `DECIMAL(13,4)`, keeps them.
