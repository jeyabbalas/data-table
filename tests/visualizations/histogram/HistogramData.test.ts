import { describe, it, expect, vi } from 'vitest';
import {
  formatSQLValue,
  filtersToWhereClause,
  calculateOptimalBins,
  fetchHistogramData,
  type HistogramData,
} from '@/visualizations/histogram/HistogramData';
import type { Filter } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

// =========================================
// formatSQLValue Tests
// =========================================

describe('formatSQLValue', () => {
  it('should format null and undefined as NULL', () => {
    expect(formatSQLValue(null)).toBe('NULL');
    expect(formatSQLValue(undefined)).toBe('NULL');
  });

  it('should format numbers correctly', () => {
    expect(formatSQLValue(42)).toBe('42');
    expect(formatSQLValue(3.14159)).toBe('3.14159');
    expect(formatSQLValue(-100)).toBe('-100');
    expect(formatSQLValue(0)).toBe('0');
  });

  it('should format non-finite numbers as NULL', () => {
    expect(formatSQLValue(NaN)).toBe('NULL');
    expect(formatSQLValue(Infinity)).toBe('NULL');
    expect(formatSQLValue(-Infinity)).toBe('NULL');
  });

  it('should format booleans correctly', () => {
    expect(formatSQLValue(true)).toBe('TRUE');
    expect(formatSQLValue(false)).toBe('FALSE');
  });

  it('should format dates as ISO strings', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    expect(formatSQLValue(date)).toBe("'2024-01-15T10:30:00.000Z'");
  });

  it('should format strings with single quotes', () => {
    expect(formatSQLValue('hello')).toBe("'hello'");
    expect(formatSQLValue('test value')).toBe("'test value'");
  });

  it('should escape single quotes in strings', () => {
    expect(formatSQLValue("it's")).toBe("'it''s'");
    expect(formatSQLValue("O'Brien")).toBe("'O''Brien'");
    // Two single quotes become four escaped quotes, wrapped in outer quotes = 6 quotes
    expect(formatSQLValue("''")).toBe("''''''");
  });
});

// =========================================
// filtersToWhereClause Tests
// =========================================

describe('filtersToWhereClause', () => {
  it('should return empty string for empty filters', () => {
    expect(filtersToWhereClause([])).toBe('');
  });

  it('should generate range filter SQL', () => {
    const filters: Filter[] = [
      { column: 'price', type: 'range', value: { min: 10, max: 100 } },
    ];
    expect(filtersToWhereClause(filters)).toBe(
      '("price" >= 10 AND "price" < 100)'
    );
  });

  it('should generate point filter SQL', () => {
    const filters: Filter[] = [
      { column: 'status', type: 'point', value: 'active' },
    ];
    expect(filtersToWhereClause(filters)).toBe('"status" = \'active\'');
  });

  it('should generate set filter SQL', () => {
    const filters: Filter[] = [
      { column: 'category', type: 'set', value: ['A', 'B', 'C'] },
    ];
    expect(filtersToWhereClause(filters)).toBe(
      '"category" IN (\'A\', \'B\', \'C\')'
    );
  });

  it('should generate FALSE for empty set filter', () => {
    const filters: Filter[] = [{ column: 'category', type: 'set', value: [] }];
    expect(filtersToWhereClause(filters)).toBe('FALSE');
  });

  it('should generate null filter SQL', () => {
    const filters: Filter[] = [
      { column: 'description', type: 'null', value: null },
    ];
    expect(filtersToWhereClause(filters)).toBe('"description" IS NULL');
  });

  it('should generate not-null filter SQL', () => {
    const filters: Filter[] = [
      { column: 'description', type: 'not-null', value: null },
    ];
    expect(filtersToWhereClause(filters)).toBe('"description" IS NOT NULL');
  });

  it('should generate pattern filter SQL', () => {
    const filters: Filter[] = [
      { column: 'name', type: 'pattern', value: '%test%' },
    ];
    expect(filtersToWhereClause(filters)).toBe('"name" LIKE \'%test%\'');
  });

  it('should combine multiple filters with AND', () => {
    const filters: Filter[] = [
      { column: 'price', type: 'range', value: { min: 10, max: 100 } },
      { column: 'active', type: 'point', value: true },
    ];
    const result = filtersToWhereClause(filters);
    expect(result).toContain('("price" >= 10 AND "price" < 100)');
    expect(result).toContain('"active" = TRUE');
    expect(result).toContain(' AND ');
  });

  it('should exclude specified column', () => {
    const filters: Filter[] = [
      { column: 'price', type: 'range', value: { min: 10, max: 100 } },
      { column: 'name', type: 'pattern', value: 'test%' },
    ];
    const result = filtersToWhereClause(filters, 'price');
    expect(result).not.toContain('price');
    expect(result).toContain('"name" LIKE \'test%\'');
  });

  it('should return empty string when excluding the only filter', () => {
    const filters: Filter[] = [
      { column: 'price', type: 'range', value: { min: 10, max: 100 } },
    ];
    expect(filtersToWhereClause(filters, 'price')).toBe('');
  });

  it('should handle numeric set values', () => {
    const filters: Filter[] = [
      { column: 'id', type: 'set', value: [1, 2, 3] },
    ];
    expect(filtersToWhereClause(filters)).toBe('"id" IN (1, 2, 3)');
  });
});

