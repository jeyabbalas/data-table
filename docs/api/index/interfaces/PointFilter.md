[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / PointFilter

# Interface: PointFilter

Defined in: [filters/FilterTypes.ts:56](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterTypes.ts#L56)

Equality filter (`column = value`). NULL is allowed as a literal value;
it generates `column IS NULL`.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:58](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterTypes.ts#L58)

***

### type

> **type**: `"point"`

Defined in: [filters/FilterTypes.ts:57](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterTypes.ts#L57)

***

### value

> **value**: `string` \| `number` \| `boolean` \| `Date` \| `null`

Defined in: [filters/FilterTypes.ts:59](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterTypes.ts#L59)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [filters/FilterTypes.ts:87](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterTypes.ts#L87)

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
