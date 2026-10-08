[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DateHistogramData

# Interface: DateHistogramData

Defined in: [visualizations/histogram/DateHistogramData.ts:50](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L50)

Complete date histogram data including bins and metadata.

The bins, `min` and `max` are of the values the chart can place on its
axis. `infinity`, `-infinity` and dates more than about 270,000 years from
1970, which a JavaScript `Date` cannot hold, are counted in
`nonFiniteCount` instead. `total` counts every row.

## Properties

### bins

> **bins**: [`DateHistogramBin`](DateHistogramBin.md)[]

Defined in: [visualizations/histogram/DateHistogramData.ts:52](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L52)

Array of bins sorted by binStart

***

### interval

> **interval**: [`TimeInterval`](../type-aliases/TimeInterval.md)

Defined in: [visualizations/histogram/DateHistogramData.ts:62](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L62)

Detected/used interval for binning

***

### isNumericBinning

> **isNumericBinning**: `boolean`

Defined in: [visualizations/histogram/DateHistogramData.ts:66](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L66)

True when using numeric binning fallback (bins not aligned to calendar intervals)

***

### isSingleValue

> **isSingleValue**: `boolean`

Defined in: [visualizations/histogram/DateHistogramData.ts:64](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L64)

True when all the values the chart draws are identical (single timestamp)

***

### max

> **max**: `Date` \| `null`

Defined in: [visualizations/histogram/DateHistogramData.ts:58](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L58)

Maximum date the chart draws, or null when there is none

***

### min

> **min**: `Date` \| `null`

Defined in: [visualizations/histogram/DateHistogramData.ts:56](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L56)

Minimum date the chart draws, or null when there is none

***

### nonFiniteCount?

> `optional` **nonFiniteCount?**: `number`

Defined in: [visualizations/histogram/DateHistogramData.ts:72](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L72)

Count of `infinity`, `-infinity` and far-off dates, which the bins leave
out. Always set by the built-in fetch; optional so that data built
elsewhere still type-checks.

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/histogram/DateHistogramData.ts:54](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L54)

Count of null values in the column

***

### total

> **total**: `number`

Defined in: [visualizations/histogram/DateHistogramData.ts:60](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/DateHistogramData.ts#L60)

Total count of all values (including nulls and the values left out)
