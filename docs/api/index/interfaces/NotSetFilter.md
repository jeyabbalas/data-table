[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / NotSetFilter

# Interface: NotSetFilter

Defined in: [filters/FilterTypes.ts:52](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterTypes.ts#L52)

Set-exclusion filter (`column NOT IN (values)`). Mirror of [SetFilter](SetFilter.md).

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:54](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterTypes.ts#L54)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [filters/FilterTypes.ts:57](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterTypes.ts#L57)

When true, NULL rows are included (generates `col NOT IN (...) OR col IS NULL`).

***

### type

> **type**: `"not-set"`

Defined in: [filters/FilterTypes.ts:53](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterTypes.ts#L53)

***

### values

> **values**: `unknown`[]

Defined in: [filters/FilterTypes.ts:55](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterTypes.ts#L55)
