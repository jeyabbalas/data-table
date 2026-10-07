[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBMapTypeNode

# Interface: DuckDBMapTypeNode

Defined in: [core/duckdbType.ts:175](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L175)

A MAP: `MAP(VARCHAR, INTEGER)`.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('MAP(DATE, INTEGER[])');
if (node.kind === 'map') {
  node.key.sqlType; // 'DATE'
  node.value.kind; // 'list'
}
```

## Properties

### key

> `readonly` **key**: [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:178](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L178)

***

### kind

> `readonly` **kind**: `"map"`

Defined in: [core/duckdbType.ts:176](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L176)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:177](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L177)

***

### value

> `readonly` **value**: [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:179](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L179)
