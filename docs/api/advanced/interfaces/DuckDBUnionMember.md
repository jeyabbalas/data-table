[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBUnionMember

# Interface: DuckDBUnionMember

Defined in: [core/duckdbType.ts:193](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L193)

One member of a UNION.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('UNION(num INTEGER, "my tag" VARCHAR)');
if (node.kind === 'union') node.members.map((m) => m.tag); // ['num', 'my tag']
```

## Properties

### tag

> `readonly` **tag**: `string`

Defined in: [core/duckdbType.ts:194](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L194)

***

### type

> `readonly` **type**: [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:195](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L195)
