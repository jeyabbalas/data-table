---
'@jeyabbalas/data-table': minor
---

Column headers far from the view leave out their buttons and handles, and closing a filter panel or a derived-column editor gives focus back to the header button that opened it.

**Changed**

- Column headers far from the view leave out their buttons. Every visible column keeps its header: name, type, stats line, chart slot, id, `aria-colindex`, label and sort state. Only the columns near the view, the ones body rows render cells for, get the pin, hide, filter and sort buttons and the drag and resize handles.
  - **At 1,000 columns:** the header holds about 10,500 elements instead of 36,000, and switching the colour scheme restyles the table in 21 ms instead of 110 ms (Chrome, 50K × 1,000 Parquet file).
  - **Where they are needed, they are there:** the keyboard cursor's column and the column holding DOM focus have their buttons wherever they are, and so does a column being resized or dragged, or whose filter panel or derived-column editor is open.
  - **Code that looks up header buttons in the DOM,** such as `.dt-col-sort-btn`, or `ColumnHeader.getControls()` through `TableContainer.getColumnHeaders()`, finds them only for those columns. `getStatsElement()` and `getVizContainer()` still answer for every column, and a `ColumnHeader` you create yourself still has all its buttons.

**Fixed**

- Closing a filter panel or a derived-column editor gives focus back to the header button that opened it for the column it shows. After switching the panel to another column by clicking that column's button, focus used to go back to the first column's button, which could be far out of view.
