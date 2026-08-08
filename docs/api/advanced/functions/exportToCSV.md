[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportToCSV

# Function: exportToCSV()

> **exportToCSV**(`tableName`, `options`, `context`, `signal?`): `Promise`\<`string`\>

Defined in: [export/CSVExport.ts:162](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/export/CSVExport.ts#L162)

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
