[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / NumericColumnStats

# Interface: NumericColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:34](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L34)

Stats for numeric columns (integer, float, decimal).
Line 2: "min 0 · med 42 · max 1.2K", then "· 30 non-finite" when the
column holds `NaN`, `Infinity` or `-Infinity`.

`min`, `max`, `median` and `distinctCount` are of the finite values, as
the histogram's bars are. `nonNullCount` counts the non-finite values too.

## Extends

- [`BaseColumnStats`](BaseColumnStats.md)

## Properties

### distinctCount

> **distinctCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:43](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L43)

Count of distinct finite values

***

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`filteredTotalRows`](BaseColumnStats.md#filteredtotalrows)

***

### kind

> **kind**: `"numeric"`

Defined in: [statistics/ColumnStatsTypes.ts:35](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L35)

***

### max

> **max**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:39](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L39)

Maximum finite value, or null if there is none

***

### median

> **median**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:41](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L41)

Approximate median of the finite values

***

### min

> **min**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:37](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L37)

Minimum finite value, or null if there is none

***

### nonFiniteCount?

> `optional` **nonFiniteCount?**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:50](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L50)

Count of `NaN`, `Infinity` and `-Infinity` values in the (possibly
filtered) column, which the chart leaves out of its bars and of `min`,
`median` and `max`. Line 2 ends with it when above 0. Optional so that
stats built by a custom chart still type-check.

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L19)

Count of non-null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nonNullCount`](BaseColumnStats.md#nonnullcount)

***

### nullCount

> **nullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L21)

Count of null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nullCount`](BaseColumnStats.md#nullcount)

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`totalRows`](BaseColumnStats.md#totalrows)
