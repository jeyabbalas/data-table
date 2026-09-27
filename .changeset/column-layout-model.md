---
'@jeyabbalas/data-table': patch
---

### Fixed

- Hiding a pinned column no longer leaves the pinned columns after it offset by its width. The next pinned column stuck that far from the left edge, over the column beside it, and the pinned divider sat past the pinned block. With every pinned column hidden, the divider no longer stays on screen.
- Resizing a pinned column moves the pinned columns after it, and the divider, with it. They kept their old offsets, so when scrolled sideways they overlapped the resized column or left a gap beside it.
- Pinned columns are offset in the order they appear. The order they were pinned in was used instead, which differs once `setColumnOrder` has moved them.
- Keyboard navigation no longer counts hidden pinned columns in the width of the pinned block, which could leave the cursor's column under the pinned columns after `←`.
- A column whose stored width is not a finite, non-negative number, for example from `setColumnWidth` or a restored session, is drawn 150 px wide in both the header and the body. The browser dropped the invalid width and left whatever width the element had before. Stored widths are drawn rounded to whole pixels.
