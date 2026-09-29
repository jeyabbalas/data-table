/**
 * The fix for duckdb-wasm's `openFile` above 2 GiB (src/worker/openFileFix.ts).
 *
 * Every test runs the text that ships, `openFileFixScript.js` as imported
 * with `?raw`, in a fresh VM context, as DuckDB's worker does. The fake
 * runtime answers as duckdb-wasm's does, writing the opened file's size,
 * buffer pointer and modification time through `mod.HEAPF64[(ptr >> 3) + i]`.
 * The fake heap drops a write at a negative index, as a Float64Array does,
 * and holds any other index, so a pointer past 2 GiB needs no 4 GiB array.
 * The browser tests in tests/browser/parquet-file-load.spec.ts and
 * tests/browser/duckdb-worker-bootstrap.spec.ts run the real runtime.
 */

import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import OPEN_FILE_FIX from '../../src/worker/openFileFixScript.js?raw';
import { duckdbWorkerSource } from '../../src/worker/openFileFix';

const ABOVE_2_GIB = 2 ** 31 + 4096;
const SIZE = 387_603_633;

type Heap = Record<string | number, unknown>;

/** A heap that keeps writes at non-negative indices, and drops the rest as a Float64Array does. */
function fakeHeap(): Heap {
  const cells = new Map<number, number>();
  return new Proxy({} as Heap, {
    get: (_target, key) => {
      const index = typeof key === 'string' ? Number(key) : NaN;
      return Number.isInteger(index) && index >= 0 ? (cells.get(index) ?? 0) : undefined;
    },
    set: (_target, key, value) => {
      const index = typeof key === 'string' ? Number(key) : NaN;
      if (Number.isInteger(index) && index >= 0) cells.set(index, value as number);
      return true;
    },
  });
}

interface FakeModule {
  HEAPF64: Heap;
  _malloc(bytes: number): number;
}

function fakeModule(pointer: number, onMalloc?: (mod: FakeModule) => void): FakeModule {
  const mod: FakeModule = {
    HEAPF64: fakeHeap(),
    _malloc() {
      onMalloc?.(mod);
      return pointer;
    },
  };
  return mod;
}

/** Answers as duckdb-wasm's browser runtime does for a registered File. */
function fakeRuntime() {
  const runtime = {
    opened: 0,
    openFile(mod: FakeModule, _fileId: number, _flags: number): number {
      runtime.opened++;
      const m = mod._malloc(24);
      mod.HEAPF64[(m >> 3) + 0] = SIZE;
      mod.HEAPF64[(m >> 3) + 1] = 0;
      // Not what duckdb-wasm writes: a read back through the same index.
      mod.HEAPF64[(m >> 3) + 2] = (mod.HEAPF64[(m >> 3) + 0] as number) / SIZE;
      return m;
    },
  };
  return runtime;
}

type Runtime = ReturnType<typeof fakeRuntime>;

function answer(mod: FakeModule, pointer: number): unknown[] {
  const heap = mod.HEAPF64;
  return [heap[pointer >>> 3], heap[(pointer >>> 3) + 1], heap[(pointer >>> 3) + 2]];
}

/** A worker's global scope with the fix run in it, holding `globals` from before. */
function workerScope(globals: Record<string, unknown> = {}) {
  const scope = createContext(globals);
  runInContext(OPEN_FILE_FIX, scope);
  return scope;
}

/** Publish a runtime as duckdb-wasm does once its WebAssembly module is instantiated. */
function publish(scope: Record<string, unknown>, runtime: unknown): void {
  scope['published'] = runtime;
  runInContext('globalThis.DUCKDB_RUNTIME = published;', scope);
}

/** Open a file through the runtime the scope holds, as DuckDB's glue does. */
function open(scope: Record<string, unknown>, mod: FakeModule): unknown {
  scope['mod'] = mod;
  return runInContext('globalThis.DUCKDB_RUNTIME.openFile(mod, 1, 1)', scope);
}

