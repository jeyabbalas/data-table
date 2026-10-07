[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DuckDBVariantTypeNode

# Interface: DuckDBVariantTypeNode

Defined in: [core/duckdbType.ts:74](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L74)

DuckDB's `VARIANT` type, whose every value carries a type of its own.

## Example

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

parseDuckDBType('VARIANT').kind; // 'variant'
```

## Properties

### kind

> `readonly` **kind**: `"variant"`

Defined in: [core/duckdbType.ts:75](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L75)

***

### sqlType

> `readonly` **sqlType**: `string`

Defined in: [core/duckdbType.ts:76](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/duckdbType.ts#L76)
