[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DUCKDB\_FUNCTIONS

# Variable: DUCKDB\_FUNCTIONS

> `const` **DUCKDB\_FUNCTIONS**: readonly `string`[]

Defined in: [sql-editor/duckdbFunctions.ts:18](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/sql-editor/duckdbFunctions.ts#L18)

Names-only view of the curated DuckDB function list. Derived at module
load from [DUCKDB\_FUNCTION\_DETAILS](DUCKDB_FUNCTION_DETAILS.md) so the two cannot drift. Pass
to [createSqlExtensions](../functions/createSqlExtensions.md) via `options.functions` when only the
autocomplete name list is needed (no category chip / description panel).
