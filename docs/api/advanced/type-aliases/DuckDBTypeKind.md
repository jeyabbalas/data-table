[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBTypeKind

# Type Alias: DuckDBTypeKind

> **DuckDBTypeKind** = [`DuckDBTypeNode`](DuckDBTypeNode.md)\[`"kind"`\]

Defined in: [core/duckdbType.ts:269](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L269)

The kinds of [DuckDBTypeNode](DuckDBTypeNode.md).

## Example

```ts
import { parseDuckDBType, type DuckDBTypeKind } from '@jeyabbalas/data-table/advanced';

const lists: readonly DuckDBTypeKind[] = ['list', 'array'];
lists.includes(parseDuckDBType('FLOAT[768]').kind); // true
```
