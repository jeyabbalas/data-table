[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBMapTypeNode

# Interface: DuckDBMapTypeNode

Defined in: [core/duckdbType.ts:175](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L175)

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

Defined in: [core/duckdbType.ts:178](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L178)

***

### kind

> `readonly` **kind**: `"map"`

Defined in: [core/duckdbType.ts:176](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L176)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:177](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L177)

***

### value

> `readonly` **value**: [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:179](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L179)
