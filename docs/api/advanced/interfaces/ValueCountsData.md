[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ValueCountsData

# Interface: ValueCountsData

Defined in: [visualizations/valuecounts/ValueCountsData.ts:42](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/visualizations/valuecounts/ValueCountsData.ts#L42)

Complete value counts data including segments and metadata

## Properties

### distinctCount

> **distinctCount**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:48](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/visualizations/valuecounts/ValueCountsData.ts#L48)

Total number of distinct non-null values

***

### isAllUnique

> **isAllUnique**: `boolean`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:52](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/visualizations/valuecounts/ValueCountsData.ts#L52)

True when every value is unique (no repeated values)

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:46](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/visualizations/valuecounts/ValueCountsData.ts#L46)

Count of null values in the column

***

### segments

> **segments**: [`CategorySegment`](CategorySegment.md)[]

Defined in: [visualizations/valuecounts/ValueCountsData.ts:44](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/visualizations/valuecounts/ValueCountsData.ts#L44)

Array of category segments (top N + "Other" if applicable)

***

### total

> **total**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:50](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/visualizations/valuecounts/ValueCountsData.ts#L50)

Total row count (including nulls)
