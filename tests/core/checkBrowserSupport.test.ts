// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { checkBrowserSupport } from '@/core/checkBrowserSupport';

type GlobalKey =
  | 'Worker'
  | 'WebAssembly'
  | 'indexedDB'
  | 'ResizeObserver'
  | 'BigInt'
  | 'structuredClone';

type Probe = { key: GlobalKey; label: string };

const PROBES: Probe[] = [
  { key: 'Worker', label: 'Worker' },
  { key: 'WebAssembly', label: 'WebAssembly' },
  { key: 'indexedDB', label: 'IndexedDB' },
  { key: 'ResizeObserver', label: 'ResizeObserver' },
  { key: 'BigInt', label: 'BigInt' },
  { key: 'structuredClone', label: 'structuredClone' },
];

// Installs minimal stubs for any globals jsdom doesn't provide, so the baseline
// "all present" case is reproducible no matter which APIs happen to be exposed
// by the test environment's jsdom build.
function ensureStub(key: GlobalKey): () => void {
  const g = globalThis as unknown as Record<string, unknown>;
  const existed = key in g;
  const previous = g[key];
  if (!existed || previous === undefined) {
    g[key] = (() => {}) as unknown;
    return () => {
      if (existed) g[key] = previous;
      else delete g[key];
    };
  }
  return () => {
    // No-op — the global was already present.
  };
}

// Removes a single global; returns a restore function.
function removeGlobal(key: GlobalKey): () => void {
  const g = globalThis as unknown as Record<string, unknown>;
  const existed = key in g;
  const previous = g[key];
  delete g[key];
  return () => {
    if (existed) g[key] = previous;
  };
}

describe('checkBrowserSupport', () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  it('reports supported: true when every required API is present', () => {
    for (const { key } of PROBES) restores.push(ensureStub(key));

    const result = checkBrowserSupport();

    expect(result.supported).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it.each(PROBES)(
    'reports $label missing when the $key global is absent',
    ({ key, label }) => {
      for (const { key: k } of PROBES) restores.push(ensureStub(k));
      restores.push(removeGlobal(key));

      const result = checkBrowserSupport();

      expect(result.supported).toBe(false);
      expect(result.missing).toEqual([label]);
    },
  );

  it('aggregates multiple missing APIs in a single report', () => {
    for (const { key } of PROBES) restores.push(ensureStub(key));
    restores.push(removeGlobal('ResizeObserver'));
    restores.push(removeGlobal('structuredClone'));

    const result = checkBrowserSupport();

    expect(result.supported).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining(['ResizeObserver', 'structuredClone']),
    );
    expect(result.missing).toHaveLength(2);
  });
});
