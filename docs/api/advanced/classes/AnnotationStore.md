[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationStore

# Class: AnnotationStore

Defined in: [annotations/AnnotationStore.ts:158](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L158)

In-memory store + index for row / column / cell annotations. Exposed on the
facade as `table.annotations`. Provides CRUD, intersection lookup
(`getByRow` / `getByColumn` / `getByCell`), severity-tier filtering,
JSON I/O (`toJSON` / `loadJSON`), and a `change` event channel. Annotations
live outside `TableState` (no undo/redo) and persist independently into
`SessionSnapshot.annotations` (v5+).

## Constructors

### Constructor

> **new AnnotationStore**(`options?`): `AnnotationStore`

Defined in: [annotations/AnnotationStore.ts:183](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L183)

#### Parameters

##### options?

[`AnnotationStoreOptions`](../interfaces/AnnotationStoreOptions.md) = `{}`

#### Returns

`AnnotationStore`

## Methods

### add()

> **add**(`ann`): [`Annotation`](../../index/type-aliases/Annotation.md)

Defined in: [annotations/AnnotationStore.ts:194](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L194)

Add a single annotation. Generates `id` and `createdAt` if missing.

#### Parameters

##### ann

[`NewAnnotation`](../../index/type-aliases/NewAnnotation.md)

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)

***

### addMany()

> **addMany**(`anns`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:206](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L206)

Add many annotations atomically. Any duplicate-id or shape failure
aborts the whole batch (rolling back any intermediate inserts) and
throws the first `AnnotationError`. On success, emits a single
`change` event with all added ids.

#### Parameters

##### anns

[`NewAnnotation`](../../index/type-aliases/NewAnnotation.md)[]

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### clear()

> **clear**(`scope?`): `number`

Defined in: [annotations/AnnotationStore.ts:339](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L339)

Clear by scope (default `'all'`). Emits a single `change` event with
`kind: 'cleared'` and the full list of removed ids. Returns the
number of annotations removed.

#### Parameters

##### scope?

`"all"` \| [`AnnotationScope`](../../index/type-aliases/AnnotationScope.md)

#### Returns

`number`

***

### count()

> **count**(): `number`

Defined in: [annotations/AnnotationStore.ts:359](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L359)

Number of annotations currently in the store.

#### Returns

`number`

***

### destroy()

> **destroy**(): `void`

Defined in: [annotations/AnnotationStore.ts:617](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L617)

Clear all listeners. Called from `DataTable.destroy`.

#### Returns

`void`

***

### get()

> **get**(`id`): [`Annotation`](../../index/type-aliases/Annotation.md) \| `null`

Defined in: [annotations/AnnotationStore.ts:224](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L224)

Lookup by id. Returns `null` when not present.

#### Parameters

##### id

`string`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md) \| `null`

***

### getAll()

> **getAll**(): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:229](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L229)

All annotations in insertion order.

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getByCell()

> **getByCell**(`rowId`, `column`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:385](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L385)

Union of row-scope + column-scope + cell-scope annotations at
`(rowId, column)`. Sorted by severity (error > warning > info),
then by `createdAt` ascending (missing sorts last), then by
insertion order.

#### Parameters

##### rowId

`number`

##### column

`string`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getByColumn()

> **getByColumn**(`column`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:373](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L373)

#### Parameters

##### column

`string`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getByRow()

> **getByRow**(`rowId`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:367](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L367)

#### Parameters

##### rowId

`number`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getSeverityFilter()

> **getSeverityFilter**(): [`SeverityFilter`](../../index/interfaces/SeverityFilter.md)

Defined in: [annotations/AnnotationStore.ts:439](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L439)

Snapshot of the current severity-filter flags. Returns a fresh copy.

#### Returns

[`SeverityFilter`](../../index/interfaces/SeverityFilter.md)

***

### loadJSON()

> **loadJSON**(`file`, `modeOrOptions?`): `object`

Defined in: [annotations/AnnotationStore.ts:490](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L490)

