import { describe, it, expect, vi } from 'vitest';
import { fetchIntervalStats } from '../../src/statistics/StatsComputer';
import type { WorkerBridge } from '../../src/data/WorkerBridge';
import { intervalToSecondsSQL } from '../../src/visualizations/histogram/IntervalHistogramData';

/**
 * Create a mock WorkerBridge that returns the given rows for any query.
 */
function mockBridge(rows: Record<string, unknown>[]): WorkerBridge {
  return {
    query: vi.fn().mockResolvedValue(rows),
  } as unknown as WorkerBridge;
}

/**
 * Create a mock WorkerBridge that rejects with the given error.
 */
function mockBridgeError(error: Error): WorkerBridge {
  return {
    query: vi.fn().mockRejectedValue(error),
  } as unknown as WorkerBridge;
}

describe('fetchIntervalStats', () => {
  it('returns correct stats for a normal result', async () => {
    const bridge = mockBridge([
      {
        min_sec: 300,
        max_sec: 9000,
        median_sec: 3600,
        count: 95,
        null_count: 5,
      },
    ]);

    const stats = await fetchIntervalStats('test_table', 'duration', [], bridge);

    expect(stats.kind).toBe('interval');
    expect(stats.totalRows).toBe(100);
    expect(stats.nonNullCount).toBe(95);
    expect(stats.nullCount).toBe(5);
    expect(stats.filteredTotalRows).toBeNull();
    expect(stats.minDisplay).toBe('5m');
    expect(stats.maxDisplay).toBe('2h 30m');
    expect(stats.medianDisplay).toBe('1h');
  });

  it('runs the interval histogram stats query, on the seconds its bins use', async () => {
    const bridge = mockBridge([
      { min_sec: 0.001, max_sec: 0.991, median_sec: 0.496, count: 100, null_count: 0 },
    ]);

    const stats = await fetchIntervalStats('test_table', 'duration', [], bridge);

    expect(bridge.query).toHaveBeenCalledOnce();
    const sql = vi.mocked(bridge.query).mock.calls[0]![0];
    expect(sql).toContain(`APPROX_QUANTILE(${intervalToSecondsSQL('"duration"')}, 0.5)`);
    expect(stats.minDisplay).toBe('0.001s');
    expect(stats.medianDisplay).toBe('0.496s');
    expect(stats.maxDisplay).toBe('0.991s');
  });

  it('returns correct stats with unfilteredTotal (filtered mode)', async () => {
    const bridge = mockBridge([
      {
        min_sec: 600,
        max_sec: 3600,
        median_sec: 1800,
        count: 48,
        null_count: 2,
      },
    ]);

    const stats = await fetchIntervalStats(
      'test_table',
      'duration',
      [],
      bridge,
      100, // unfilteredTotal
    );

    expect(stats.totalRows).toBe(100);
    expect(stats.filteredTotalRows).toBe(50);
    expect(stats.nonNullCount).toBe(48);
  });

  it('handles empty results', async () => {
    const bridge = mockBridge([]);

    const stats = await fetchIntervalStats('test_table', 'duration', [], bridge);

    expect(stats.totalRows).toBe(0);
    expect(stats.nonNullCount).toBe(0);
    expect(stats.nullCount).toBe(0);
    expect(stats.filteredTotalRows).toBeNull();
    expect(stats.minDisplay).toBeNull();
    expect(stats.maxDisplay).toBeNull();
    expect(stats.medianDisplay).toBeNull();
  });

  it('handles all-null column', async () => {
    const bridge = mockBridge([
      {
        min_sec: null,
        max_sec: null,
        median_sec: null,
        count: 0,
        null_count: 100,
      },
    ]);

    const stats = await fetchIntervalStats('test_table', 'duration', [], bridge);

    expect(stats.totalRows).toBe(100);
    expect(stats.nonNullCount).toBe(0);
    expect(stats.nullCount).toBe(100);
    expect(stats.minDisplay).toBeNull();
    expect(stats.medianDisplay).toBeNull();
  });

  it('returns safe fallback on query error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bridge = mockBridgeError(
      new Error('Catalog Error: Table with name test_table does not exist!'),
    );

    const stats = await fetchIntervalStats('test_table', 'duration', [], bridge);

    expect(stats.kind).toBe('interval');
    expect(stats.totalRows).toBe(0);
    expect(stats.nonNullCount).toBe(0);
    expect(stats.minDisplay).toBeNull();

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy.mock.calls[0][0]).toContain('[StatsComputer]');

    consoleSpy.mockRestore();
  });

  it('uses quoteIdentifier for SQL safety', async () => {
    const bridge = mockBridge([
      {
        min_sec: 60,
        max_sec: 120,
        median_sec: 90,
        count: 10,
        null_count: 0,
      },
    ]);

    await fetchIntervalStats('my"table', 'col"name', [], bridge);

    // Verify the SQL uses properly escaped identifiers
    const sql = (bridge.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('"my""table"');
    expect(sql).toContain('"col""name"');
    expect(sql).not.toContain('"my"table"');
  });
});
