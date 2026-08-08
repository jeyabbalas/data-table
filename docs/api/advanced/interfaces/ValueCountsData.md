[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ValueCountsData

# Interface: ValueCountsData

Defined in: [visualizations/valuecounts/ValueCountsData.ts:44](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/valuecounts/ValueCountsData.ts#L44)

Complete value counts data including segments and metadata

## Properties

### distinctCount

> **distinctCount**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:50](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/valuecounts/ValueCountsData.ts#L50)

Total number of distinct non-null values

***

### distinctCountApprox?

> `optional` **distinctCountApprox?**: `boolean`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:64](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/valuecounts/ValueCountsData.ts#L64)

True when `distinctCount` came from `approx_count_distinct` rather than
an exact `COUNT(DISTINCT …)`. Absent means exact.

***

### isAllUnique

> **isAllUnique**: `boolean`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:59](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/valuecounts/ValueCountsData.ts#L59)

True when every value is unique (no repeated values).

Always `false` when [ValueCountsData.distinctCountApprox](#distinctcountapprox) is set —
see the derivation in `fetchValueCountsData`.

***

### nullCount

> **nullCount**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:48](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/valuecounts/ValueCountsData.ts#L48)

Count of null values in the column

***

### segments

> **segments**: [`CategorySegment`](CategorySegment.md)[]

Defined in: [visualizations/valuecounts/ValueCountsData.ts:46](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/valuecounts/ValueCountsData.ts#L46)

Array of category segments (top N + "Other" if applicable)

***

### total

> **total**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:52](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/valuecounts/ValueCountsData.ts#L52)

Total row count (including nulls)
