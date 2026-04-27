[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / dataTableTheme

# Variable: dataTableTheme

> `const` **dataTableTheme**: `Extension`

Defined in: [sql-editor/theme.ts:14](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/sql-editor/theme.ts#L14)

CodeMirror editor theme that resolves every color, font, and spacing through
the library's `--dt-*` CSS custom properties so the editor inherits the
host page's palette automatically. Adapts to light/dark mode because the
`--dt-*` variables switch under `@media (prefers-color-scheme: dark)` /
`[data-dt-color-scheme="dark"]`. Pair with [dataTableHighlighting](dataTableHighlighting.md)
for SQL-token coloring; or use [createSqlExtensions](../functions/createSqlExtensions.md) (which bundles
both by default via `includeTheme`).
