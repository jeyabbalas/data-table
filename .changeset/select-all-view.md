---
'@jeyabbalas/data-table': patch
---

`actions.selectAll()` selects the rows of the current view while a filter is active, and `Ctrl/Cmd+C` copies only the visible columns.

- **`selectAll()`.** A selection holds 0-based positions in the filtered, sorted view, but `selectAll()` selected `totalRows` positions: under a filter it also selected positions past the view's last row, and the export dialog counted them, "(40)" for a view of 10 rows. It now selects `filteredRows` positions while a filter is active. DuckDB counts those after each filter change, so call `selectAll()` once `filterChange` has fired.
- **The export dialog's Selected count** leaves out positions past the end of the current view, which a filter change can leave in a selection: it is the number of rows a Selected export or copy writes.
- **`Ctrl/Cmd+C` and `copyRowsToClipboard`** copied every column but `__rowid__`, hidden ones included. They copy the visible columns in the order the grid shows them, `__rowid__` among them when the app has shown it. The export dialog keeps its own choice of columns.
- A new load or `clearSession()` forgets the row a `Shift`-click range starts from, which pointed into the previous data.
- Filter and sort changes still leave a selection as it is. The docs no longer say that `selectionChange` fires on filter changes, or that the built-in UI adjusts a selection when the filters change.
