[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBTypeKind

# Type Alias: DuckDBTypeKind

> **DuckDBTypeKind** = [`DuckDBTypeNode`](DuckDBTypeNode.md)\[`"kind"`\]

Defined in: [core/duckdbType.ts:269](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L269)

The kinds of [DuckDBTypeNode](DuckDBTypeNode.md).

## Example

```ts
import { parseDuckDBType, type DuckDBTypeKind } from '@jeyabbalas/data-table/advanced';

const lists: readonly DuckDBTypeKind[] = ['list', 'array'];
lists.includes(parseDuckDBType('FLOAT[768]').kind); // true
```
