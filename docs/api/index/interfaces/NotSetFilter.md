[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / NotSetFilter

# Interface: NotSetFilter

Defined in: [filters/FilterTypes.ts:122](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L122)

Set-exclusion filter (`column NOT IN (values)`). Mirror of [SetFilter](SetFilter.md).

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:124](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L124)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [filters/FilterTypes.ts:127](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L127)

When true, NULL rows are included (generates `col NOT IN (...) OR col IS NULL`).

***

### type

> **type**: `"not-set"`

Defined in: [filters/FilterTypes.ts:123](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L123)

***

### values

> **values**: `unknown`[]

Defined in: [filters/FilterTypes.ts:125](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L125)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [filters/FilterTypes.ts:144](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L144)

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
