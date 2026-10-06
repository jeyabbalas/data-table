---
'@jeyabbalas/data-table': patch
---

### Fixed

- A column named `__proto__`, which a CSV header can give a table, keeps its values. Rows were built by assigning each column to a plain object, and assigning `__proto__` sets the object's prototype instead of a property: the column's cells showed `[object Object]`, CSV and JSON exports wrote it, and `getColumnValues` of selected rows read it the same way. When the column held a STRUCT, the assignment of the next column threw `'set' on proxy: trap returned falsish`, so a query that read a column after it failed, the grid's row fetches and `bridge.query('SELECT * …')` included.

### Changed

- `bridge.query` builds each row from the result's columns by position, rather than from Arrow's row objects, which reads a result about three times as fast: 2,000 rows of 1,000 columns in 0.41 s against 1.11 s, and a 128-row block of 30 columns in 1.4 ms against 2.5 ms.
