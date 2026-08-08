[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / RowId

# Type Alias: RowId

> **RowId** = `bigint`

Defined in: [core/types.ts:47](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/core/types.ts#L47)

Stable row identity produced at load time by the loaders and stored in the
reserved `__rowid__` column. 0-indexed, monotonic, BIGINT-backed, stable
across sort/filter/derived-column changes for the lifetime of the session.
