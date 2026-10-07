[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetColumnValuesOptions

# Interface: GetColumnValuesOptions

Defined in: [core/Actions.ts:83](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/core/Actions.ts#L83)

Options for [StateActions.getColumnValues](../../advanced/classes/StateActions.md#getcolumnvalues).

## Properties

### limit?

> `optional` **limit?**: `number`

Defined in: [core/Actions.ts:95](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/core/Actions.ts#L95)

Optional cap on the number of returned values. Non-negative integer.

***

### offset?

> `optional` **offset?**: `number`

Defined in: [core/Actions.ts:97](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/core/Actions.ts#L97)

Optional offset applied after WHERE and ORDER BY. Non-negative integer.

***

### scope?

> `optional` **scope?**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [core/Actions.ts:93](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/core/Actions.ts#L93)

Which rows to include:
- `'all'` (default) — every row in the effective table.
- `'filtered'` — only rows matching the currently active filters.
- `'selected'` — only rows in the current selection (positional indices
  resolved against the current filter/sort view, same semantics as the
  export "selected rows" scope). A position past the end of the view,
  which a filter change can leave in the selection, selects nothing.

***

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [core/Actions.ts:99](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/core/Actions.ts#L99)

Optional AbortSignal forwarded to the DuckDB worker.
