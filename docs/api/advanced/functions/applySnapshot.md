[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / applySnapshot

# Function: applySnapshot()

> **applySnapshot**(`state`, `snapshot`): `void`

Defined in: [core/UndoManager.ts:240](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/UndoManager.ts#L240)

Apply a StateSnapshot to a TableState.

Sets all undoable signals from the snapshot values. Does not perform
schema validation (undo/redo operates within a single session where
the schema is stable). Uses batch() to minimize notification churn.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

### snapshot

[`StateSnapshot`](../interfaces/StateSnapshot.md)

## Returns

`void`
