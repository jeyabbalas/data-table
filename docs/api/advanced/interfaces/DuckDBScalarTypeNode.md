[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBScalarTypeNode

# Interface: DuckDBScalarTypeNode

Defined in: [core/duckdbType.ts:32](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L32)

A scalar type: a number, text, a date, a BLOB, an ENUM, …

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('DECIMAL(18,4)');
if (node.kind === 'scalar') {
  node.name; // 'DECIMAL'
  node.args; // ['18', '4']
  node.dataType; // 'decimal'
}
```

## Properties

### args

> `readonly` **args**: readonly `string`[]

Defined in: [core/duckdbType.ts:43](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L43)

The arguments as written, outer parentheses removed and split at the
commas between them: `['18', '4']` for `DECIMAL(18,4)`, `["'it''s'",
"'y,z'"]` for an ENUM. Empty when there are none.

***

### dataType

> `readonly` **dataType**: `"string"` \| `"boolean"` \| `"integer"` \| `"float"` \| `"decimal"` \| `"uuid"` \| `"date"` \| `"timestamp"` \| `"time"` \| `"interval"`

Defined in: [core/duckdbType.ts:45](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L45)

The library's type for it. Never `'nested'`.

***

### kind

> `readonly` **kind**: `"scalar"`

Defined in: [core/duckdbType.ts:33](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L33)

***

### name

> `readonly` **name**: `string`

Defined in: [core/duckdbType.ts:37](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L37)

Upper case, without arguments: `DECIMAL`, `TIMESTAMP WITH TIME ZONE`, `ENUM`.

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:35](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/core/duckdbType.ts#L35)

The type as written, arguments included: `DECIMAL(18,4)`.
