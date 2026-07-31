[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportParquetFromState

# Function: exportParquetFromState()

> **exportParquetFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [export/ParquetExport.ts:124](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/export/ParquetExport.ts#L124)

Convenience wrapper that reads Signals from a TableState and delegates
to `exportToParquet`.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

### options?

`Partial`\<[`ParquetExportOptions`](../interfaces/ParquetExportOptions.md)\>

### signal?

`AbortSignal`

## Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>
