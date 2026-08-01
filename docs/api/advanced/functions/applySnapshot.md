[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / applySnapshot

# Function: applySnapshot()

> **applySnapshot**(`state`, `snapshot`): `void`

Defined in: [core/UndoManager.ts:208](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L208)

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
