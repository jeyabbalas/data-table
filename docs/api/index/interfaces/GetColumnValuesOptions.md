[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetColumnValuesOptions

# Interface: GetColumnValuesOptions

Defined in: [core/Actions.ts:48](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/Actions.ts#L48)

Options for [StateActions.getColumnValues](../../advanced/classes/StateActions.md#getcolumnvalues).

## Properties

### limit?

> `optional` **limit?**: `number`

Defined in: [core/Actions.ts:59](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/Actions.ts#L59)

Optional cap on the number of returned values. Non-negative integer.

***

### offset?

> `optional` **offset?**: `number`

Defined in: [core/Actions.ts:61](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/Actions.ts#L61)

Optional offset applied after WHERE and ORDER BY. Non-negative integer.

***

### scope?

> `optional` **scope?**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [core/Actions.ts:57](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/Actions.ts#L57)

Which rows to include:
- `'all'` (default) — every row in the effective table.
- `'filtered'` — only rows matching the currently active filters.
- `'selected'` — only rows in the current selection (positional indices
  resolved against the current filter/sort view, same semantics as the
  export "selected rows" scope).

***

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [core/Actions.ts:63](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/Actions.ts#L63)

Optional AbortSignal forwarded to the DuckDB worker.
