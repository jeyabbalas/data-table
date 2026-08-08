[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportParquetFromState

# Function: exportParquetFromState()

> **exportParquetFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [export/ParquetExport.ts:124](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/export/ParquetExport.ts#L124)

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
