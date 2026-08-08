[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / PatternFilter

# Interface: PatternFilter

Defined in: [filters/FilterTypes.ts:76](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L76)

String-pattern filter on a categorical column. The [mode](#mode) value picks
the comparison: `contains` / `starts` / `ends` use case-insensitive
substring matching; `regex` runs the pattern through DuckDB's RE2 engine
(linear-time, ReDoS-resistant). The `pattern` field is a literal user
string; SQL escaping is handled internally.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:78](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L78)

***

### mode

> **mode**: `"contains"` \| `"regex"` \| `"starts"` \| `"ends"`

Defined in: [filters/FilterTypes.ts:80](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L80)

***

### pattern

> **pattern**: `string`

Defined in: [filters/FilterTypes.ts:79](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L79)

***

### type

> **type**: `"pattern"`

Defined in: [filters/FilterTypes.ts:77](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterTypes.ts#L77)
