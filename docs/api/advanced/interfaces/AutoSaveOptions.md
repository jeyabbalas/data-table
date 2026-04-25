[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AutoSaveOptions

# Interface: AutoSaveOptions

Defined in: [persistence/AutoSave.ts:34](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L34)

## Properties

### annotationStore?

> `optional` **annotationStore?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [persistence/AutoSave.ts:38](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L38)

***

### debounceMs?

> `optional` **debounceMs?**: `number`

Defined in: [persistence/AutoSave.ts:35](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L35)

***

### onError?

> `optional` **onError?**: (`error`) => `void`

Defined in: [persistence/AutoSave.ts:44](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L44)

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

Defined in: [persistence/AutoSave.ts:37](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L37)

***

### undoManager?

> `optional` **undoManager?**: [`UndoManager`](../classes/UndoManager.md)

Defined in: [persistence/AutoSave.ts:36](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L36)
