[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / Filter

# Type Alias: Filter

> **Filter** = [`RangeFilter`](../interfaces/RangeFilter.md) \| [`PointFilter`](../interfaces/PointFilter.md) \| [`SetFilter`](../interfaces/SetFilter.md) \| [`NotSetFilter`](../interfaces/NotSetFilter.md) \| [`NullFilter`](../interfaces/NullFilter.md) \| [`PatternFilter`](../interfaces/PatternFilter.md) \| [`RawSQLFilter`](../interfaces/RawSQLFilter.md)

Defined in: [filters/FilterTypes.ts:200](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterTypes.ts#L200)

Discriminated union of every filter shape understood by the library.
`actions.addFilter`, `state.filters`, the export pipeline, and
`filtersToWhereClause` all consume this union directly.
