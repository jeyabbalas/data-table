/**
 * Phase 2 §4.6 — approximate distinct counts on the numeric stats scan.
 *
 * `COUNT(DISTINCT col)` builds a full hash table over the column and is the
 * dominant term of the per-column stats scan. Above
 * `APPROX_DISTINCT_ROW_THRESHOLD` rows the facade flips the visualization to
 * DuckDB's HyperLogLog `approx_count_distinct(col)` instead; at or below it
 * the count stays exact.
 *
 * These tests assert the SQL actually emitted, not just the flag: the point
 * of the milestone is which aggregate DuckDB runs.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  APPROX_DISTINCT_ROW_THRESHOLD,
  distinctCountExpr,
  fetchColumnStats,
  fetchHistogramData,
  shouldUseApproxDistinct,
} from '@/visualizations/histogram/HistogramData';
import type { WorkerBridge } from '@/data/WorkerBridge';

/**
 * Mirrors the value in `src/` on purpose — `tests/` never imports budgets
 * from the library bundle (Phase 2 §6). A drift here is the alarm.
 */
const THRESHOLD = 100_000;

interface StatsRow {
  min: number | null;
  max: number | null;
  count: number;
  null_count: number;
  q1: number | null;
  q3: number | null;
  median: number | null;
  distinct_count: number;
}

const statsRow = (overrides: Partial<StatsRow> = {}): StatsRow => ({
  min: 0,
  max: 100,
  count: 1000,
  null_count: 0,
  q1: 25,
  q3: 75,
  median: 50,
  distinct_count: 40,
  ...overrides,
});

/** Bridge that records every SQL string it is handed. */
function recordingBridge(responses: unknown[][]): { bridge: WorkerBridge; sql: string[] } {
  const sql: string[] = [];
  let call = 0;
  const bridge = {
    query: vi.fn(async (query: string) => {
      sql.push(query);
      return responses[call++] ?? [];
    }),
  } as unknown as WorkerBridge;
  return { bridge, sql };
}

describe('APPROX_DISTINCT_ROW_THRESHOLD', () => {
  it('is 100,000 rows', () => {
    expect(APPROX_DISTINCT_ROW_THRESHOLD).toBe(THRESHOLD);
  });

  it('is exact at the threshold and approximate one row above it', () => {
    expect(shouldUseApproxDistinct(THRESHOLD)).toBe(false);
    expect(shouldUseApproxDistinct(THRESHOLD + 1)).toBe(true);
  });

  it('is exact for every row count below the threshold', () => {
    expect(shouldUseApproxDistinct(0)).toBe(false);
    expect(shouldUseApproxDistinct(1)).toBe(false);
    expect(shouldUseApproxDistinct(THRESHOLD - 1)).toBe(false);
  });
});

describe('distinctCountExpr', () => {
  it('emits the exact aggregate when approximation is off or unset', () => {
    expect(distinctCountExpr('"v"', false)).toBe('COUNT(DISTINCT "v")');
    expect(distinctCountExpr('"v"', undefined)).toBe('COUNT(DISTINCT "v")');
  });

  it('emits the HyperLogLog aggregate when approximation is on', () => {
    expect(distinctCountExpr('"v"', true)).toBe('approx_count_distinct("v")');
  });
});

describe('fetchColumnStats — distinct-count aggregate selection', () => {
  it('uses the exact count when no options are supplied (default behavior)', async () => {
    const { bridge, sql } = recordingBridge([[statsRow()]]);
    const stats = await fetchColumnStats('t', 'v', [], bridge);

    expect(sql[0]).toContain('COUNT(DISTINCT "v") as distinct_count');
    expect(sql[0]).not.toContain('approx_count_distinct');
    expect(stats.distinctCountApprox).toBe(false);
  });

  it('uses the exact count when useApproxDistinct is explicitly false', async () => {
    const { bridge, sql } = recordingBridge([[statsRow()]]);
    const stats = await fetchColumnStats('t', 'v', [], bridge, { useApproxDistinct: false });

    expect(sql[0]).toContain('COUNT(DISTINCT "v")');
    expect(stats.distinctCountApprox).toBe(false);
  });

  it('uses approx_count_distinct when useApproxDistinct is true', async () => {
    const { bridge, sql } = recordingBridge([[statsRow({ distinct_count: 98_314 })]]);
    const stats = await fetchColumnStats('t', 'v', [], bridge, { useApproxDistinct: true });

    expect(sql[0]).toContain('approx_count_distinct("v") as distinct_count');
    expect(sql[0]).not.toContain('COUNT(DISTINCT');
    expect(stats.distinctCount).toBe(98_314);
    expect(stats.distinctCountApprox).toBe(true);
  });

  it('leaves the other aggregates untouched under approximation', async () => {
    const { bridge, sql } = recordingBridge([[statsRow()]]);
    await fetchColumnStats('t', 'v', [], bridge, { useApproxDistinct: true });

    expect(sql[0]).toContain('CAST(MIN("v") AS DOUBLE)');
    expect(sql[0]).toContain('CAST(MAX("v") AS DOUBLE)');
    expect(sql[0]).toContain('APPROX_QUANTILE("v", 0.5)');
    expect(sql[0]).toContain('COUNT("v") as count');
  });

  it('reports approximate even on the empty-result path', async () => {
    const { bridge } = recordingBridge([[]]);
    const stats = await fetchColumnStats('t', 'v', [], bridge, { useApproxDistinct: true });

    expect(stats.distinctCount).toBe(0);
    expect(stats.distinctCountApprox).toBe(true);
  });
});

