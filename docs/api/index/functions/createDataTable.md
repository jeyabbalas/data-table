[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / createDataTable

# Function: createDataTable()

> **createDataTable**(`opts`): `Promise`\<[`DataTable`](../interfaces/DataTable.md)\>

Defined in: [DataTable.ts:543](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L543)

Create a fully-wired data table mounted in `container`.

Awaits worker initialization before returning so the caller can immediately
`loadData()` or rely on `state.schema` being populated (if `source` was
provided).

## Parameters

### opts

[`CreateDataTableOptions`](../interfaces/CreateDataTableOptions.md)

## Returns

`Promise`\<[`DataTable`](../interfaces/DataTable.md)\>

## Remarks

Size the container before calling this. The table virtualizes
against the container's height, and an unbounded one silently renders every
row — see [CreateDataTableOptions.container](../interfaces/CreateDataTableOptions.md#container).
