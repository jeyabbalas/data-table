[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / defaultStrings

# Variable: defaultStrings

> `const` **defaultStrings**: [`Strings`](../interfaces/Strings.md)

Defined in: [core/Strings.ts:495](https://github.com/jeyabbalas/data-table/blob/22d54ac8218eb0fa7175bf162920780da4351b59/src/core/Strings.ts#L495)

Default English strings for every user-facing label, placeholder, ARIA
announcement, and stats template. Pass `messages: DeepPartial<Strings>` to
[createDataTable](../functions/createDataTable.md) to override any subtree; missing keys fall back to
these defaults via [mergeStrings](../functions/mergeStrings.md). Messages are resolved once at
construction — recreate the table to switch locales at runtime.
