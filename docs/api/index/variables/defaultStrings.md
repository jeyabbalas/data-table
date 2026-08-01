[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / defaultStrings

# Variable: defaultStrings

> `const` **defaultStrings**: [`Strings`](../interfaces/Strings.md)

Defined in: [core/Strings.ts:458](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/core/Strings.ts#L458)

Default English strings for every user-facing label, placeholder, ARIA
announcement, and stats template. Pass `messages: DeepPartial<Strings>` to
[createDataTable](../functions/createDataTable.md) to override any subtree; missing keys fall back to
these defaults via [mergeStrings](../functions/mergeStrings.md). Messages are resolved once at
construction — recreate the table to switch locales at runtime.
