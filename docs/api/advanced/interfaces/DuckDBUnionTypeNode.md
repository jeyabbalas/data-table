[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBUnionTypeNode

# Interface: DuckDBUnionTypeNode

Defined in: [core/duckdbType.ts:90](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L90)

A UNION: `UNION(num INTEGER, str VARCHAR)`.

## Properties

### kind

> `readonly` **kind**: `"union"`

Defined in: [core/duckdbType.ts:91](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L91)

***

### members

> `readonly` **members**: readonly [`DuckDBUnionMember`](DuckDBUnionMember.md)[]

Defined in: [core/duckdbType.ts:93](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L93)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:92](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/duckdbType.ts#L92)
