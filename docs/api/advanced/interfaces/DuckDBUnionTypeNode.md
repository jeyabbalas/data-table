[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBUnionTypeNode

# Interface: DuckDBUnionTypeNode

Defined in: [core/duckdbType.ts:209](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L209)

A UNION: `UNION(num INTEGER, str VARCHAR)`.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('UNION(num INTEGER, str VARCHAR)');
if (node.kind === 'union') node.members[1]!.type.sqlType; // 'VARCHAR'
```

## Properties

### kind

> `readonly` **kind**: `"union"`

Defined in: [core/duckdbType.ts:210](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L210)

***

### members

> `readonly` **members**: readonly [`DuckDBUnionMember`](DuckDBUnionMember.md)[]

Defined in: [core/duckdbType.ts:212](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L212)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:211](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L211)
