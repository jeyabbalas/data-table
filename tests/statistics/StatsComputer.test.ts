import { describe, it, expect, vi } from 'vitest';
import { fetchIntervalStats } from '../../src/statistics/StatsComputer';
import type { WorkerBridge } from '../../src/data/WorkerBridge';

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
        total: 100,
        non_null: 95,
        null_count: 5,
        min_val: '00:05:00',
        max_val: '02:30:00',
        median_val: '01:00:00',
      },
    ]);

    const stats = await fetchIntervalStats('test_table', 'duration', [], bridge);

    expect(stats.kind).toBe('interval');
    expect(stats.totalRows).toBe(100);
    expect(stats.nonNullCount).toBe(95);
    expect(stats.nullCount).toBe(5);
    expect(stats.filteredTotalRows).toBeNull();
    expect(stats.minDisplay).toBe('00:05:00');
    expect(stats.maxDisplay).toBe('02:30:00');
    expect(stats.medianDisplay).toBe('01:00:00');
  });

  it('returns correct stats with unfilteredTotal (filtered mode)', async () => {
    const bridge = mockBridge([
      {
        total: 50,
        non_null: 48,
        null_count: 2,
        min_val: '00:10:00',
        max_val: '01:00:00',
        median_val: '00:30:00',
      },
    ]);

    const stats = await fetchIntervalStats(
      'test_table',
      'duration',
      [],
      bridge,
      100 // unfilteredTotal
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
        total: 100,
        non_null: 0,
        null_count: 100,
        min_val: null,
        max_val: null,
        median_val: null,
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
    const bridge = mockBridgeError(new Error('APPROX_QUANTILE not supported'));

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
        total: 10,
        non_null: 10,
        null_count: 0,
        min_val: '00:01:00',
        max_val: '00:02:00',
        median_val: '00:01:30',
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
