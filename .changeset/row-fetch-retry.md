---
'@jeyabbalas/data-table': patch
---

### Fixed

- A row fetch that fails, or comes back short, is no longer issued again at once.
  - **Before:** the body repeated it as fast as DuckDB answered, for as long as the failure lasted, and logged `Error fetching rows` each time: 2,756 failed queries in a browser test that held a derived-column change for a second.
  - **Now:** the same fetch waits 250 ms, then twice as long after each failure in a row, up to 8 s. A fetch of other columns or rows goes ahead at once, and a filter, sort or data change starts afresh.
- Rows are not fetched while a derived-column change is replacing the relation they come from. A scroll during the change used to read from the VIEW it had dropped, or read a column it was removing, and every read failed. The rows are fetched once the change settles, whether it succeeded or failed.
