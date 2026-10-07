[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / copyRowsToClipboard

# Function: copyRowsToClipboard()

> **copyRowsToClipboard**(`rows`, `state`, `bridge`): `Promise`\<`void`\>

Defined in: [export/Clipboard.ts:78](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/export/Clipboard.ts#L78)

Copy specific rows from the table to the clipboard as TSV.

TSV (tab-separated values) is the standard clipboard format understood
by Excel, Google Sheets, and other spreadsheet applications. The output
includes a header row and the visible columns (`state.visibleColumns`)
in the order the grid shows them: a hidden column is left out, and
`__rowid__` is copied when the app has shown it. With nothing to copy (no
visible column the schema has, or no row of the view among `rows`), it
writes nothing, and the clipboard keeps what it holds.
Cells are written as [exportToCSV](exportToCSV.md) writes them, so a nested value
(LIST, STRUCT, MAP, …) is standard JSON: `["a","b"]`, `{"x":1.25}`.
A DATE or TIMESTAMP is written in the form spreadsheets read, a space
between date and time (`2024-01-02 03:04:05`); a TIMESTAMP WITH TIME
ZONE keeps its `Z`, which some spreadsheets show as text.

## Parameters

### rows

`number`[]

0-based row indices (into the sorted/filtered view) to
  copy; an index past the view's last row copies nothing

### state

[`TableState`](../interfaces/TableState.md)

Reactive table state (signals are read, not mutated)

### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

WorkerBridge for querying DuckDB

## Returns

`Promise`\<`void`\>
