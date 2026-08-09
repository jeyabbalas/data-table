[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ReorderCallback

# Type Alias: ReorderCallback

> **ReorderCallback** = (`newOrder`, `movedColumn`) => `void`

Defined in: [table/ColumnReorder.ts:55](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L55)

Callback invoked when columns are reordered.

## Parameters

### newOrder

`string`[]

The full presented order after the drop.

### movedColumn

`string`

The column that was dragged. Derivable from `newOrder`
  only ambiguously (a single move looks like a rotation of everything
  between the two positions), so it is passed explicitly for announcements.

## Returns

`void`
