[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / dataTableTheme

# Variable: dataTableTheme

> `const` **dataTableTheme**: `Extension`

Defined in: [sql-editor/theme.ts:14](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/sql-editor/theme.ts#L14)

CodeMirror editor theme that resolves every color, font, and spacing through
the library's `--dt-*` CSS custom properties so the editor inherits the
host page's palette automatically. Adapts to light/dark mode because the
`--dt-*` variables switch under `@media (prefers-color-scheme: dark)` /
`[data-dt-color-scheme="dark"]`. Pair with [dataTableHighlighting](dataTableHighlighting.md)
for SQL-token coloring; or use [createSqlExtensions](../functions/createSqlExtensions.md) (which bundles
both by default via `includeTheme`).
