[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / RangeFilter

# Interface: RangeFilter

Defined in: [filters/FilterTypes.ts:14](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L14)

Range (`min` ≤ x ≤ `max` by default) filter on a numeric, date, or interval
column. Bounds may be widened to strict comparisons via `maxInclusive` /
`minExclusive`. Constructed by histogram brushing or explicit
`actions.addFilter({ type: 'range', … })` calls.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:16](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L16)

***

### max

> **max**: `string` \| `number` \| `Date`

Defined in: [filters/FilterTypes.ts:18](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L18)

***

### maxInclusive?

> `optional` **maxInclusive?**: `boolean`

Defined in: [filters/FilterTypes.ts:20](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L20)

When true, upper bound uses <= instead of <. Used for last histogram bin.

***

### min

> **min**: `string` \| `number` \| `Date`

Defined in: [filters/FilterTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L17)

***

### minExclusive?

> `optional` **minExclusive?**: `boolean`

Defined in: [filters/FilterTypes.ts:22](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L22)

When true, lower bound uses > instead of >=. Used for strict greater-than filters.

***

### type

> **type**: `"range"`

Defined in: [filters/FilterTypes.ts:15](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L15)

***

### valueType?

> `optional` **valueType?**: `"interval"`

Defined in: [filters/FilterTypes.ts:24](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/filters/FilterTypes.ts#L24)

Value type hint for SQL generation. When 'interval', values are prefixed with INTERVAL keyword.
