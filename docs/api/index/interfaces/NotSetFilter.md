[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / NotSetFilter

# Interface: NotSetFilter

Defined in: [filters/FilterTypes.ts:95](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterTypes.ts#L95)

Set-exclusion filter (`column NOT IN (values)`). Mirror of [SetFilter](SetFilter.md).

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:97](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterTypes.ts#L97)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [filters/FilterTypes.ts:100](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterTypes.ts#L100)

When true, NULL rows are included (generates `col NOT IN (...) OR col IS NULL`).

***

### type

> **type**: `"not-set"`

Defined in: [filters/FilterTypes.ts:96](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterTypes.ts#L96)

***

### values

> **values**: `unknown`[]

Defined in: [filters/FilterTypes.ts:98](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterTypes.ts#L98)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [filters/FilterTypes.ts:117](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterTypes.ts#L117)

`'text'` compares the column's DuckDB text with the values, taken as
text: `CAST("col" AS VARCHAR) NOT IN (…)`. The `IS NULL` that
[includeNull](#includenull) adds still tests the column itself. See
[PointFilter.valueType](PointFilter.md#valuetype).

#### Example

```ts
// Every row but the empty lists, NULL rows included
table.actions.addFilter({
  type: 'not-set',
  column: 'tags',
  values: ['[]'],
  includeNull: true,
  valueType: 'text',
});
```
