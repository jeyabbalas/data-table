[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / createSqlExtensions

# Function: createSqlExtensions()

> **createSqlExtensions**(`context`, `options?`): `Extension`[]

Defined in: [sql-editor/extensions.ts:133](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/sql-editor/extensions.ts#L133)

Build the CodeMirror extensions that make any editor SQL-, schema-, and
DuckDB-aware. The returned array can be combined with any other
extensions the host wants (e.g., `keymap.of(...)`, `placeholder(...)`,
`EditorView.theme(...)`).

Wrapping the result in a `Compartment` lets the host reconfigure
completions on schema change — see `CodeMirrorExpressionEditor` for the
canonical pattern.

## Parameters

### context

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

Columns and (optionally) a function name list.

### options?

[`SqlExtensionOptions`](../interfaces/SqlExtensionOptions.md) = `{}`

Theming, keyword case, and function-source overrides.

## Returns

`Extension`[]

Plain CodeMirror `Extension` array suitable for
         `EditorState.create({ extensions })` or `Compartment.of(...)`.
