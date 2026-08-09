[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / isStylesheetLoaded

# Function: isStylesheetLoaded()

> **isStylesheetLoaded**(`root?`): `boolean`

Defined in: [core/stylesheet.ts:24](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/core/stylesheet.ts#L24)

Return `true` if the library stylesheet is loaded in the document.

## Parameters

### root?

`HTMLElement`

Element to check. Defaults to `document.documentElement`. Pass
  the owning `.dt-root` if you shadow-root or scope styles differently; the
  sentinel is inherited from the document root so the default works for
  every standard deployment.

## Returns

`boolean`
