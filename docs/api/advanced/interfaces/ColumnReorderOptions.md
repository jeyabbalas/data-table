[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnReorderOptions

# Interface: ColumnReorderOptions

Defined in: [table/ColumnReorder.ts:16](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnReorder.ts#L16)

Options for configuring the ColumnReorder

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/ColumnReorder.ts:18](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnReorder.ts#L18)

CSS class prefix (default: 'dt')

***

### dragThreshold?

> `optional` **dragThreshold?**: `number`

Defined in: [table/ColumnReorder.ts:20](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnReorder.ts#L20)

Movement threshold in pixels to start drag (default: 5)

***

### getPinnedColumns?

> `optional` **getPinnedColumns?**: () => readonly `string`[]

Defined in: [table/ColumnReorder.ts:26](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnReorder.ts#L26)

Late-bound accessor for the currently pinned columns. Used to keep a drop
out of the pinned block (see [clampUnpinnedIndex](../functions/clampUnpinnedIndex.md)); when omitted,
no clamping is applied.

#### Returns

readonly `string`[]

***

### getVisibleColumns?

> `optional` **getVisibleColumns?**: () => readonly `string`[]

Defined in: [table/ColumnReorder.ts:44](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnReorder.ts#L44)

Late-bound accessor for the **whole** presented column order.

The header row is windowed, so the elements this class can see are a
slice of that order — roughly 17 of 60, and 17 of 1,000. Without this,
a drop is computed over the slice and handed on as if it were the table:
`TableContainer.applyReorderFromDrag` passes it to `setColumnOrder`,
whose missing-column merge then re-splices every column that was not
mounted. Dragging one column three slots right at 60 columns moved 23 of
them.

Supplied, the drop is still *measured* in the DOM — pointer geometry has
no other source — and then translated onto this order by naming the
column the dragged one should land in front of. Omitted, the DOM slice is
used as before, which is correct for a standalone `/advanced` header row
that mounts every column.

#### Returns

readonly `string`[]
