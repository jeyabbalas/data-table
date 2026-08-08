/**
 * Phase 2 §4.6 — approximate distinct counts on the value-counts stats scan,
 * and the `isAllUnique` shortcut they have to suppress.
 *
 * `isAllUnique` is an exact-equality claim (`distinctCount === nonNullCount`)
 * that swaps the whole category breakdown for one display-only "All unique"
 * segment which emits no filter. Under `approx_count_distinct` that equality
 * is a coin flip, so the claim has to be withheld — getting it wrong shows
 * the user an un-clickable lie, not a rounding error.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  fetchAlignedValueCountsData,
  fetchValueCountsData,
} from '@/visualizations/valuecounts/ValueCountsData';
import type { WorkerBridge } from '@/data/WorkerBridge';

interface StatsRow {
  total: number;
  non_null_count: number;
  null_count: number;
  distinct_count: number;
}

const statsRow = (overrides: Partial<StatsRow> = {}): StatsRow => ({
  total: 1000,
  non_null_count: 1000,
  null_count: 0,
  distinct_count: 4,
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

const categories = [
  { value: 'a', count: 400 },
  { value: 'b', count: 300 },
  { value: 'c', count: 200 },
  { value: 'd', count: 100 },
];

describe('fetchValueCountsData — distinct-count aggregate selection', () => {
  it('uses the exact count when no options are supplied (default behavior)', async () => {
    const { bridge, sql } = recordingBridge([[statsRow()], categories]);
    const data = await fetchValueCountsData('t', 's', [], bridge);

    expect(sql[0]).toContain('COUNT(DISTINCT "s") as distinct_count');
    expect(sql[0]).not.toContain('approx_count_distinct');
    expect(data.distinctCountApprox).toBe(false);
  });

  it('uses approx_count_distinct when useApproxDistinct is true', async () => {
    const { bridge, sql } = recordingBridge([[statsRow()], categories]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10, {
      useApproxDistinct: true,
    });

    expect(sql[0]).toContain('approx_count_distinct("s") as distinct_count');
    expect(sql[0]).not.toContain('COUNT(DISTINCT');
    expect(data.distinctCountApprox).toBe(true);
  });

  it('leaves the row/null aggregates untouched under approximation', async () => {
    const { bridge, sql } = recordingBridge([[statsRow()], categories]);
    await fetchValueCountsData('t', 's', [], bridge, 10, { useApproxDistinct: true });

    expect(sql[0]).toContain('COUNT(*) as total');
    expect(sql[0]).toContain('COUNT("s") as non_null_count');
    expect(sql[0]).toContain('COUNT(*) - COUNT("s") as null_count');
  });

  it('reports approximate even on the all-null path', async () => {
    const { bridge } = recordingBridge([
      [statsRow({ non_null_count: 0, null_count: 1000, distinct_count: 0 })],
    ]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10, {
      useApproxDistinct: true,
    });

    expect(data.segments).toHaveLength(0);
    expect(data.isAllUnique).toBe(false);
    expect(data.distinctCountApprox).toBe(true);
  });
});

describe('fetchValueCountsData — isAllUnique suppression', () => {
  /** distinct === nonNull and nonNull > 1: the all-unique condition. */
  const allUniqueStats = statsRow({ non_null_count: 1000, distinct_count: 1000 });

  it('claims all-unique when the count is exact', async () => {
    const { bridge } = recordingBridge([[allUniqueStats], categories]);
    const data = await fetchValueCountsData('t', 's', [], bridge);

    expect(data.isAllUnique).toBe(true);
  });

  it('withholds the claim when the count is approximate', async () => {
    const { bridge } = recordingBridge([[allUniqueStats], categories]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10, {
      useApproxDistinct: true,
    });

    expect(data.isAllUnique).toBe(false);
    // The count itself still travels — only the exact-equality claim is gone.
    expect(data.distinctCount).toBe(1000);
    expect(data.distinctCountApprox).toBe(true);
  });

  it('still returns the real segments under approximation', async () => {
    // Suppressing the shortcut must fall through to the normal breakdown,
    // not to an empty chart.
    const { bridge } = recordingBridge([[allUniqueStats], categories]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10, {
      useApproxDistinct: true,
    });

    expect(data.segments.map((s) => s.value)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('fetchAlignedValueCountsData — approximation and isAllUnique', () => {
  const alignedResponses = (stats: StatsRow) => [
    [stats],
    [
      { value: 'a', count: 200 },
      { value: 'b', count: 100 },
    ],
  ];

  it('uses the exact count by default', async () => {
    const { bridge, sql } = recordingBridge(alignedResponses(statsRow()));
    const data = await fetchAlignedValueCountsData('t', 's', ['a', 'b'], false, [], bridge);

    expect(sql[0]).toContain('COUNT(DISTINCT "s")');
    expect(data.distinctCountApprox).toBe(false);
  });

  it('uses approx_count_distinct when asked', async () => {
    const { bridge, sql } = recordingBridge(alignedResponses(statsRow()));
    const data = await fetchAlignedValueCountsData('t', 's', ['a', 'b'], false, [], bridge, {
      useApproxDistinct: true,
    });

    expect(sql[0]).toContain('approx_count_distinct("s")');
    expect(sql[0]).not.toContain('COUNT(DISTINCT');
    expect(data.distinctCountApprox).toBe(true);
  });

  it('claims all-unique when exact, withholds it when approximate', async () => {
    const allUnique = statsRow({ non_null_count: 300, distinct_count: 300 });

    const exact = recordingBridge(alignedResponses(allUnique));
    const exactData = await fetchAlignedValueCountsData(
      't',
      's',
      ['a', 'b'],
      false,
      [],
      exact.bridge,
    );
    expect(exactData.isAllUnique).toBe(true);

    const approx = recordingBridge(alignedResponses(allUnique));
    const approxData = await fetchAlignedValueCountsData(
      't',
      's',
      ['a', 'b'],
      false,
      [],
      approx.bridge,
      { useApproxDistinct: true },
    );
    expect(approxData.isAllUnique).toBe(false);
    expect(approxData.distinctCountApprox).toBe(true);
  });

  it('reports approximate on the no-non-null path', async () => {
    const { bridge } = recordingBridge([
      [statsRow({ non_null_count: 0, null_count: 1000, distinct_count: 0 })],
    ]);
    const data = await fetchAlignedValueCountsData('t', 's', ['a'], true, [], bridge, {
      useApproxDistinct: true,
    });

    expect(data.isAllUnique).toBe(false);
    expect(data.distinctCountApprox).toBe(true);
  });
});