describe('openFileFixScript', () => {
  it('shows the bug: an answer past 2 GiB is lost without the fix', () => {
    const mod = fakeModule(ABOVE_2_GIB);
    fakeRuntime().openFile(mod, 1, 1);
    expect(answer(mod, ABOVE_2_GIB)).toEqual([0, 0, 0]);
  });

  it('puts an answer past 2 GiB where DuckDB reads it', () => {
    const scope = workerScope();
    publish(scope, fakeRuntime());
    const mod = fakeModule(ABOVE_2_GIB);

    expect(open(scope, mod)).toBe(ABOVE_2_GIB);
    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });

  it('fixes a runtime published before the fix ran', () => {
    const scope = workerScope({ DUCKDB_RUNTIME: fakeRuntime() });
    const mod = fakeModule(ABOVE_2_GIB);

    open(scope, mod);

    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });

  it('fixes a runtime published empty and filled in afterwards', () => {
    const scope = workerScope();
    const runtime: Partial<Runtime> = {};
    publish(scope, runtime);
    Object.assign(runtime, fakeRuntime());
    const mod = fakeModule(ABOVE_2_GIB);

    open(scope, mod);

    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });

  it('leaves an answer below 2 GiB where it was', () => {
    const scope = workerScope();
    publish(scope, fakeRuntime());
    const mod = fakeModule(4096);

    open(scope, mod);

    expect(answer(mod, 4096)).toEqual([SIZE, 0, 1]);
  });

  it('follows the heap when the call grows it, and leaves the new heap in place', () => {
    const scope = workerScope();
    publish(scope, fakeRuntime());
    const grown = fakeHeap();
    // Emscripten replaces its views when malloc grows the heap.
    const mod = fakeModule(ABOVE_2_GIB, (m) => {
      m.HEAPF64 = grown;
    });

    open(scope, mod);

    expect(mod.HEAPF64).toBe(grown);
    expect(Object.getOwnPropertyDescriptor(mod, 'HEAPF64')).toMatchObject({
      value: grown,
      writable: true,
    });
    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });

  it('gives back the module its own heap after the call', () => {
    const scope = workerScope();
    publish(scope, fakeRuntime());
    const mod = fakeModule(ABOVE_2_GIB);
    const heap = mod.HEAPF64;

    open(scope, mod);

    expect(mod.HEAPF64).toBe(heap);
    expect(Object.getOwnPropertyDescriptor(mod, 'HEAPF64')).toMatchObject({ writable: true });
  });

  it('gives the heap’s methods the heap itself', () => {
    const scope = workerScope();
    publish(scope, {
      openFile: (m: { HEAPF64: Float64Array }) => m.HEAPF64.subarray(2, 4).length,
    });

    expect(open(scope, { HEAPF64: new Float64Array(8) } as unknown as FakeModule)).toBe(2);
  });

  it('wraps a runtime once, however often it is published or read', () => {
    const scope = workerScope();
    const runtime = fakeRuntime();
    publish(scope, runtime);
    const wrapped = runtime.openFile;
    publish(scope, runtime);
    open(scope, fakeModule(ABOVE_2_GIB));

    expect(runtime.openFile).toBe(wrapped);
    expect(runtime.opened).toBe(1);
  });

  it('leaves the call to duckdb-wasm when the module’s heap cannot be redefined', () => {
    const scope = workerScope();
    const runtime = fakeRuntime();
    publish(scope, runtime);
    const mod = fakeModule(4096);
    Object.defineProperty(mod, 'HEAPF64', { value: mod.HEAPF64, configurable: false });

    expect(open(scope, mod)).toBe(4096);

    expect(runtime.opened).toBe(1);
    expect(answer(mod, 4096)).toEqual([SIZE, 0, 1]);
  });
  it('leaves the call to duckdb-wasm when the module cannot take a heap of its own', () => {
    const scope = workerScope();
    const runtime = fakeRuntime();
    publish(scope, runtime);
    // A module whose heap is inherited, and which takes no new properties.
    const mod = Object.preventExtensions(
      Object.create(
        { HEAPF64: fakeHeap() },
        { _malloc: { value: () => 4096, enumerable: true } },
      ) as FakeModule,
    );

    expect(open(scope, mod)).toBe(4096);

    expect(runtime.opened).toBe(1);
    expect(answer(mod, 4096)).toEqual([SIZE, 0, 1]);
  });

  it('says once that it runs without the fix when the module’s heap cannot be redefined', () => {
    const warnings: string[] = [];
    const scope = workerScope({
      console: { warn: (...args: unknown[]) => warnings.push(args.map(String).join(' ')) },
    });
    publish(scope, fakeRuntime());
    const frozen = () =>
      Object.preventExtensions(
        Object.create(
          { HEAPF64: fakeHeap() },
          { _malloc: { value: () => 4096, enumerable: true } },
        ) as FakeModule,
      );

    open(scope, frozen());
    open(scope, frozen());

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      '[data-table] DuckDB runs without the fix for files opened past 2 GiB of memory',
    );
  });

  it('puts an accessor HEAPF64 back as it was, and hands it a heap the call grew', () => {
    const scope = workerScope();
    publish(scope, fakeRuntime());
    const grown = fakeHeap();
    let current = fakeHeap();
    let sets = 0;
    const get = () => current;
    const set = (next: Heap) => {
      current = next;
      sets++;
    };
    const mod = {
      _malloc(this: FakeModule) {
        // Emscripten replaces its views when malloc grows the heap.
        this.HEAPF64 = grown;
        return ABOVE_2_GIB;
      },
    } as FakeModule;
    Object.defineProperty(mod, 'HEAPF64', { get, set, configurable: true, enumerable: false });

    open(scope, mod);

    expect(Object.getOwnPropertyDescriptor(mod, 'HEAPF64')).toEqual({
      get,
      set,
      configurable: true,
      enumerable: false,
    });
    expect(sets).toBe(1);
    expect(current).toBe(grown);
    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });

  it('leaves an inherited heap inherited', () => {
    const scope = workerScope();
    publish(scope, fakeRuntime());
    const mod = Object.create(
      { HEAPF64: fakeHeap() },
      { _malloc: { value: () => ABOVE_2_GIB, enumerable: true } },
    ) as FakeModule;

    open(scope, mod);

    expect(Object.getOwnPropertyDescriptor(mod, 'HEAPF64')).toBeUndefined();
    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });
});

