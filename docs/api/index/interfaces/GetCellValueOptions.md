[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetCellValueOptions

# Interface: GetCellValueOptions

Defined in: [core/Actions.ts:105](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Actions.ts#L105)

Options for [StateActions.getCellValue](../../advanced/classes/StateActions.md#getcellvalue).

## Example

```ts
const controller = new AbortController();
const value = await table.actions.getCellValue(0, 'tags', { signal: controller.signal });
```

## Properties

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [core/Actions.ts:110](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Actions.ts#L110)

Aborts the read: the query is cancelled in the DuckDB worker, and the
promise rejects with a `QueryError` coded `QUERY_ABORTED`.
