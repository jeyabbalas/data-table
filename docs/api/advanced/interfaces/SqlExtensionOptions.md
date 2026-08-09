[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SqlExtensionOptions

# Interface: SqlExtensionOptions

Defined in: [sql-editor/extensions.ts:47](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/sql-editor/extensions.ts#L47)

Options accepted by `createSqlExtensions`.

## Properties

### functions?

> `optional` **functions?**: readonly `string`[] \| readonly [`DuckDBFunctionInfo`](DuckDBFunctionInfo.md)[]

Defined in: [sql-editor/extensions.ts:67](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/sql-editor/extensions.ts#L67)

Override the function list surfaced via autocomplete. Three behaviors:

- **`undefined` (default)** — fall back to `context.functions`, then to the
  built-in `DUCKDB_FUNCTION_DETAILS`.
- **`[]` (empty array)** — disable function autocomplete entirely; only
  column completions are surfaced. Note: this does NOT fall through, since
  `??` only treats `null`/`undefined` as missing.
- **non-empty array** — replace the function list. A `DuckDBFunctionInfo[]`
  populates `detail` (category chip) and `info` (description tooltip) on
  each completion option; a `string[]` populates `label` only.

***

### includeTheme?

> `optional` **includeTheme?**: `boolean`

Defined in: [sql-editor/extensions.ts:54](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/sql-editor/extensions.ts#L54)

Include `dataTableTheme` and `dataTableHighlighting` in the returned
extension array. Defaults to `true`. Set to `false` if the host already
applies its own theme or wants to add the theme separately (e.g.,
outside a `Compartment` so it survives reconfiguration).

***

### upperCaseKeywords?

> `optional` **upperCaseKeywords?**: `boolean`

Defined in: [sql-editor/extensions.ts:73](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/sql-editor/extensions.ts#L73)

Format SQL keyword completions as uppercase. Defaults to `true`,
matching DuckDB's preferred style and the bundled
`CodeMirrorExpressionEditor`.
