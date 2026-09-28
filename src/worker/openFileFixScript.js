/*
 * Runs in DuckDB's worker, as written: duckdbWorkerSource (openFileFix.ts)
 * puts this text there, and says what it fixes. It cannot use anything but
 * itself and the worker's globals, and the unit tests run this same text.
 *
 * It wraps the `openFile` of duckdb-wasm's runtime. For the call, the
 * module's `HEAPF64` is a view that moves a write at a negative index to that
 * index plus 2^29, which is where `(ptr >> 3) + i` wrapped from for a pointer
 * past 2 GiB; if the call grows the heap, the view follows the new one. A
 * `HEAPF64` it cannot redefine leaves the call to duckdb-wasm as it is.
 *
 * The runtime is published as `DUCKDB_RUNTIME` when the WebAssembly module is
 * instantiated, after the worker's script has run, so the assignment is
 * hooked; and every read fixes a runtime not fixed yet, one published before
 * this ran, or published empty and filled in afterwards.
 */
(function installOpenFileFix(scope) {
  const fixed = new WeakSet();

  const fix = (runtime) => {
    if (!runtime || typeof runtime.openFile !== 'function' || fixed.has(runtime)) return;
    fixed.add(runtime);
    const openFile = runtime.openFile;
    runtime.openFile = (mod, ...args) => {
      const own = Object.getOwnPropertyDescriptor(mod, 'HEAPF64');
      let heap = mod.HEAPF64;
      // `(ptr >> 3) + i` for a pointer in [2^31, 2^32) is `(ptr >>> 3) + i - 2^29`.
      const unwrapped = (key) => {
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
            const value = Reflect.get(heap, key);
            return typeof value === 'function' ? value.bind(heap) : value;
          },
          set: (_target, key, value) => {
            const index = unwrapped(key);
            if (index === null) return Reflect.set(heap, key, value);
            heap[index] = value;
            return true;
          },
        },
      );
      const enumerable = own ? own.enumerable : true;
      try {
        Object.defineProperty(mod, 'HEAPF64', {
          configurable: true,
          enumerable,
          get: () => view,
          // Emscripten replaces its views when the heap grows.
          set: (next) => {
            heap = next;
          },
        });
      } catch {
        return openFile.apply(runtime, [mod, ...args]);
      }
      try {
        return openFile.apply(runtime, [mod, ...args]);
      } finally {
        Object.defineProperty(mod, 'HEAPF64', {
          configurable: true,
          enumerable,
          writable: true,
          value: heap,
        });
      }
    };
  };

  let runtime = scope.DUCKDB_RUNTIME;
  Object.defineProperty(scope, 'DUCKDB_RUNTIME', {
    configurable: true,
    enumerable: true,
    get: () => {
      fix(runtime);
      return runtime;
    },
    set: (value) => {
      runtime = value;
      fix(runtime);
    },
  });
})(globalThis);
