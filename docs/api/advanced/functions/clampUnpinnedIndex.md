[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / clampUnpinnedIndex

# Function: clampUnpinnedIndex()

> **clampUnpinnedIndex**(`index`, `columns`, `pinnedColumns`): `number`

Defined in: [table/ColumnReorder.ts:66](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L66)

Clamp an insertion index so an unpinned column cannot land inside the
pinned block.

Pinned columns are assumed to occupy the leading positions of the presented
order. `TableContainer.updatePinnedColumnStyles` and `TableBody`'s render
pass both take their sticky `left` offsets from `pinnedOffsets`, which
accumulates widths across `visibleColumns[0, pinnedCount)` — the span
`resolvePinnedCount` reports — and not across `pinnedColumns`. Drop an
unpinned column at index 0 of a table with two pinned ones and that span
falls back to "through the last pinned column"
(`ColumnWindow.pinnedPrefixViolated`): the intruder is filtered back out of
the offsets, but its width still lands in the running sum, so every pinned
column after it freezes that much further right — and the body force-renders
one extra column outside its window on top.

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
