[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / PointFilter

# Interface: PointFilter

Defined in: [filters/FilterTypes.ts:31](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/filters/FilterTypes.ts#L31)

Equality filter (`column = value`). NULL is allowed as a literal value;
it generates `column IS NULL`.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:33](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/filters/FilterTypes.ts#L33)

***

### type

> **type**: `"point"`

Defined in: [filters/FilterTypes.ts:32](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/filters/FilterTypes.ts#L32)

***

### value

> **value**: `string` \| `number` \| `boolean` \| `Date` \| `null`

Defined in: [filters/FilterTypes.ts:34](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/filters/FilterTypes.ts#L34)
