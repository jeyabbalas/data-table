[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedNotSetFilter

# Interface: SerializedNotSetFilter

Defined in: [persistence/types.ts:65](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L65)

JSON-safe form of [NotSetFilter](NotSetFilter.md); values pass through `serializeValue`.

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:67](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L67)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [persistence/types.ts:69](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L69)

***

### type

> **type**: `"not-set"`

Defined in: [persistence/types.ts:66](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L66)

***

### values

> **values**: `unknown`[]

Defined in: [persistence/types.ts:68](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L68)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [persistence/types.ts:71](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/persistence/types.ts#L71)

As [NotSetFilter.valueType](NotSetFilter.md#valuetype): `'text'` compares the column's DuckDB text.
