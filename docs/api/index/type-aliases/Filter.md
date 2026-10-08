[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / Filter

# Type Alias: Filter

> **Filter** = [`RangeFilter`](../interfaces/RangeFilter.md) \| [`PointFilter`](../interfaces/PointFilter.md) \| [`SetFilter`](../interfaces/SetFilter.md) \| [`NotSetFilter`](../interfaces/NotSetFilter.md) \| [`NullFilter`](../interfaces/NullFilter.md) \| [`PatternFilter`](../interfaces/PatternFilter.md) \| [`RawSQLFilter`](../interfaces/RawSQLFilter.md)

Defined in: [filters/FilterTypes.ts:200](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L200)

Discriminated union of every filter shape understood by the library.
`actions.addFilter`, `state.filters`, the export pipeline, and
`filtersToWhereClause` all consume this union directly.
