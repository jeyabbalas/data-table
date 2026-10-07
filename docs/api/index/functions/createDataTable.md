[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / createDataTable

# Function: createDataTable()

> **createDataTable**(`opts`): `Promise`\<[`DataTable`](../interfaces/DataTable.md)\>

Defined in: [DataTable.ts:497](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/DataTable.ts#L497)

Create a fully-wired data table mounted in `container`.

Awaits worker initialization before returning so the caller can immediately
`loadData()`. With `source`, it also awaits that first load, and the first
fetches of its rows and of the charts in view, so `state.schema` is
populated on return. Those fetches are awaited, not required: one that
fails is logged and leaves placeholders. If the load fails, the table tears
itself down as `destroy()` would, and the promise rejects with the load's
error: omit `source` and call `loadData(source, { tableName, sourceFormat, sourceOptions })`
to keep the table through a failed load.

## Parameters

### opts

[`CreateDataTableOptions`](../interfaces/CreateDataTableOptions.md)

## Returns

`Promise`\<[`DataTable`](../interfaces/DataTable.md)\>

## Remarks

Size the container before calling this. The table virtualizes
against the container's height, and an unbounded one silently renders every
row — see [CreateDataTableOptions.container](../interfaces/CreateDataTableOptions.md#container).
