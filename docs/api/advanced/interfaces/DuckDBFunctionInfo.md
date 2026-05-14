[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBFunctionInfo

# Interface: DuckDBFunctionInfo

Defined in: [sql-editor/duckdbFunctionDetails.ts:42](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/sql-editor/duckdbFunctionDetails.ts#L42)

Single function entry: name, category, and one-line description.

## Properties

### category

> **category**: [`DuckDBFunctionCategory`](../type-aliases/DuckDBFunctionCategory.md)

Defined in: [sql-editor/duckdbFunctionDetails.ts:46](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/sql-editor/duckdbFunctionDetails.ts#L46)

Group used for the autocomplete `detail` chip.

***

### description

> **description**: `string`

Defined in: [sql-editor/duckdbFunctionDetails.ts:48](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/sql-editor/duckdbFunctionDetails.ts#L48)

One-line description shown in the autocomplete `info` panel.

***

### name

> **name**: `string`

Defined in: [sql-editor/duckdbFunctionDetails.ts:44](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/sql-editor/duckdbFunctionDetails.ts#L44)

Function identifier (lowercase, matches DuckDB resolution).
