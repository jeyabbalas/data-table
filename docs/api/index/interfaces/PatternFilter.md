[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / PatternFilter

# Interface: PatternFilter

Defined in: [filters/FilterTypes.ts:163](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L163)

String-pattern filter on a categorical column. The [mode](#mode) value picks
the comparison: `contains` / `starts` / `ends` use case-insensitive
substring matching; `regex` runs the pattern through DuckDB's RE2 engine
(linear-time, ReDoS-resistant). The `pattern` field is a literal user
string; SQL escaping is handled internally.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:165](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L165)

***

### mode

> **mode**: `"contains"` \| `"regex"` \| `"starts"` \| `"ends"`

Defined in: [filters/FilterTypes.ts:167](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L167)

***

### pattern

> **pattern**: `string`

Defined in: [filters/FilterTypes.ts:166](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L166)

***

### type

> **type**: `"pattern"`

Defined in: [filters/FilterTypes.ts:164](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L164)
