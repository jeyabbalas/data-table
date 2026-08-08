[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / captureSnapshot

# Function: captureSnapshot()

> **captureSnapshot**(`state`): [`StateSnapshot`](../interfaces/StateSnapshot.md)

Defined in: [core/UndoManager.ts:205](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/core/UndoManager.ts#L205)

Capture the current TableState as a StateSnapshot.

Creates independent copies of all mutable values so the snapshot
is not affected by future state mutations.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

## Returns

[`StateSnapshot`](../interfaces/StateSnapshot.md)
