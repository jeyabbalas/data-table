[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TimeColumnStats

# Interface: TimeColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:85](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L85)

Stats for time columns.
Line 2: "08:00 – 23:45"

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

> **kind**: `"time"`

Defined in: [statistics/ColumnStatsTypes.ts:86](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L86)

***

### maxSeconds

> **maxSeconds**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:90](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L90)

Maximum time as seconds from midnight, or null if all null

***

### minSeconds

> **minSeconds**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:88](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L88)

Minimum time as seconds from midnight, or null if all null

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
