[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / CSVSourceOptions

# Interface: CSVSourceOptions

Defined in: [data/sourceOptions.ts:10](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/sourceOptions.ts#L10)

How a CSV source is read. DuckDB detects whatever is left out.

## Properties

### delimiter?

> `optional` **delimiter?**: `string`

Defined in: [data/sourceOptions.ts:15](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/sourceOptions.ts#L15)

The character between fields: one character (one UTF-16 code unit),
not a line break or NUL. Default: detected.

***

### header?

> `optional` **header?**: `boolean`

Defined in: [data/sourceOptions.ts:17](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/sourceOptions.ts#L17)

Whether the first row holds the column names. Default: detected.

***

### nullValues?

> `optional` **nullValues?**: readonly `string`[]

Defined in: [data/sourceOptions.ts:31](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/sourceOptions.ts#L31)

Field values read as NULL. They replace DuckDB's default, under which
only an empty field is NULL: include `''` to keep that. None may hold a
NUL character.

***

### sampleSize?

> `optional` **sampleSize?**: `number`

Defined in: [data/sourceOptions.ts:23](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/sourceOptions.ts#L23)

Rows DuckDB reads to detect the dialect and the column types, or `-1`
for every row. Default: DuckDB's, 20,480. A value that does not fit the
type detected from the rows read fails the load.

***

### skip?

> `optional` **skip?**: `number`

Defined in: [data/sourceOptions.ts:25](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/sourceOptions.ts#L25)

Lines to skip at the start of the file, before the header. Default: 0.
