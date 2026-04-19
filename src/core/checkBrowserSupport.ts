/**
 * Sync feature detection for the browser APIs the library relies on.
 *
 * Pair with `strictBrowserCheck: true` on {@link createDataTable} for fail-
 * fast init, or call directly in a React/Vue guard before mounting. The
 * probes only cover APIs the library actually uses — not an exhaustive
 * modern-browser capability matrix.
 *
 * SSR-safe: every probe is a `typeof` guard, so importing this module on
 * the server (Node, Deno, Bun) does not throw.
 */

/** Result of {@link checkBrowserSupport}. */
export interface BrowserSupport {
  /** `true` if every probed API is present. */
  supported: boolean;
  /** Names of APIs that were probed and found missing. Empty when `supported`. */
  missing: string[];
}

/**
 * Probe every browser API the library requires and report what is missing.
 *
 * Probed:
 * - `Worker` — DuckDB runs in a dedicated worker.
 * - `WebAssembly` — DuckDB is compiled to Wasm.
 * - `indexedDB` — session persistence (filters, sort, columns, derived cols).
 *   Only used when `persistence !== false` on `createDataTable`, but probed
 *   unconditionally because the default is on.
 * - `ResizeObserver` — column-resize and visualization responsive layout.
 * - `BigInt` — DuckDB integer columns cross the worker boundary as BigInt.
 * - `structuredClone` — used by the bridge to snapshot result sets.
 *
 * @example
 * const { supported, missing } = checkBrowserSupport();
 * if (!supported) {
 *   alert('Your browser is missing: ' + missing.join(', '));
 * }
 */
export function checkBrowserSupport(): BrowserSupport {
  const missing: string[] = [];

  if (typeof Worker === 'undefined') missing.push('Worker');
  if (typeof WebAssembly === 'undefined') missing.push('WebAssembly');
  if (typeof indexedDB === 'undefined') missing.push('IndexedDB');
  if (typeof ResizeObserver === 'undefined') missing.push('ResizeObserver');
  if (typeof BigInt === 'undefined') missing.push('BigInt');
  if (typeof structuredClone === 'undefined') missing.push('structuredClone');

  return {
    supported: missing.length === 0,
    missing,
  };
}
