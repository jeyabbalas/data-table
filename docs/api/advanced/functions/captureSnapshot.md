[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / captureSnapshot

# Function: captureSnapshot()

> **captureSnapshot**(`state`): [`StateSnapshot`](../interfaces/StateSnapshot.md)

Defined in: [core/UndoManager.ts:179](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L179)

Capture the current TableState as a StateSnapshot.

Creates independent copies of all mutable values so the snapshot
is not affected by future state mutations.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

## Returns

[`StateSnapshot`](../interfaces/StateSnapshot.md)
