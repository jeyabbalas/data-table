[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBScalarTypeNode

# Interface: DuckDBScalarTypeNode

Defined in: [core/duckdbType.ts:18](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L18)

A scalar type: a number, text, a date, a BLOB, an ENUM, …

## Properties

### args

> `readonly` **args**: readonly `string`[]

Defined in: [core/duckdbType.ts:29](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L29)

The arguments as written, outer parentheses removed and split at the
commas between them: `['18', '4']` for `DECIMAL(18,4)`, `["'it''s'",
"'y,z'"]` for an ENUM. Empty when there are none.

***

### dataType

> `readonly` **dataType**: `"string"` \| `"boolean"` \| `"integer"` \| `"float"` \| `"decimal"` \| `"uuid"` \| `"date"` \| `"timestamp"` \| `"time"` \| `"interval"`

Defined in: [core/duckdbType.ts:31](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L31)

The library's type for it. Never `'nested'`.

***

### kind

> `readonly` **kind**: `"scalar"`

Defined in: [core/duckdbType.ts:19](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L19)

***

### name

> `readonly` **name**: `string`

Defined in: [core/duckdbType.ts:23](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L23)

Upper case, without arguments: `DECIMAL`, `TIMESTAMP WITH TIME ZONE`, `ENUM`.

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:21](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L21)

The type as written, arguments included: `DECIMAL(18,4)`.
