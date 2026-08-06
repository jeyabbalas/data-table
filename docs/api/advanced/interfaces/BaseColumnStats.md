[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / BaseColumnStats

# Interface: BaseColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:15](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/statistics/ColumnStatsTypes.ts#L15)

Base stats shared by all column types.
Answers: "How much data? Any quality issues?"

## Extended by

- [`NumericColumnStats`](NumericColumnStats.md)
- [`CategoricalColumnStats`](CategoricalColumnStats.md)
- [`TemporalColumnStats`](TemporalColumnStats.md)
- [`TimeColumnStats`](TimeColumnStats.md)
- [`IntervalColumnStats`](IntervalColumnStats.md)

## Properties

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/statistics/ColumnStatsTypes.ts#L19)

Count of non-null values in the (possibly filtered) column

***

### nullCount

> **nullCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/statistics/ColumnStatsTypes.ts#L21)

Count of null values in the (possibly filtered) column

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)
