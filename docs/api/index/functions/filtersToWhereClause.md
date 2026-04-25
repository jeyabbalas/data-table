[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / filtersToWhereClause

# Function: filtersToWhereClause()

> **filtersToWhereClause**(`filters`, `excludeColumn?`): `string`

Defined in: [filters/FilterSQL.ts:173](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterSQL.ts#L173)

Convert an array of filters to a SQL WHERE clause

## Parameters

### filters

[`Filter`](../type-aliases/Filter.md)[]

Array of filters to convert

### excludeColumn?

`string`

Optional column name to exclude from the WHERE clause
                       (used for crossfilter behavior)

## Returns

`string`

SQL WHERE clause (without the WHERE keyword), or empty string if no filters
