[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationStore

# Class: AnnotationStore

Defined in: [annotations/AnnotationStore.ts:384](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L384)

In-memory store + index for row / column / cell annotations. Exposed on the
facade as `table.annotations`. Provides CRUD, lookups (`getByRow` /
`getByColumn` / `getByCell`), severity-tier filtering, JSON I/O
(`toJSON` / `loadJSON`), and a `change` event channel. Annotations live
outside `TableState` (no undo/redo) and persist with the session, in a
database of their own, `dt-annotations`, which the `SessionStore` writes
only when they have changed; a custom session store still receives them
in the snapshot's `annotations`.

Lookups:
- `getByRow(rowId)`: that row's row- and cell-scope annotations, in
  insertion order.
- `getByColumn(column)`: that column's column- and cell-scope annotations,
  in insertion order.
- `getByCell(rowId, column)`: the row-scope annotations at `rowId`, the
  column-scope annotations at `column`, and the cell-scope annotations at
  exactly `(rowId, column)`, sorted by severity (error first), then
  `createdAt` ascending (a missing one last), then insertion order.
- `getAll()`: everything, in insertion order.

Costs, for a store of N annotations and a result of k: `get`, `update`,
`remove` and `count` are O(1); `removeMany` is O(k); `getByCell`,
`getByRow` and `getByColumn` are O(k log k), never a pass over the store
(the first `getByRow` call, or annotation navigation, that meets cell
annotations builds a by-row index of them, O(cells), kept up to date
afterwards); `add` is O(1) and `addMany` O(k); `getAll`, `toJSON`,
`loadJSON` and `clear('all')` are O(N); `clear(scope)` is O(k) for the k
annotations it removes.

Limits and contracts:
- Each annotation is one entry in a `Map`, and V8 caps a `Map` at 2²⁴
  (~16.7M) entries: past that, `add` / `addMany` / `loadJSON` throw a
  `RangeError` and leave the store as it was.
- Any finite `rowId` is accepted, but the grid renders only the
  non-negative integers its `__rowid__` column holds.
- `get`, the lookups and the change payloads return the stored objects
  themselves, unfrozen. Mutating one directly is unsupported: the indexes
  do not see it. Use `update`.

## Constructors

### Constructor

> **new AnnotationStore**(`options?`): `AnnotationStore`

Defined in: [annotations/AnnotationStore.ts:423](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L423)

#### Parameters

##### options?

[`AnnotationStoreOptions`](../interfaces/AnnotationStoreOptions.md) = `{}`

#### Returns

`AnnotationStore`

## Methods

### add()

> **add**(`ann`): [`Annotation`](../../index/type-aliases/Annotation.md)

Defined in: [annotations/AnnotationStore.ts:473](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L473)

Add a single annotation. Generates `id` and `createdAt` if missing.

#### Parameters

##### ann

[`NewAnnotation`](../../index/type-aliases/NewAnnotation.md)

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)

***

### addMany()

> **addMany**(`anns`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:492](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L492)

Add many annotations atomically: all of them, or none. Every entry is
validated first, so a malformed one throws `ANNOTATION_INVALID_SHAPE`
(`details.index` is its position) before the store changes. An id that
is already in the store, or that the batch repeats, throws
`ANNOTATION_DUPLICATE_ID` (`details: { id, index }`) with the store as
it was. On success, emits a single `change` event with all added ids.

Entries without `createdAt` share one timestamp, taken once per call.

#### Parameters

##### anns

[`NewAnnotation`](../../index/type-aliases/NewAnnotation.md)[]

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### clear()

> **clear**(`scope?`): `number`

Defined in: [annotations/AnnotationStore.ts:647](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L647)

Clear by scope (default `'all'`). Emits a single `change` event with
`kind: 'cleared'` and the removed ids, in insertion order, when it
removed any. `'all'` also forgets the file-level fields an earlier
`loadJSON` kept. Returns the number of annotations removed.

#### Parameters

##### scope?

`"all"` \| [`AnnotationScope`](../../index/type-aliases/AnnotationScope.md)

#### Returns

`number`

***

### count()

> **count**(): `number`

Defined in: [annotations/AnnotationStore.ts:667](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L667)

Number of annotations currently in the store.

#### Returns

`number`

***

### destroy()

> **destroy**(): `void`

Defined in: [annotations/AnnotationStore.ts:1139](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L1139)

Clear all listeners. Called from `DataTable.destroy`.

#### Returns

`void`

***

### get()

> **get**(`id`): [`Annotation`](../../index/type-aliases/Annotation.md) \| `null`

Defined in: [annotations/AnnotationStore.ts:497](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L497)

Lookup by id. Returns `null` when not present.

#### Parameters

##### id

`string`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md) \| `null`

***

### getAll()

> **getAll**(): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:502](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L502)

