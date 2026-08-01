[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SerializedStateSnapshot

# Interface: SerializedStateSnapshot

Defined in: [persistence/types.ts:140](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/persistence/types.ts#L140)

A serialized StateSnapshot (undo/redo stack entry).

Same fields as StateSnapshot but with JSON-safe types:
Map → Record, Date → DateWrapper (via SerializedFilter).

## Properties

### columnOrder

> **columnOrder**: `string`[]

Defined in: [persistence/types.ts:144](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/persistence/types.ts#L144)

***

### columnWidths

> **columnWidths**: `Record`\<`string`, `number`\>

Defined in: [persistence/types.ts:145](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/persistence/types.ts#L145)

***

### derivedColumns?

> `optional` **derivedColumns?**: [`SerializedDerivedColumnDef`](../type-aliases/SerializedDerivedColumnDef.md)[]

Defined in: [persistence/types.ts:149](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/persistence/types.ts#L149)

Derived column definitions. May use pool references (v4+) or inline values (pre-v4).

***

### filters

> **filters**: [`SerializedFilter`](../../index/type-aliases/SerializedFilter.md)[]

Defined in: [persistence/types.ts:141](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/persistence/types.ts#L141)

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Record`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>

Defined in: [persistence/types.ts:147](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/persistence/types.ts#L147)

***

### pinnedColumns

> **pinnedColumns**: `string`[]

Defined in: [persistence/types.ts:146](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/persistence/types.ts#L146)

***

### sortColumns

> **sortColumns**: [`SortColumn`](../../index/interfaces/SortColumn.md)[]

Defined in: [persistence/types.ts:142](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/persistence/types.ts#L142)

***

### visibleColumns

> **visibleColumns**: `string`[]

Defined in: [persistence/types.ts:143](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/persistence/types.ts#L143)
