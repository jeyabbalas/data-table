[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / PointFilter

# Interface: PointFilter

Defined in: [filters/FilterTypes.ts:31](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/filters/FilterTypes.ts#L31)

Equality filter (`column = value`). NULL is allowed as a literal value;
it generates `column IS NULL`.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:33](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/filters/FilterTypes.ts#L33)

***

### type

> **type**: `"point"`

Defined in: [filters/FilterTypes.ts:32](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/filters/FilterTypes.ts#L32)

***

### value

> **value**: `string` \| `number` \| `boolean` \| `Date` \| `null`

Defined in: [filters/FilterTypes.ts:34](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/filters/FilterTypes.ts#L34)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [filters/FilterTypes.ts:62](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/filters/FilterTypes.ts#L62)

What the value is compared with. Left out, it is the column's value:
`"col" = 'x'`, where DuckDB reads the literal as the column's type.

`'text'` compares the column's DuckDB text instead,
`CAST("col" AS VARCHAR) = 'x'`, and takes the value as text (a number or
boolean by its `String()` form, a `Date` by its ISO string). This is how a
nested column (LIST, ARRAY, STRUCT, MAP, UNION, VARIANT) is matched
exactly: its text is what the grid shows, so the cell `[red, green]`
matches the value `'[red, green]'`. Compared as a value, the text would
be read as a list, struct or map, which fails with a Conversion Error on
text that does not read as one; a UNION would read it as one member only
(`0` finds the text `'0'` but not the integer `0`, though both show `0`);
and a VARIANT fails on any value of another type. The filter panel's
"exact" mode sets it on nested columns.

A `null` value still filters `"col" IS NULL`.

#### Example

```ts
// A VARCHAR[] column whose cell reads [red, green]
table.actions.addFilter({
  type: 'point',
  column: 'tags',
  value: '[red, green]',
  valueType: 'text',
});
```
