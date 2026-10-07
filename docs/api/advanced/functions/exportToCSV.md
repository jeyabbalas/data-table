[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportToCSV

# Function: exportToCSV()

> **exportToCSV**(`tableName`, `options`, `context`, `signal?`): `Promise`\<`string`\>

Defined in: [export/CSVExport.ts:234](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/export/CSVExport.ts#L234)

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
