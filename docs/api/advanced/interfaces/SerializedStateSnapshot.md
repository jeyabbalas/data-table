[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SerializedStateSnapshot

# Interface: SerializedStateSnapshot

Defined in: [persistence/types.ts:151](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L151)

A serialized StateSnapshot (undo/redo stack entry).

Same fields as StateSnapshot but with JSON-safe types:
Map → Record, Date → DateWrapper (via SerializedFilter).

## Properties

### columnOrder

> **columnOrder**: `string`[]

Defined in: [persistence/types.ts:155](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L155)

***

### columnWidths

> **columnWidths**: `Record`\<`string`, `number`\>

Defined in: [persistence/types.ts:156](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L156)

***

### derivedColumns?

> `optional` **derivedColumns?**: [`SerializedDerivedColumnDef`](../type-aliases/SerializedDerivedColumnDef.md)[]

Defined in: [persistence/types.ts:160](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L160)

Derived column definitions. May use pool references (v4+) or inline values (pre-v4).

***

### filters

> **filters**: [`SerializedFilter`](../../index/type-aliases/SerializedFilter.md)[]

Defined in: [persistence/types.ts:152](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L152)

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Record`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>

Defined in: [persistence/types.ts:158](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L158)

***

### pinnedColumns

> **pinnedColumns**: `string`[]

Defined in: [persistence/types.ts:157](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L157)

***

### sortColumns

> **sortColumns**: [`SortColumn`](../../index/interfaces/SortColumn.md)[]

Defined in: [persistence/types.ts:153](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L153)

***

### visibleColumns

> **visibleColumns**: `string`[]

Defined in: [persistence/types.ts:154](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L154)
