[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportJSONFromState

# Function: exportJSONFromState()

> **exportJSONFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`string`\>

Defined in: [export/JSONExport.ts:222](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/export/JSONExport.ts#L222)

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
