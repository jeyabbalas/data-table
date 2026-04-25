[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SessionSnapshot

# Interface: SessionSnapshot

Defined in: [persistence/types.ts:119](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L119)

A serialized snapshot of table state, keyed by tableName in IndexedDB

## Properties

### annotations?

> `optional` **annotations?**: [`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

Defined in: [persistence/types.ts:140](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L140)

Saved annotations. Absent in pre-v5 snapshots.

***

### columnHeaderTooltips?

> `optional` **columnHeaderTooltips?**: `Record`\<`string`, `string` \| [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md)\>

Defined in: [persistence/types.ts:148](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L148)

App-controlled column-header tooltip overrides.

String entries are an in-flight Phase 5 legacy format (a description-only
shorthand) and are normalized to `{ description: string }` on restore.
Object entries are validated field-by-field; malformed fields drop.

***

### columnOrder

> **columnOrder**: `string`[]

Defined in: [persistence/types.ts:126](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L126)

***

### columnWidths

> **columnWidths**: `Record`\<`string`, `number`\>

Defined in: [persistence/types.ts:127](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L127)

***

### derivedColumns

> **derivedColumns**: [`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]

Defined in: [persistence/types.ts:130](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L130)

***

### filterPresets?

> `optional` **filterPresets?**: [`FilterPreset`](../../index/interfaces/FilterPreset.md)[]

Defined in: [persistence/types.ts:138](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L138)

Saved filter presets. Absent in pre-v3 snapshots.

***

### filters

> **filters**: [`SerializedFilter`](../../index/type-aliases/SerializedFilter.md)[]

Defined in: [persistence/types.ts:123](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L123)

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Record`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>

Defined in: [persistence/types.ts:129](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L129)

***

### pinnedColumns

> **pinnedColumns**: `string`[]

Defined in: [persistence/types.ts:128](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L128)

***

### redoStack?

> `optional` **redoStack?**: [`SerializedStateSnapshot`](SerializedStateSnapshot.md)[]

Defined in: [persistence/types.ts:134](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L134)

Persisted redo stack (oldest → newest). Absent in pre-v1 snapshots.

***

### sortColumns

> **sortColumns**: [`SortColumn`](../../index/interfaces/SortColumn.md)[]

Defined in: [persistence/types.ts:124](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L124)

***

### tableName

> **tableName**: `string` \| `null`

Defined in: [persistence/types.ts:122](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L122)

***

### timestamp

> **timestamp**: `number`

Defined in: [persistence/types.ts:121](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L121)

***

### undoStack?

> `optional` **undoStack?**: [`SerializedStateSnapshot`](SerializedStateSnapshot.md)[]

Defined in: [persistence/types.ts:132](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L132)

Persisted undo stack (oldest → newest). Absent in pre-v1 snapshots.

***

### vectorValuePool?

> `optional` **vectorValuePool?**: `Record`\<`string`, [`VectorValuePoolEntry`](VectorValuePoolEntry.md)\>

Defined in: [persistence/types.ts:136](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L136)

Deduplicated vector column values shared across undo/redo stack entries. Absent in pre-v4 snapshots.

***

### version

> **version**: `number`

Defined in: [persistence/types.ts:120](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L120)

***

### visibleColumns

> **visibleColumns**: `string`[]

Defined in: [persistence/types.ts:125](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L125)
