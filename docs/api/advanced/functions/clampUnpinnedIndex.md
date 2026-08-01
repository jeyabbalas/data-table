[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / clampUnpinnedIndex

# Function: clampUnpinnedIndex()

> **clampUnpinnedIndex**(`index`, `columns`, `pinnedColumns`): `number`

Defined in: [table/ColumnReorder.ts:60](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/ColumnReorder.ts#L60)

Clamp an insertion index so an unpinned column cannot land inside the
pinned block.

Pinned columns are assumed to occupy the leading positions of the presented
order — `TableContainer.updatePinnedColumnStyles` and
`TableBody.updateRowContent` both compute sticky `left` offsets by walking
`pinnedColumns` in order, so dropping an unpinned column at index 0 of a
table with two pinned columns desyncs every offset after it.

## Parameters

### index

`number`

Desired insertion index into `columns`.

### columns

readonly `string`[]

The presented order the column will be spliced into, with
  the moved column already removed.

### pinnedColumns

readonly `string`[]

Currently pinned column names.

## Returns

`number`

`index` clamped to `[pinnedPrefixLength, columns.length]`.

## Example

```typescript
clampUnpinnedIndex(0, ['id', 'name', 'qty'], ['id']); // → 1
```
