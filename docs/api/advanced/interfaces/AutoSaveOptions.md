[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AutoSaveOptions

# Interface: AutoSaveOptions

Defined in: [persistence/AutoSave.ts:33](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L33)

## Properties

### debounceMs?

> `optional` **debounceMs?**: `number`

Defined in: [persistence/AutoSave.ts:34](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L34)

***

### onError?

> `optional` **onError?**: (`error`) => `void`

Defined in: [persistence/AutoSave.ts:42](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L42)

Invoked when a snapshot save fails (e.g., IndexedDB quota exceeded,
transaction aborted). If omitted, save failures are swallowed —
the facade wires this to emit an `error` event with `source: 'persistence'`.

#### Parameters

##### error

[`PersistenceError`](../../index/classes/PersistenceError.md)

#### Returns

`void`

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [persistence/AutoSave.ts:36](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L36)

***

### undoManager?

> `optional` **undoManager?**: [`UndoManager`](../classes/UndoManager.md)

Defined in: [persistence/AutoSave.ts:35](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L35)
