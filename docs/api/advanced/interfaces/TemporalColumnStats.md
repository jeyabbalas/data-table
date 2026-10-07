[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TemporalColumnStats

# Interface: TemporalColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:77](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L77)

Stats for date and timestamp columns.
Line 2: "2020-01-01 – 2024-12-31", then "· 2 non-finite" when the column
holds `infinity`, `-infinity` or a date a JavaScript `Date` cannot hold.

`min` and `max` are of the values the chart draws, as `toISOString`
writes them: a year before 1 or past 9999 with its sign and six digits,
`-000043-03-15T00:00:00.000Z` (44 BC) or `+012000-01-01T00:00:00.000Z`.
`nonNullCount` counts the values left out too.

## Extends

- [`BaseColumnStats`](BaseColumnStats.md)

## Properties

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`filteredTotalRows`](BaseColumnStats.md#filteredtotalrows)

***

### kind

> **kind**: `"temporal"`

Defined in: [statistics/ColumnStatsTypes.ts:78](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L78)

***

### max

> **max**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:82](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L82)

Maximum date/timestamp the chart draws, as ISO string, or null if there is none

***

### min

> **min**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:80](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L80)

Minimum date/timestamp the chart draws, as ISO string, or null if there is none

***

### nonFiniteCount?

> `optional` **nonFiniteCount?**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:90](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L90)

Count of `infinity`, `-infinity` and dates more than about 270,000 years
from 1970, which a JavaScript `Date` cannot hold, in the (possibly
filtered) column. The chart leaves them out of its bars and of `min`
and `max`. Line 2 ends with it when above 0. Optional so that stats
built by a custom chart still type-check.

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L19)

Count of non-null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nonNullCount`](BaseColumnStats.md#nonnullcount)

***

### nullCount

> **nullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L21)

Count of null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nullCount`](BaseColumnStats.md#nullcount)

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`totalRows`](BaseColumnStats.md#totalrows)
