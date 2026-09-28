/**
 * The fix for duckdb-wasm's `openFile` above 2 GiB (src/worker/openFileFix.ts).
 *
 * The fake runtime here answers as duckdb-wasm's does, writing the opened
 * file's size, buffer pointer and modification time through
 * `mod.HEAPF64[(ptr >> 3) + i]`. The fake heap drops a write at a negative
 * index, as a Float64Array does, and holds any other index, so a pointer
 * past 2 GiB needs no 4 GiB array. The browser test in
 * tests/browser/parquet-file-load.spec.ts runs the real runtime.
 */

import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { duckdbWorkerSource, installOpenFileFix } from '../../src/worker/openFileFix';

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

function answer(mod: FakeModule, pointer: number): unknown[] {
  const heap = mod.HEAPF64;
  return [heap[pointer >>> 3], heap[(pointer >>> 3) + 1], heap[(pointer >>> 3) + 2]];
}

describe('installOpenFileFix', () => {
  it('shows the bug: an answer past 2 GiB is lost without the fix', () => {
    const mod = fakeModule(ABOVE_2_GIB);
    fakeRuntime().openFile(mod, 1, 1);
    expect(answer(mod, ABOVE_2_GIB)).toEqual([0, 0, 0]);
  });

  it('puts an answer past 2 GiB where DuckDB reads it', () => {
    const scope: { DUCKDB_RUNTIME?: unknown } = {};
    installOpenFileFix(scope);
    // duckdb-wasm publishes its runtime once the WebAssembly module is instantiated.
    scope.DUCKDB_RUNTIME = fakeRuntime();
    const mod = fakeModule(ABOVE_2_GIB);

    const pointer = (scope.DUCKDB_RUNTIME as ReturnType<typeof fakeRuntime>).openFile(mod, 1, 1);

    expect(pointer).toBe(ABOVE_2_GIB);
    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });

  it('fixes a runtime published before it is installed', () => {
    const scope: { DUCKDB_RUNTIME?: unknown } = { DUCKDB_RUNTIME: fakeRuntime() };
    installOpenFileFix(scope);
    const mod = fakeModule(ABOVE_2_GIB);

    (scope.DUCKDB_RUNTIME as ReturnType<typeof fakeRuntime>).openFile(mod, 1, 1);

    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });

  it('leaves an answer below 2 GiB where it was', () => {
    const scope: { DUCKDB_RUNTIME?: unknown } = {};
    installOpenFileFix(scope);
    scope.DUCKDB_RUNTIME = fakeRuntime();
    const mod = fakeModule(4096);

    (scope.DUCKDB_RUNTIME as ReturnType<typeof fakeRuntime>).openFile(mod, 1, 1);

    expect(answer(mod, 4096)).toEqual([SIZE, 0, 1]);
  });

  it('follows the heap when the call grows it, and leaves the new heap in place', () => {
    const scope: { DUCKDB_RUNTIME?: unknown } = {};
    installOpenFileFix(scope);
    scope.DUCKDB_RUNTIME = fakeRuntime();
    const grown = fakeHeap();
    // Emscripten replaces its views when malloc grows the heap.
    const mod = fakeModule(ABOVE_2_GIB, (m) => {
      m.HEAPF64 = grown;
    });

    (scope.DUCKDB_RUNTIME as ReturnType<typeof fakeRuntime>).openFile(mod, 1, 1);

    expect(mod.HEAPF64).toBe(grown);
    expect(Object.getOwnPropertyDescriptor(mod, 'HEAPF64')).toMatchObject({
      value: grown,
      writable: true,
    });
    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });

  it('gives back the module its own heap after the call', () => {
    const scope: { DUCKDB_RUNTIME?: unknown } = {};
    installOpenFileFix(scope);
    scope.DUCKDB_RUNTIME = fakeRuntime();
    const mod = fakeModule(ABOVE_2_GIB);
    const heap = mod.HEAPF64;

    (scope.DUCKDB_RUNTIME as ReturnType<typeof fakeRuntime>).openFile(mod, 1, 1);

    expect(mod.HEAPF64).toBe(heap);
    expect(Object.getOwnPropertyDescriptor(mod, 'HEAPF64')).toMatchObject({ writable: true });
  });

  it('gives the heap’s methods the heap itself', () => {
    const scope: { DUCKDB_RUNTIME?: unknown } = {};
    installOpenFileFix(scope);
    const heap = new Float64Array(8);
    const mod = { HEAPF64: heap };
    scope.DUCKDB_RUNTIME = {
      openFile: (m: { HEAPF64: Float64Array }) => m.HEAPF64.subarray(2, 4).length,
    };

    const length = (scope.DUCKDB_RUNTIME as { openFile(m: unknown): number }).openFile(mod);

    expect(length).toBe(2);
  });

  it('wraps a runtime once, however often it is published', () => {
    const scope: { DUCKDB_RUNTIME?: unknown } = {};
    installOpenFileFix(scope);
    const runtime = fakeRuntime();
    scope.DUCKDB_RUNTIME = runtime;
    const wrapped = runtime.openFile;
    scope.DUCKDB_RUNTIME = runtime;

    expect(runtime.openFile).toBe(wrapped);
    runtime.openFile(fakeModule(ABOVE_2_GIB), 1, 1);
    expect(runtime.opened).toBe(1);
  });
});

describe('duckdbWorkerSource', () => {
  it('loads duckdb-wasm’s worker, then installs the fix on its own', () => {
    const imported: string[] = [];
    const mod = fakeModule(ABOVE_2_GIB);
    const context: Record<string, unknown> = {
      importScripts: (url: string) => imported.push(url),
      runtime: fakeRuntime(),
      mod,
    };
    const url = 'https://cdn.example/duckdb-browser-eh.worker.js';

    // A fresh global: the fix is source text there, with nothing of this module around it.
    runInNewContext(duckdbWorkerSource(url), context);
    runInNewContext(
      'globalThis.DUCKDB_RUNTIME = runtime; DUCKDB_RUNTIME.openFile(mod, 1, 1);',
      context,
    );

    expect(imported).toEqual([url]);
    expect(answer(mod, ABOVE_2_GIB)).toEqual([SIZE, 0, 1]);
  });
});
