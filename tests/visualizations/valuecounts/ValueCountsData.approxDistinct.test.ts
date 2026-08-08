/**
 * Phase 2 §4.6 — approximate distinct counts on the value-counts stats scan,
 * and the `isAllUnique` shortcut they have to suppress.
 *
 * `isAllUnique` is an exact-equality claim (`distinctCount === nonNullCount`)
 * that swaps the whole category breakdown for one display-only "All unique"
 * segment which emits no filter. Under `approx_count_distinct` that equality
 * is a coin flip, so the claim has to be withheld — getting it wrong shows
 * the user an un-clickable lie, not a rounding error.
 *
 * The "Other" segment is the same class of hazard one step further on: it used
 * to be gated on `distinctCount > maxCategories`, a comparison against 10 —
 * well past the cardinality where the sketch stops being exact. It is now
 * keyed on the exact row remainder, and these tests pin that both ways round,
 * under-counting and over-counting.
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

describe('fetchValueCountsData — the "Other" segment under an approximate count', () => {
  /** Ten categories of 100 rows — exactly what `LIMIT 10` hands back. */
  const topTen = Array.from({ length: 10 }, (_, i) => ({ value: `c${i}`, count: 100 }));

  /**
   * 11 real categories of 100 rows each. `LIMIT 10` returns ten of them; the
   * eleventh exists only as the 100-row remainder — and the sketch reports 10,
   * so the old `distinctCount > maxCategories` gate never fired.
   */
  const elevenCategories = statsRow({ total: 1100, non_null_count: 1100, distinct_count: 10 });

  it('emits Other when the sketch under-counts to exactly maxCategories', async () => {
    const { bridge } = recordingBridge([[elevenCategories], topTen]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10, { useApproxDistinct: true });

    const other = data.segments.find((s) => s.isOther);
    expect(other).toBeDefined();
    expect(other!.count).toBe(100);
  });

  it('conserves every non-null row across the segments', async () => {
    const { bridge } = recordingBridge([[elevenCategories], topTen]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10, { useApproxDistinct: true });

    expect(data.segments.reduce((sum, s) => sum + s.count, 0)).toBe(1100);
  });

  it('floors the Other distinct count at 1 when the estimate subtracts to <= 0', async () => {
    // 8 reported for a true 11: 8 − 10 top categories is −2, yet the 100-row
    // remainder proves at least one more distinct value is down there.
    const { bridge } = recordingBridge([
      [statsRow({ total: 1100, non_null_count: 1100, distinct_count: 8 })],
      topTen,
    ]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10, { useApproxDistinct: true });

    expect(data.segments.find((s) => s.isOther)!.otherCount).toBe(1);
  });

  it('keeps the Other distinct count and marks it approximate on the result', async () => {
    // The count still travels; `distinctCountApprox` on the enclosing result is
    // the marker a renderer reads, the same flag the stats line turns into `~`.
    const { bridge } = recordingBridge([
      [statsRow({ total: 1100, non_null_count: 1100, distinct_count: 90 })],
      topTen,
    ]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10, { useApproxDistinct: true });

    expect(data.segments.find((s) => s.isOther)!.otherCount).toBe(80);
    expect(data.distinctCountApprox).toBe(true);
  });

  it('emits no zero-count Other when the sketch over-counts and nothing was truncated', async () => {
    // 12 reported for a true 10: `LIMIT 10` already returned every category, so
    // the remainder is 0 and there is no tail to show.
    const { bridge } = recordingBridge([
      [statsRow({ total: 1000, non_null_count: 1000, distinct_count: 12 })],
      topTen,
    ]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10, { useApproxDistinct: true });

    expect(data.segments).toHaveLength(10);
    expect(data.segments.some((s) => s.isOther)).toBe(false);
  });

  it('reaches the same segments on the exact path', async () => {
    // Same fixture with the truth (11) in the stats row: the row remainder was
    // always the operative term, so dropping the distinct-count gate changed
    // nothing here.
    const { bridge } = recordingBridge([
      [statsRow({ total: 1100, non_null_count: 1100, distinct_count: 11 })],
      topTen,
    ]);
    const data = await fetchValueCountsData('t', 's', [], bridge, 10);

    const other = data.segments.find((s) => s.isOther);
    expect(other!.count).toBe(100);
    expect(other!.otherCount).toBe(1);
    expect(data.distinctCountApprox).toBe(false);
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

  it('floors the aligned Other distinct count at 1 only while rows remain', async () => {
    // 2 reported against 2 background categories subtracts to 0, but 100 rows
    // sit outside them — same floor as the unfiltered path.
    const withTail = recordingBridge(
      alignedResponses(statsRow({ total: 400, non_null_count: 400, distinct_count: 2 })),
    );
    const tail = await fetchAlignedValueCountsData(
      't',
      's',
      ['a', 'b'],
      true,
      [],
      withTail.bridge,
      { useApproxDistinct: true },
    );
    const tailOther = tail.segments.find((s) => s.isOther)!;
    expect(tailOther.count).toBe(100);
    expect(tailOther.otherCount).toBe(1);

    // An aligned Other the foreground filter emptied really does hold nothing.
    const empty = recordingBridge(
      alignedResponses(statsRow({ total: 300, non_null_count: 300, distinct_count: 2 })),
    );
    const emptied = await fetchAlignedValueCountsData(
      't',
      's',
      ['a', 'b'],
      true,
      [],
      empty.bridge,
      {
        useApproxDistinct: true,
      },
    );
    const emptyOther = emptied.segments.find((s) => s.isOther)!;
    expect(emptyOther.count).toBe(0);
    expect(emptyOther.otherCount).toBe(0);
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
