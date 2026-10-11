[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetCellValueOptions

# Interface: GetCellValueOptions

Defined in: [core/Actions.ts:140](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L140)

Options for [StateActions.getCellValue](../../advanced/classes/StateActions.md#getcellvalue).

## Example

```ts
const controller = new AbortController();
const value = await table.actions.getCellValue(0, 'tags', { signal: controller.signal });
```

## Properties

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [core/Actions.ts:145](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L145)

Aborts the read: the query is cancelled in the DuckDB worker, and the
promise rejects with a `QueryError` coded `QUERY_ABORTED`.
