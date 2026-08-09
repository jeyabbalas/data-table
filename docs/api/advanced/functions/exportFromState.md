[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportFromState

# Function: exportFromState()

> **exportFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`string`\>

Defined in: [export/CSVExport.ts:211](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/export/CSVExport.ts#L211)

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