describe('duckdbWorkerSource', () => {
  function worker() {
    const imported: string[] = [];
    const warnings: string[] = [];
    const scope = createContext({
      importScripts: (url: string) => imported.push(url),
      console: { warn: (...args: unknown[]) => warnings.push(args.map(String).join(' ')) },
    });
    return { scope, imported, warnings };
  }

  it('loads duckdb-wasm’s worker, then installs the fix', () => {
    const { scope, imported, warnings } = worker();
    const url = 'https://cdn.example/duckdb-browser-eh.worker.js';

    runInContext(duckdbWorkerSource(url), scope);
    publish(scope, fakeRuntime());
    const mod = fakeModule(ABOVE_2_GIB);
    open(scope, mod);

    expect(imported).toEqual([url]);
    expect(warnings).toEqual([]);
    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });

  it('leaves DuckDB as it was, with a warning, when the fix cannot install itself', () => {
    const { scope, warnings } = worker();
    // A duckdb-wasm build that publishes its runtime where it cannot be hooked.
    runInContext(
      'Object.defineProperty(globalThis, "DUCKDB_RUNTIME", { value: undefined, writable: true, configurable: false });',
      scope,
    );

    expect(() => runInContext(duckdbWorkerSource('duckdb.worker.js'), scope)).not.toThrow();
    publish(scope, fakeRuntime());
    const mod = fakeModule(4096);
    open(scope, mod);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('runs without the fix');
    expect(answer(mod, 4096)).toEqual([SIZE, 0, 1]);
  });
});
