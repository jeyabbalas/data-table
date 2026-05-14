[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SessionSnapshot

# Interface: SessionSnapshot

Defined in: [persistence/types.ts:155](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L155)

A serialized snapshot of table state, keyed by tableName in IndexedDB

## Properties

### annotations?

> `optional` **annotations?**: [`AnnotationFile`](../../index/interfaces/AnnotationFile.md)

Defined in: [persistence/types.ts:176](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L176)

Saved annotations. Absent in pre-v5 snapshots.

***

### annotationSeverityFilter?

> `optional` **annotationSeverityFilter?**: [`SeverityFilter`](../../index/interfaces/SeverityFilter.md)

Defined in: [persistence/types.ts:183](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L183)

Annotation severity-filter state (visual-only). Present only when the
user has toggled at least one severity off; the all-true default is
omitted to keep snapshots clean. Back-compat by absence — pre-fix
snapshots restore with the all-true default.

***

### columnHeaderTooltips?

> `optional` **columnHeaderTooltips?**: `Record`\<`string`, `string` \| [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md)\>

Defined in: [persistence/types.ts:191](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L191)

App-controlled column-header tooltip overrides.

String entries are an in-flight Phase 5 legacy format (a description-only
shorthand) and are normalized to `{ description: string }` on restore.
Object entries are validated field-by-field; malformed fields drop.

***

### columnOrder

> **columnOrder**: `string`[]

Defined in: [persistence/types.ts:162](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L162)

***

### columnWidths

> **columnWidths**: `Record`\<`string`, `number`\>

Defined in: [persistence/types.ts:163](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L163)

***

### derivedColumns

> **derivedColumns**: [`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]

Defined in: [persistence/types.ts:166](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L166)

***

### filterPresets?

> `optional` **filterPresets?**: [`FilterPreset`](../../index/interfaces/FilterPreset.md)[]

Defined in: [persistence/types.ts:174](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L174)

Saved filter presets. Absent in pre-v3 snapshots.

***

### filters

> **filters**: [`SerializedFilter`](../../index/type-aliases/SerializedFilter.md)[]

Defined in: [persistence/types.ts:159](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L159)

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Record`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>

Defined in: [persistence/types.ts:165](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L165)

***

### pinnedColumns

> **pinnedColumns**: `string`[]

Defined in: [persistence/types.ts:164](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L164)

***

### redoStack?

> `optional` **redoStack?**: [`SerializedStateSnapshot`](SerializedStateSnapshot.md)[]

Defined in: [persistence/types.ts:170](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L170)

Persisted redo stack (oldest → newest). Absent in pre-v1 snapshots.

***

### sortColumns

> **sortColumns**: [`SortColumn`](../../index/interfaces/SortColumn.md)[]

Defined in: [persistence/types.ts:160](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L160)

***

### tableName

> **tableName**: `string` \| `null`

Defined in: [persistence/types.ts:158](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L158)

***

### timestamp

> **timestamp**: `number`

Defined in: [persistence/types.ts:157](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L157)

***

### undoStack?

> `optional` **undoStack?**: [`SerializedStateSnapshot`](SerializedStateSnapshot.md)[]

Defined in: [persistence/types.ts:168](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L168)

Persisted undo stack (oldest → newest). Absent in pre-v1 snapshots.

***

### vectorValuePool?

> `optional` **vectorValuePool?**: `Record`\<`string`, [`VectorValuePoolEntry`](VectorValuePoolEntry.md)\>

Defined in: [persistence/types.ts:172](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L172)

Deduplicated vector column values shared across undo/redo stack entries. Absent in pre-v4 snapshots.

***

### version

> **version**: `number`

Defined in: [persistence/types.ts:156](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L156)

***

### visibleColumns

> **visibleColumns**: `string`[]

Defined in: [persistence/types.ts:161](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/persistence/types.ts#L161)
