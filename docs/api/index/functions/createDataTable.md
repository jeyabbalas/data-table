[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / createDataTable

# Function: createDataTable()

> **createDataTable**(`opts`): `Promise`\<[`DataTable`](../interfaces/DataTable.md)\>

Defined in: [DataTable.ts:361](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/DataTable.ts#L361)

Create a fully-wired data table mounted in `container`.

Awaits worker initialization before returning so the caller can immediately
`loadData()` or rely on `state.schema` being populated (if `source` was
provided).

## Parameters

### opts

[`CreateDataTableOptions`](../interfaces/CreateDataTableOptions.md)

## Returns

`Promise`\<[`DataTable`](../interfaces/DataTable.md)\>
