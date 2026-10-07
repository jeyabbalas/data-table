[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnStatsData

# Type Alias: ColumnStatsData

> **ColumnStatsData** = [`NumericColumnStats`](../interfaces/NumericColumnStats.md) \| [`CategoricalColumnStats`](../interfaces/CategoricalColumnStats.md) \| [`TemporalColumnStats`](../interfaces/TemporalColumnStats.md) \| [`TimeColumnStats`](../interfaces/TimeColumnStats.md) \| [`IntervalColumnStats`](../interfaces/IntervalColumnStats.md) \| [`NestedColumnStats`](../interfaces/NestedColumnStats.md)

Defined in: [statistics/ColumnStatsTypes.ts:125](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/statistics/ColumnStatsTypes.ts#L125)

Discriminated union of all column stats types.
Switch on `stats.kind` for type-safe formatting.
