[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetCellValueOptions

# Interface: GetCellValueOptions

Defined in: [core/Actions.ts:109](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/Actions.ts#L109)

Options for [StateActions.getCellValue](../../advanced/classes/StateActions.md#getcellvalue).

## Example

```ts
const controller = new AbortController();
const value = await table.actions.getCellValue(0, 'tags', { signal: controller.signal });
```

## Properties

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [core/Actions.ts:114](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/Actions.ts#L114)

Aborts the read: the query is cancelled in the DuckDB worker, and the
promise rejects with a `QueryError` coded `QUERY_ABORTED`.
