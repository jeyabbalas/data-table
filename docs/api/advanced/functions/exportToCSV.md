[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportToCSV

# Function: exportToCSV()

> **exportToCSV**(`tableName`, `options`, `context`, `signal?`): `Promise`\<`string`\>

Defined in: [export/CSVExport.ts:212](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/CSVExport.ts#L212)

Export table data as a CSV string.

## Parameters

### tableName

`string`

DuckDB table name

### options

`Partial`\<[`ExportOptions`](../interfaces/ExportOptions.md)\>

Export configuration (merged with defaults)

### context

[`ExportContext`](../interfaces/ExportContext.md)

State dependencies as plain values

### signal?

`AbortSignal`

Optional AbortSignal for cancellation

## Returns

`Promise`\<`string`\>

CSV string
