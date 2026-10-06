[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / PatternFilter

# Interface: PatternFilter

Defined in: [filters/FilterTypes.ts:136](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterTypes.ts#L136)

String-pattern filter on a categorical column. The [mode](#mode) value picks
the comparison: `contains` / `starts` / `ends` use case-insensitive
substring matching; `regex` runs the pattern through DuckDB's RE2 engine
(linear-time, ReDoS-resistant). The `pattern` field is a literal user
string; SQL escaping is handled internally.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:138](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterTypes.ts#L138)

***

### mode

> **mode**: `"contains"` \| `"regex"` \| `"starts"` \| `"ends"`

Defined in: [filters/FilterTypes.ts:140](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterTypes.ts#L140)

***

### pattern

> **pattern**: `string`

Defined in: [filters/FilterTypes.ts:139](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterTypes.ts#L139)

***

### type

> **type**: `"pattern"`

Defined in: [filters/FilterTypes.ts:137](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterTypes.ts#L137)
