[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / JSONSourceOptions

# Interface: JSONSourceOptions

Defined in: [data/sourceOptions.ts:30](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L30)

How a JSON source is read. DuckDB detects whatever is left out.

## Properties

### format?

> `optional` **format?**: `"array"` \| `"ndjson"`

Defined in: [data/sourceOptions.ts:35](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L35)

`'array'` for one JSON array of objects, `'ndjson'` for one object per
line. Default: detected.

***

### maxDepth?

> `optional` **maxDepth?**: `number`

Defined in: [data/sourceOptions.ts:45](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L45)

How many levels of nested objects get types of their own. Values nested
deeper load as JSON text. Default: no limit.

***

### sampleSize?

> `optional` **sampleSize?**: `number`

Defined in: [data/sourceOptions.ts:40](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L40)

Objects DuckDB reads to detect the column types, or `-1` for every one.
Default: DuckDB's, 20,480.
