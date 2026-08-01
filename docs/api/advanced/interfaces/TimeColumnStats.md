[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TimeColumnStats

# Interface: TimeColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:68](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/statistics/ColumnStatsTypes.ts#L68)

Stats for time columns.
Line 2: "08:00 – 23:45"

## Extends

- [`BaseColumnStats`](BaseColumnStats.md)

## Properties

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`filteredTotalRows`](BaseColumnStats.md#filteredtotalrows)

***

### kind

> **kind**: `"time"`

Defined in: [statistics/ColumnStatsTypes.ts:69](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/statistics/ColumnStatsTypes.ts#L69)

***

### maxSeconds

> **maxSeconds**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:73](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/statistics/ColumnStatsTypes.ts#L73)

Maximum time as seconds from midnight, or null if all null

***

### minSeconds

> **minSeconds**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:71](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/statistics/ColumnStatsTypes.ts#L71)

Minimum time as seconds from midnight, or null if all null

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/statistics/ColumnStatsTypes.ts#L19)

Count of non-null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nonNullCount`](BaseColumnStats.md#nonnullcount)

***

### nullCount

> **nullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/statistics/ColumnStatsTypes.ts#L21)

Count of null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nullCount`](BaseColumnStats.md#nullcount)

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`totalRows`](BaseColumnStats.md#totalrows)
