[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / dataTableHighlighting

# Variable: dataTableHighlighting

> `const` **dataTableHighlighting**: `Extension`

Defined in: [sql-editor/theme.ts:51](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/sql-editor/theme.ts#L51)

Syntax highlighting style for SQL keywords, strings, numbers, comments,
function names, operators, type names, null, and boolean literals. Every
color resolves through `--dt-*` CSS custom properties, so overriding a
variable on `:root` or the `.dt-root` element re-themes the editor on the
next paint without rebuilding the extension. Pair with [dataTableTheme](dataTableTheme.md)
(or use [createSqlExtensions](../functions/createSqlExtensions.md), which bundles both).
