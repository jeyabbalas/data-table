[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AutoSaveOptions

# Interface: AutoSaveOptions

Defined in: [persistence/AutoSave.ts:42](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L42)

Construction options for [AutoSave](../classes/AutoSave.md). Most fields are optional and
default to sensible values matching the facade's wiring.

## Properties

### annotationStore?

> `optional` **annotationStore?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [persistence/AutoSave.ts:46](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L46)

***

### debounceMs?

> `optional` **debounceMs?**: `number`

Defined in: [persistence/AutoSave.ts:43](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L43)

***

### onError?

> `optional` **onError?**: (`error`) => `void`

Defined in: [persistence/AutoSave.ts:57](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L57)

Invoked when a snapshot save fails (e.g., IndexedDB quota exceeded,
transaction aborted). If omitted, save failures are swallowed —
the facade wires this to emit an `error` event with `source: 'persistence'`.

A quota error stops the saves until the next `enable()`. One on the
table's annotations record alone (`details.record: 'annotations'`), or
a second failed write of that record in a row, is reported once and
stops only the annotations: the session keeps saving without them.

#### Parameters

##### error

[`PersistenceError`](../../index/classes/PersistenceError.md)

#### Returns

`void`

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [persistence/AutoSave.ts:45](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L45)

***

### undoManager?

> `optional` **undoManager?**: [`UndoManager`](../classes/UndoManager.md)

Defined in: [persistence/AutoSave.ts:44](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L44)
