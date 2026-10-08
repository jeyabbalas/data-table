[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / IntervalColumnStats

# Interface: IntervalColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:109](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L109)

Stats for interval columns.
Line 2: "min 2h · med 8h · max 48h"

## Extends

- [`BaseColumnStats`](BaseColumnStats.md)

## Properties

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`filteredTotalRows`](BaseColumnStats.md#filteredtotalrows)

***

### kind

> **kind**: `"interval"`

Defined in: [statistics/ColumnStatsTypes.ts:110](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L110)

***

### maxDisplay

> **maxDisplay**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:114](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L114)

Pre-formatted maximum interval from DuckDB

***

### medianDisplay

> **medianDisplay**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:116](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L116)

Pre-formatted median interval from DuckDB

***

### minDisplay

> **minDisplay**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:112](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L112)

Pre-formatted minimum interval from DuckDB

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L19)

Count of non-null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nonNullCount`](BaseColumnStats.md#nonnullcount)

***

### nullCount

> **nullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L21)

Count of null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nullCount`](BaseColumnStats.md#nullcount)

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`totalRows`](BaseColumnStats.md#totalrows)
