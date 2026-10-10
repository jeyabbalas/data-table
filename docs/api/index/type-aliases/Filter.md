[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / Filter

# Type Alias: Filter

> **Filter** = [`RangeFilter`](../interfaces/RangeFilter.md) \| [`PointFilter`](../interfaces/PointFilter.md) \| [`SetFilter`](../interfaces/SetFilter.md) \| [`NotSetFilter`](../interfaces/NotSetFilter.md) \| [`NullFilter`](../interfaces/NullFilter.md) \| [`PatternFilter`](../interfaces/PatternFilter.md) \| [`RawSQLFilter`](../interfaces/RawSQLFilter.md)

Defined in: [filters/FilterTypes.ts:200](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterTypes.ts#L200)

Discriminated union of every filter shape understood by the library.
`actions.addFilter`, `state.filters`, the export pipeline, and
`filtersToWhereClause` all consume this union directly.
