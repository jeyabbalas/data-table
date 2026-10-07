---
'@jeyabbalas/data-table': patch
---

The filter panel, the filter-preset panel and the derived-column editor are named by their titles, and the SQL editors' placeholder and the confirmations' **No** and **Cancel** meet WCAG AA contrast.

- **Dialog names.** The three panels were `role="dialog"` with no accessible name (axe `aria-dialog-name`), so a screen reader announced only "dialog". Each is now `aria-labelledby` its title: "Filter: price", "Filter Presets", "Edit: total". The filter panel's and the editor's follow a switch to another column. Like the modals, each takes an `instanceId` option, which `createDataTable()` passes, for its ids.
- **The SQL editors' placeholder** kept CodeMirror's `#888`: 3.54:1 on a light panel, and 4.14:1 in dark on `dataTableTheme`'s active-line highlight, in an editor that turns it on with `highlightActiveLine()`. `dataTableTheme` now paints it `--dt-text-tertiary` (7.56:1 in light, 9.57:1 in dark), falling back to the light value, `#4b5563`, without the library's stylesheet. That reaches editors built with `createSqlExtensions` too.
- **A placeholder wider than the library's own expression editor**, as the default one is in the 360 px derived-column editor, now ends in an ellipsis at the editor's edge. It ran on past it, into a scroll region no key could scroll. Editors built with `dataTableTheme` keep their whole placeholder.
- **The plain-text expression editor** (`DefaultExpressionEditor`) and the derived-column modal's values field painted their placeholders in the browser's own grey. They use `--dt-text-tertiary` now.
- **The preset delete confirmation's No** set no colour and took the page's: white on the white panel (1.00:1) on a page whose buttons have white text, as the demo's do. It is `--dt-text-secondary` now, with a hover state of its own.
- **Under the pointer, a page's `button:hover` background replaced** the background of **Cancel** in the SQL filter modal's Remove confirmation and in the derived-column editor's delete confirmation, whose hover states set none: their text read 2.65:1 on the demo's blue. Their hover states set their own background now.
