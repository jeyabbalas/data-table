[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetColumnValuesOptions

# Interface: GetColumnValuesOptions

Defined in: [core/Actions.ts:114](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L114)

Options for [StateActions.getColumnValues](../../advanced/classes/StateActions.md#getcolumnvalues).

## Properties

### limit?

> `optional` **limit?**: `number`

Defined in: [core/Actions.ts:126](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L126)

Optional cap on the number of returned values. Non-negative integer.

***

### offset?

> `optional` **offset?**: `number`

Defined in: [core/Actions.ts:128](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L128)

Optional offset applied after WHERE and ORDER BY. Non-negative integer.

***

### scope?

> `optional` **scope?**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [core/Actions.ts:124](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L124)

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

Defined in: [core/Actions.ts:130](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L130)

Optional AbortSignal forwarded to the DuckDB worker.
