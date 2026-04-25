[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / copyRowsToClipboard

# Function: copyRowsToClipboard()

> **copyRowsToClipboard**(`rows`, `state`, `bridge`): `Promise`\<`void`\>

Defined in: [export/Clipboard.ts:52](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/export/Clipboard.ts#L52)

Copy specific rows from the table to the clipboard as TSV.

TSV (tab-separated values) is the standard clipboard format understood
by Excel, Google Sheets, and other spreadsheet applications. The output
includes a header row and uses visible columns in their display order.

## Parameters

### rows

`number`[]

0-based row indices (into the sorted/filtered view) to copy

### state

[`TableState`](../interfaces/TableState.md)

Reactive table state (signals are read, not mutated)

### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

WorkerBridge for querying DuckDB

## Returns

`Promise`\<`void`\>
