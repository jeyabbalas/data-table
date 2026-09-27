---
'@jeyabbalas/data-table': minor
---

### Changed

- Header and body cells are `box-sizing: border-box`, so a column's width includes its padding and border. On a page without a global `box-sizing` reset, columns are 25 px narrower than before: a column is 150 px wide by default, where it took 175 px. Pages with a reset, such as Tailwind's or Bootstrap's, look the same.

### Fixed

- On pages without a `box-sizing` reset, every calculation that places columns treated them as 25 px narrower than they drew, and the error grew with each column. `End` and the arrow keys could leave the cursor's column off-screen (on 1,000 columns, `End` stopped near column 872); pinned columns overlapped and the pinned divider sat inside the last pinned column; with a filter matching no rows, the last columns could not be scrolled to; and in containers narrower than 550 px, where the header padding shrinks, headers drifted 8 px per column from their cells.
- Starting a resize drag no longer widens the column before the pointer moves. On pages without a reset it added 25 px.
