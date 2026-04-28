[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / defaultStrings

# Variable: defaultStrings

> `const` **defaultStrings**: [`Strings`](../interfaces/Strings.md)

Defined in: [core/Strings.ts:433](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/Strings.ts#L433)

Default English strings for every user-facing label, placeholder, ARIA
announcement, and stats template. Pass `messages: DeepPartial<Strings>` to
[createDataTable](../functions/createDataTable.md) to override any subtree; missing keys fall back to
these defaults via [mergeStrings](../functions/mergeStrings.md). Messages are resolved once at
construction — recreate the table to switch locales at runtime.
