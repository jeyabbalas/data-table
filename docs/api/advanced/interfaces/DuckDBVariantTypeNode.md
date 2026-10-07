[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBVariantTypeNode

# Interface: DuckDBVariantTypeNode

Defined in: [core/duckdbType.ts:74](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/core/duckdbType.ts#L74)

DuckDB's `VARIANT` type, whose every value carries a type of its own.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

parseDuckDBType('VARIANT').kind; // 'variant'
```

## Properties

### kind

> `readonly` **kind**: `"variant"`

Defined in: [core/duckdbType.ts:75](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/core/duckdbType.ts#L75)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:76](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/core/duckdbType.ts#L76)
