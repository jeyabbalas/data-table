[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SerializedStateSnapshot

# Interface: SerializedStateSnapshot

Defined in: [persistence/types.ts:105](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L105)

A serialized StateSnapshot (undo/redo stack entry).

Same fields as StateSnapshot but with JSON-safe types:
Map → Record, Date → DateWrapper (via SerializedFilter).

## Properties

### columnOrder

> **columnOrder**: `string`[]

Defined in: [persistence/types.ts:109](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L109)

***

### columnWidths

> **columnWidths**: `Record`\<`string`, `number`\>

Defined in: [persistence/types.ts:110](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L110)

***

### derivedColumns?

> `optional` **derivedColumns?**: [`SerializedDerivedColumnDef`](../type-aliases/SerializedDerivedColumnDef.md)[]

Defined in: [persistence/types.ts:114](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L114)

Derived column definitions. May use pool references (v4+) or inline values (pre-v4).

***

### filters

> **filters**: [`SerializedFilter`](../../index/type-aliases/SerializedFilter.md)[]

Defined in: [persistence/types.ts:106](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L106)

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Record`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>

Defined in: [persistence/types.ts:112](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L112)

***

### pinnedColumns

> **pinnedColumns**: `string`[]

Defined in: [persistence/types.ts:111](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L111)

***

### sortColumns

> **sortColumns**: [`SortColumn`](../../index/interfaces/SortColumn.md)[]

Defined in: [persistence/types.ts:107](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L107)

***

### visibleColumns

> **visibleColumns**: `string`[]

Defined in: [persistence/types.ts:108](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L108)
