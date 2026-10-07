[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / captureSnapshot

# Function: captureSnapshot()

> **captureSnapshot**(`state`): [`StateSnapshot`](../interfaces/StateSnapshot.md)

Defined in: [core/UndoManager.ts:211](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/UndoManager.ts#L211)

Capture the current TableState as a StateSnapshot.

Creates independent copies of all mutable values so the snapshot
is not affected by future state mutations.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

## Returns

[`StateSnapshot`](../interfaces/StateSnapshot.md)
