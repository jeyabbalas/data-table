[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / IntervalColumnStats

# Interface: IntervalColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:97](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L97)

Stats for interval columns.
Line 2: "min 2h · med 8h · max 48h"

## Extends

- [`BaseColumnStats`](BaseColumnStats.md)

## Properties

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`filteredTotalRows`](BaseColumnStats.md#filteredtotalrows)

***

### kind

> **kind**: `"interval"`

Defined in: [statistics/ColumnStatsTypes.ts:98](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L98)

***

### maxDisplay

> **maxDisplay**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:102](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L102)

Pre-formatted maximum interval from DuckDB

***

### medianDisplay

> **medianDisplay**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:104](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L104)

Pre-formatted median interval from DuckDB

***

### minDisplay

> **minDisplay**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:100](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L100)

Pre-formatted minimum interval from DuckDB

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L19)

Count of non-null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nonNullCount`](BaseColumnStats.md#nonnullcount)

***

### nullCount

> **nullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L21)

Count of null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nullCount`](BaseColumnStats.md#nullcount)

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`totalRows`](BaseColumnStats.md#totalrows)
