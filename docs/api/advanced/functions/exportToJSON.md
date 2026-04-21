[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportToJSON

# Function: exportToJSON()

> **exportToJSON**(`tableName`, `options`, `context`, `signal?`): `Promise`\<`string`\>

Defined in: [export/JSONExport.ts:104](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/export/JSONExport.ts#L104)

Export table data as a JSON string.

## Parameters

### tableName

`string`

DuckDB table name

### options

`Partial`\<[`JSONExportOptions`](../interfaces/JSONExportOptions.md)\>

Export configuration (merged with defaults)

### context

[`ExportContext`](../interfaces/ExportContext.md)

State dependencies as plain values

### signal?

`AbortSignal`

Optional AbortSignal for cancellation

## Returns

`Promise`\<`string`\>

JSON string (array or NDJSON format)
