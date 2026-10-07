[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportParquetFromState

# Function: exportParquetFromState()

> **exportParquetFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [export/ParquetExport.ts:132](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/export/ParquetExport.ts#L132)

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
