[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBStructTypeNode

# Interface: DuckDBStructTypeNode

Defined in: [core/duckdbType.ts:155](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/duckdbType.ts#L155)

A STRUCT: `STRUCT(x DOUBLE, y DOUBLE)`.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('STRUCT(x DOUBLE, tags VARCHAR[])');
if (node.kind === 'struct') {
  node.fields.map((f) => `${f.name}: ${f.type.kind}`); // ['x: scalar', 'tags: list']
}
```

## Properties

### fields

> `readonly` **fields**: readonly [`DuckDBStructField`](DuckDBStructField.md)[]

Defined in: [core/duckdbType.ts:158](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/duckdbType.ts#L158)

***

### kind

> `readonly` **kind**: `"struct"`

Defined in: [core/duckdbType.ts:156](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/duckdbType.ts#L156)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:157](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/duckdbType.ts#L157)
