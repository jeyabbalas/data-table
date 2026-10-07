[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetCellValueOptions

# Interface: GetCellValueOptions

Defined in: [core/Actions.ts:109](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/Actions.ts#L109)

Options for [StateActions.getCellValue](../../advanced/classes/StateActions.md#getcellvalue).

## Example

```ts
const controller = new AbortController();
const value = await table.actions.getCellValue(0, 'tags', { signal: controller.signal });
```

## Properties

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [core/Actions.ts:114](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/Actions.ts#L114)

Aborts the read: the query is cancelled in the DuckDB worker, and the
promise rejects with a `QueryError` coded `QUERY_ABORTED`.
