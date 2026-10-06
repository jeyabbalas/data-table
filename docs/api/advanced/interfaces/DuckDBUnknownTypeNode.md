[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBUnknownTypeNode

# Interface: DuckDBUnknownTypeNode

Defined in: [core/duckdbType.ts:100](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L100)

A type the parser could not read: text it does not understand, or nesting
deeper than `MAX_TYPE_DEPTH` (256) levels.

## Properties

### kind

> `readonly` **kind**: `"unknown"`

Defined in: [core/duckdbType.ts:101](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L101)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:102](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L102)
