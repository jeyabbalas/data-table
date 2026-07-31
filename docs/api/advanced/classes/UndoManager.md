[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / UndoManager

# Class: UndoManager

Defined in: [core/UndoManager.ts:259](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L259)

Manages undo/redo history as two stacks of StateSnapshot objects.

The UndoManager is decoupled from TableState — callers capture the
current state before mutations (via captureSnapshot) and pass it to
push(). On undo/redo, the returned snapshot is applied externally
(via applySnapshot).

## Example

```ts
import { UndoManager, captureSnapshot, applySnapshot } from '@jeyabbalas/data-table/advanced';

const mgr = new UndoManager(50);
// Before mutating state (e.g., in custom UI):
mgr.push(captureSnapshot(table.state));
// ...mutate state...
// Later:
const previous = mgr.undo(captureSnapshot(table.state));
if (previous) applySnapshot(table.state, previous);
```

## Constructors

### Constructor

> **new UndoManager**(`maxDepth?`): `UndoManager`

Defined in: [core/UndoManager.ts:269](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L269)

#### Parameters

##### maxDepth?

`number` = `DEFAULT_MAX_DEPTH`

#### Returns

`UndoManager`

## Properties

### canRedoSignal

> `readonly` **canRedoSignal**: `Signal`\<`boolean`\>

Defined in: [core/UndoManager.ts:267](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L267)

Reactive signal: true when redo is available

***

### canUndoSignal

> `readonly` **canUndoSignal**: `Signal`\<`boolean`\>

Defined in: [core/UndoManager.ts:265](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L265)

Reactive signal: true when undo is available

## Accessors

### canRedo

#### Get Signature

> **get** **canRedo**(): `boolean`

Defined in: [core/UndoManager.ts:281](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L281)

Whether the redo stack has entries

##### Returns

`boolean`

***

### canUndo

#### Get Signature

> **get** **canUndo**(): `boolean`

Defined in: [core/UndoManager.ts:276](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L276)

Whether the undo stack has entries

##### Returns

`boolean`

***

### redoDepth

#### Get Signature

> **get** **redoDepth**(): `number`

Defined in: [core/UndoManager.ts:291](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L291)

Current depth of the redo stack

##### Returns

`number`

***

### undoDepth

#### Get Signature

> **get** **undoDepth**(): `number`

Defined in: [core/UndoManager.ts:286](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L286)

Current depth of the undo stack

##### Returns

`number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [core/UndoManager.ts:334](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L334)

Clear both stacks (e.g., when loading new data)

#### Returns

`void`

***

### getStacks()

> **getStacks**(): `object`

Defined in: [core/UndoManager.ts:341](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L341)

Return shallow copies of both stacks (for serialization).

#### Returns

`object`

##### redoStack

> **redoStack**: [`StateSnapshot`](../interfaces/StateSnapshot.md)[]

##### undoStack

> **undoStack**: [`StateSnapshot`](../interfaces/StateSnapshot.md)[]

***

### loadStacks()

> **loadStacks**(`undoStack`, `redoStack`): `void`

Defined in: [core/UndoManager.ts:349](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L349)

Replace both stacks with deserialized data. Enforces maxDepth.

#### Parameters

##### undoStack

[`StateSnapshot`](../interfaces/StateSnapshot.md)[]

##### redoStack

[`StateSnapshot`](../interfaces/StateSnapshot.md)[]

#### Returns

`void`

***

### push()

> **push**(`snapshot`): `void`

Defined in: [core/UndoManager.ts:300](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L300)

Push a snapshot onto the undo stack (state BEFORE a mutation).
Clears the redo stack (new action invalidates redo history).
Enforces maxDepth by removing the oldest entry if needed.

#### Parameters

##### snapshot

[`StateSnapshot`](../interfaces/StateSnapshot.md)

#### Returns

`void`

***

### redo()

> **redo**(`currentSnapshot`): [`StateSnapshot`](../interfaces/StateSnapshot.md) \| `null`

Defined in: [core/UndoManager.ts:325](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L325)

Redo: pops from redo stack, pushes currentSnapshot to undo stack.
Returns the snapshot to restore, or null if nothing to redo.

#### Parameters

##### currentSnapshot

[`StateSnapshot`](../interfaces/StateSnapshot.md)

#### Returns

[`StateSnapshot`](../interfaces/StateSnapshot.md) \| `null`

***

### undo()

> **undo**(`currentSnapshot`): [`StateSnapshot`](../interfaces/StateSnapshot.md) \| `null`

Defined in: [core/UndoManager.ts:313](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/UndoManager.ts#L313)

Undo: pops from undo stack, pushes currentSnapshot to redo stack.
Returns the snapshot to restore, or null if nothing to undo.

#### Parameters

##### currentSnapshot

[`StateSnapshot`](../interfaces/StateSnapshot.md)

#### Returns

[`StateSnapshot`](../interfaces/StateSnapshot.md) \| `null`
