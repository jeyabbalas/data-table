[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableState

# Interface: TableState

Defined in: [core/State.ts:27](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L27)

TableState interface - all reactive state for a data table instance

## Properties

### baseTableName

> **baseTableName**: `Signal`\<`string` \| `null`\>

Defined in: [core/State.ts:36](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L36)

Original table name before any VIEW was created

***

### columnHeaderTooltips

> **columnHeaderTooltips**: `Signal`\<`Map`\<`string`, [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md)\>\>

Defined in: [core/State.ts:64](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L64)

App-controlled column-header tooltip overrides, rendered as a styled popover.

***

### columnOrder

> **columnOrder**: `Signal`\<`string`[]\>

Defined in: [core/State.ts:56](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L56)

Order of columns as displayed

***

### columnWidths

> **columnWidths**: `Signal`\<`Map`\<`string`, `number`\>\>

Defined in: [core/State.ts:58](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L58)

Custom widths for columns (column name -> width in pixels)

***

### derivedColumns

> **derivedColumns**: `Signal`\<[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]\>

Defined in: [core/State.ts:38](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L38)

Ordered list of derived column definitions

***

### filteredRows

> **filteredRows**: `Signal`\<`number`\>

Defined in: [core/State.ts:44](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L44)

Number of rows matching current filters (updated after queries)

***

### filters

> **filters**: `Signal`\<[`Filter`](../../index/type-aliases/Filter.md)[]\>

Defined in: [core/State.ts:42](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L42)

Active filters applied to the data

***

### filtersByColumn

> **filtersByColumn**: `Computed`\<`Map`\<`string`, [`Filter`](../../index/type-aliases/Filter.md)[]\>\>

Defined in: [core/State.ts:46](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L46)

Filters grouped by column name (computed from filters signal)

***

### focusedCell

> **focusedCell**: `Signal`\<\{ `column`: `string`; `row`: `number`; \} \| `null`\>

Defined in: [core/State.ts:76](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L76)

Currently focused cell for keyboard navigation

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Signal`\<`Map`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>\>

Defined in: [core/State.ts:62](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L62)

Metadata for hidden columns — tracks neighbors at hide time for intelligent restore

***

### hoveredColumn

> **hoveredColumn**: `Signal`\<`string` \| `null`\>

Defined in: [core/State.ts:74](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L74)

Currently hovered column name

***

### hoveredRow

> **hoveredRow**: `Signal`\<`number` \| `null`\>

Defined in: [core/State.ts:72](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L72)

Currently hovered row index

***

### pinnedColumns

> **pinnedColumns**: `Signal`\<`string`[]\>

Defined in: [core/State.ts:60](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L60)

Names of columns pinned to the left

***

### schema

> **schema**: `Signal`\<[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)[]\>

Defined in: [core/State.ts:32](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L32)

Column schema information

***

### selectedRows

> **selectedRows**: `Signal`\<`Set`\<`number`\>\>

Defined in: [core/State.ts:68](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L68)

Set of selected row indices

***

### sortColumns

> **sortColumns**: `Signal`\<[`SortColumn`](../../index/interfaces/SortColumn.md)[]\>

Defined in: [core/State.ts:50](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L50)

Columns to sort by, in order of priority

***

### tableName

> **tableName**: `Signal`\<`string` \| `null`\>

Defined in: [core/State.ts:30](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L30)

The name of the DuckDB table containing the data

***

### totalRows

> **totalRows**: `Signal`\<`number`\>

Defined in: [core/State.ts:34](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L34)

Total number of rows in the table

***

### visibleColumns

> **visibleColumns**: `Signal`\<`string`[]\>

Defined in: [core/State.ts:54](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L54)

Names of currently visible columns
