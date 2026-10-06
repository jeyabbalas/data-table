[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / clampUnpinnedIndex

# Function: clampUnpinnedIndex()

> **clampUnpinnedIndex**(`index`, `columns`, `pinnedColumns`): `number`

Defined in: [table/ColumnReorder.ts:80](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/ColumnReorder.ts#L80)

Clamp an insertion index so an unpinned column cannot land inside the
pinned block.

Pinned columns are assumed to occupy the leading positions of the presented
order — the sticky `left` offsets (`ColumnLayout.pinnedPlacement`) are the
widths of the pinned columns before each one, which is where it sits only
while nothing unpinned comes between them. Dropping an unpinned column at
index 0 of a table with two pinned columns would put it under both.

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
