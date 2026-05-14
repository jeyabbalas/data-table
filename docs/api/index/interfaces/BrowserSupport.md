[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / BrowserSupport

# Interface: BrowserSupport

Defined in: [core/checkBrowserSupport.ts:14](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/core/checkBrowserSupport.ts#L14)

Result of [checkBrowserSupport](../functions/checkBrowserSupport.md).

## Properties

### missing

> **missing**: `string`[]

Defined in: [core/checkBrowserSupport.ts:18](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/core/checkBrowserSupport.ts#L18)

Names of APIs that were probed and found missing. Empty when `supported`.

***

### supported

> **supported**: `boolean`

Defined in: [core/checkBrowserSupport.ts:16](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/core/checkBrowserSupport.ts#L16)

`true` if every probed API is present.
