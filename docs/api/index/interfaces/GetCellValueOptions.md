[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / GetCellValueOptions

# Interface: GetCellValueOptions

Defined in: [core/Actions.ts:109](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/Actions.ts#L109)

Options for [StateActions.getCellValue](../../advanced/classes/StateActions.md#getcellvalue).

## Example

```ts
const controller = new AbortController();
const value = await table.actions.getCellValue(0, 'tags', { signal: controller.signal });
```

## Properties

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [core/Actions.ts:114](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/Actions.ts#L114)

Aborts the read: the query is cancelled in the DuckDB worker, and the
promise rejects with a `QueryError` coded `QUERY_ABORTED`.
