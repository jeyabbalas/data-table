[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DUCKDB\_FUNCTIONS

# Variable: DUCKDB\_FUNCTIONS

> `const` **DUCKDB\_FUNCTIONS**: readonly `string`[]

Defined in: [sql-editor/duckdbFunctions.ts:18](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/sql-editor/duckdbFunctions.ts#L18)

Names-only view of the curated DuckDB function list. Derived at module
load from [DUCKDB\_FUNCTION\_DETAILS](DUCKDB_FUNCTION_DETAILS.md) so the two cannot drift. Pass
to [createSqlExtensions](../functions/createSqlExtensions.md) via `options.functions` when only the
autocomplete name list is needed (no category chip / description panel).
