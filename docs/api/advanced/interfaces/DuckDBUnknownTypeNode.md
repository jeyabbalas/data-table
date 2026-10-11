[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBUnknownTypeNode

# Interface: DuckDBUnknownTypeNode

Defined in: [core/duckdbType.ts:228](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/duckdbType.ts#L228)

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

Defined in: [core/duckdbType.ts:229](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/duckdbType.ts#L229)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:230](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/duckdbType.ts#L230)
