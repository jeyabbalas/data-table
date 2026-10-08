---
'@jeyabbalas/data-table': patch
---

Keys that act on the keyboard cursor scroll it into view first, so `F2`, `Shift+F2`, `Enter` and `Space` no longer act on a column or row out of sight.

- Keys that act on the keyboard cursor now scroll it into view. Once the user had scrolled away from the cursor with the mouse, `F2` put focus on a header button out of sight, `Shift+F2` opened column layout mode on a column nobody could see, and `Enter` or `Space` sorted a column, or `Enter` selected a row, off-screen.
- In column layout mode (`Shift+F2`), widening a column at the right edge no longer pushes it out of view, and `Escape` after moving a column scrolls back to where the column returns.
- A column wider than the table's view no longer jumps between its two edges on every key press that keeps the cursor on it; the view shows the column's start and stays put.
