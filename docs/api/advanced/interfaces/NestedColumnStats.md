[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / NestedColumnStats

# Interface: NestedColumnStats

Defined in: [statistics/ColumnStatsTypes.ts:139](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L139)

Stats for nested columns: LIST, ARRAY, STRUCT, MAP, UNION and VARIANT
(`DataType` `'nested'`). Their values are not grouped or ranged, so
beyond the row and null counts the stats say what the values are: line 2
is the column's type outline, e.g. `x double · y double · tier varchar`.

## Example

```ts
import type { NestedColumnStats } from '@jeyabbalas/data-table/advanced';

const stats: NestedColumnStats = {
  kind: 'nested',
  totalRows: 1000,
  nonNullCount: 990,
  nullCount: 10,
  filteredTotalRows: null,
  outline: 'x double · y double · tier varchar',
};
```

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

> **kind**: `"nested"`

Defined in: [statistics/ColumnStatsTypes.ts:140](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L140)

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

### outline

> **outline**: `string`

Defined in: [statistics/ColumnStatsTypes.ts:147](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L147)

The column's type in one line, as the stats line shows it: a struct's
fields with their types (`x double · y double · tier varchar`), a list's
element type (`[integer]`), a map's (`{varchar → integer}`). Field names
come from the data file: escape it before writing it as HTML.

***

### totalRows

> **totalRows**: `number`

Defined in: [statistics/ColumnStatsTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/statistics/ColumnStatsTypes.ts#L17)

Total row count (unfiltered when filteredTotalRows is set, otherwise current)

#### Inherited from

[`BaseColumnStats`](BaseColumnStats.md).[`totalRows`](BaseColumnStats.md#totalrows)
