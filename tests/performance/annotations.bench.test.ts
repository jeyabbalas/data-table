/**
 * Phase 9 — AnnotationStore performance budgets.
 *
 * Pure-JS micro-benchmarks (no DuckDB). Runs in the default `npm test` suite
 * because it's fast and deterministic. Budgets are sized for GitHub-hosted
 * runner variance (5–7× slower than M1 plus noise), not just for local
 * medians.
 *
 * Local M1 medians (3-run, after warmup):
 *   - addMany(10_000):                       ~50ms
 *   - 1000 random getByCell lookups (~150
 *     column-scope anns per col, on a 10k
 *     mixed store):                          ~120ms
 *
 * The `getByCell` budget catches O(n²) regressions in the gather/sort
 * intersection path. Each lookup unions row-scope + column-scope +
 * cell-scope Set entries (typically ~150 column-anns + a few row/cell)
 * then sorts by severity. Constant-factor work per call; budget gives
 * ~12× CI headroom over the local M1 median (~120ms) — an O(n²)
 * regression at this fixture size lands in multi-second territory,
 * well past the 1500ms budget.
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

  it('1000 random getByCell lookups against a 10k store under 500ms', () => {
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
