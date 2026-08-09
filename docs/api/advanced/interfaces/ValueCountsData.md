[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ValueCountsData

# Interface: ValueCountsData

Defined in: [visualizations/valuecounts/ValueCountsData.ts:64](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/valuecounts/ValueCountsData.ts#L64)

Complete value counts data including segments and metadata

## Properties

### distinctCount

> **distinctCount**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:70](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/valuecounts/ValueCountsData.ts#L70)

Total number of distinct non-null values

***

### distinctCountApprox?

> `optional` **distinctCountApprox?**: `boolean`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:84](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/valuecounts/ValueCountsData.ts#L84)

True when `distinctCount` came from `approx_count_distinct` rather than
an exact `COUNT(DISTINCT …)`. Absent means exact.

***

### isAllUnique

> **isAllUnique**: `boolean`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:79](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/valuecounts/ValueCountsData.ts#L79)

True when every value is unique (no repeated values).

Always `false` when [ValueCountsData.distinctCountApprox](#distinctcountapprox) is set —
see the derivation in `fetchValueCountsData`.

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:68](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/valuecounts/ValueCountsData.ts#L68)

Count of null values in the column

***

### segments

> **segments**: [`CategorySegment`](CategorySegment.md)[]

Defined in: [visualizations/valuecounts/ValueCountsData.ts:66](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/valuecounts/ValueCountsData.ts#L66)

Array of category segments (top N + "Other" if applicable)

***

### total

> **total**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:72](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/valuecounts/ValueCountsData.ts#L72)

Total row count (including nulls)
