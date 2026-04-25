[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SetFilter

# Interface: SetFilter

Defined in: [filters/FilterTypes.ts:27](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L27)

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:29](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L29)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [filters/FilterTypes.ts:32](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L32)

When true, NULL rows are included (generates `col IN (...) OR col IS NULL`).

***

### type

> **type**: `"set"`

Defined in: [filters/FilterTypes.ts:28](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L28)

***

### values

> **values**: `unknown`[]

Defined in: [filters/FilterTypes.ts:30](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L30)
