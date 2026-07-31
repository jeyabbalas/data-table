[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / copyToClipboard

# Function: copyToClipboard()

> **copyToClipboard**(`data`, `format`): `Promise`\<`void`\>

Defined in: [export/Clipboard.ts:40](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/export/Clipboard.ts#L40)

Copy a string to the clipboard.

## Parameters

### data

`string`

The string to copy

### format

`"text"` \| `"html"`

`'text'` for plain text, `'html'` for rich HTML with plain-text fallback

**Browser size limits.** This function does not pre-check `data.length`.
`navigator.clipboard.writeText` typically caps payloads at ~10 MB
(Chromium) or smaller (Safari, Firefox); `ClipboardItem` HTML payloads
can be even smaller. The browser rejects oversized payloads with a
`DOMException` (often `NotAllowedError` or `DataError`), which propagates
to the caller. Consumers exporting large datasets should size-check
upstream — for example, cap `copyRowsToClipboard` at the visible
selection rather than the full dataset.

**HTML format.** When `format === 'html'`, the plain-text fallback is
computed by stripping `<...>` tags via regex. This is intentional and
lossy — embedded `<script>`/`<style>` content is removed wholesale, but
the trade-off keeps the function dependency-free.

**Insecure contexts.** `navigator.clipboard` is only available on HTTPS
(and `http://localhost`). On `http://` outside localhost, this function
rejects with the browser's underlying `TypeError` /
`DOMException`.

## Returns

`Promise`\<`void`\>
