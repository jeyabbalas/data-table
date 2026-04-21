[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SessionSnapshot

# Interface: SessionSnapshot

Defined in: [persistence/types.ts:118](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L118)

A serialized snapshot of table state, keyed by tableName in IndexedDB

## Properties

### columnOrder

> **columnOrder**: `string`[]

Defined in: [persistence/types.ts:125](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L125)

***

### columnWidths

> **columnWidths**: `Record`\<`string`, `number`\>

Defined in: [persistence/types.ts:126](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L126)

***

### derivedColumns

> **derivedColumns**: [`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]

Defined in: [persistence/types.ts:129](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L129)

***

### filterPresets?

> `optional` **filterPresets?**: [`FilterPreset`](../../index/interfaces/FilterPreset.md)[]

Defined in: [persistence/types.ts:137](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L137)

Saved filter presets. Absent in pre-v3 snapshots.

***

### filters

> **filters**: [`SerializedFilter`](../../index/type-aliases/SerializedFilter.md)[]

Defined in: [persistence/types.ts:122](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L122)

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Record`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>

Defined in: [persistence/types.ts:128](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L128)

***

### pinnedColumns

> **pinnedColumns**: `string`[]

Defined in: [persistence/types.ts:127](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L127)

***

### redoStack?

> `optional` **redoStack?**: [`SerializedStateSnapshot`](SerializedStateSnapshot.md)[]

Defined in: [persistence/types.ts:133](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L133)

Persisted redo stack (oldest → newest). Absent in pre-v1 snapshots.

***

### sortColumns

> **sortColumns**: [`SortColumn`](../../index/interfaces/SortColumn.md)[]

Defined in: [persistence/types.ts:123](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L123)

***

### tableName

> **tableName**: `string` \| `null`

Defined in: [persistence/types.ts:121](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L121)

***

### timestamp

> **timestamp**: `number`

Defined in: [persistence/types.ts:120](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L120)

***

### undoStack?

> `optional` **undoStack?**: [`SerializedStateSnapshot`](SerializedStateSnapshot.md)[]

Defined in: [persistence/types.ts:131](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L131)

Persisted undo stack (oldest → newest). Absent in pre-v1 snapshots.

***

### vectorValuePool?

> `optional` **vectorValuePool?**: `Record`\<`string`, [`VectorValuePoolEntry`](VectorValuePoolEntry.md)\>

Defined in: [persistence/types.ts:135](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L135)

Deduplicated vector column values shared across undo/redo stack entries. Absent in pre-v4 snapshots.

***

### version

> **version**: `number`

Defined in: [persistence/types.ts:119](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L119)

***

### visibleColumns

> **visibleColumns**: `string`[]

Defined in: [persistence/types.ts:124](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L124)
