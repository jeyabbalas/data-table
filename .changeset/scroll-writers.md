---
'@jeyabbalas/data-table': patch
---

### Fixed

- A sideways scroll right after a filter change now stays where the user put it. For a second after a filter change, a table scrolled sideways put its horizontal position back every frame, which undid any scroll made in that second. A wheel scroll straight after brushing a chart went nowhere, and moving the keyboard cursor with `End` could leave it off-screen. The hold now ends at the first wheel, key press, click or touch in the table.
- Hiding, showing, pinning or moving a column now puts the scroll position back as soon as the table is rebuilt, not a frame later. The table no longer flashes to its first column for a frame. The late restore also undid a scroll made right after the rebuild: moving a column to the far right with `Shift+F2` and then `Shift+End` left it off-screen. And it lost the position when the table was rebuilt twice in a row, as when a derived column is added: the table jumped back to its first column.
- Adding a column with the + button now scrolls the table all the way to it. The smooth scroll to the right end was cut off after 600ms, before a wide table got there, and the new column was left out of view.
