[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / Filter

# Type Alias: Filter

> **Filter** = [`RangeFilter`](../interfaces/RangeFilter.md) \| [`PointFilter`](../interfaces/PointFilter.md) \| [`SetFilter`](../interfaces/SetFilter.md) \| [`NotSetFilter`](../interfaces/NotSetFilter.md) \| [`NullFilter`](../interfaces/NullFilter.md) \| [`PatternFilter`](../interfaces/PatternFilter.md) \| [`RawSQLFilter`](../interfaces/RawSQLFilter.md)

Defined in: [filters/FilterTypes.ts:115](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L115)

Discriminated union of every filter shape understood by the library.
`actions.addFilter`, `state.filters`, the export pipeline, and
`filtersToWhereClause` all consume this union directly.
