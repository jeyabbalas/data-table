/**
 * Phase 9 — AnnotationStore performance budgets.
 *
 * Pure-JS micro-benchmarks (no DuckDB). Runs in the default `npm test` suite
 * because it's fast and deterministic. Budgets are sized for GitHub-hosted
 * runner variance (5–7× slower than M1 plus noise), not just for local
 * medians. The 1M-annotation budgets are gated: see
 * `annotations.scale.perf.test.ts` (`RUN_ANNOTATION_PERF=1`).
 *
 * Local M1 Pro medians, Node 22:
 *   - addMany(10_000):                                    ~6ms
 *   - 1000 random getByCell lookups, 10k mixed store:     ~15ms
 *   - addMany(100_000):                                   ~65ms
 *   - 1000 × (getByCell + getByRow + getByColumn), 100k:  ~50ms
 *   - removeMany(100), 100k:                              < 1ms
 *   - toJSON + loadJSON('replace') onto 100k:             ~60ms
 *   - clear() of 100k, with a listener:                   ~3ms
 *
 * Each budget sits far below what the store cost before its indexes were
 * rebuilt around one insertion-ordered `Map` (100k: getByRow ~1.2ms and
 * getByColumn ~2.1ms a call, remove ~5.6ms a call, clear() ~140s), so a
 * return to a per-call scan of the store, or to per-id splicing, fails it.
 * `getByCell` returns the intersection at one cell — the row's row-scope,
 * the column's column-scope and that cell's own annotations — so its cost
 * follows what it returns: in the 10k mix, each column's ~150 column-scope
 * annotations, sorted.
 */

import { describe, expect, it } from 'vitest';

import { AnnotationStore } from '@/annotations/AnnotationStore';
import { PerfMonitor } from '@/core/PerfMonitor';
import type { NewAnnotation } from '@/annotations/types';

const TOTAL_ANNOTATIONS = 10_000;
const COLUMNS = 20;
const ROWS = 5_000;
const LOOKUP_ITERATIONS = 1_000;

/**
 * Build a deterministic 10 k mix of annotations:
 *   - 40% row-scope (rowId only)
 *   - 30% column-scope (column only)
 *   - 30% cell-scope (rowId + column)
 * Severity rotates through error/warning/info so the rendered cell
 * stripe lookup hits every priority bucket.
 */
function buildAnnotationFixture(): NewAnnotation[] {
  const anns: NewAnnotation[] = [];
  const sevs: ('error' | 'warning' | 'info')[] = ['error', 'warning', 'info'];
  for (let i = 0; i < TOTAL_ANNOTATIONS; i++) {
    const sev = sevs[i % 3]!;
    const r = i % 10;
    if (r < 4) {
      anns.push({
        scope: 'row',
        rowId: i % ROWS,
        severity: sev,
        message: `row annotation ${i}`,
      });
    } else if (r < 7) {
      anns.push({
        scope: 'column',
        column: `col_${i % COLUMNS}`,
        severity: sev,
        message: `column annotation ${i}`,
      });
    } else {
      anns.push({
        scope: 'cell',
        rowId: i % ROWS,
        column: `col_${i % COLUMNS}`,
        severity: sev,
        message: `cell annotation ${i}`,
      });
    }
  }
  return anns;
}

describe('AnnotationStore — Phase 9 perf budgets', () => {
  it('addMany of 10k mixed-scope annotations completes under 250ms', () => {
    const store = new AnnotationStore();
    const anns = buildAnnotationFixture();
    const perf = new PerfMonitor();
    const { perf: m } = perf.measureSync('addMany-10k', () => store.addMany(anns));
    expect(m.durationMs).toBeLessThan(250);
  });

  it('1000 random getByCell lookups against a 10k store under 1500ms', () => {
    const store = new AnnotationStore();
    store.addMany(buildAnnotationFixture());

    // Pre-build 1000 random (rowId, column) pairs so the timed loop only
    // measures the lookup itself, not random-number generation.
    const queries: { rowId: number; column: string }[] = [];
    for (let i = 0; i < LOOKUP_ITERATIONS; i++) {
      queries.push({
        rowId: Math.floor(Math.random() * ROWS),
        column: `col_${Math.floor(Math.random() * COLUMNS)}`,
      });
    }

    const perf = new PerfMonitor();
    const { perf: m, result: total } = perf.measureSync('getByCell-1000', () => {
      let sum = 0;
      for (const q of queries) {
        sum += store.getByCell(q.rowId, q.column).length;
      }
      return sum;
    });
    // Sanity check — most cells in the 10k mix should hit at least one of
    // row-scope (40%) + column-scope (30%) — so total > 0 by a wide margin.
    expect(total).toBeGreaterThan(0);
    expect(m.durationMs).toBeLessThan(1500);
  });
});

