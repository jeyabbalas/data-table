[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnStatsData

# Type Alias: ColumnStatsData

> **ColumnStatsData** = [`NumericColumnStats`](../interfaces/NumericColumnStats.md) \| [`CategoricalColumnStats`](../interfaces/CategoricalColumnStats.md) \| [`TemporalColumnStats`](../interfaces/TemporalColumnStats.md) \| [`TimeColumnStats`](../interfaces/TimeColumnStats.md) \| [`IntervalColumnStats`](../interfaces/IntervalColumnStats.md)

Defined in: [statistics/ColumnStatsTypes.ts:111](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/statistics/ColumnStatsTypes.ts#L111)

Discriminated union of all column stats types.
Switch on `stats.kind` for type-safe formatting.
