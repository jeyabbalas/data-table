[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / dataTableHighlighting

# Variable: dataTableHighlighting

> `const` **dataTableHighlighting**: `Extension`

Defined in: [sql-editor/theme.ts:51](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/sql-editor/theme.ts#L51)

Syntax highlighting style for SQL keywords, strings, numbers, comments,
function names, operators, type names, null, and boolean literals. Every
color resolves through `--dt-*` CSS custom properties, so overriding a
variable on `:root` or the `.dt-root` element re-themes the editor on the
next paint without rebuilding the extension. Pair with [dataTableTheme](dataTableTheme.md)
(or use [createSqlExtensions](../functions/createSqlExtensions.md), which bundles both).
