[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBJsonTypeNode

# Interface: DuckDBJsonTypeNode

Defined in: [core/duckdbType.ts:59](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/duckdbType.ts#L59)

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

Defined in: [core/duckdbType.ts:60](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/duckdbType.ts#L60)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:61](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/duckdbType.ts#L61)
