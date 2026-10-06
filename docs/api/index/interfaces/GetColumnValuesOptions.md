[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetColumnValuesOptions

# Interface: GetColumnValuesOptions

Defined in: [core/Actions.ts:80](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L80)

Options for [StateActions.getColumnValues](../../advanced/classes/StateActions.md#getcolumnvalues).

## Properties

### limit?

> `optional` **limit?**: `number`

Defined in: [core/Actions.ts:91](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L91)

Optional cap on the number of returned values. Non-negative integer.

***

### offset?

> `optional` **offset?**: `number`

Defined in: [core/Actions.ts:93](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L93)

Optional offset applied after WHERE and ORDER BY. Non-negative integer.

***

### scope?

> `optional` **scope?**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [core/Actions.ts:89](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L89)

Which rows to include:
- `'all'` (default) — every row in the effective table.
- `'filtered'` — only rows matching the currently active filters.
- `'selected'` — only rows in the current selection (positional indices
  resolved against the current filter/sort view, same semantics as the
  export "selected rows" scope).

***

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [core/Actions.ts:95](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L95)

Optional AbortSignal forwarded to the DuckDB worker.