Load annotations from an [AnnotationFile](../../index/interfaces/AnnotationFile.md).

- `'replace'` (default) wipes existing annotations, preserving ids from
  the file.
- `'merge'` retains existing annotations; throws `ANNOTATION_DUPLICATE_ID`
  on the first collision (the store is reverted to the pre-call state).

The second argument may also be an options bag:
- `mode`: same `'replace' | 'merge'` choice as above.
- `validateTableName`: when `true` and the file's `tableName` does not
  match the store's resolved table name (and both are non-null), throw
  `ANNOTATION_TABLENAME_MISMATCH` before any state mutation. Multi-table
  apps should opt in to catch cross-table loads.

Regardless of `validateTableName`, a `console.warn` is emitted on every
tableName mismatch (both sides non-null). This makes the cross-table
case visible even when callers do not opt into the throw.

#### Parameters

##### file

[`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

##### modeOrOptions?

`"replace"` \| `"merge"` \| [`LoadJSONOptions`](../interfaces/LoadJSONOptions.md)

#### Returns

`object`

##### added

> **added**: `number`

##### skipped

> **skipped**: `number`

***

### on()

> **on**(`event`, `handler`): () => `void`

Defined in: [annotations/AnnotationStore.ts:600](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L600)

Subscribe to store mutations. Returns an unsubscribe function.
Handlers that throw are caught and logged; other handlers still fire.

#### Parameters

##### event

`"change"`

##### handler

[`AnnotationChangeHandler`](../../index/type-aliases/AnnotationChangeHandler.md)

#### Returns

() => `void`

***

### remove()

> **remove**(`id`): `boolean`

Defined in: [annotations/AnnotationStore.ts:314](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L314)

Remove by id. Returns `true` if something was removed.

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### removeMany()

> **removeMany**(`ids`): `number`

Defined in: [annotations/AnnotationStore.ts:325](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L325)

Remove many ids in a batch. Unknown ids are silently skipped.
Returns the count of ids actually removed. Emits a single `change`
event when at least one was removed.

#### Parameters

##### ids

`string`[]

#### Returns

`number`

***

### setSeverityFilter()

> **setSeverityFilter**(`patch`): `void`

Defined in: [annotations/AnnotationStore.ts:426](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L426)

Toggle one or more severities on or off for visual rendering.

Contract: the store **always retains every annotation** regardless of
filter state. The flags only affect the cell / row / column-header tints
via `getSeverityFilter()` consulted by the renderer
(`TableBody.applyCellAnnotationClasses`, etc.). Lookup methods
(`getByRow`, `getByColumn`, `getByCell`, `getAll`) are **not** filtered —
downstream code that wants the visible subset should consult
`getSeverityFilter()` directly.

When at least one flag actually changes, emits a single `change` event
with `kind: 'filterChanged'` and an empty `ids` array so renderers
reapply. The flag state is also captured in `SessionSnapshot.annotationSeverityFilter`
so toggles survive a page reload.

#### Parameters

##### patch

`Partial`\<[`SeverityFilter`](../../index/interfaces/SeverityFilter.md)\>

#### Returns

`void`

***

### toJSON()

> **toJSON**(): [`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

Defined in: [annotations/AnnotationStore.ts:452](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L452)

Serialize the store to a JSON-safe [AnnotationFile](../../index/interfaces/AnnotationFile.md). Unknown
top-level keys and unknown per-annotation keys captured by an earlier
`loadJSON` call are reattached verbatim.

#### Returns

[`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

***

### update()

> **update**(`id`, `patch`): [`Annotation`](../../index/type-aliases/Annotation.md)

Defined in: [annotations/AnnotationStore.ts:238](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L238)

Apply a partial update. Rejects any patch that would change `id`,
`scope`, `rowId`, or `column` — those are immutable after creation.
Sets `updatedAt` to `now()` on every successful update.

#### Parameters

##### id

`string`

##### patch

`Partial`\<`AnnotationBase`\>

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)
