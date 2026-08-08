[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableState

# Interface: TableState

Defined in: [core/State.ts:22](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L22)

TableState interface - all reactive state for a data table instance

## Properties

### baseTableName

> **baseTableName**: `Signal`\<`string` \| `null`\>

Defined in: [core/State.ts:31](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L31)

Original table name before any VIEW was created

***

### columnHeaderTooltips

> **columnHeaderTooltips**: `Signal`\<`Map`\<`string`, [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md)\>\>

Defined in: [core/State.ts:59](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L59)

App-controlled column-header tooltip overrides, rendered as a styled popover.

***

### columnOrder

> **columnOrder**: `Signal`\<`string`[]\>

Defined in: [core/State.ts:51](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L51)

Order of columns as displayed

***

### columnWidths

> **columnWidths**: `Signal`\<`Map`\<`string`, `number`\>\>

Defined in: [core/State.ts:53](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L53)

Custom widths for columns (column name -> width in pixels)

***

### derivedColumns

> **derivedColumns**: `Signal`\<[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]\>

Defined in: [core/State.ts:33](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L33)

Ordered list of derived column definitions

***

### filteredRows

> **filteredRows**: `Signal`\<`number`\>

Defined in: [core/State.ts:39](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L39)

Number of rows matching current filters (updated after queries)

***

### filters

> **filters**: `Signal`\<[`Filter`](../../index/type-aliases/Filter.md)[]\>

Defined in: [core/State.ts:37](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L37)

Active filters applied to the data

***

### filtersByColumn

> **filtersByColumn**: `Computed`\<`Map`\<`string`, [`Filter`](../../index/type-aliases/Filter.md)[]\>\>

Defined in: [core/State.ts:41](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L41)

Filters grouped by column name (computed from filters signal)

***

### focusedCell

> **focusedCell**: `Signal`\<\{ `column`: `string`; `row`: `number`; \} \| `null`\>

Defined in: [core/State.ts:71](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L71)

Currently focused cell for keyboard navigation

***

### hiddenColumnInfo

> **hiddenColumnInfo**: `Signal`\<`Map`\<`string`, [`HiddenColumnInfo`](HiddenColumnInfo.md)\>\>

Defined in: [core/State.ts:57](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L57)

Metadata for hidden columns — tracks neighbors at hide time for intelligent restore

***

### hoveredColumn

> **hoveredColumn**: `Signal`\<`string` \| `null`\>

Defined in: [core/State.ts:69](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L69)

Currently hovered column name

***

### hoveredRow

> **hoveredRow**: `Signal`\<`number` \| `null`\>

Defined in: [core/State.ts:67](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L67)

Currently hovered row index

***

### pinnedColumns

> **pinnedColumns**: `Signal`\<`string`[]\>

Defined in: [core/State.ts:55](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L55)

Names of columns pinned to the left

***

### schema

> **schema**: `Signal`\<[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)[]\>

Defined in: [core/State.ts:27](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L27)

Column schema information

***

### selectedRows

> **selectedRows**: `Signal`\<`Set`\<`number`\>\>

Defined in: [core/State.ts:63](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L63)

Set of selected row indices

***

### sortColumns

> **sortColumns**: `Signal`\<[`SortColumn`](../../index/interfaces/SortColumn.md)[]\>

Defined in: [core/State.ts:45](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L45)

Columns to sort by, in order of priority

***

### tableName

> **tableName**: `Signal`\<`string` \| `null`\>

Defined in: [core/State.ts:25](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L25)

The name of the DuckDB table containing the data

***

### totalRows

> **totalRows**: `Signal`\<`number`\>

Defined in: [core/State.ts:29](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L29)

Total number of rows in the table

***

### visibleColumns

> **visibleColumns**: `Signal`\<`string`[]\>

Defined in: [core/State.ts:49](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/State.ts#L49)

Names of currently visible columns
