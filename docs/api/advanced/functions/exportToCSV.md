[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportToCSV

# Function: exportToCSV()

> **exportToCSV**(`tableName`, `options`, `context`, `signal?`): `Promise`\<`string`\>

Defined in: [export/CSVExport.ts:212](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/export/CSVExport.ts#L212)

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
