[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBArrayTypeNode

# Interface: DuckDBArrayTypeNode

Defined in: [core/duckdbType.ts:110](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L110)

A fixed-size ARRAY: `FLOAT[768]`.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('FLOAT[768]');
if (node.kind === 'array') {
  node.size; // 768
  node.element.sqlType; // 'FLOAT'
}
```

## Properties

### element

> `readonly` **element**: [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:114](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L114)

***

### kind

> `readonly` **kind**: `"array"`

Defined in: [core/duckdbType.ts:111](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L111)

***

### size

> `readonly` **size**: `number`

Defined in: [core/duckdbType.ts:113](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L113)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:112](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L112)
