[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ValueCountsSnapshot

# Interface: ValueCountsSnapshot

Defined in: [visualizations/valuecounts/ValueCounts.ts:161](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/valuecounts/ValueCounts.ts#L161)

[ValueCounts](../classes/ValueCounts.md)'s data snapshot — see
[BaseVisualization.exportDataSnapshot](../classes/BaseVisualization.md#exportdatasnapshot). Exported from `/advanced` so a
consumer parking snapshots across a header rebuild can name what it holds.
Snapshots stay opaque in the direction that matters: `exportDataSnapshot()`
and `importDataSnapshot()` both trade in `unknown`, and one only ever moves
between two instances of this class for the same column.

## Properties

### backgroundData

> **backgroundData**: [`ValueCountsData`](ValueCountsData.md) \| `null`

Defined in: [visualizations/valuecounts/ValueCounts.ts:163](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/valuecounts/ValueCounts.ts#L163)

***

### data

> **data**: [`ValueCountsData`](ValueCountsData.md) \| `null`

Defined in: [visualizations/valuecounts/ValueCounts.ts:162](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/valuecounts/ValueCounts.ts#L162)

***

### foldedCountOverrides

> **foldedCountOverrides**: `Map`\<`string`, `number`\> \| `null`

Defined in: [visualizations/valuecounts/ValueCounts.ts:169](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/valuecounts/ValueCounts.ts#L169)

***

### initialCategoryOrder

> **initialCategoryOrder**: `string`[] \| `null`

Defined in: [visualizations/valuecounts/ValueCounts.ts:165](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/valuecounts/ValueCounts.ts#L165)

***

### initialData

> **initialData**: [`ValueCountsData`](ValueCountsData.md) \| `null`

Defined in: [visualizations/valuecounts/ValueCounts.ts:164](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/valuecounts/ValueCounts.ts#L164)

***

### initialHasOther

> **initialHasOther**: `boolean`

Defined in: [visualizations/valuecounts/ValueCounts.ts:166](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/valuecounts/ValueCounts.ts#L166)

***

### initialSegmentCounts

> **initialSegmentCounts**: `Map`\<`string`, `number`\> \| `null`

Defined in: [visualizations/valuecounts/ValueCounts.ts:167](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/valuecounts/ValueCounts.ts#L167)

***

### topCategoryValues

> **topCategoryValues**: `string`[]

Defined in: [visualizations/valuecounts/ValueCounts.ts:168](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/valuecounts/ValueCounts.ts#L168)
