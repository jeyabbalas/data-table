---
'@jeyabbalas/data-table': patch
---

`setColumnOrder` no longer puts a column in the order twice when its name is given twice.

- `setColumnOrder` counts a column name given twice once, at its first place. A repeated name used to put the column in the order twice.
