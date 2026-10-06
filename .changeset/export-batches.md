---
'@jeyabbalas/data-table': patch
---

### Fixed

- CSV, JSON and clipboard exports no longer fill the query cache. Their batches went through it and stayed until the next filter, sort or derived-column change: 460 MB after a 30,000-row CSV export of a `FLOAT[768]` column. A long export also pushed the charts' and stats' results out of the cache. The batches now skip it, as a nested column's `getColumnValues` and the value inspector's reads do.

### Changed

- Export batches, clipboard copies and pages of `getColumnValues` (`limit`, `offset`) that DuckDB has to order pick their rows by `__rowid__` first, then read the values of those rows alone. In one `SELECT`, DuckDB worked out the values of every row before it kept the page, the JSON of each nested value included. A 10-row copy at row 30,000 of 100,000 `FLOAT[768]` rows takes 4 ms, a 10,000-row export batch of them about 0.5 s, and `getColumnValues(name, { scope: 'filtered', limit: 1000 })` over 60,000 of them 55 ms.
