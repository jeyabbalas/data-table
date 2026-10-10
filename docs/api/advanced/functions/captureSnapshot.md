[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / captureSnapshot

# Function: captureSnapshot()

> **captureSnapshot**(`state`): [`StateSnapshot`](../interfaces/StateSnapshot.md)

Defined in: [core/UndoManager.ts:211](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/UndoManager.ts#L211)

Capture the current TableState as a StateSnapshot.

Creates independent copies of all mutable values so the snapshot
is not affected by future state mutations.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

## Returns

[`StateSnapshot`](../interfaces/StateSnapshot.md)
