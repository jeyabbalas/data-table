---
'@jeyabbalas/data-table': patch
---

The docs describe the table's keys, sort gestures and tab stops as the source has them.

**Fixed**

- Sorting: `actions.addToSort`'s JSDoc said Shift+click adds a column to a multi-column sort. Cmd/Ctrl+click on the column's sort button does, and from the keyboard Shift, Ctrl or Cmd with Enter or Space on its header. The accessibility guide's manual test plan and example 01's README said clicking a column header sorts; only its sort button does.
- SQL autocomplete opens on Ctrl+Space, the Control key on a Mac too, where Option+I also works. The SQL editor guide and troubleshooting entry 23 said Ctrl/Cmd+Space.
- Tab stops: with the `derivedColumns` UI on (the default), the "+" add-column button after `.dt-root` is a tab stop, so `Tab` crosses six stops, not five. The accessibility guide, AGENTS.md and the 0.5 → 0.6 migration guide counted only the five inside `.dt-root`, and said six presses step from the control before a table to the one after it, where it takes seven.
- Undo and redo: Cmd/Ctrl+Z undoes, and Cmd/Ctrl+Shift+Z or Ctrl+Y redoes. The README left out Cmd/Ctrl+Shift+Z, and the `undoRedo` option's JSDoc and AGENTS.md left out Ctrl+Y.
- The accessibility guide's keyboard map gains the keys it left out: `Escape` clearing a chart's brush or selection, the most recent first; `Shift+F2`, `F2` and `↓` in column layout mode; and when `Ctrl/Cmd+C` leaves the copy to the browser. It said the grid's keys are off while a dialog holds focus; they are off while any dialog or panel is open.
- Example 10's README opened the export dialog from a right-click menu on a column header, which does not exist; `table.openExportDialog()` opens it.
