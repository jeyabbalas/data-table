[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBJsonTypeNode

# Interface: DuckDBJsonTypeNode

Defined in: [core/duckdbType.ts:59](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L59)

DuckDB's `JSON` type: text the json extension knows to be JSON.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

parseDuckDBType('JSON').kind; // 'json'
parseDuckDBType('JSON[]').kind; // 'list', of 'json'
```

## Properties

### kind

> `readonly` **kind**: `"json"`

Defined in: [core/duckdbType.ts:60](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L60)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:61](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L61)
