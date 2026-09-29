[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / CSVSourceOptions

# Interface: CSVSourceOptions

Defined in: [data/sourceOptions.ts:9](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L9)

How a CSV source is read. DuckDB detects whatever is left out.

## Properties

### delimiter?

> `optional` **delimiter?**: `string`

Defined in: [data/sourceOptions.ts:11](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L11)

The character between fields: one character (one UTF-16 code unit),
not a line break or NUL. Default: detected.

***

### header?

> `optional` **header?**: `boolean`

Defined in: [data/sourceOptions.ts:13](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L13)

Whether the first row holds the column names. Default: detected.

***

### nullValues?

> `optional` **nullValues?**: readonly `string`[]

Defined in: [data/sourceOptions.ts:26](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L26)

Field values read as NULL. They replace DuckDB's default, under which
only an empty field is NULL: include `''` to keep that. None may hold a
NUL character.

***

### sampleSize?

> `optional` **sampleSize?**: `number`

Defined in: [data/sourceOptions.ts:19](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L19)

Rows DuckDB reads to detect the dialect and the column types, or `-1`
for every row. Default: DuckDB's, 20,480. A value that does not fit the
type detected from the rows read fails the load.

***

### skip?

> `optional` **skip?**: `number`

Defined in: [data/sourceOptions.ts:21](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L21)

Lines to skip at the start of the file, before the header. Default: 0.
