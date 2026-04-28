[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnStatsData

# Type Alias: ColumnStatsData

> **ColumnStatsData** = [`NumericColumnStats`](../interfaces/NumericColumnStats.md) \| [`CategoricalColumnStats`](../interfaces/CategoricalColumnStats.md) \| [`TemporalColumnStats`](../interfaces/TemporalColumnStats.md) \| [`TimeColumnStats`](../interfaces/TimeColumnStats.md) \| [`IntervalColumnStats`](../interfaces/IntervalColumnStats.md)

Defined in: [statistics/ColumnStatsTypes.ts:94](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/statistics/ColumnStatsTypes.ts#L94)

Discriminated union of all column stats types.
Switch on `stats.kind` for type-safe formatting.
