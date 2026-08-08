[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / HistogramData

# Interface: HistogramData

Defined in: [visualizations/histogram/HistogramData.ts:104](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L104)

Complete histogram data including bins and metadata

## Properties

### bins

> **bins**: [`HistogramBin`](HistogramBin.md)[]

Defined in: [visualizations/histogram/HistogramData.ts:106](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L106)

Array of histogram bins sorted by x0

***

### distinctCount

> **distinctCount**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:122](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L122)

Count of distinct non-null values

***

### distinctCountApprox?

> `optional` **distinctCountApprox?**: `boolean`

Defined in: [visualizations/histogram/HistogramData.ts:127](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L127)

True when `distinctCount` came from `approx_count_distinct` rather than
an exact `COUNT(DISTINCT …)`. Absent means exact.

***

### isDiscrete

> **isDiscrete**: `boolean`

Defined in: [visualizations/histogram/HistogramData.ts:118](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L118)

True when using discrete binning (one bin per unique value, ≤ threshold)

***

### isSingleValue

> **isSingleValue**: `boolean`

Defined in: [visualizations/histogram/HistogramData.ts:116](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L116)

True when all non-null values are identical (single value column)

***

### max

> **max**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:112](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L112)

Maximum non-null value

***

### median

> **median**: `number` \| `null`

Defined in: [visualizations/histogram/HistogramData.ts:120](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L120)

Approximate median of non-null values

***

### min

> **min**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:110](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L110)

Minimum non-null value

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:108](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L108)

Count of null values in the column

***

### total

> **total**: `number`

Defined in: [visualizations/histogram/HistogramData.ts:114](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/histogram/HistogramData.ts#L114)

Total count of all values (including nulls)
