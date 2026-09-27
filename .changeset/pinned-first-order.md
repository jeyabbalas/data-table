---
'@jeyabbalas/data-table': patch
---

### Fixed

- `setColumnOrder` keeps the pinned columns first, in the order it is given, hidden pinned columns included. An order that put a pinned column after an unpinned one left it sticky at the left edge over another column, and out of step with the pinned divider. The table's own reorders never did this; code calling `setColumnOrder` could.
- A restored session does the same, and puts the visible columns in the restored column order. That fixes sessions saved before the column actions kept pinned columns first, where `aria-colindex` could descend along a row.
- `setColumnOrder` updates `columnOrder` and `visibleColumns` together, so a `columnOrder` subscriber sees the visible columns already in the new order.
