[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportToJSON

# Function: exportToJSON()

> **exportToJSON**(`tableName`, `options`, `context`, `signal?`): `Promise`\<`string`\>

Defined in: [export/JSONExport.ts:192](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/export/JSONExport.ts#L192)

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
