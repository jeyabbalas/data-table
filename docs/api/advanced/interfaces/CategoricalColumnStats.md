[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CategoricalColumnStats

# Interface: CategoricalColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:52](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/statistics/ColumnStatsTypes.ts#L52)

Stats for categorical columns (string, boolean, uuid).
Line 2 varies by DataType:
- string: "12 unique", "~12 unique" (approximate), or "all unique"
- boolean: "67% true"
- uuid: "1,234 unique (100%)", "~1,234 unique (98%)", or "all unique"

## Extends

- [`BaseColumnStats`](BaseColumnStats.md)

## Properties

### distinctCount

> **distinctCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:54](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/statistics/ColumnStatsTypes.ts#L54)

***

### distinctCountApprox?

> `optional` **distinctCountApprox?**: `boolean`

Defined in: [statistics/ColumnStatsTypes.ts:64](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/statistics/ColumnStatsTypes.ts#L64)

True when `distinctCount` is a HyperLogLog estimate from
`approx_count_distinct` rather than an exact `COUNT(DISTINCT …)`.

Drives two things in `formatStatsLine2`: the `~` marker on the rendered
count, and suppression of the "all unique" shortcut — under HLL,
`distinctCount === nonNullCount` is a coin flip, so the claim cannot be
made. Absent or false means the count is exact.

***

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`filteredTotalRows`](BaseColumnStats.md#filteredtotalrows)

***

### kind

> **kind**: `"categorical"`

Defined in: [statistics/ColumnStatsTypes.ts:53](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/statistics/ColumnStatsTypes.ts#L53)

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/statistics/ColumnStatsTypes.ts#L19)

Count of non-null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nonNullCount`](BaseColumnStats.md#nonnullcount)

***

### nullCount

> **nullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/statistics/ColumnStatsTypes.ts#L21)

Count of null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nullCount`](BaseColumnStats.md#nullcount)

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`totalRows`](BaseColumnStats.md#totalrows)

***

### trueCount?

> `optional` **trueCount?**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:66](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/statistics/ColumnStatsTypes.ts#L66)

Count of true values (boolean columns only)
