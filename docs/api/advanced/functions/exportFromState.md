[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportFromState

# Function: exportFromState()

> **exportFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`string`\>

Defined in: [export/CSVExport.ts:211](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/export/CSVExport.ts#L211)

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
