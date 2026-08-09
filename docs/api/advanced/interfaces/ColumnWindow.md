[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnWindow

# Interface: ColumnWindow

Defined in: [table/ColumnWindow.ts:73](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnWindow.ts#L73)

The set of body columns to render, plus the geometry of everything skipped.

`[0, pinnedCount)` is always rendered — pinned columns are sticky and stay
on screen at any scroll offset — followed by the left spacer, then
`[start, end)`, then the right spacer. So a row's children are
`[P cells][left spacer][W cells][right spacer]`, and
`childIndex(absIdx) = absIdx < P ? absIdx : absIdx - start + P + 1`.

## Properties

### end

> **end**: `number`

Defined in: [table/ColumnWindow.ts:77](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnWindow.ts#L77)

One past the last windowed index. Always `>= start`, `<= visibleColumns.length`.

***

### leftSpacerPx

> **leftSpacerPx**: `number`

Defined in: [table/ColumnWindow.ts:81](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnWindow.ts#L81)

Σ occupied widths of `[pinnedCount, start)` — the left spacer.

***

### pinnedCount

> **pinnedCount**: `number`

Defined in: [table/ColumnWindow.ts:79](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnWindow.ts#L79)

Leading run of pinned columns, force-rendered outside the window.

***

### pinnedPrefixViolated

> **pinnedPrefixViolated**: `boolean`

Defined in: [table/ColumnWindow.ts:97](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnWindow.ts#L97)

`true` when the pinned columns were **not** a leading run of
`visibleColumns` and `pinnedCount` fell back to "through the last pinned
column". Correct, merely less economical. Reachable through public API:
`showColumn` splices into `visibleColumns` via `computeRestoreIndex`
without clamping to the pinned prefix, so
`hideColumn('C') → toggleColumnPin('D') → showColumn('C')` can leave a
pinned column behind an unpinned one.

***

### pinnedWidthPx

> **pinnedWidthPx**: `number`

Defined in: [table/ColumnWindow.ts:85](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnWindow.ts#L85)

Σ occupied widths of `[0, pinnedCount)` — where unpinned content starts.

***

### rightSpacerPx

> **rightSpacerPx**: `number`

Defined in: [table/ColumnWindow.ts:83](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnWindow.ts#L83)

Σ occupied widths of `[end, N)` — the right spacer.

***

### start

> **start**: `number`

Defined in: [table/ColumnWindow.ts:75](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnWindow.ts#L75)

First windowed index into `visibleColumns`. Always `>= pinnedCount`.

***

### totalWidthPx

> **totalWidthPx**: `number`

Defined in: [table/ColumnWindow.ts:87](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnWindow.ts#L87)

Σ occupied widths of `[0, N)` — the horizontal scroll extent.
