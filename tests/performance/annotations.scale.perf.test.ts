/**
 * AnnotationStore at 1M annotations — wall-clock budgets and heap per
 * annotation.
 *
 * Opt in with `RUN_ANNOTATION_PERF=1` (`npm run test:perf` sets it): the
 * default run asserts counts, not time (see the scan guards and the large-
 * batch tests in `tests/annotations/`). Pure JS, no DuckDB.
 *
 * Fixture: 1M annotations, 90% cell / 9% row / 1% column, over 200K rows ×
 * 1,000 columns, seeded; messages from a pool of 100, ids generated.
 *
 * Measured on an M1 Pro, Node 22 (before → after the store's rewrite, which
 * replaced its insertion-order array and string-keyed indexes with one
 * insertion-ordered `Map` and per-scope buckets):
 *
 *   addMany(1M)                    4.95 s   → 0.77 s
 *   heap per annotation            572 B    → 258 B
 *   getByCell p50                  856 µs   → 2 µs
 *   getByRow / getByColumn p50     48 / 62 ms → 2 / 131 µs
 *   remove ×1 p50                  43.5 ms  → 6 µs
 *   removeMany ×100                5.4 s    → 0.45 ms
 *   toJSON                         237 ms   → 14 ms
 *   loadJSON('replace') onto 1M    3.0 s    → 0.65 s
 *   clear('all')                   RangeError → 0.1 ms (34 ms with a listener)
 *
 * Budgets allow for CI runners several times slower than an M1, plus noise.
 */

import { runInNewContext } from 'node:vm';
import { setFlagsFromString } from 'node:v8';
import { beforeAll, describe, expect, it } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import { createScopeSummary } from '@/annotations/severity';
import type { AnnotationChangePayload, NewAnnotation } from '@/annotations/types';

const RUN = process.env['RUN_ANNOTATION_PERF'] === '1';
const describeIfPerf = RUN ? describe : describe.skip;

const N = 1_000_000;
const ROWS = 200_000;
const COLS = 1_000;
const columns = Array.from({ length: COLS }, (_, i) => `col_${String(i).padStart(4, '0')}`);
const messages = Array.from({ length: 100 }, (_, i) => `Value violates rule ${i}`);

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fixture(n: number, seed: number): NewAnnotation[] {
  const rand = mulberry32(seed);
  const out = new Array<NewAnnotation>(n);
  for (let i = 0; i < n; i++) {
    const r = rand();
    const s = rand();
    const severity = s < 0.2 ? 'error' : s < 0.5 ? 'warning' : 'info';
    const message = messages[(rand() * 100) | 0]!;
    if (r < 0.9) {
      out[i] = {
        scope: 'cell',
        rowId: (rand() * ROWS) | 0,
        column: columns[(rand() * COLS) | 0]!,
        severity,
        message,
      };
    } else if (r < 0.99) {
      out[i] = { scope: 'row', rowId: (rand() * ROWS) | 0, severity, message };
    } else {
      out[i] = { scope: 'column', column: columns[(rand() * COLS) | 0]!, severity, message };
    }
  }
  return out;
}

function time<T>(fn: () => T): [number, T] {
  const t0 = performance.now();
  const result = fn();
  return [performance.now() - t0, result];
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[sorted.length >> 1]!;
}

/** `global.gc` when Node exposes it; else exposed the way Jest's leak detector does. */
function findGc(): (() => void) | undefined {
  const exposed = (globalThis as { gc?: () => void }).gc;
  if (exposed) return exposed;
  try {
    setFlagsFromString('--expose-gc');
    return runInNewContext('gc') as () => void;
  } catch {
    return undefined;
  }
}

