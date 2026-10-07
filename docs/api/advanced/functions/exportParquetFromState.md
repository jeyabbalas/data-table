[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportParquetFromState

# Function: exportParquetFromState()

> **exportParquetFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [export/ParquetExport.ts:132](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/export/ParquetExport.ts#L132)

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
