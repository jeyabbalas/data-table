[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / filtersToWhereClause

# Function: filtersToWhereClause()

> **filtersToWhereClause**(`filters`, `excludeColumn?`): `string`

Defined in: [filters/FilterSQL.ts:235](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/filters/FilterSQL.ts#L235)

Convert an array of filters to a SQL WHERE clause fragment.

Returns the predicates `AND`-joined **without** surrounding parentheses
— callers must wrap the result in `WHERE (...)` (or equivalent) when
concatenating with other predicates so operator precedence stays correct.

## Parameters

### filters

[`Filter`](../type-aliases/Filter.md)[]

Array of filters to convert.

### excludeColumn?

`string`

Optional column name to exclude from the WHERE
  clause (used for crossfilter behavior). Raw-SQL filters are never
  excluded — their synthetic column keys never match real columns.

## Returns

`string`

SQL fragment (no WHERE keyword), or empty string if no filters.

## Example

```ts
const where = filtersToWhereClause(filters);
const sql = where
  ? `SELECT * FROM ${tableId} WHERE ${where}`
  : `SELECT * FROM ${tableId}`;
```
