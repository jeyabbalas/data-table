[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / NumericColumnStats

# Interface: NumericColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:30](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L30)

Stats for numeric columns (integer, float, decimal).
Line 2: "min 0 · med 42 · max 1.2K"

## Extends

- [`BaseColumnStats`](BaseColumnStats.md)

## Properties

### distinctCount

> **distinctCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:35](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L35)

***

### distinctCountApprox?

> `optional` **distinctCountApprox?**: `boolean`

Defined in: [statistics/ColumnStatsTypes.ts:42](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L42)

True when `distinctCount` is a HyperLogLog estimate from
`approx_count_distinct` rather than an exact `COUNT(DISTINCT …)`. The
visualizations set it above `APPROX_DISTINCT_ROW_THRESHOLD` rows.
Absent or false means the count is exact.

***

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`filteredTotalRows`](BaseColumnStats.md#filteredtotalrows)

***

### kind

> **kind**: `"numeric"`

Defined in: [statistics/ColumnStatsTypes.ts:31](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L31)

***

### max

> **max**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:33](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L33)

***

### median

> **median**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:34](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L34)

***

### min

> **min**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:32](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L32)

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L19)

Count of non-null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nonNullCount`](BaseColumnStats.md#nonnullcount)

***

### nullCount

> **nullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L21)

Count of null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nullCount`](BaseColumnStats.md#nullcount)

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`totalRows`](BaseColumnStats.md#totalrows)
