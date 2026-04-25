[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportFromState

# Function: exportFromState()

> **exportFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`string`\>

Defined in: [export/CSVExport.ts:185](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/CSVExport.ts#L185)

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
