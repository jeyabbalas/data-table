---
'@jeyabbalas/data-table': patch
---

### Fixed

- `setColumnOrder` keeps the pinned columns first, hidden pinned columns included.
  - **What went wrong:** an order that put a pinned column after an unpinned one left it sticky at the left edge over another column, and out of step with the pinned divider.
  - **How it happened:** besides code calling `setColumnOrder`, dragging or moving a column to the front with the keyboard while a pinned column was hidden did it. Pinning another column then put it after the moved one.
  - **The pinned columns' order:** they keep the order given, and a pinned column hidden and shown again goes back to its place among them.
  - **One update:** `columnOrder`, `visibleColumns` and `pinnedColumns` change together, so a subscriber to any of them sees the others already updated.
- A restored session keeps the pinned columns first too, and shows its columns in the order the table last showed them, with hidden ones kept beside their old neighbours.
  - **Undo and redo:** the entries saved with the session get the same fix.
  - **Old sessions:** sessions saved before the column actions kept pinned columns first could restore a pinned column out of place, or undo back to one, with `aria-colindex` descending along a row. A pinned column in such a session now moves into the pinned block.
