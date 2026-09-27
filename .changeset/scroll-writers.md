---
'@jeyabbalas/data-table': patch
---

### Fixed

- A sideways scroll right after a filter change now stays where the user put it. For a second after any filter change, the table put its horizontal scroll position back every frame, which undid any scroll in that second. A wheel scroll straight after brushing a chart went nowhere, and moving the keyboard cursor with `End` could leave it off-screen. The table still undoes a scroll position that the filter change itself collapsed, but no longer after the user wheels, presses a key, clicks or touches the table.
- Hiding, showing, pinning or moving a column now puts the scroll position back as soon as the table is rebuilt, not a frame later. The late restore undid a scroll made right after the rebuild: moving a column to the far right with `Shift+F2` and then `Shift+End` left it off-screen. It also lost the position when the table was rebuilt twice in a row, as when a derived column is added: the table jumped back to its first column.
- Adding a column with the + button now scrolls the table all the way to it. The smooth scroll to the right end was cut off after 600ms, before a wide table got there, and the new column was left out of view.
