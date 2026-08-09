[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / exportJSONFromState

# Function: exportJSONFromState()

> **exportJSONFromState**(`state`, `bridge`, `options?`, `signal?`): `Promise`\<`string`\>

Defined in: [export/JSONExport.ts:222](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/export/JSONExport.ts#L222)

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
