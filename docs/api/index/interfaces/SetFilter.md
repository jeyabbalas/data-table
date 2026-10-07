[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SetFilter

# Interface: SetFilter

Defined in: [filters/FilterTypes.ts:69](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterTypes.ts#L69)

Set-membership filter (`column IN (values)`). The [includeNull](#includenull) flag
widens the predicate to include NULL rows.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:71](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterTypes.ts#L71)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [filters/FilterTypes.ts:74](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterTypes.ts#L74)

When true, NULL rows are included (generates `col IN (...) OR col IS NULL`).

***

### type

> **type**: `"set"`

Defined in: [filters/FilterTypes.ts:70](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterTypes.ts#L70)

***

### values

> **values**: `unknown`[]

Defined in: [filters/FilterTypes.ts:72](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterTypes.ts#L72)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [filters/FilterTypes.ts:89](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterTypes.ts#L89)

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
