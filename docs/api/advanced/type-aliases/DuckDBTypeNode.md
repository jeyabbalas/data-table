[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBTypeNode

# Type Alias: DuckDBTypeNode

> **DuckDBTypeNode** = [`DuckDBScalarTypeNode`](../interfaces/DuckDBScalarTypeNode.md) \| [`DuckDBJsonTypeNode`](../interfaces/DuckDBJsonTypeNode.md) \| [`DuckDBVariantTypeNode`](../interfaces/DuckDBVariantTypeNode.md) \| [`DuckDBListTypeNode`](../interfaces/DuckDBListTypeNode.md) \| [`DuckDBArrayTypeNode`](../interfaces/DuckDBArrayTypeNode.md) \| [`DuckDBStructTypeNode`](../interfaces/DuckDBStructTypeNode.md) \| [`DuckDBMapTypeNode`](../interfaces/DuckDBMapTypeNode.md) \| [`DuckDBUnionTypeNode`](../interfaces/DuckDBUnionTypeNode.md) \| [`DuckDBUnknownTypeNode`](../interfaces/DuckDBUnknownTypeNode.md)

Defined in: [core/duckdbType.ts:247](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L247)

A DuckDB type, as a tree. Every node keeps the text of its own type in
`sqlType`.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('STRUCT(x DOUBLE, tags VARCHAR[])');
if (node.kind === 'struct') {
  node.fields.map((f) => f.name); // ['x', 'tags']
}
```
