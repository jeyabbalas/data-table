[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnStatsData

# Type Alias: ColumnStatsData

> **ColumnStatsData** = [`NumericColumnStats`](../interfaces/NumericColumnStats.md) \| [`CategoricalColumnStats`](../interfaces/CategoricalColumnStats.md) \| [`TemporalColumnStats`](../interfaces/TemporalColumnStats.md) \| [`TimeColumnStats`](../interfaces/TimeColumnStats.md) \| [`IntervalColumnStats`](../interfaces/IntervalColumnStats.md) \| [`NestedColumnStats`](../interfaces/NestedColumnStats.md)

Defined in: [statistics/ColumnStatsTypes.ts:154](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/statistics/ColumnStatsTypes.ts#L154)

Discriminated union of all column stats types.
Switch on `stats.kind` for type-safe formatting.
