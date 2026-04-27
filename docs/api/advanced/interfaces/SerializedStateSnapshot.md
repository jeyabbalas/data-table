[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SerializedStateSnapshot

# Interface: SerializedStateSnapshot

Defined in: [persistence/types.ts:142](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/persistence/types.ts#L142)

A serialized StateSnapshot (undo/redo stack entry).

Same fields as StateSnapshot but with JSON-safe types:
Map → Record, Date → DateWrapper (via SerializedFilter).

## Properties

### columnOrder

> **columnOrder**: `string`[]

Defined in: [persistence/types.ts:146](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/persistence/types.ts#L146)

***

### columnWidths

> **columnWidths**: `Record`\<`string`, `number`\>

Defined in: [persistence/types.ts:147](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/persistence/types.ts#L147)

***

### derivedColumns?

> `optional` **derivedColumns?**: [`SerializedDerivedColumnDef`](../type-aliases/SerializedDerivedColumnDef.md)[]

Defined in: [persistence/types.ts:151](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/persistence/types.ts#L151)

Derived column definitions. May use pool references (v4+) or inline values (pre-v4).

***

### filters

> **filters**: [`SerializedFilter`](../../index/type-aliases/SerializedFilter.md)[]

Defined in: [persistence/types.ts:143](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/persistence/types.ts#L143)

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Record`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>

Defined in: [persistence/types.ts:149](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/persistence/types.ts#L149)

***

### pinnedColumns

> **pinnedColumns**: `string`[]

Defined in: [persistence/types.ts:148](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/persistence/types.ts#L148)

***

### sortColumns

> **sortColumns**: [`SortColumn`](../../index/interfaces/SortColumn.md)[]

Defined in: [persistence/types.ts:144](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/persistence/types.ts#L144)

***

### visibleColumns

> **visibleColumns**: `string`[]

Defined in: [persistence/types.ts:145](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/persistence/types.ts#L145)