describeIfPerf('AnnotationStore at 1M annotations (opt-in via RUN_ANNOTATION_PERF=1)', () => {
  let input: NewAnnotation[];
  let store: AnnotationStore;

  beforeAll(() => {
    input = fixture(N, 42);
    store = new AnnotationStore();
  });

  it('addMany(1M) < 4 s', () => {
    const [ms, added] = time(() => store.addMany(input));
    expect(added).toHaveLength(N);
    expect(ms).toBeLessThan(4_000);
  });

  it('heap per annotation < 340 B (40% under the 572 B it was)', (ctx) => {
    const gc = findGc();
    if (!gc) {
      ctx.skip();
      return;
    }
    const fresh = fixture(N, 43);
    gc();
    gc();
    const before = process.memoryUsage().heapUsed;
    const measured = new AnnotationStore();
    measured.addMany(fresh);
    fresh.length = 0;
    gc();
    gc();
    const perAnnotation = (process.memoryUsage().heapUsed - before) / N;
    expect(measured.count()).toBe(N);
    expect(perAnnotation).toBeLessThan(340);
  });

  it('lookups: getByCell / getByRow p50 < 50 µs, getByColumn p50 < 3 ms', () => {
    const rand = mulberry32(7);
    const cells: [number, string][] = [];
    for (let i = 0; i < 5_000; i++) {
      const a = input[(rand() * N) | 0]!;
      if (a.scope === 'cell') cells.push([a.rowId, a.column]);
    }
    const byCell = cells.map(([r, c]) => time(() => store.getByCell(r, c))[0]);
    store.getByRow(0); // builds the by-row index of cells once
    const byRow = cells.map(([r]) => time(() => store.getByRow(r))[0]);
    const byColumn = columns.slice(0, 100).map((c) => time(() => store.getByColumn(c))[0]);
    expect(median(byCell)).toBeLessThan(0.05);
    expect(median(byRow)).toBeLessThan(0.05);
    expect(median(byColumn)).toBeLessThan(3);
  });

  it('summaries and masks: < 2 µs per call on average', () => {
    const summary = createScopeSummary();
    const rand = mulberry32(9);
    const probes = Array.from(
      { length: 100_000 },
      () => [(rand() * ROWS) | 0, columns[(rand() * COLS) | 0]!] as const,
    );
    let sink = 0;
    const [ms] = time(() => {
      for (const [r, c] of probes) {
        sink += store.summarizeCellScope(r, c, summary).count;
        sink += store.summarizeRowScope(r, summary).count;
        sink += store.summarizeColumnScope(c, summary).count;
        sink += store.cellScopeMask(r, c);
      }
    });
    expect(sink).toBeGreaterThan(0);
    expect((ms * 1_000) / (probes.length * 4)).toBeLessThan(2);
    const [build] = time(() => store.annotatedRows());
    expect(build).toBeLessThan(1_000);
    const [lookups] = time(() => {
      for (const [r] of probes) sink += store.annotatedRowMask(r);
    });
    expect((lookups * 1_000) / probes.length).toBeLessThan(2);
  });

  it('remove ×1 p50 < 0.2 ms, removeMany(100) < 20 ms', () => {
    const ids = store.getAll().map((a) => a.id);
    const rand = mulberry32(11);
    const single = Array.from(
      { length: 21 },
      () => time(() => store.remove(ids[(rand() * ids.length) | 0]!))[0],
    );
    expect(median(single)).toBeLessThan(0.2);
    const batch = Array.from({ length: 100 }, () => ids[(rand() * ids.length) | 0]!);
    const [ms] = time(() => store.removeMany(batch));
    expect(ms).toBeLessThan(20);
  });

  it("toJSON < 300 ms; loadJSON('replace') onto 1M < 4 s, with a listener", () => {
    const [jsonMs, file] = time(() => store.toJSON());
    expect(file.annotations.length).toBeGreaterThan(N - 200);
    expect(jsonMs).toBeLessThan(300);
    const kinds: string[] = [];
    const off = store.on('change', (e: AnnotationChangePayload) => kinds.push(e.kind));
    const [loadMs] = time(() => store.loadJSON(file, 'replace'));
    off();
    expect(kinds).toEqual(['cleared', 'added']);
    expect(loadMs).toBeLessThan(4_000);
  });

  it("clear(scope) < 1 s each, and clear('all') < 1 s with a listener", () => {
    for (const scope of ['column', 'row', 'cell'] as const) {
      const fresh = new AnnotationStore();
      fresh.addMany(input);
      const [ms, removed] = time(() => fresh.clear(scope));
      expect(removed).toBeGreaterThan(0);
      expect(ms).toBeLessThan(1_000);
    }
    let received = 0;
    store.on('change', (e) => {
      received = e.ids.length;
    });
    const count = store.count();
    const [ms, removed] = time(() => store.clear('all'));
    expect(removed).toBe(count);
    expect(received).toBe(count);
    expect(ms).toBeLessThan(1_000);
  });
});
