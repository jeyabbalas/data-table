[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetColumnValuesOptions

# Interface: GetColumnValuesOptions

Defined in: [core/Actions.ts:47](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/core/Actions.ts#L47)

Options for [StateActions.getColumnValues](../../advanced/classes/StateActions.md#getcolumnvalues).

## Properties

### limit?

> `optional` **limit?**: `number`

Defined in: [core/Actions.ts:58](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/core/Actions.ts#L58)

Optional cap on the number of returned values. Non-negative integer.

***

### offset?

> `optional` **offset?**: `number`

Defined in: [core/Actions.ts:60](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/core/Actions.ts#L60)

Optional offset applied after WHERE and ORDER BY. Non-negative integer.

***

### scope?

> `optional` **scope?**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [core/Actions.ts:56](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/core/Actions.ts#L56)

Which rows to include:
- `'all'` (default) — every row in the effective table.
- `'filtered'` — only rows matching the currently active filters.
- `'selected'` — only rows in the current selection (positional indices
  resolved against the current filter/sort view, same semantics as the
  export "selected rows" scope).

***

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [core/Actions.ts:62](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/core/Actions.ts#L62)

Optional AbortSignal forwarded to the DuckDB worker.