// =========================================
// calculateOptimalBins Tests
// =========================================

describe('calculateOptimalBins', () => {
  it('should return 1 for single value', () => {
    expect(calculateOptimalBins(42, 42, 100, 0)).toBe(1);
  });

  it('should return 1 for count <= 1', () => {
    expect(calculateOptimalBins(0, 100, 0, 10)).toBe(1);
    expect(calculateOptimalBins(0, 100, 1, 10)).toBe(1);
  });

  it('should use Freedman-Diaconis rule when IQR > 0', () => {
    // n=1000, IQR=10, range=50
    // binWidth = 2 * 10 / 1000^(1/3) = 2
    // numBins = 50 / 2 = 25
    const result = calculateOptimalBins(0, 50, 1000, 10);
    expect(result).toBeGreaterThanOrEqual(5);
    expect(result).toBeLessThanOrEqual(100);
    // Rough check - should be around 25
    expect(result).toBeGreaterThanOrEqual(20);
    expect(result).toBeLessThanOrEqual(30);
  });

  it('should fallback to Sturges when IQR is 0', () => {
    // Sturges: ceil(log2(1000) + 1) = ceil(10.97) = 11
    const result = calculateOptimalBins(0, 100, 1000, 0);
    expect(result).toBe(11);
  });

  it('should clamp to minimum 5 bins', () => {
    // With very small n and large IQR, might calculate < 5 bins
    const result = calculateOptimalBins(0, 100, 10, 50);
    expect(result).toBeGreaterThanOrEqual(5);
  });

  it('should clamp to maximum 100 bins', () => {
    // With large n and small IQR, might calculate > 100 bins
    const result = calculateOptimalBins(0, 1000000, 1000000, 1);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('should handle negative values', () => {
    const result = calculateOptimalBins(-100, 100, 500, 50);
    expect(result).toBeGreaterThanOrEqual(5);
    expect(result).toBeLessThanOrEqual(100);
  });
});

// =========================================
// fetchHistogramData Tests
// =========================================

describe('fetchHistogramData', () => {
  function createMockBridge(
    queryResults: Record<string, unknown[]>
  ): WorkerBridge {
    let callIndex = 0;
    const results = Object.values(queryResults);

    return {
      query: vi.fn().mockImplementation(async () => {
        const result = results[callIndex] || [];
        callIndex++;
        return result;
      }),
    } as unknown as WorkerBridge;
  }

  it('should fetch and transform histogram data', async () => {
    const mockBridge = createMockBridge({
      stats: [{ min: 0, max: 100, count: 1000, null_count: 5, q1: 25, q3: 75 }],
      bins: [
        { bin_idx: 0, count: 100 },
        { bin_idx: 1, count: 250 },
        { bin_idx: 2, count: 300 },
        { bin_idx: 3, count: 200 },
        { bin_idx: 4, count: 150 },
      ],
    });

    const result = await fetchHistogramData(
      'test_table',
      'price',
      5,
      [],
      mockBridge
    );

    expect(result.bins).toHaveLength(5);
    expect(result.min).toBe(0);
    expect(result.max).toBe(100);
    expect(result.nullCount).toBe(5);
    expect(result.total).toBe(1005);
    expect(result.bins[0].count).toBe(100);
    expect(result.bins[2].count).toBe(300);
  });

  it('should handle empty result', async () => {
    const mockBridge = createMockBridge({
      stats: [{ min: null, max: null, count: 0, null_count: 0, q1: null, q3: null }],
    });

    const result = await fetchHistogramData(
      'empty_table',
      'value',
      'auto',
      [],
      mockBridge
    );

    expect(result.bins).toHaveLength(0);
    expect(result.nullCount).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should handle all nulls', async () => {
    const mockBridge = createMockBridge({
      stats: [{ min: null, max: null, count: 0, null_count: 100, q1: null, q3: null }],
    });

    const result = await fetchHistogramData(
      'null_table',
      'value',
      'auto',
      [],
      mockBridge
    );

    expect(result.bins).toHaveLength(0);
    expect(result.nullCount).toBe(100);
    expect(result.total).toBe(100);
  });

  it('should handle single unique value', async () => {
    const mockBridge = createMockBridge({
      stats: [{ min: 42, max: 42, count: 100, null_count: 0, q1: 42, q3: 42 }],
    });

    const result = await fetchHistogramData(
      'single_value_table',
      'value',
      'auto',
      [],
      mockBridge
    );

    expect(result.bins).toHaveLength(1);
    expect(result.bins[0].x0).toBe(42);
    expect(result.bins[0].x1).toBe(42);
    expect(result.bins[0].count).toBe(100);
  });

  it('should use auto bin calculation', async () => {
    const mockBridge = createMockBridge({
      stats: [{ min: 0, max: 100, count: 1000, null_count: 0, q1: 25, q3: 75 }],
      bins: [],
    });

    const result = await fetchHistogramData(
      'test_table',
      'value',
      'auto',
      [],
      mockBridge
    );

    // Should have called query twice: stats + bins
    expect(mockBridge.query).toHaveBeenCalledTimes(2);
    // Bins should be calculated, not empty
    expect(result.bins.length).toBeGreaterThan(0);
  });

  it('should apply filters to queries', async () => {
    const mockBridge = createMockBridge({
      stats: [{ min: 0, max: 100, count: 500, null_count: 0, q1: 25, q3: 75 }],
      bins: [{ bin_idx: 0, count: 500 }],
    });

    const filters: Filter[] = [
      { column: 'category', type: 'point', value: 'electronics' },
    ];

    await fetchHistogramData('test_table', 'price', 5, filters, mockBridge);

    // Check that filters were applied to query
    const statsCall = (mockBridge.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(statsCall).toContain('"category" = \'electronics\'');
  });

  it('should fill empty bins with zero counts', async () => {
    const mockBridge = createMockBridge({
      stats: [{ min: 0, max: 100, count: 100, null_count: 0, q1: 25, q3: 75 }],
      bins: [
        { bin_idx: 0, count: 50 },
        { bin_idx: 4, count: 50 },
        // bins 1, 2, 3 are empty
      ],
    });

    const result = await fetchHistogramData(
      'test_table',
      'value',
      5,
      [],
      mockBridge
    );

    expect(result.bins).toHaveLength(5);
    expect(result.bins[0].count).toBe(50);
    expect(result.bins[1].count).toBe(0);
    expect(result.bins[2].count).toBe(0);
    expect(result.bins[3].count).toBe(0);
    expect(result.bins[4].count).toBe(50);
  });

  it('should calculate correct bin boundaries', async () => {
    const mockBridge = createMockBridge({
      stats: [{ min: 0, max: 100, count: 100, null_count: 0, q1: 25, q3: 75 }],
      bins: [],
    });

    // Note: minimum bins is 5, so passing 5 as maxBins
    const result = await fetchHistogramData(
      'test_table',
      'value',
      5,
      [],
      mockBridge
    );

    expect(result.bins).toHaveLength(5);
    expect(result.bins[0].x0).toBe(0);
    expect(result.bins[0].x1).toBe(20);
    expect(result.bins[1].x0).toBe(20);
    expect(result.bins[1].x1).toBe(40);
    expect(result.bins[2].x0).toBe(40);
    expect(result.bins[2].x1).toBe(60);
    expect(result.bins[3].x0).toBe(60);
    expect(result.bins[3].x1).toBe(80);
    expect(result.bins[4].x0).toBe(80);
    expect(result.bins[4].x1).toBe(100); // Last bin includes max
  });

  it('should throw error with context on query failure', async () => {
    const mockBridge = {
      query: vi.fn().mockRejectedValue(new Error('Query failed')),
    } as unknown as WorkerBridge;

    await expect(
      fetchHistogramData('test_table', 'value', 'auto', [], mockBridge)
    ).rejects.toThrow('Failed to fetch histogram data for column "value"');
  });
});
