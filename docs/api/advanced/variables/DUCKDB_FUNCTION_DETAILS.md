[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DUCKDB\_FUNCTION\_DETAILS

# Variable: DUCKDB\_FUNCTION\_DETAILS

> `const` **DUCKDB\_FUNCTION\_DETAILS**: readonly [`DuckDBFunctionInfo`](../interfaces/DuckDBFunctionInfo.md)[]

Defined in: [sql-editor/duckdbFunctionDetails.ts:57](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/sql-editor/duckdbFunctionDetails.ts#L57)

Curated DuckDB function metadata array used to populate the autocomplete
`detail` (category chip) and `info` (one-line description) slots. Frozen
at load — apps that need a richer / different set should pass their own
`functions` array to [createSqlExtensions](../functions/createSqlExtensions.md).
