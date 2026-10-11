[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBTypeKind

# Type Alias: DuckDBTypeKind

> **DuckDBTypeKind** = [`DuckDBTypeNode`](DuckDBTypeNode.md)\[`"kind"`\]

Defined in: [core/duckdbType.ts:269](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/duckdbType.ts#L269)

The kinds of [DuckDBTypeNode](DuckDBTypeNode.md).

## Example

```ts
import { parseDuckDBType, type DuckDBTypeKind } from '@jeyabbalas/data-table/advanced';

const lists: readonly DuckDBTypeKind[] = ['list', 'array'];
lists.includes(parseDuckDBType('FLOAT[768]').kind); // true
```
