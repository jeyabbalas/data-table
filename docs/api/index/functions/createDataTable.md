[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / createDataTable

# Function: createDataTable()

> **createDataTable**(`opts`): `Promise`\<[`DataTable`](../interfaces/DataTable.md)\>

Defined in: [DataTable.ts:456](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/DataTable.ts#L456)

Create a fully-wired data table mounted in `container`.

Awaits worker initialization before returning so the caller can immediately
`loadData()`. With `source`, it also awaits that first load until its rows
are painted and the charts in view have their data, so `state.schema` is
populated on return. If the load fails, the promise rejects with its error
and the table, already mounted, is not torn down: omit `source` and call
`loadData()` to keep a handle on it.

## Parameters

### opts

[`CreateDataTableOptions`](../interfaces/CreateDataTableOptions.md)

## Returns

`Promise`\<[`DataTable`](../interfaces/DataTable.md)\>

## Remarks

Size the container before calling this. The table virtualizes
against the container's height, and an unbounded one silently renders every
row — see [CreateDataTableOptions.container](../interfaces/CreateDataTableOptions.md#container).
