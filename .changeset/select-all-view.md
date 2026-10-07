---
'@jeyabbalas/data-table': patch
---

`actions.selectAll()` selects the rows of the current view while a filter is active, and `Ctrl/Cmd+C` copies only the visible columns.

- **`selectAll()`.** A selection holds 0-based positions in the filtered, sorted view, but `selectAll()` selected `totalRows` positions: under a filter it also selected positions past the view's last row, and the export dialog counted them, "(40)" for a view of 10 rows. It now selects `filteredRows` positions while a filter is active. DuckDB counts those after each filter change, so call `selectAll()` once `filterChange` has fired.
- **The export dialog's Selected count** leaves out positions past the end of the current view, which a filter change can leave in a selection: it is the number of rows a Selected export or copy writes. While the count is 0 the dialog checks All instead, as it did for an empty selection, and it now checks Selected again once the count is back, unless another scope was picked meanwhile.
- **`Ctrl/Cmd+C` and `copyRowsToClipboard`** copied every column but `__rowid__`, hidden ones included. They copy the visible columns in the order the grid shows them, `__rowid__` among them when the app has shown it. With no selected row left in the view, `Ctrl/Cmd+C` leaves the browser its own copy, and `copyRowsToClipboard` writes nothing instead of the column names alone. The export dialog keeps its own choice of columns.
- **A `Shift`-click** whose starting row a filter change has left past the end of the view selects its row alone, instead of a range reaching past the view. A new load or `clearSession()` forgets that starting row, which pointed into the previous data.
- Filter and sort changes still leave a selection as it is. The docs no longer say that `selectionChange` fires on filter changes, or that the built-in UI adjusts a selection when the filters change.
