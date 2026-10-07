[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBUnknownTypeNode

# Interface: DuckDBUnknownTypeNode

Defined in: [core/duckdbType.ts:228](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L228)

A type the parser could not read: text it does not understand, or nesting
deeper than `MAX_TYPE_DEPTH` (256) levels.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('STRUCT(a INTEGER');
node.kind; // 'unknown'
node.sqlType; // 'STRUCT(a INTEGER'
```

## Properties

### kind

> `readonly` **kind**: `"unknown"`

Defined in: [core/duckdbType.ts:229](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L229)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:230](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L230)