All annotations in insertion order.

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getByCell()

> **getByCell**(`rowId`, `column`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:716](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L716)

The annotations that apply to the cell `(rowId, column)`: row-scope
annotations at `rowId`, column-scope annotations at `column`, and
cell-scope annotations at exactly `(rowId, column)`. Sorted by severity
(error > warning > info), then by `createdAt` ascending (missing sorts
last), then by insertion order.

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

Defined in: [annotations/AnnotationStore.ts:699](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L699)

Annotations on column `column`: its column-scope annotations and its
cells' cell-scope annotations, in insertion order.

#### Parameters

##### column

`string`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getByRow()

> **getByRow**(`rowId`): [`Annotation`](../../index/type-aliases/Annotation.md)[]

Defined in: [annotations/AnnotationStore.ts:688](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L688)

Annotations on row `rowId`: its row-scope annotations and its cells'
cell-scope annotations, in insertion order.

#### Parameters

##### rowId

`number`

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)[]

***

### getSeverityFilter()

> **getSeverityFilter**(): [`SeverityFilter`](../../index/interfaces/SeverityFilter.md)

Defined in: [annotations/AnnotationStore.ts:933](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L933)

Snapshot of the current severity-filter flags. Returns a fresh copy.

#### Returns

[`SeverityFilter`](../../index/interfaces/SeverityFilter.md)

***

### loadJSON()

> **loadJSON**(`file`, `modeOrOptions?`): `object`

Defined in: [annotations/AnnotationStore.ts:992](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L992)

Load annotations from an [AnnotationFile](../../index/interfaces/AnnotationFile.md). Every entry is validated
before the store changes, so a rejected file leaves it as it was.

- `'replace'` (default) wipes existing annotations, preserving ids from
  the file. Emits `cleared` for what the store held (when it held
  anything), then `added` for what the file holds (when it holds
  anything).
- `'merge'` retains existing annotations; throws `ANNOTATION_DUPLICATE_ID`
  when a file id is already in the store, before adding any.

An id the file itself repeats throws `ANNOTATION_DUPLICATE_ID`
(`details: { id, index }`) in either mode.

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

Defined in: [annotations/AnnotationStore.ts:1122](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L1122)

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

Defined in: [annotations/AnnotationStore.ts:605](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L605)

Remove by id. Returns `true` if something was removed.

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### removeMany()

> **removeMany**(`ids`): `number`

Defined in: [annotations/AnnotationStore.ts:622](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L622)

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

Defined in: [annotations/AnnotationStore.ts:917](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L917)

Toggle one or more severities on or off for visual rendering.

Contract: the store **always retains every annotation** regardless of
filter state. The flags only affect the cell / row / column-header tints
and the popover's lists, which the renderers (`TableBody`,
`ColumnHeader`, `AnnotationPopover`) read through the `summarize*Scope`
methods and `getSeverityFilter()`. Lookup methods
(`getByRow`, `getByColumn`, `getByCell`, `getAll`) are **not** filtered —
downstream code that wants the visible subset should consult
`getSeverityFilter()` directly.

When at least one flag actually changes, emits a single `change` event
with `kind: 'filterChanged'` and an empty `ids` array so renderers
reapply. The flag state is also captured in `SessionSnapshot.annotationSeverityFilter`
so toggles survive a page reload.

The flags also set the severities annotation navigation visits by
default: `actions.nextAnnotation` and `actions.previousAnnotation`
without `severities`, and the `F8` and `Alt+↓` / `Alt+↑` keys, skip
the annotations of a severity hidden here, as the table paints none of
them.

#### Parameters

##### patch

`Partial`\<[`SeverityFilter`](../../index/interfaces/SeverityFilter.md)\>

#### Returns

`void`

***

### toJSON()

> **toJSON**(): [`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

Defined in: [annotations/AnnotationStore.ts:946](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L946)

Serialize the store to a JSON-safe [AnnotationFile](../../index/interfaces/AnnotationFile.md). Unknown
top-level keys and unknown per-annotation keys captured by an earlier
`loadJSON` call are reattached verbatim.

#### Returns

[`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

***

### update()

> **update**(`id`, `patch`): [`Annotation`](../../index/type-aliases/Annotation.md)

Defined in: [annotations/AnnotationStore.ts:515](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L515)

Apply a partial update. Rejects any patch that would change `id`,
`scope`, `rowId`, or `column` — those are immutable after creation.
Sets `updatedAt` to `now()` on every successful update. A `severity` or
`message` given as `undefined` is ignored.

Returns a new object, which `get(id)` returns from then on; the
annotation keeps its place in insertion order.

#### Parameters

##### id

`string`

##### patch

`Partial`\<`AnnotationBase`\>

#### Returns

[`Annotation`](../../index/type-aliases/Annotation.md)
