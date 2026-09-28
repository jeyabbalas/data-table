---
'@jeyabbalas/data-table': patch
---

### Fixed

- A row fetch that fails, or comes back short, is no longer issued again at once.
  - **Before:** the body repeated it as fast as DuckDB answered, for as long as the failure lasted, and logged `Error fetching rows` each time: thousands of failed queries in a browser test that held a derived-column change for a second.
  - **Now:** the same fetch waits 250 ms, then twice as long after each failure in a row, up to 8 s. A fetch of other columns or rows goes ahead at once, and a filter, sort or data change starts afresh.
- Rows are not fetched, and filtered rows not counted, while a derived-column change can drop or rebuild the relation they come from: a removal, an edit or a replacement, an undo or redo, a reset or a session restore.
  - **Before:** a scroll during one read from the VIEW it had dropped, or read a column it was removing, and every read failed. A filter added during one kept the row count from before it, and the rows past the true count stayed placeholders.
  - **Now:** both run once the change settles, whether it succeeded or failed. Adding a derived column leaves the relation readable until its last statement, so rows scrolled to or sorted while one is added load at once.
- A table body whose row count dropped below the rows in view while its first fetch was in flight, as when a filter's count lands at zero, no longer asks for the same empty block over and over in one call stack until the stack overflows.
- A derived column added while another of the same name is still being added is refused. The two shared a vector column's helper table, each dropping the other's.
