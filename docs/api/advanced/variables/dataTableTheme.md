[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / dataTableTheme

# Variable: dataTableTheme

> `const` **dataTableTheme**: `Extension`

Defined in: [sql-editor/theme.ts:14](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/sql-editor/theme.ts#L14)

CodeMirror editor theme that resolves every color, font, and spacing through
the library's `--dt-*` CSS custom properties so the editor inherits the
host page's palette automatically. Adapts to light/dark mode because the
`--dt-*` variables switch under `@media (prefers-color-scheme: dark)` /
`[data-dt-color-scheme="dark"]`. Pair with [dataTableHighlighting](dataTableHighlighting.md)
for SQL-token coloring; or use [createSqlExtensions](../functions/createSqlExtensions.md) (which bundles
both by default via `includeTheme`).
