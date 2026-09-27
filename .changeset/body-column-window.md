---
'@jeyabbalas/data-table': minor
---

### Changed

- Body rows render only the columns near the view. That is the pinned columns, the columns in view and a viewport's width either side, and the column the keyboard cursor or DOM focus is on. A spacer stands in for the rest, so the scroll width and every column's position stay the same.
  - **Fewer cells:** at 1,000 columns in a 1,200 px view, a row holds 16 to 24 cells instead of 1,000.
  - **Scrolling sideways:** cells are added and removed as columns come within reach. The cells of columns that stay are kept in place, so a clicked cell keeps focus.
  - **Code that looks up body cells in the DOM** finds only these. The cursor's cell is always among them, so `aria-activedescendant` always resolves.
