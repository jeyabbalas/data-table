[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CategoricalColumnStats

# Interface: CategoricalColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:60](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L60)

Stats for categorical columns (string, boolean, uuid).
Line 2 varies by DataType:
- string: "12 unique" or "all unique"
- boolean: "67% true"
- uuid: "1,234 unique (100%)" or "all unique"

## Extends

- [`BaseColumnStats`](BaseColumnStats.md)

## Properties

### distinctCount

> **distinctCount**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:62](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L62)

***

### filteredTotalRows

> **filteredTotalRows**: `number` \| `null`

Defined in: [statistics/ColumnStatsTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L23)

Total rows in filtered view, or null if no filter is active

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`filteredTotalRows`](BaseColumnStats.md#filteredtotalrows)

***

### kind

> **kind**: `"categorical"`

Defined in: [statistics/ColumnStatsTypes.ts:61](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L61)

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

***

### trueCount?

> `optional` **trueCount?**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:64](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/statistics/ColumnStatsTypes.ts#L64)

Count of true values (boolean columns only)
