[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TimeHistogramData

# Interface: TimeHistogramData

Defined in: [visualizations/histogram/TimeHistogramData.ts:49](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/histogram/TimeHistogramData.ts#L49)

Complete time histogram data including bins and metadata

## Properties

### bins

> **bins**: [`TimeHistogramBin`](TimeHistogramBin.md)[]

Defined in: [visualizations/histogram/TimeHistogramData.ts:51](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/histogram/TimeHistogramData.ts#L51)

Array of bins sorted by binStartSeconds

***

### interval

> **interval**: [`TimeInterval`](../type-aliases/TimeInterval.md)

Defined in: [visualizations/histogram/TimeHistogramData.ts:65](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/histogram/TimeHistogramData.ts#L65)

Detected/used interval for binning

***

### isNumericBinning

> **isNumericBinning**: `boolean`

Defined in: [visualizations/histogram/TimeHistogramData.ts:69](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/histogram/TimeHistogramData.ts#L69)

True when using numeric binning fallback (bins not aligned to time intervals)

***

### isSingleValue

> **isSingleValue**: `boolean`

Defined in: [visualizations/histogram/TimeHistogramData.ts:67](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/histogram/TimeHistogramData.ts#L67)

True when all non-null values are identical

***

### maxSeconds

> **maxSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/TimeHistogramData.ts:61](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/histogram/TimeHistogramData.ts#L61)

Maximum non-null time in seconds from midnight; `24:00:00` is 86400.

***

### minSeconds

> **minSeconds**: `number` \| `null`

Defined in: [visualizations/histogram/TimeHistogramData.ts:59](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/histogram/TimeHistogramData.ts#L59)

Minimum non-null time in seconds from midnight, as `EXTRACT(EPOCH …)`
gives it: a TIME WITH TIME ZONE's time of day as written, its offset
ignored.

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/histogram/TimeHistogramData.ts:53](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/histogram/TimeHistogramData.ts#L53)

Count of null values in the column

***

### total

> **total**: `number`

Defined in: [visualizations/histogram/TimeHistogramData.ts:63](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/histogram/TimeHistogramData.ts#L63)

Total count of all values (including nulls)
