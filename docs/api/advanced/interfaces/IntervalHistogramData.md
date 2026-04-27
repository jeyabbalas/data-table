[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / IntervalHistogramData

# Interface: IntervalHistogramData

Defined in: [visualizations/histogram/IntervalHistogramData.ts:48](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/visualizations/histogram/IntervalHistogramData.ts#L48)

Complete interval histogram data including bins and metadata

## Properties

### bins

> **bins**: [`IntervalHistogramBin`](IntervalHistogramBin.md)[]

Defined in: [visualizations/histogram/IntervalHistogramData.ts:50](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/visualizations/histogram/IntervalHistogramData.ts#L50)

Array of bins sorted by binStartSeconds

***

### isSingleValue

> **isSingleValue**: `boolean`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:62](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/visualizations/histogram/IntervalHistogramData.ts#L62)

True when all non-null values are identical

***

### maxSeconds

> **maxSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:56](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/visualizations/histogram/IntervalHistogramData.ts#L56)

Maximum non-null interval in total seconds

***

### medianSeconds

> **medianSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:58](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/visualizations/histogram/IntervalHistogramData.ts#L58)

Median non-null interval in total seconds

***

### minSeconds

> **minSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:54](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/visualizations/histogram/IntervalHistogramData.ts#L54)

Minimum non-null interval in total seconds

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:52](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/visualizations/histogram/IntervalHistogramData.ts#L52)

Count of null values in the column

***

### total

> **total**: `number`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:60](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/visualizations/histogram/IntervalHistogramData.ts#L60)

Total count of all values (including nulls)
