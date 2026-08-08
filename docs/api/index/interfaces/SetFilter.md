[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SetFilter

# Interface: SetFilter

Defined in: [filters/FilterTypes.ts:41](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L41)

Set-membership filter (`column IN (values)`). The [includeNull](#includenull) flag
widens the predicate to include NULL rows.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:43](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L43)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [filters/FilterTypes.ts:46](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L46)

When true, NULL rows are included (generates `col IN (...) OR col IS NULL`).

***

### type

> **type**: `"set"`

Defined in: [filters/FilterTypes.ts:42](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L42)

***

### values

> **values**: `unknown`[]

Defined in: [filters/FilterTypes.ts:44](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L44)
