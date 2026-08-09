[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / formatSQLValue

# Function: formatSQLValue()

> **formatSQLValue**(`value`): `string`

Defined in: [filters/FilterSQL.ts:61](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/filters/FilterSQL.ts#L61)

Format a JS value as a SQL literal for splicing into a query string.

Type handling:
 - `null` / `undefined` → `NULL`
 - `number` (finite)   → bare numeric literal (`42`, `-3.14`)
 - `number` (NaN/±∞)   → `NULL` (DuckDB has no NaN literal)
 - `bigint`            → bare numeric literal (`9223372036854775807`).
                         NOT quoted: BIGINT in DuckDB is numeric, and
                         quoting would force an implicit cast that is
                         fragile near the BIGINT range bounds.
 - `boolean`           → `TRUE` / `FALSE`
 - `Date`              → `'<ISO-8601>'`, single-quoted ISO string
 - everything else     → `'<String(value)>'` with single quotes doubled

Identifier-quoting (column/table names) lives in `quoteIdentifier`; this
function is exclusively for value literals.

## Parameters

### value

`unknown`

## Returns

`string`
