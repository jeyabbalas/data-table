[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / IntervalHistogramData

# Interface: IntervalHistogramData

Defined in: [visualizations/histogram/IntervalHistogramData.ts:62](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/histogram/IntervalHistogramData.ts#L62)

Complete interval histogram data including bins and metadata

## Properties

### bins

> **bins**: [`IntervalHistogramBin`](IntervalHistogramBin.md)[]

Defined in: [visualizations/histogram/IntervalHistogramData.ts:64](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/histogram/IntervalHistogramData.ts#L64)

Array of bins sorted by binStartSeconds

***

### isSingleValue

> **isSingleValue**: `boolean`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:76](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/histogram/IntervalHistogramData.ts#L76)

True when all non-null values are identical

***

### maxSeconds

> **maxSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:70](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/histogram/IntervalHistogramData.ts#L70)

Maximum non-null interval in total seconds

***

### medianSeconds

> **medianSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:72](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/histogram/IntervalHistogramData.ts#L72)

Median non-null interval in total seconds

***

### minSeconds

> **minSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:68](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/histogram/IntervalHistogramData.ts#L68)

Minimum non-null interval in total seconds

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:66](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/histogram/IntervalHistogramData.ts#L66)

Count of null values in the column

***

### total

> **total**: `number`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:74](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/histogram/IntervalHistogramData.ts#L74)

Total count of all values (including nulls)
