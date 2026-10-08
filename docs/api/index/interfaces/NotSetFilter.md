[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / NotSetFilter

# Interface: NotSetFilter

Defined in: [filters/FilterTypes.ts:120](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L120)

Set-exclusion filter (`column NOT IN (values)`). Mirror of [SetFilter](SetFilter.md).

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:122](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L122)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [filters/FilterTypes.ts:125](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L125)

When true, NULL rows are included (generates `col NOT IN (...) OR col IS NULL`).

***

### type

> **type**: `"not-set"`

Defined in: [filters/FilterTypes.ts:121](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L121)

***

### values

> **values**: `unknown`[]

Defined in: [filters/FilterTypes.ts:123](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L123)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [filters/FilterTypes.ts:142](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L142)

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