describe('fetchColumnStats — at the row-count boundary', () => {
  const runAtRowCount = async (totalRows: number) => {
    const { bridge, sql } = recordingBridge([[statsRow()]]);
    await fetchColumnStats('t', 'v', [], bridge, {
      useApproxDistinct: shouldUseApproxDistinct(totalRows),
    });
    return sql[0]!;
  };

  it('stays exact at exactly 100,000 rows', async () => {
    const sql = await runAtRowCount(THRESHOLD);
    expect(sql).toContain('COUNT(DISTINCT "v")');
    expect(sql).not.toContain('approx_count_distinct');
  });

  it('switches to approximate at 100,001 rows', async () => {
    const sql = await runAtRowCount(THRESHOLD + 1);
    expect(sql).toContain('approx_count_distinct("v")');
    expect(sql).not.toContain('COUNT(DISTINCT');
  });
});

describe('fetchHistogramData — forwards the option and stamps the result', () => {
  it('threads the option into its stats scan', async () => {
    const { bridge, sql } = recordingBridge([
      [statsRow()],
      [
        { bin_idx: 0, count: 500 },
        { bin_idx: 1, count: 500 },
      ],
    ]);
    const data = await fetchHistogramData('t', 'v', 5, [], bridge, { useApproxDistinct: true });

    expect(sql[0]).toContain('approx_count_distinct("v")');
    expect(data.distinctCountApprox).toBe(true);
  });

  it('defaults to exact when no options are supplied', async () => {
    const { bridge, sql } = recordingBridge([[statsRow()], [{ bin_idx: 0, count: 1000 }]]);
    const data = await fetchHistogramData('t', 'v', 5, [], bridge);

    expect(sql[0]).toContain('COUNT(DISTINCT "v")');
    expect(data.distinctCountApprox).toBe(false);
  });

  it('stamps the flag on the no-data branch', async () => {
    const { bridge } = recordingBridge([
      [statsRow({ min: null, max: null, count: 0, null_count: 0 })],
    ]);
    const data = await fetchHistogramData('t', 'v', 'auto', [], bridge, {
      useApproxDistinct: true,
    });

    expect(data.bins).toHaveLength(0);
    expect(data.distinctCountApprox).toBe(true);
  });

  it('stamps the flag on the single-value branch', async () => {
    const { bridge } = recordingBridge([
      [statsRow({ min: 7, max: 7, count: 10, distinct_count: 1 })],
    ]);
    const data = await fetchHistogramData('t', 'v', 'auto', [], bridge, {
      useApproxDistinct: true,
    });

    expect(data.isSingleValue).toBe(true);
    expect(data.distinctCountApprox).toBe(true);
  });

  it('stamps the flag on the discrete-bin branch', async () => {
    // distinct_count 3 ≤ DISCRETE_BIN_THRESHOLD: HLL is effectively exact at
    // this cardinality, so the discrete decision is safe under approximation.
    const { bridge } = recordingBridge([
      [statsRow({ min: 1, max: 3, distinct_count: 3 })],
      [
        { value: 1, count: 400 },
        { value: 2, count: 300 },
        { value: 3, count: 300 },
      ],
    ]);
    const data = await fetchHistogramData('t', 'v', 'auto', [], bridge, {
      useApproxDistinct: true,
    });

    expect(data.isDiscrete).toBe(true);
    expect(data.bins).toHaveLength(3);
    expect(data.distinctCountApprox).toBe(true);
  });
});