const LARGE = 100_000;
const LARGE_ROWS = 20_000;
const LARGE_COLUMNS = 200;

/** 100k annotations: 90% cell, 9% row, 1% column, over 20k rows × 200 columns. */
function buildLargeFixture(offset = 0): NewAnnotation[] {
  const anns = new Array<NewAnnotation>(LARGE);
  const sevs: ('error' | 'warning' | 'info')[] = ['error', 'warning', 'info'];
  for (let k = 0; k < LARGE; k++) {
    const i = k + offset;
    const severity = sevs[i % 3]!;
    const r = i % 100;
    if (r < 90) {
      anns[k] = {
        scope: 'cell',
        rowId: (i * 7919) % LARGE_ROWS,
        column: `col_${(i * 31) % LARGE_COLUMNS}`,
        severity,
        message: 'cell annotation',
      };
    } else if (r < 99) {
      anns[k] = {
        scope: 'row',
        rowId: (i * 104_729) % LARGE_ROWS,
        severity,
        message: 'row annotation',
      };
    } else {
      anns[k] = {
        scope: 'column',
        column: `col_${i % LARGE_COLUMNS}`,
        severity,
        message: 'column annotation',
      };
    }
  }
  return anns;
}

describe('AnnotationStore — 100k perf budgets', () => {
  it('addMany of 100k annotations completes under 1500ms', () => {
    const store = new AnnotationStore();
    const anns = buildLargeFixture();
    const { perf: m } = new PerfMonitor().measureSync('addMany-100k', () => store.addMany(anns));
    expect(store.count()).toBe(LARGE);
    expect(m.durationMs).toBeLessThan(1500);
  });

  it('1000 × getByCell + getByRow + getByColumn against a 100k store under 1000ms', () => {
    const store = new AnnotationStore();
    store.addMany(buildLargeFixture());
    const queries: { rowId: number; column: string }[] = [];
    for (let i = 0; i < LOOKUP_ITERATIONS; i++) {
      queries.push({
        rowId: (i * 7919) % LARGE_ROWS,
        column: `col_${(i * 31) % LARGE_COLUMNS}`,
      });
    }
    const { perf: m, result: total } = new PerfMonitor().measureSync('lookups-100k', () => {
      let sum = 0;
      for (const q of queries) {
        sum += store.getByCell(q.rowId, q.column).length;
        sum += store.getByRow(q.rowId).length;
        sum += store.getByColumn(q.column).length;
      }
      return sum;
    });
    expect(total).toBeGreaterThan(0);
    expect(m.durationMs).toBeLessThan(1000);
  });

  it('removeMany of 100 ids from a 100k store under 100ms', () => {
    const store = new AnnotationStore();
    const added = store.addMany(buildLargeFixture());
    const ids = Array.from({ length: 100 }, (_, i) => added[(i * 997) % LARGE]!.id);
    const { perf: m, result } = new PerfMonitor().measureSync('removeMany-100', () =>
      store.removeMany(ids),
    );
    expect(result).toBe(100);
    expect(m.durationMs).toBeLessThan(100);
  });

  it("toJSON + loadJSON('replace') of 100k onto 100k under 1500ms", () => {
    const source = new AnnotationStore();
    source.addMany(buildLargeFixture(13));
    const store = new AnnotationStore();
    store.addMany(buildLargeFixture());
    const { perf: m } = new PerfMonitor().measureSync('json-roundtrip-100k', () =>
      store.loadJSON(source.toJSON(), 'replace'),
    );
    expect(store.count()).toBe(LARGE);
    expect(m.durationMs).toBeLessThan(1500);
  });

  it('clear() of a 100k store with a listener under 500ms', () => {
    const store = new AnnotationStore();
    store.addMany(buildLargeFixture());
    let cleared = 0;
    store.on('change', (e) => {
      cleared = e.ids.length;
    });
    const { perf: m } = new PerfMonitor().measureSync('clear-100k', () => store.clear());
    expect(cleared).toBe(LARGE);
    expect(m.durationMs).toBeLessThan(500);
  });
});
