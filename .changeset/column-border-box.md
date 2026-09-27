---
'@jeyabbalas/data-table': minor
---

### Changed

- Header cells, body cells, rows and the table root are `box-sizing: border-box`, so a column's width and a row's height include their padding and border. On a page without a global `box-sizing` reset, columns are narrower than before by their side padding and border: 25 px at the default 16 px root font size, so a column is 150 px wide by default where it took 175 px. Pages with a reset, such as Tailwind's or Bootstrap's, look the same.

### Fixed

- On pages without a `box-sizing` reset, every calculation that places columns treated them as narrower than they drew, by 25 px per column at the default font size. `End` and the arrow keys could leave the cursor's column off-screen (on 1,000 columns, `End` stopped more than 100 columns short of the last); pinned columns overlapped and the pinned divider sat inside the last pinned column; with a filter matching no rows, the body scrolled only as far as the declared widths reached, well short of the last headers; and in a table narrower than 550 px, where the header padding shrinks, headers drifted 8 px per column from their cells.
- On pages without a reset, each row also took 1 px more than `rowHeight`, so rows drifted 1 px per row from where the scroller placed them and walking the cursor down with the arrow keys could leave its row partly below the view. The table overflowed its container by 2 px.
- Starting a resize drag no longer widens the column before the pointer moves. On pages without a reset it added the padding and border.
