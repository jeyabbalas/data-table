[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportToParquet

# Function: exportToParquet()

> **exportToParquet**(`tableName`, `options`, `context`, `signal?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [export/ParquetExport.ts:101](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/export/ParquetExport.ts#L101)

Export table data as a Parquet file.

## Parameters

### tableName

`string`

DuckDB table name

### options

`Partial`\<[`ParquetExportOptions`](../interfaces/ParquetExportOptions.md)\>

Export configuration (merged with defaults)

### context

[`ExportContext`](../interfaces/ExportContext.md)

State dependencies as plain values

### signal?

`AbortSignal`

Optional AbortSignal for cancellation

## Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Parquet file contents as Uint8Array
