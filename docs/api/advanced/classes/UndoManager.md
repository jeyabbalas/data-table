[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / UndoManager

# Class: UndoManager

Defined in: [core/UndoManager.ts:251](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L251)

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

Defined in: [core/UndoManager.ts:261](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L261)

#### Parameters

##### maxDepth?

`number` = `DEFAULT_MAX_DEPTH`

#### Returns

`UndoManager`

## Properties

### canRedoSignal

> `readonly` **canRedoSignal**: `Signal`\<`boolean`\>

Defined in: [core/UndoManager.ts:259](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L259)

Reactive signal: true when redo is available

***

### canUndoSignal

> `readonly` **canUndoSignal**: `Signal`\<`boolean`\>

Defined in: [core/UndoManager.ts:257](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L257)

Reactive signal: true when undo is available

## Accessors

### canRedo

#### Get Signature

> **get** **canRedo**(): `boolean`

Defined in: [core/UndoManager.ts:273](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L273)

Whether the redo stack has entries

##### Returns

`boolean`

***

### canUndo

#### Get Signature

> **get** **canUndo**(): `boolean`

Defined in: [core/UndoManager.ts:268](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L268)

Whether the undo stack has entries

##### Returns

`boolean`

***

### redoDepth

#### Get Signature

> **get** **redoDepth**(): `number`

Defined in: [core/UndoManager.ts:283](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L283)

Current depth of the redo stack

##### Returns

`number`

***

### undoDepth

#### Get Signature

> **get** **undoDepth**(): `number`

Defined in: [core/UndoManager.ts:278](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L278)

Current depth of the undo stack

##### Returns

`number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [core/UndoManager.ts:326](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L326)

Clear both stacks (e.g., when loading new data)

#### Returns

`void`

***

### getStacks()

> **getStacks**(): `object`

Defined in: [core/UndoManager.ts:333](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L333)

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

Defined in: [core/UndoManager.ts:341](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L341)

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

Defined in: [core/UndoManager.ts:292](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L292)

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

Defined in: [core/UndoManager.ts:317](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L317)

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

Defined in: [core/UndoManager.ts:305](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/UndoManager.ts#L305)

Undo: pops from undo stack, pushes currentSnapshot to redo stack.
Returns the snapshot to restore, or null if nothing to undo.

#### Parameters

##### currentSnapshot

[`StateSnapshot`](../interfaces/StateSnapshot.md)

#### Returns

[`StateSnapshot`](../interfaces/StateSnapshot.md) \| `null`
