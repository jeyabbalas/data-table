[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / RawSQLFilter

# Interface: RawSQLFilter

Defined in: [filters/FilterTypes.ts:174](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L174)

Raw-SQL `WHERE`-clause fragment filter. Spliced verbatim into the active
query — see the trust-boundary note on [RawSQLFilter.sql](#sql).

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:176](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L176)

***

### id

> **id**: `string`

Defined in: [filters/FilterTypes.ts:194](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L194)

***

### label?

> `optional` **label?**: `string`

Defined in: [filters/FilterTypes.ts:193](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L193)

Human-readable label for the filter chip. Widened to allow explicit
`undefined` so call sites that pass through an optional caller-supplied
label don't have to conditionally spread.

***

### sql

> **sql**: `string`

Defined in: [filters/FilterTypes.ts:187](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L187)

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

Defined in: [filters/FilterTypes.ts:175](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L175)
