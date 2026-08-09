[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / checkBrowserSupport

# Function: checkBrowserSupport()

> **checkBrowserSupport**(): [`BrowserSupport`](../interfaces/BrowserSupport.md)

Defined in: [core/checkBrowserSupport.ts:40](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/checkBrowserSupport.ts#L40)

Probe every browser API the library requires and report what is missing.

Probed:
- `Worker` — DuckDB runs in a dedicated worker.
- `WebAssembly` — DuckDB is compiled to Wasm.
- `indexedDB` — session persistence (filters, sort, columns, derived cols).
  Only used when `persistence !== false` on `createDataTable`, but probed
  unconditionally because the default is on.
- `ResizeObserver` — column-resize and visualization responsive layout.
- `BigInt` — DuckDB integer columns cross the worker boundary as BigInt.
- `structuredClone` — used by the bridge to snapshot result sets.

## Returns

[`BrowserSupport`](../interfaces/BrowserSupport.md)

## Example

```ts
const { supported, missing } = checkBrowserSupport();
if (!supported) {
  alert('Your browser is missing: ' + missing.join(', '));
}
```
