[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StateSnapshot

# Interface: StateSnapshot

Defined in: [core/UndoManager.ts:27](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L27)

A lightweight snapshot of user-manipulable table view state.

Unlike SessionSnapshot (used for persistence), StateSnapshot stores
values in their native signal formats (Filter[] not SerializedFilter[],
Map not Record) and omits metadata (version, timestamp, tableName,
derivedColumns). Snapshots are cheap — just reading and copying
signal values.

## Properties

### columnOrder

> **columnOrder**: `string`[]

Defined in: [core/UndoManager.ts:31](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L31)

***

### columnWidths

> **columnWidths**: `Map`\<`string`, `number`\>

Defined in: [core/UndoManager.ts:32](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L32)

***

### derivedColumns

> **derivedColumns**: [`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]

Defined in: [core/UndoManager.ts:35](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L35)

***

### filters

> **filters**: [`Filter`](../../index/type-aliases/Filter.md)[]

Defined in: [core/UndoManager.ts:28](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L28)

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Map`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>

Defined in: [core/UndoManager.ts:34](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L34)

***

### pinnedColumns

> **pinnedColumns**: `string`[]

Defined in: [core/UndoManager.ts:33](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L33)

***

### sortColumns

> **sortColumns**: [`SortColumn`](../../index/interfaces/SortColumn.md)[]

Defined in: [core/UndoManager.ts:29](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L29)

***

### visibleColumns

> **visibleColumns**: `string`[]

Defined in: [core/UndoManager.ts:30](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/UndoManager.ts#L30)
