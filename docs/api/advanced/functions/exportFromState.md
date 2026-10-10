[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportFromState

# Function: exportFromState()

> **exportFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`string`\>

Defined in: [export/CSVExport.ts:286](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/export/CSVExport.ts#L286)

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
