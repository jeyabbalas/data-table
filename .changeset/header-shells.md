---
'@jeyabbalas/data-table': minor
---

### Changed

- Column headers far from the view leave out their buttons. Every visible column keeps its header: name, type, stats line, chart slot, id, `aria-colindex`, label and sort state. Only the columns near the view, the ones body rows render cells for, get the pin, hide, filter and sort buttons and the drag and resize handles.
  - **At 1,000 columns:** the header holds about 10,500 elements instead of 36,000, and switching the colour scheme restyles the table in 21 ms instead of 110 ms (Chrome, 50K × 1,000 Parquet file).
  - **Where they are needed, they are there:** the keyboard cursor's column and the column holding DOM focus have their buttons wherever they are, and so does a column being resized or dragged, or whose filter panel or derived-column editor is open. Closing the panel gives focus back to the button that opened it.
  - **Code that looks up header buttons in the DOM,** such as `.dt-col-sort-btn`, or `ColumnHeader.getControls()` through `TableContainer.getColumnHeaders()`, finds them only for those columns. `getStatsElement()` and `getVizContainer()` still answer for every column, and a `ColumnHeader` you create yourself still has all its buttons.
