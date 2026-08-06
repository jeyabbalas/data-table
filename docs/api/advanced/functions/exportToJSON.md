[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportToJSON

# Function: exportToJSON()

> **exportToJSON**(`tableName`, `options`, `context`, `signal?`): `Promise`\<`string`\>

Defined in: [export/JSONExport.ts:123](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/export/JSONExport.ts#L123)

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
