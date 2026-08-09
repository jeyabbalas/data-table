[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TimeHistogramData

# Interface: TimeHistogramData

Defined in: [visualizations/histogram/TimeHistogramData.ts:42](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/TimeHistogramData.ts#L42)

Complete time histogram data including bins and metadata

## Properties

### bins

> **bins**: [`TimeHistogramBin`](TimeHistogramBin.md)[]

Defined in: [visualizations/histogram/TimeHistogramData.ts:44](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/TimeHistogramData.ts#L44)

Array of bins sorted by binStartSeconds

***

### interval

> **interval**: [`TimeInterval`](../type-aliases/TimeInterval.md)

Defined in: [visualizations/histogram/TimeHistogramData.ts:54](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/TimeHistogramData.ts#L54)

Detected/used interval for binning

***

### isNumericBinning

> **isNumericBinning**: `boolean`

Defined in: [visualizations/histogram/TimeHistogramData.ts:58](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/TimeHistogramData.ts#L58)

True when using numeric binning fallback (bins not aligned to time intervals)

***

### isSingleValue

> **isSingleValue**: `boolean`

Defined in: [visualizations/histogram/TimeHistogramData.ts:56](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/TimeHistogramData.ts#L56)

True when all non-null values are identical

***

### maxSeconds

> **maxSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/TimeHistogramData.ts:50](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/TimeHistogramData.ts#L50)

Maximum non-null time in seconds from midnight

***

### minSeconds

> **minSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/TimeHistogramData.ts:48](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/TimeHistogramData.ts#L48)

Minimum non-null time in seconds from midnight

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/histogram/TimeHistogramData.ts:46](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/TimeHistogramData.ts#L46)

Count of null values in the column

***

### total

> **total**: `number`

Defined in: [visualizations/histogram/TimeHistogramData.ts:52](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/TimeHistogramData.ts#L52)

Total count of all values (including nulls)
