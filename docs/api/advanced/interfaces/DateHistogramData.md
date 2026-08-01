[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DateHistogramData

# Interface: DateHistogramData

Defined in: [visualizations/histogram/DateHistogramData.ts:38](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/visualizations/histogram/DateHistogramData.ts#L38)

Complete date histogram data including bins and metadata

## Properties

### bins

> **bins**: [`DateHistogramBin`](DateHistogramBin.md)[]

Defined in: [visualizations/histogram/DateHistogramData.ts:40](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/visualizations/histogram/DateHistogramData.ts#L40)

Array of bins sorted by binStart

***

### interval

> **interval**: [`TimeInterval`](../type-aliases/TimeInterval.md)

Defined in: [visualizations/histogram/DateHistogramData.ts:50](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/visualizations/histogram/DateHistogramData.ts#L50)

Detected/used interval for binning

***

### isNumericBinning

> **isNumericBinning**: `boolean`

Defined in: [visualizations/histogram/DateHistogramData.ts:54](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/visualizations/histogram/DateHistogramData.ts#L54)

True when using numeric binning fallback (bins not aligned to calendar intervals)

***

### isSingleValue

> **isSingleValue**: `boolean`

Defined in: [visualizations/histogram/DateHistogramData.ts:52](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/visualizations/histogram/DateHistogramData.ts#L52)

True when all non-null values are identical (single timestamp)

***

### max

> **max**: `Date` \| `null`

Defined in: [visualizations/histogram/DateHistogramData.ts:46](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/visualizations/histogram/DateHistogramData.ts#L46)

Maximum non-null date

***

### min

> **min**: `Date` \| `null`

Defined in: [visualizations/histogram/DateHistogramData.ts:44](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/visualizations/histogram/DateHistogramData.ts#L44)

Minimum non-null date

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/histogram/DateHistogramData.ts:42](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/visualizations/histogram/DateHistogramData.ts#L42)

Count of null values in the column

***

### total

> **total**: `number`

Defined in: [visualizations/histogram/DateHistogramData.ts:48](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/visualizations/histogram/DateHistogramData.ts#L48)

Total count of all values (including nulls)
