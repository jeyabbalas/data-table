[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DUCKDB\_FUNCTION\_DETAILS

# Variable: DUCKDB\_FUNCTION\_DETAILS

> `const` **DUCKDB\_FUNCTION\_DETAILS**: readonly [`DuckDBFunctionInfo`](../interfaces/DuckDBFunctionInfo.md)[]

Defined in: [sql-editor/duckdbFunctionDetails.ts:57](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/sql-editor/duckdbFunctionDetails.ts#L57)

Curated DuckDB function metadata array used to populate the autocomplete
`detail` (category chip) and `info` (one-line description) slots. Frozen
at load — apps that need a richer / different set should pass their own
`functions` array to [createSqlExtensions](../functions/createSqlExtensions.md).
