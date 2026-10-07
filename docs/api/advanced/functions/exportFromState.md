[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportFromState

# Function: exportFromState()

> **exportFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`string`\>

Defined in: [export/CSVExport.ts:264](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/export/CSVExport.ts#L264)

Convenience wrapper that reads Signals from a TableState and delegates
to `exportToCSV`.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

### options?

`Partial`\<[`ExportOptions`](../interfaces/ExportOptions.md)\>

### signal?

`AbortSignal`

## Returns

`Promise`\<`string`\>
