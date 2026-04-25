[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportJSONFromState

# Function: exportJSONFromState()

> **exportJSONFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`string`\>

Defined in: [export/JSONExport.ts:203](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/JSONExport.ts#L203)

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
