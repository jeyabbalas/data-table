[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DeepPartial

# Type Alias: DeepPartial\<T\>

> **DeepPartial**\<`T`\> = `T` *extends* (...`args`) => `unknown` ? `T` : `T` *extends* `object` ? `{ [K in keyof T]?: DeepPartial<T[K]> }` : `T`

Defined in: [core/Strings.ts:25](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/Strings.ts#L25)

Deep-partial helper for `messages` overrides. Every nested object becomes
optional; function-typed leaves are replaced wholesale (no partial
application) and keep their parameter types.

The leaf test is `(...args: never[]) => unknown`, which every function
type is assignable to. Under `strictFunctionTypes` parameters compare
contravariantly, so a test against `(...args: unknown[]) => unknown`
matches no function with a typed parameter, such as
`(count: number) => string`, and would turn that leaf into `{}`.

## Type Parameters

### T

`T`
