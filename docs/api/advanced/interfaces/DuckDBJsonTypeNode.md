[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBJsonTypeNode

# Interface: DuckDBJsonTypeNode

Defined in: [core/duckdbType.ts:59](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L59)

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

Defined in: [core/duckdbType.ts:60](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L60)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:61](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/duckdbType.ts#L61)
