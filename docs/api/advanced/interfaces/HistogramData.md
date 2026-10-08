[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / HistogramData

# Interface: HistogramData

Defined in: [visualizations/histogram/HistogramData.ts:45](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L45)

Complete histogram data including bins and metadata.

The bins, `min`, `max`, `median` and `distinctCount` are of the column's
finite values: `NaN`, `Infinity` and `-Infinity`, which a FLOAT or DOUBLE
column can hold, have no place on the axis, and are counted in
`nonFiniteCount` instead. `total` counts every row.

## Properties

### bins

> **bins**: [`HistogramBin`](HistogramBin.md)[]

Defined in: [visualizations/histogram/HistogramData.ts:47](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L47)

Array of histogram bins sorted by x0

***

### distinctCount

> **distinctCount**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:63](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L63)

Count of distinct finite values

***

### isDiscrete

> **isDiscrete**: `boolean`

Defined in: [visualizations/histogram/HistogramData.ts:59](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L59)

True when using discrete binning (one bin per unique value, ≤ threshold)

***

### isSingleValue

> **isSingleValue**: `boolean`

Defined in: [visualizations/histogram/HistogramData.ts:57](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L57)

True when all finite values are identical (single value column)

***

### max

> **max**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:53](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L53)

Maximum finite value; `NaN` when there is none

***

### median

> **median**: `number` \| `null`

Defined in: [visualizations/histogram/HistogramData.ts:61](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L61)

Approximate median of the finite values

***

### min

> **min**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:51](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L51)

Minimum finite value; `NaN` when there is none

***

### nonFiniteCount?

> `optional` **nonFiniteCount?**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:69](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L69)

Count of `NaN`, `Infinity` and `-Infinity` values, which the bins leave
out. Always set by the built-in fetch; optional so that data built
elsewhere still type-checks.

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:49](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L49)

Count of null values in the column

***

### total

> **total**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:55](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/HistogramData.ts#L55)

Total count of all values (including nulls and non-finite values)
