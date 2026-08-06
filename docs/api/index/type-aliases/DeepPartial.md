[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DeepPartial

# Type Alias: DeepPartial\<T\>

> **DeepPartial**\<`T`\> = `T` *extends* (...`args`) => `unknown` ? `T` : `T` *extends* `object` ? `{ [K in keyof T]?: DeepPartial<T[K]> }` : `T`

Defined in: [core/Strings.ts:19](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/core/Strings.ts#L19)

Deep-partial helper for `messages` overrides. Every nested object becomes
optional; function-typed leaves are replaced wholesale (no partial
application).

## Type Parameters

### T

`T`
