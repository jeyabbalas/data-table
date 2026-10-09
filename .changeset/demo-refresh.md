---
'@jeyabbalas/data-table': patch
---

The demo and the examples have a new look, and the demo opens Excel workbooks. The library itself is unchanged.

**Changed**

- The [demo](https://jeyabbalas.github.io/data-table/) opens on the file picker and the table: a compact top bar, one row to open a file, paste a link or try an example, and the table filling the rest of the window above a status bar. Its theme switch now themes the whole page, not only the table, and is remembered.
- The demo's instructions moved to a [Shortcuts](https://jeyabbalas.github.io/data-table/shortcuts/) page, which lists every keyboard shortcut and mouse gesture of the table.
- The [examples](https://jeyabbalas.github.io/data-table/examples/) share the demo's look and follow its theme, and their index is a grid of cards.
- The README links to the demo, the examples and the shortcuts.

**Added**

- A load that takes a moment shows an overlay over the table: the step it is on, a download's progress and the seconds spent.
- A file dropped anywhere on the demo loads.
- The demo opens Excel workbooks (`.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.ods`), asking which sheet to load when a workbook has several. The demo reads them with SheetJS and converts the sheet to JSON, keeping each column's type; the library still loads CSV, JSON and Parquet.
