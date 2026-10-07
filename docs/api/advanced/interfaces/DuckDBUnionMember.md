[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBUnionMember

# Interface: DuckDBUnionMember

Defined in: [core/duckdbType.ts:193](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L193)

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

Defined in: [core/duckdbType.ts:194](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L194)

***

### type

> `readonly` **type**: [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:195](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L195)
