[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBTypeKind

# Type Alias: DuckDBTypeKind

> **DuckDBTypeKind** = [`DuckDBTypeNode`](DuckDBTypeNode.md)\[`"kind"`\]

Defined in: [core/duckdbType.ts:269](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/core/duckdbType.ts#L269)

The kinds of [DuckDBTypeNode](DuckDBTypeNode.md).

## Example

```ts
import { parseDuckDBType, type DuckDBTypeKind } from '@jeyabbalas/data-table/advanced';

const lists: readonly DuckDBTypeKind[] = ['list', 'array'];
lists.includes(parseDuckDBType('FLOAT[768]').kind); // true
```
