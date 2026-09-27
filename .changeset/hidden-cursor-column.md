---
'@jeyabbalas/data-table': patch
---

### Fixed

- Hiding or removing the column the keyboard cursor is on moves the cursor to the column in its place, not to the first column. That is the next column still shown, or the one before it when it was the last. For a pinned column it is another pinned column, which is always in view, or with none left, the first column at the left of the view. A derived column renamed while the cursor is on it keeps the cursor. The first column was far from where the user was: hiding a column far to the right, from its header's hide button for example, left the cursor off-screen with the view unchanged, and the next arrow key jumped the table back to its start.
