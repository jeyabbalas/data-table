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
 */

/**
 * Wrap the runtime's `openFile` so its answer lands where DuckDB reads it:
 * for the call, the module's `HEAPF64` is a view that moves a write at a
 * negative index to that index plus 2^29, which is where `(ptr >> 3) + i`
 * wrapped from. If the call grows the heap, the view follows the new one.
 *
 * DuckDB's worker publishes the runtime as `DUCKDB_RUNTIME` on its global
 * scope when it instantiates the WebAssembly module, after its script has
 * run, so this hooks that assignment. It is installed as source text (see
 * {@link duckdbWorkerSource}), so it must not use anything outside itself.
 */
export function installOpenFileFix(scope: { DUCKDB_RUNTIME?: unknown }): void {
  const fixed = new WeakSet<object>();
  const fix = (candidate: unknown): unknown => {
    const runtime = candidate as { openFile?: unknown } | null | undefined;
    if (!runtime || typeof runtime.openFile !== 'function' || fixed.has(runtime)) {
      return candidate;
    }
    fixed.add(runtime);
    const openFile = runtime.openFile as (...args: unknown[]) => unknown;
    runtime.openFile = (mod: Record<string, unknown>, ...args: unknown[]): unknown => {
      const own = Object.getOwnPropertyDescriptor(mod, 'HEAPF64');
      let heap = mod['HEAPF64'] as Float64Array;
      // `(ptr >> 3) + i` for a pointer in [2^31, 2^32) is `(ptr >>> 3) + i - 2^29`.
      const unwrapped = (key: string | symbol): number | null => {
        if (typeof key !== 'string') return null;
        const index = Number(key);
        return Number.isInteger(index) && index < 0 ? index + 0x20000000 : null;
      };
      const view = new Proxy(
        {},
        {
          get: (_target, key) => {
            const index = unwrapped(key);
            if (index !== null) return heap[index];
            const value: unknown = Reflect.get(heap, key);
            return typeof value === 'function' ? (value as () => unknown).bind(heap) : value;
          },
          set: (_target, key, value) => {
            const index = unwrapped(key);
            if (index === null) return Reflect.set(heap, key, value);
            heap[index] = value as number;
            return true;
          },
        },
      );
      Object.defineProperty(mod, 'HEAPF64', {
        configurable: true,
        enumerable: own?.enumerable ?? true,
        get: () => view,
        // Emscripten replaces its views when the heap grows.
        set: (next: Float64Array) => {
          heap = next;
        },
      });
      try {
        return openFile.apply(runtime, [mod, ...args]);
      } finally {
        Object.defineProperty(mod, 'HEAPF64', {
          configurable: true,
          enumerable: own?.enumerable ?? true,
          writable: true,
          value: heap,
        });
      }
    };
    return candidate;
  };

  let runtime = fix(scope.DUCKDB_RUNTIME);
  Object.defineProperty(scope, 'DUCKDB_RUNTIME', {
    configurable: true,
    enumerable: true,
    get: () => runtime,
    set: (value: unknown) => {
      runtime = fix(value);
    },
  });
}

/**
 * The script DuckDB's worker runs: duckdb-wasm's worker, then
 * {@link installOpenFileFix}.
 */
export function duckdbWorkerSource(mainWorkerUrl: string): string {
  return (
    `importScripts(${JSON.stringify(mainWorkerUrl)});\n` +
    `(${installOpenFileFix.toString()})(globalThis);\n`
  );
}
