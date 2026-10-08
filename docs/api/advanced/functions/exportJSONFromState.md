[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportJSONFromState

# Function: exportJSONFromState()

> **exportJSONFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`string`\>

Defined in: [export/JSONExport.ts:300](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/export/JSONExport.ts#L300)

Convenience wrapper that reads Signals from a TableState and delegates
to `exportToJSON`.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

### options?

`Partial`\<[`JSONExportOptions`](../interfaces/JSONExportOptions.md)\>

### signal?

`AbortSignal`

## Returns

`Promise`\<`string`\>
