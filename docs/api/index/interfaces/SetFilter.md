[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SetFilter

# Interface: SetFilter

Defined in: [filters/FilterTypes.ts:94](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L94)

Set-membership filter (`column IN (values)`). The [includeNull](#includenull) flag
widens the predicate to include NULL rows.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:96](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L96)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [filters/FilterTypes.ts:99](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L99)

When true, NULL rows are included (generates `col IN (...) OR col IS NULL`).

***

### type

> **type**: `"set"`

Defined in: [filters/FilterTypes.ts:95](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L95)

***

### values

> **values**: `unknown`[]

Defined in: [filters/FilterTypes.ts:97](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L97)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [filters/FilterTypes.ts:114](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterTypes.ts#L114)

`'text'` compares the column's DuckDB text with the values, taken as
text: `CAST("col" AS VARCHAR) IN (…)`. The `IS NULL` that
[includeNull](#includenull) adds still tests the column itself. See
[PointFilter.valueType](PointFilter.md#valuetype).

#### Example

```ts
table.actions.addFilter({
  type: 'set',
  column: 'point',
  values: ["{'x': 1.25, 'y': 0.58, 'tier': bronze}", "{'x': 2.0, 'y': 1.5, 'tier': gold}"],
  valueType: 'text',
});
```
