---
'@jeyabbalas/data-table': minor
---

Body rows render cells only for the columns near the view, not for every column.

**Changed**

- Body rows render only the columns near the view. That is the pinned columns, the columns in view and a viewport's width either side, and the columns holding the keyboard cursor or DOM focus. A spacer stands in for the rest, so the scroll width and every column's position stay the same.
  - **Fewer cells:** at 1,000 columns in a 1,200 px view, a row holds about two dozen cells instead of 1,000.
  - **Scrolling sideways:** cells are added and removed as columns come within reach. The cells of columns that stay are left in place, and a reorder never moves the cell holding focus, so a clicked cell keeps focus through both.
  - **Code that looks up body cells in the DOM** finds only these. The cursor's cell is among them whenever its row is rendered, so `aria-activedescendant` keeps resolving.
