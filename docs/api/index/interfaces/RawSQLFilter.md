[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / RawSQLFilter

# Interface: RawSQLFilter

Defined in: [filters/FilterTypes.ts:87](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L87)

Raw-SQL `WHERE`-clause fragment filter. Spliced verbatim into the active
query — see the trust-boundary note on [RawSQLFilter.sql](#sql).

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:89](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L89)

***

### id

> **id**: `string`

Defined in: [filters/FilterTypes.ts:107](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L107)

***

### label?

> `optional` **label?**: `string`

Defined in: [filters/FilterTypes.ts:106](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L106)

Human-readable label for the filter chip. Widened to allow explicit
`undefined` so call sites that pass through an optional caller-supplied
label don't have to conditionally spread.

***

### sql

> **sql**: `string`

Defined in: [filters/FilterTypes.ts:100](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L100)

SQL WHERE-clause fragment (no `WHERE` keyword).

**Trust boundary.** Spliced verbatim into the query when filters are
evaluated. The library validates parseability via DuckDB
(`actions.validateSQLFilter`) but does not constrain semantics —
subqueries, UNIONs, and CTEs that DuckDB accepts will run with the
library's data access. Treat as trusted developer input; sanitise
at the host application layer if end users author the SQL.

***

### type

> **type**: `"raw-sql"`

Defined in: [filters/FilterTypes.ts:88](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L88)
