---
'@jeyabbalas/data-table': patch
---

The filter panel, the filter-preset panel and the derived-column editor are named by their titles, and the SQL editors' placeholder and the preset delete confirmation's **No** meet WCAG AA contrast.

- **Dialog names.** The three panels were `role="dialog"` with no accessible name (axe `aria-dialog-name`), so a screen reader announced only "dialog". Each is now `aria-labelledby` its title: "Filter: price", "Filter Presets", "Edit: total". The filter panel's and the editor's follow a switch to another column.
- **The SQL editors' placeholder** (the SQL filter modal, the derived-column modal and editor) kept CodeMirror's `#888`: 3.54:1 on a light panel, and 4.14:1 in dark on `dataTableTheme`'s active-line highlight, in an editor that turns it on with `highlightActiveLine()`. `dataTableTheme` now paints it `--dt-text-tertiary` (7.56:1 in light, 9.57:1 in dark), which also reaches editors built with `createSqlExtensions`. A placeholder wider than its editor, as the default one is in the 360 px derived-column editor, now ends in an ellipsis at the editor's edge: it ran on past it, into a scroll region no key could scroll.
- **The preset confirmation's No** set no colour and took the page's: white on the white panel (1.00:1) on a page whose buttons have white text, as the demo's do. It is `--dt-text-secondary` now.
