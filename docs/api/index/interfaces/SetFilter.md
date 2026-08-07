[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SetFilter

# Interface: SetFilter

Defined in: [filters/FilterTypes.ts:41](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L41)

Set-membership filter (`column IN (values)`). The [includeNull](#includenull) flag
widens the predicate to include NULL rows.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:43](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L43)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [filters/FilterTypes.ts:46](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L46)

When true, NULL rows are included (generates `col IN (...) OR col IS NULL`).

***

### type

> **type**: `"set"`

Defined in: [filters/FilterTypes.ts:42](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L42)

***

### values

> **values**: `unknown`[]

Defined in: [filters/FilterTypes.ts:44](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L44)
