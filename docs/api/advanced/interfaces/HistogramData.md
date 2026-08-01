[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / HistogramData

# Interface: HistogramData

Defined in: [visualizations/histogram/HistogramData.ts:40](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L40)

Complete histogram data including bins and metadata

## Properties

### bins

> **bins**: [`HistogramBin`](HistogramBin.md)[]

Defined in: [visualizations/histogram/HistogramData.ts:42](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L42)

Array of histogram bins sorted by x0

***

### distinctCount

> **distinctCount**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:58](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L58)

Count of distinct non-null values

***

### isDiscrete

> **isDiscrete**: `boolean`

Defined in: [visualizations/histogram/HistogramData.ts:54](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L54)

True when using discrete binning (one bin per unique value, ≤ threshold)

***

### isSingleValue

> **isSingleValue**: `boolean`

Defined in: [visualizations/histogram/HistogramData.ts:52](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L52)

True when all non-null values are identical (single value column)

***

### max

> **max**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:48](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L48)

Maximum non-null value

***

### median

> **median**: `number` \| `null`

Defined in: [visualizations/histogram/HistogramData.ts:56](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L56)

Approximate median of non-null values

***

### min

> **min**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:46](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L46)

Minimum non-null value

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:44](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L44)

Count of null values in the column

***

### total

> **total**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:50](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/visualizations/histogram/HistogramData.ts#L50)

Total count of all values (including nulls)
