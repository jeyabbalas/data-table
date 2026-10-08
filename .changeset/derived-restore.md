---
'@jeyabbalas/data-table': patch
---

A restored session whose filters or sort name a derived column restores them with that column, and a saved session that cannot be read no longer makes the load reject.

- A restored session whose filter or sort names a derived column now counts and reads its rows once that column is back. The filters, sort and column layout are restored in one change with the derived columns. Before, they were written first, so the filtered-row count and the first row reads ran against the base table, which lacks the column, and failed. With `visualizations: false` nothing counted again, and the rows past the true count stayed placeholders.
- A restored session none of whose derived columns can be rebuilt, for example because an expression names a column the data no longer has, no longer keeps filters, a sort or columns that name them.
- A saved session that cannot be read no longer makes the load reject. The load logs a console warning and goes ahead without the session, and whatever part of it was already written is taken back. Before, a snapshot with malformed fields rejected the load when it had no derived columns, and was reported as a derived-column failure when it had some.
- A derived column that a restored session cannot rebuild no longer leaves its header tooltip behind for a later column of the same name.
