[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / RowId

# Type Alias: RowId

> **RowId** = `bigint`

Defined in: [core/types.ts:61](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/types.ts#L61)

Stable row identity produced at load time by the loaders and stored in the
reserved `__rowid__` column. 0-indexed, monotonic, BIGINT-backed, stable
across sort/filter/derived-column changes for the lifetime of the session.
