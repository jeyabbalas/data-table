[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationStore

# Class: AnnotationStore

Defined in: [annotations/AnnotationStore.ts:122](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L122)

## Constructors

### Constructor

> **new AnnotationStore**(`options?`): `AnnotationStore`

Defined in: [annotations/AnnotationStore.ts:147](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L147)

#### Parameters

##### options?

[`AnnotationStoreOptions`](../interfaces/AnnotationStoreOptions.md) = `{}`

#### Returns

`AnnotationStore`

## Methods

### add()

> **add**(`ann`): [`Annotation`](../../index/type-aliases/Annotation.md)

Defined in: [annotations/AnnotationStore.ts:158](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L158)

Add a single annotation. Generates `id` and `createdAt` if missing.

#### Parameters

##### ann

[`NewAnnotation`](../../index/type-aliases/NewAnnotation.md)

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)

***

### addMany()

> **addMany**(`anns`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:170](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L170)

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

Defined in: [annotations/AnnotationStore.ts:292](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L292)

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

Defined in: [annotations/AnnotationStore.ts:312](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L312)

Number of annotations currently in the store.

#### Returns

`number`

***

### destroy()

> **destroy**(): `void`

Defined in: [annotations/AnnotationStore.ts:521](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L521)

Clear all listeners. Called from `DataTable.destroy`.

#### Returns

`void`

***

### get()

> **get**(`id`): [`Annotation`](../../index/type-aliases/Annotation.md) \| `null`

Defined in: [annotations/AnnotationStore.ts:188](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L188)

Lookup by id. Returns `null` when not present.

#### Parameters

##### id

`string`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md) \| `null`

***

### getAll()

> **getAll**(): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:193](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L193)

All annotations in insertion order.

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getByCell()

> **getByCell**(`rowId`, `column`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:338](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L338)

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

Defined in: [annotations/AnnotationStore.ts:326](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L326)

#### Parameters

##### column

`string`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getByRow()

> **getByRow**(`rowId`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:320](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L320)

#### Parameters

##### rowId

`number`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getSeverityFilter()

> **getSeverityFilter**(): [`SeverityFilter`](../../index/interfaces/SeverityFilter.md)

Defined in: [annotations/AnnotationStore.ts:383](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L383)

Snapshot of the current severity-filter flags. Returns a fresh copy.

#### Returns

[`SeverityFilter`](../../index/interfaces/SeverityFilter.md)

***

### loadJSON()

> **loadJSON**(`file`, `mode?`): `object`

Defined in: [annotations/AnnotationStore.ts:423](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L423)

Load annotations from an [AnnotationFile](../../index/interfaces/AnnotationFile.md).

- `'replace'` (default) wipes existing annotations, preserving ids from
  the file.
- `'merge'` retains existing annotations; throws `ANNOTATION_DUPLICATE_ID`
  on the first collision (the store is reverted to the pre-call state).

#### Parameters

##### file

[`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

##### mode?

`"replace"` \| `"merge"`

#### Returns

`object`

##### added

> **added**: `number`

##### skipped

> **skipped**: `number`

***

### on()

> **on**(`event`, `handler`): () => `void`

Defined in: [annotations/AnnotationStore.ts:504](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L504)

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

Defined in: [annotations/AnnotationStore.ts:267](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L267)

Remove by id. Returns `true` if something was removed.

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### removeMany()

> **removeMany**(`ids`): `number`

Defined in: [annotations/AnnotationStore.ts:278](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L278)

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

Defined in: [annotations/AnnotationStore.ts:370](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L370)

Toggle one or more severities on or off for visual rendering. Annotations
remain in the store regardless — only the cell / row / column-header
tints respond. When at least one flag actually changes, emits a single
`change` event with `kind: 'filterChanged'` and an empty `ids` array so
renderers reapply. Persistence layers should ignore this kind.

#### Parameters

##### patch

`Partial`\<[`SeverityFilter`](../../index/interfaces/SeverityFilter.md)\>

#### Returns

`void`

***

### toJSON()

> **toJSON**(): [`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

Defined in: [annotations/AnnotationStore.ts:396](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L396)

Serialize the store to a JSON-safe [AnnotationFile](../../index/interfaces/AnnotationFile.md). Unknown
top-level keys and unknown per-annotation keys captured by an earlier
`loadJSON` call are reattached verbatim.

#### Returns

[`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

***

### update()

> **update**(`id`, `patch`): [`Annotation`](../../index/type-aliases/Annotation.md)

Defined in: [annotations/AnnotationStore.ts:202](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L202)

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
