---
'@jeyabbalas/data-table': patch
---

### Fixed

- A restored session whose filter or sort names a derived column now counts and reads its rows once that column is back. The filters, sort and column layout are restored in one change with the derived columns. Before, they were written first, so the filtered-row count and the first row reads ran against the base table, which lacks the column, and failed. With `visualizations: false` nothing counted again, and the rows past the true count stayed placeholders.
- A restored session none of whose derived columns can be rebuilt, for example because an expression names a column the data no longer has, no longer keeps filters, a sort or columns that name them.
