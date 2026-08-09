[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ReorderCallback

# Type Alias: ReorderCallback

> **ReorderCallback** = (`newOrder`, `movedColumn`) => `void`

Defined in: [table/ColumnReorder.ts:37](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnReorder.ts#L37)

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
