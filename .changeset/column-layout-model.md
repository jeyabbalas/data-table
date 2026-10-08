---
'@jeyabbalas/data-table': patch
---

Pinned columns no longer fall out of the pinned block or off their offsets when a column is shown, hidden, resized, reordered or pinned, or a session is restored.

- Showing a hidden column no longer puts it in front of a column pinned while it was hidden. It went back next to the neighbours it had when hidden; if one of them had been pinned since, the restored column landed before the pinned block, the pinned divider cut through it, and `aria-colindex` stopped ascending along the header row (3, 1, 4). An unpinned column now goes after the pinned columns, and a pinned one back to its place in pin order among them.
- A column shown back next to its old neighbours also moves there in `columnOrder` when a reorder since then had filed it elsewhere, so `visibleColumns` always follows `columnOrder`. `aria-colindex` is numbered from `columnOrder` and could descend after such a show.
- `setColumnOrder` keeps the pinned columns first, hidden pinned columns included.
  - **What went wrong:** an order that put a pinned column after an unpinned one left it sticky at the left edge over another column, and out of step with the pinned divider.
  - **How it happened:** besides code calling `setColumnOrder`, dragging or moving a column to the front with the keyboard while a pinned column was hidden did it. Pinning another column then put it after the moved one.
  - **The pinned columns' order:** they keep the order given, and a pinned column hidden and shown again goes back to its place among them.
- Pinning or unpinning a column, and `setColumnOrder`, change `pinnedColumns`, `columnOrder` and `visibleColumns` in one update, so a subscriber to any of them sees the others already updated. A `pinnedColumns` subscriber no longer sees the pinned column outside the pinned block, and a `TableBody` used directly no longer fetches its rows again on a pin change.
- `toggleColumnPin` ignores a column name the table does not have. It pinned it and added it to `columnOrder`, where the phantom shifted every later column's `aria-colindex`. A stale pinned name is unpinned without being added.
- A restored session keeps the pinned columns first too, and shows its columns in the order the table last showed them, with hidden ones kept beside their old neighbours.
  - **Undo and redo:** the entries saved with the session get the same fix.
  - **Old sessions:** sessions saved before the column actions kept pinned columns first could restore a pinned column out of place, or undo back to one, with `aria-colindex` descending along a row. A pinned column in such a session now moves into the pinned block.
- Hiding a pinned column no longer leaves the pinned columns after it offset by its width. The next pinned column stuck that far from the left edge, over the column beside it, and the pinned divider sat past the pinned block. With every pinned column hidden, the divider no longer stays on screen.
- Resizing a pinned column moves the pinned columns after it, and the divider, with it. They kept their old offsets, so when scrolled sideways they overlapped the resized column or left a gap beside it.
- Pinned columns are offset in the order they appear. The order they were pinned in was used instead, which differs once `setColumnOrder` has moved them.
- Keyboard navigation counts only visible pinned columns in the width of the pinned block, matching where the pinned columns are now drawn. Counting hidden ones scrolled a column that much too far.
- A column whose stored width is not a finite, non-negative number, for example from `setColumnWidth` or a restored session, is drawn 150 px wide in both the header and the body. The browser dropped the invalid width and left whatever width the element had before. Stored widths are drawn rounded to whole pixels.
