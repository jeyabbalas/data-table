---
'@jeyabbalas/data-table': patch
---

A dragged column lands where the drop indicator shows, also over the pinned columns and in a scaled table, and a drag ends without a drop when its button is released outside the browser.

- A column let go over the pinned columns, while the table is scrolled sideways, now lands at the pinned block's edge, before the first unpinned column in view. It used to land among the columns scrolled out of view beneath the pinned block, wherever the pointer met their hidden headers, and so vanished from view. Drops are now found from the column layout and the header scroll rather than from header positions, and the drop indicator marks where the column will land.
- A drag whose mouse button is released outside the browser, after switching to another window, now ends without moving the column. It stayed alive, with its indicator following the pointer, until the next click anywhere dropped the column there. A drag also ends, without a drop, when the window loses focus, the page is hidden or the browser cancels the pointer.
- The drop indicator now marks the right place in a table inside a scaled element, under a CSS `transform` or `zoom`. It was placed in screen pixels inside the scaled header row, far from the gap it marked.
