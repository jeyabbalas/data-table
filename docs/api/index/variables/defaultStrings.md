[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / defaultStrings

# Variable: defaultStrings

> `const` **defaultStrings**: [`Strings`](../interfaces/Strings.md)

Defined in: [core/Strings.ts:433](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/core/Strings.ts#L433)

Default English strings for every user-facing label, placeholder, ARIA
announcement, and stats template. Pass `messages: DeepPartial<Strings>` to
[createDataTable](../functions/createDataTable.md) to override any subtree; missing keys fall back to
these defaults via [mergeStrings](../functions/mergeStrings.md). Messages are resolved once at
construction — recreate the table to switch locales at runtime.
