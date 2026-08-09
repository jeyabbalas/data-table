[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DeepPartial

# Type Alias: DeepPartial\<T\>

> **DeepPartial**\<`T`\> = `T` *extends* (...`args`) => `unknown` ? `T` : `T` *extends* `object` ? `{ [K in keyof T]?: DeepPartial<T[K]> }` : `T`

Defined in: [core/Strings.ts:19](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/Strings.ts#L19)

Deep-partial helper for `messages` overrides. Every nested object becomes
optional; function-typed leaves are replaced wholesale (no partial
application).

## Type Parameters

### T

`T`
