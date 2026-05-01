---
'@jeyabbalas/data-table': patch
---

Fix: CSV / JSON / Parquet exports and table scrolling no longer reorder rows within tie groups.

DuckDB's `ORDER BY` is non-deterministic for tied keys, so two queries with the same `ORDER BY <user_sort>` could shuffle ties differently across runs. Without a tiebreaker:

- Repeating an export of the same dataset with the same sort produced files with rows shuffled within tie groups (non-reproducible exports).
- "Export selected rows" computed selection indices via `ROW_NUMBER() OVER(ORDER BY <user_sort>)`, then issued the export query with the same `ORDER BY`. The two orderings of tied rows could disagree, so the indices addressed *different* underlying rows on the export — writing rows the user had not selected.
- The scroll path re-fetched overlapping `LIMIT`/`OFFSET` windows, so rows could shuffle in place as the viewport moved.

`ExportQuery.buildOrderByClause`, `ExportQuery.buildBaseQuery`, `ExportQuery.buildSelectedRowsQuery`, and `TableBody.buildRowQuery` now append `"__rowid__" ASC` as the final tiebreaker on every ordered query (skipped only when the user's sort already includes `__rowid__`). Empty-sort branches now emit `ORDER BY "__rowid__" ASC` instead of no `ORDER BY`. The Parquet empty-selection path switched from `WHERE FALSE` to `LIMIT 0` because `WHERE` must precede `ORDER BY` in the rewritten query.

Symptom this fixes: exporting twice from the same filtered + sorted view yielded files with rows shuffled within ties, and "Export selected rows" could write rows the user hadn't actually selected when the sort column had duplicates.
