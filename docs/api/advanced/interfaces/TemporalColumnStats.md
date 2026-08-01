[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TemporalColumnStats

# Interface: TemporalColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:56](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/statistics/ColumnStatsTypes.ts#L56)

Stats for date and timestamp columns.
Line 2: "2020-01-01 – 2024-12-31"

## Extends

- [`BaseColumnStats`](BaseColumnStats.md)

## Properties

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`filteredTotalRows`](BaseColumnStats.md#filteredtotalrows)

***

### kind

> **kind**: `"temporal"`

Defined in: [statistics/ColumnStatsTypes.ts:57](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/statistics/ColumnStatsTypes.ts#L57)

***

### max

> **max**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:61](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/statistics/ColumnStatsTypes.ts#L61)

Maximum date/timestamp as ISO string, or null if all null

***

### min

> **min**: `string` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:59](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/statistics/ColumnStatsTypes.ts#L59)

Minimum date/timestamp as ISO string, or null if all null

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/statistics/ColumnStatsTypes.ts#L19)

Count of non-null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nonNullCount`](BaseColumnStats.md#nonnullcount)

***

### nullCount

> **nullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/statistics/ColumnStatsTypes.ts#L21)

Count of null values in the (possibly filtered) column

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`nullCount`](BaseColumnStats.md#nullcount)

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`totalRows`](BaseColumnStats.md#totalrows)
