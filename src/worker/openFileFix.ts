/**
 * A fix for duckdb-wasm's browser runtime, installed in DuckDB's own worker.
 *
 * When DuckDB opens a file, duckdb-wasm's runtime answers in 24 bytes it
 * allocates in DuckDB's heap: the file's size, a buffer pointer and a
 * modification time, written as `mod.HEAPF64[(ptr >> 3) + i]`. `>>` is a
 * signed shift. Once the heap has grown past 2 GiB, which a few large
 * tables take it to, malloc can return an address above it; the index is
 * then negative, the writes go nowhere, and DuckDB reads the fresh memory as
 * a file of 0 bytes. A Parquet File then fails to load with "too small to be
 * a Parquet file" or "Prefetch registered for bytes outside file … file
 * size: 0", and so does every load after it. The runtime on duckdb-wasm's
 * main branch still shifts this way.
 *
 * The fix itself is openFileFixScript.js, which DuckDB's worker runs as its
 * text: no bundler can rewrite it there, so the text the tests run is the
 * text that ships.
 *
 * duckdb-wasm shifts the same way in two places the library never reaches:
 * the result of a scalar UDF, `HEAPF64[(response >> 3) + i]` in
 * `udf_runtime.ts` (the library registers no UDFs), and the pointer array
 * `dropFiles` builds in `bindings_base.ts` (the library only calls
 * `dropFile`). The `coi` bundle's pthread workers load their own script, so
 * they go without the fix.
 */

import OPEN_FILE_FIX from './openFileFixScript.js?raw';

/**
 * The script DuckDB's worker runs: duckdb-wasm's worker, then the fix. A
 * fix that cannot install itself, in a duckdb-wasm build it does not
 * expect, leaves DuckDB as it was, and says so in the worker's console.
 */
export function duckdbWorkerSource(mainWorkerUrl: string): string {
  return (
    `importScripts(${JSON.stringify(mainWorkerUrl)});\n` +
    `try {\n${OPEN_FILE_FIX}\n} catch (error) {\n` +
    `  console.warn('[data-table] DuckDB runs without the fix for files opened past 2 GiB of memory:', error);\n` +
    `}\n`
  );
}
