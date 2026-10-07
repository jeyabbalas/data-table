[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SessionSnapshot

# Interface: SessionSnapshot

Defined in: [persistence/types.ts:164](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L164)

A serialized snapshot of table state, keyed by tableName in IndexedDB

## Properties

### annotations?

> `optional` **annotations?**: [`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

Defined in: [persistence/types.ts:185](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L185)

Saved annotations. Absent in pre-v5 snapshots.

***

### annotationSeverityFilter?

> `optional` **annotationSeverityFilter?**: [`SeverityFilter`](../../index/interfaces/SeverityFilter.md)

Defined in: [persistence/types.ts:192](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L192)

Annotation severity-filter state (visual-only). Present only when the
user has toggled at least one severity off; the all-true default is
omitted to keep snapshots clean. Back-compat by absence — pre-fix
snapshots restore with the all-true default.

***

### columnHeaderTooltips?

> `optional` **columnHeaderTooltips?**: `Record`\<`string`, `string` \| [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md)\>

Defined in: [persistence/types.ts:200](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L200)

App-controlled column-header tooltip overrides.

String entries are an in-flight Phase 5 legacy format (a description-only
shorthand) and are normalized to `{ description: string }` on restore.
Object entries are validated field-by-field; malformed fields drop.

***

### columnOrder

> **columnOrder**: `string`[]

Defined in: [persistence/types.ts:171](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L171)

***

### columnWidths

> **columnWidths**: `Record`\<`string`, `number`\>

Defined in: [persistence/types.ts:172](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L172)

***

### derivedColumns

> **derivedColumns**: [`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]

Defined in: [persistence/types.ts:175](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L175)

***

### filterPresets?

> `optional` **filterPresets?**: [`FilterPreset`](../../index/interfaces/FilterPreset.md)[]

Defined in: [persistence/types.ts:183](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L183)

Saved filter presets. Absent in pre-v3 snapshots.

***

### filters

> **filters**: [`SerializedFilter`](../../index/type-aliases/SerializedFilter.md)[]

Defined in: [persistence/types.ts:168](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L168)

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Record`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>

Defined in: [persistence/types.ts:174](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L174)

***

### pinnedColumns

> **pinnedColumns**: `string`[]

Defined in: [persistence/types.ts:173](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L173)

***

### redoStack?

> `optional` **redoStack?**: [`SerializedStateSnapshot`](SerializedStateSnapshot.md)[]

Defined in: [persistence/types.ts:179](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L179)

Persisted redo stack (oldest → newest). Absent in pre-v1 snapshots.

***

### sortColumns

> **sortColumns**: [`SortColumn`](../../index/interfaces/SortColumn.md)[]

Defined in: [persistence/types.ts:169](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L169)

***

### tableName

> **tableName**: `string` \| `null`

Defined in: [persistence/types.ts:167](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L167)

***

### timestamp

> **timestamp**: `number`

Defined in: [persistence/types.ts:166](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L166)

***

### undoStack?

> `optional` **undoStack?**: [`SerializedStateSnapshot`](SerializedStateSnapshot.md)[]

Defined in: [persistence/types.ts:177](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L177)

Persisted undo stack (oldest → newest). Absent in pre-v1 snapshots.

***

### vectorValuePool?

> `optional` **vectorValuePool?**: `Record`\<`string`, [`VectorValuePoolEntry`](VectorValuePoolEntry.md)\>

Defined in: [persistence/types.ts:181](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L181)

Deduplicated vector column values shared across undo/redo stack entries. Absent in pre-v4 snapshots.

***

### version

> **version**: `number`

Defined in: [persistence/types.ts:165](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L165)

***

### visibleColumns

> **visibleColumns**: `string`[]

Defined in: [persistence/types.ts:170](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L170)
