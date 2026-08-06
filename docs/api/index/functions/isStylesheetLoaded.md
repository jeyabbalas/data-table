[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / isStylesheetLoaded

# Function: isStylesheetLoaded()

> **isStylesheetLoaded**(`root?`): `boolean`

Defined in: [core/stylesheet.ts:24](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/stylesheet.ts#L24)

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
