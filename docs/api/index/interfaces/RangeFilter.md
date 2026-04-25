[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / RangeFilter

# Interface: RangeFilter

Defined in: [filters/FilterTypes.ts:8](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L8)

Discriminated union types for filters

Replaces the old `{ type: string; value: unknown }` with proper
per-type interfaces so consumers get type-safe property access.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:10](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L10)

***

### max

> **max**: `string` \| `number` \| `Date`

Defined in: [filters/FilterTypes.ts:12](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L12)

***

### maxInclusive?

> `optional` **maxInclusive?**: `boolean`

Defined in: [filters/FilterTypes.ts:14](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L14)

When true, upper bound uses <= instead of <. Used for last histogram bin.

***

### min

> **min**: `string` \| `number` \| `Date`

Defined in: [filters/FilterTypes.ts:11](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L11)

***

### minExclusive?

> `optional` **minExclusive?**: `boolean`

Defined in: [filters/FilterTypes.ts:16](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L16)

When true, lower bound uses > instead of >=. Used for strict greater-than filters.

***

### type

> **type**: `"range"`

Defined in: [filters/FilterTypes.ts:9](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L9)

***

### valueType?

> `optional` **valueType?**: `"interval"`

Defined in: [filters/FilterTypes.ts:18](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterTypes.ts#L18)

Value type hint for SQL generation. When 'interval', values are prefixed with INTERVAL keyword.
