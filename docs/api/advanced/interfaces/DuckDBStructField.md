[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBStructField

# Interface: DuckDBStructField

Defined in: [core/duckdbType.ts:62](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L62)

One field of a STRUCT.

## Properties

### name

> `readonly` **name**: `string` \| `null`

Defined in: [core/duckdbType.ts:64](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L64)

The field's name, `null` for an unnamed field (`STRUCT(INTEGER, VARCHAR)`).

***

### type

> `readonly` **type**: [`DuckDBTypeNode`](../type-aliases/DuckDBTypeNode.md)

Defined in: [core/duckdbType.ts:65](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L65)
