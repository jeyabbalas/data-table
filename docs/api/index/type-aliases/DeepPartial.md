[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DeepPartial

# Type Alias: DeepPartial\<T\>

> **DeepPartial**\<`T`\> = `T` *extends* (...`args`) => `unknown` ? `T` : `T` *extends* `object` ? `{ [K in keyof T]?: DeepPartial<T[K]> }` : `T`

Defined in: [core/Strings.ts:19](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/Strings.ts#L19)

Deep-partial helper for `messages` overrides. Every nested object becomes
optional; function-typed leaves are replaced wholesale (no partial
application).

## Type Parameters

### T

`T`
