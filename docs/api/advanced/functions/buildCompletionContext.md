[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / buildCompletionContext

# Function: buildCompletionContext()

> **buildCompletionContext**(`columns`, `options?`): [`CompletionContext`](../../index/interfaces/CompletionContext.md)

Defined in: [sql-editor/extensions.ts:96](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/sql-editor/extensions.ts#L96)

Build a `CompletionContext` from any column-like array.

Accepts inputs as terse as `[{name: 'foo'}]` or as full as
`ColumnSchema[]`. When both `originalType` and `type` are present
`originalType` wins (matches the data-table's internal behavior). Unknown
types fall back to an empty string. `isDerived` defaults to `false`.

**System columns:** if you obtain columns from
`actions.getCompletionContext()`, the synthetic `__rowid__` is already
filtered. If you pull columns from `actions.tableSchema` (or some other
raw source), filter rows where `name === '__rowid__'` before passing
them in — otherwise the synthetic id will appear in the autocomplete
dropdown.

## Parameters

### columns

readonly `object`[]

Source columns. Extra fields are ignored.

### options?

Optional `functions` array forwarded to `CompletionContext.functions`.

#### functions?

readonly `string`[]

## Returns

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

A `CompletionContext` ready to pass to `createSqlExtensions` or
         `CodeMirrorExpressionEditor`.
