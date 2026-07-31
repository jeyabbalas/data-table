[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AutoSaveOptions

# Interface: AutoSaveOptions

Defined in: [persistence/AutoSave.ts:38](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/persistence/AutoSave.ts#L38)

Construction options for [AutoSave](../classes/AutoSave.md). Most fields are optional and
default to sensible values matching the facade's wiring.

## Properties

### annotationStore?

> `optional` **annotationStore?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [persistence/AutoSave.ts:42](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/persistence/AutoSave.ts#L42)

***

### debounceMs?

> `optional` **debounceMs?**: `number`

Defined in: [persistence/AutoSave.ts:39](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/persistence/AutoSave.ts#L39)

***

### onError?

> `optional` **onError?**: (`error`) => `void`

Defined in: [persistence/AutoSave.ts:48](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/persistence/AutoSave.ts#L48)

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

Defined in: [persistence/AutoSave.ts:41](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/persistence/AutoSave.ts#L41)

***

### undoManager?

> `optional` **undoManager?**: [`UndoManager`](../classes/UndoManager.md)

Defined in: [persistence/AutoSave.ts:40](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/persistence/AutoSave.ts#L40)
