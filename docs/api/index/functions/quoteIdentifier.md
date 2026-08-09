[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / quoteIdentifier

# Function: quoteIdentifier()

> **quoteIdentifier**(`name`): `string`

Defined in: [filters/FilterSQL.ts:29](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/filters/FilterSQL.ts#L29)

Quote a SQL identifier (table/column name) for safe DuckDB use.

Wraps `name` in double quotes and escapes embedded double quotes by
doubling them (`a"b` → `"a""b"`). Surrogate pairs and non-ASCII Unicode
pass through unchanged — DuckDB stores identifiers as UTF-8 text.

Throws `SQLValidationError({ code: 'INVALID_IDENTIFIER' })` when:
 - `name` is the empty string (invalid SQL identifier), or
 - `name` contains an embedded NUL (`\0`) byte. NUL bytes truncate
   identifiers in some downstream tooling and have no legitimate use
   in a column or table name.

Other ASCII control characters (`\x01`–`\x1f`, `\x7f`) are NOT stripped
here: DuckDB will reject them at parse time if it dislikes them, and
stripping silently would mask whichever upstream layer produced them.

## Parameters

### name

`string`

## Returns

`string`
