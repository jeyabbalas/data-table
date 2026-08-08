[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / dataTableHighlighting

# Variable: dataTableHighlighting

> `const` **dataTableHighlighting**: `Extension`

Defined in: [sql-editor/theme.ts:51](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/sql-editor/theme.ts#L51)

Syntax highlighting style for SQL keywords, strings, numbers, comments,
function names, operators, type names, null, and boolean literals. Every
color resolves through `--dt-*` CSS custom properties, so overriding a
variable on `:root` or the `.dt-root` element re-themes the editor on the
next paint without rebuilding the extension. Pair with [dataTableTheme](dataTableTheme.md)
(or use [createSqlExtensions](../functions/createSqlExtensions.md), which bundles both).
