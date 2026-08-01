[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnReorderOptions

# Interface: ColumnReorderOptions

Defined in: [table/ColumnReorder.ts:16](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/table/ColumnReorder.ts#L16)

Options for configuring the ColumnReorder

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/ColumnReorder.ts:18](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/table/ColumnReorder.ts#L18)

CSS class prefix (default: 'dt')

***

### dragThreshold?

> `optional` **dragThreshold?**: `number`

Defined in: [table/ColumnReorder.ts:20](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/table/ColumnReorder.ts#L20)

Movement threshold in pixels to start drag (default: 5)

***

### getPinnedColumns?

> `optional` **getPinnedColumns?**: () => readonly `string`[]

Defined in: [table/ColumnReorder.ts:26](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/table/ColumnReorder.ts#L26)

Late-bound accessor for the currently pinned columns. Used to keep a drop
out of the pinned block (see [clampUnpinnedIndex](../functions/clampUnpinnedIndex.md)); when omitted,
no clamping is applied.

#### Returns

readonly `string`[]
