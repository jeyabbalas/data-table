import { describe, it, expect } from 'vitest';
import {
  parseIntervalToSeconds,
  secondsToIntervalString,
  secondsToIntervalSQL,
  intervalToSecondsSQL,
  fetchIntervalHistogramData,
  fetchIntervalNumericBins,
  fetchIntervalColumnStats,
  MONTH_SECONDS,
  YEAR_SECONDS,
} from '@/visualizations/histogram/IntervalHistogramData';
import type { WorkerBridge } from '@/data/WorkerBridge';

// =========================================
// intervalToSecondsSQL Tests
// =========================================

describe('intervalToSecondsSQL', () => {
  it('should return a SQL expression using EXTRACT components', () => {
    const sql = intervalToSecondsSQL('"duration"');
    expect(sql).toContain('EXTRACT(year FROM "duration")');
    expect(sql).toContain('EXTRACT(month FROM "duration")');
    expect(sql).toContain('EXTRACT(day FROM "duration")');
    expect(sql).toContain('EXTRACT(hour FROM "duration")');
    expect(sql).toContain('EXTRACT(minute FROM "duration")');
    expect(sql).toContain('EXTRACT(second FROM "duration")');
  });

  it('should use correct conversion constants', () => {
    const sql = intervalToSecondsSQL('"col"');
    expect(sql).toContain(`${MONTH_SECONDS}.0`);
    expect(sql).toContain('86400.0'); // DAY_SECONDS
    expect(sql).toContain('3600.0');
    expect(sql).toContain('60.0');
  });
});

// =========================================
// parseIntervalToSeconds Tests
// =========================================

describe('parseIntervalToSeconds', () => {
  it('should return null for null/undefined/empty', () => {
    expect(parseIntervalToSeconds(null)).toBeNull();
    expect(parseIntervalToSeconds('')).toBeNull();
    expect(parseIntervalToSeconds('  ')).toBeNull();
  });

  it('should parse time-only intervals', () => {
    expect(parseIntervalToSeconds('00:00:00')).toBe(0);
    expect(parseIntervalToSeconds('01:00:00')).toBe(3600);
    expect(parseIntervalToSeconds('00:30:00')).toBe(1800);
    expect(parseIntervalToSeconds('00:00:45')).toBe(45);
    expect(parseIntervalToSeconds('02:30:15')).toBe(2 * 3600 + 30 * 60 + 15);
  });

  it('should parse fractional seconds', () => {
    const result = parseIntervalToSeconds('00:00:01.500000');
    expect(result).toBeCloseTo(1.5, 5);
  });

  it('should parse day intervals', () => {
    expect(parseIntervalToSeconds('1 day')).toBe(86400);
    expect(parseIntervalToSeconds('5 days')).toBe(5 * 86400);
    expect(parseIntervalToSeconds('3 days 04:05:06')).toBe(3 * 86400 + 4 * 3600 + 5 * 60 + 6);
  });

  it('should parse month intervals', () => {
    expect(parseIntervalToSeconds('1 month')).toBe(MONTH_SECONDS);
    expect(parseIntervalToSeconds('6 months')).toBe(6 * MONTH_SECONDS);
  });

  it('should parse year intervals', () => {
    expect(parseIntervalToSeconds('1 year')).toBe(YEAR_SECONDS);
    expect(parseIntervalToSeconds('2 years')).toBe(2 * YEAR_SECONDS);
  });

  it('should parse combined intervals', () => {
    const expected = YEAR_SECONDS + 2 * MONTH_SECONDS + 3 * 86400 + 4 * 3600 + 5 * 60 + 6;
    expect(parseIntervalToSeconds('1 year 2 months 3 days 04:05:06')).toBe(expected);
  });

  it('should parse negative intervals', () => {
    expect(parseIntervalToSeconds('-01:00:00')).toBe(-3600);
    expect(parseIntervalToSeconds('-1 day')).toBe(-86400);
  });

  it('should parse per-component negative signs', () => {
    // All components negative (e.g. from secondsToIntervalSQL(-90061))
    expect(parseIntervalToSeconds('-1 day -01:01:01')).toBe(-86400 - 3661);
    // Full negative combined
    const fullNeg = -(YEAR_SECONDS + 2 * MONTH_SECONDS + 3 * 86400 + 4 * 3600 + 5 * 60 + 6);
    expect(parseIntervalToSeconds('-1 year -2 months -3 days -04:05:06')).toBe(fullNeg);
  });

  it('should parse mixed-sign components', () => {
    // Positive year, negative months (DuckDB can produce this)
    expect(parseIntervalToSeconds('1 year -2 months')).toBe(YEAR_SECONDS - 2 * MONTH_SECONDS);
    // Negative days, positive time
    expect(parseIntervalToSeconds('-3 days 04:05:06')).toBe(-3 * 86400 + 4 * 3600 + 5 * 60 + 6);
  });

  it('should handle Arrow MonthDayNano interval objects', () => {
    expect(parseIntervalToSeconds({ months: 0, days: 0, nanoseconds: 3_600_000_000_000 }))
      .toBe(3600);
    expect(parseIntervalToSeconds({ months: 0, days: 1, nanoseconds: 0 }))
      .toBe(86400);
    expect(parseIntervalToSeconds({ months: 1, days: 0, nanoseconds: 0 }))
      .toBe(MONTH_SECONDS);
  });

  it('should handle DuckDB internal interval objects with micros', () => {
    expect(parseIntervalToSeconds({ months: 0, days: 0, micros: 3_600_000_000 }))
      .toBe(3600);
  });
});

// =========================================
// secondsToIntervalString Tests
// =========================================

describe('secondsToIntervalString', () => {
  it('should return "0s" for zero', () => {
    expect(secondsToIntervalString(0)).toBe('0s');
  });

  it('should format seconds', () => {
    expect(secondsToIntervalString(30)).toBe('30s');
    expect(secondsToIntervalString(1)).toBe('1s');
  });

  it('should format minutes', () => {
    expect(secondsToIntervalString(60)).toBe('1m');
    expect(secondsToIntervalString(90)).toBe('1m 30s');
  });

  it('should format hours', () => {
    expect(secondsToIntervalString(3600)).toBe('1h');
    expect(secondsToIntervalString(3661)).toBe('1h 1m 1s');
  });

  it('should format days', () => {
    expect(secondsToIntervalString(86400)).toBe('1d');
    expect(secondsToIntervalString(90061)).toBe('1d 1h 1m 1s');
  });

  it('should format months', () => {
    expect(secondsToIntervalString(MONTH_SECONDS)).toBe('1mo');
    expect(secondsToIntervalString(6 * MONTH_SECONDS)).toBe('6mo');
  });

  it('should format years', () => {
    expect(secondsToIntervalString(YEAR_SECONDS)).toBe('1y');
    expect(secondsToIntervalString(2 * YEAR_SECONDS)).toBe('2y');
  });

  it('should format combined values', () => {
    const secs = YEAR_SECONDS + 2 * MONTH_SECONDS + 3 * 86400 + 4 * 3600 + 5 * 60 + 6;
    expect(secondsToIntervalString(secs)).toBe('1y 2mo 3d 4h 5m 6s');
  });

  it('should handle negative values', () => {
    expect(secondsToIntervalString(-3600)).toBe('-1h');
    expect(secondsToIntervalString(-90)).toBe('-1m 30s');
  });

  it('should skip zero components', () => {
    expect(secondsToIntervalString(86400 + 60)).toBe('1d 1m');
    expect(secondsToIntervalString(YEAR_SECONDS + 86400)).toBe('1y 1d');
  });
});

// =========================================
// secondsToIntervalSQL Tests
// =========================================

describe('secondsToIntervalSQL', () => {
  it('should return "00:00:00" for zero', () => {
    expect(secondsToIntervalSQL(0)).toBe('00:00:00');
  });

  it('should format time-only values', () => {
    expect(secondsToIntervalSQL(3661)).toBe('01:01:01');
    expect(secondsToIntervalSQL(7200)).toBe('02:00:00');
  });

  it('should format days with time', () => {
    expect(secondsToIntervalSQL(86400)).toBe('1 day');
    expect(secondsToIntervalSQL(90061)).toBe('1 day 01:01:01');
    expect(secondsToIntervalSQL(2 * 86400)).toBe('2 days');
  });

  it('should format months', () => {
    expect(secondsToIntervalSQL(MONTH_SECONDS)).toBe('1 month');
    expect(secondsToIntervalSQL(3 * MONTH_SECONDS)).toBe('3 months');
  });

  it('should format years', () => {
    expect(secondsToIntervalSQL(YEAR_SECONDS)).toBe('1 year');
    expect(secondsToIntervalSQL(2 * YEAR_SECONDS)).toBe('2 years');
  });

  it('should format combined values', () => {
    const secs = YEAR_SECONDS + 2 * MONTH_SECONDS + 3 * 86400 + 4 * 3600 + 5 * 60 + 6;
    expect(secondsToIntervalSQL(secs)).toBe('1 year 2 months 3 days 04:05:06');
  });

  it('should round-trip through parseIntervalToSeconds', () => {
    const values = [0, 30, 3600, 86400, MONTH_SECONDS, YEAR_SECONDS, YEAR_SECONDS + 86400 + 3600];
    for (const v of values) {
      const sql = secondsToIntervalSQL(v);
      const parsed = parseIntervalToSeconds(sql);
      expect(parsed).toBe(v);
    }
  });

  it('should handle negative time-only values', () => {
    expect(secondsToIntervalSQL(-3600)).toBe('-01:00:00');
  });

  it('should handle negative day-only values', () => {
    expect(secondsToIntervalSQL(-86400)).toBe('-1 day');
  });

  it('should negate each component for negative combined values', () => {
    // -90061 = -(1 day + 1h + 1m + 1s)
    expect(secondsToIntervalSQL(-90061)).toBe('-1 day -01:01:01');
    // Negative with fractional seconds
    expect(secondsToIntervalSQL(-3661.5)).toBe('-01:01:01.5');
  });

  it('should preserve fractional seconds', () => {
    expect(secondsToIntervalSQL(720.2)).toBe('00:12:00.2');
    expect(secondsToIntervalSQL(3661.5)).toBe('01:01:01.5');
    expect(secondsToIntervalSQL(0.123456)).toBe('00:00:00.123456');
  });

  it('should round-trip fractional seconds through parseIntervalToSeconds', () => {
    const values = [720.2, 3661.5, 86400 + 0.5];
    for (const v of values) {
      const sql = secondsToIntervalSQL(v);
      const parsed = parseIntervalToSeconds(sql);
      expect(parsed).toBeCloseTo(v, 5);
    }
  });

  it('should round-trip negative combined values through parseIntervalToSeconds', () => {
    const values = [-3600, -86400, -90061, -(YEAR_SECONDS + 86400 + 3600)];
    for (const v of values) {
      const sql = secondsToIntervalSQL(v);
      const parsed = parseIntervalToSeconds(sql);
      expect(parsed).toBe(v);
    }
  });
});

// =========================================
// fetchIntervalColumnStats Tests
// =========================================

describe('fetchIntervalColumnStats', () => {
  function mockBridge(rows: unknown[]): WorkerBridge {
    return {
      query: async () => rows,
    } as unknown as WorkerBridge;
  }

  it('should parse stats from DuckDB VARCHAR output', async () => {
    const bridge = mockBridge([{
      min_val: '01:00:00',
      max_val: '1 day 02:30:00',
      median_val: '12:00:00',
      count: 100,
      null_count: 5,
    }]);

    const stats = await fetchIntervalColumnStats('t', 'dur', [], bridge);
    expect(stats.minSeconds).toBe(3600);
    expect(stats.maxSeconds).toBe(86400 + 2 * 3600 + 30 * 60);
    expect(stats.medianSeconds).toBe(12 * 3600);
    expect(stats.count).toBe(100);
    expect(stats.nullCount).toBe(5);
  });

  it('should handle all-null column', async () => {
    const bridge = mockBridge([{
      min_val: null, max_val: null, median_val: null, count: 0, null_count: 10,
    }]);

    const stats = await fetchIntervalColumnStats('t', 'dur', [], bridge);
    expect(stats.minSeconds).toBeNull();
    expect(stats.maxSeconds).toBeNull();
    expect(stats.medianSeconds).toBeNull();
    expect(stats.count).toBe(0);
    expect(stats.nullCount).toBe(10);
  });

  it('should handle empty result', async () => {
    const bridge = mockBridge([]);
    const stats = await fetchIntervalColumnStats('t', 'dur', [], bridge);
    expect(stats.count).toBe(0);
    expect(stats.nullCount).toBe(0);
  });
});

// =========================================
// fetchIntervalNumericBins Tests
// =========================================

describe('fetchIntervalNumericBins', () => {
  it('should create all bins including empty ones', async () => {
    const bridge = {
      query: async () => [
        { bin_idx: 0, count: 10 },
        { bin_idx: 2, count: 5 },
        // bin_idx 1 is missing (empty)
      ],
    } as unknown as WorkerBridge;

    const bins = await fetchIntervalNumericBins('t', 'dur', 3, 0, 300, [], bridge);
    expect(bins).toHaveLength(3);
    expect(bins[0].count).toBe(10);
    expect(bins[1].count).toBe(0); // Empty bin
    expect(bins[2].count).toBe(5);
    // Last bin ends at maxSec exactly
    expect(bins[2].binEndSeconds).toBe(300);
  });

  it('should compute correct bin edges', async () => {
    const bridge = {
      query: async () => [],
    } as unknown as WorkerBridge;

    const bins = await fetchIntervalNumericBins('t', 'dur', 4, 0, 400, [], bridge);
    expect(bins[0].binStartSeconds).toBe(0);
    expect(bins[0].binEndSeconds).toBe(100);
    expect(bins[1].binStartSeconds).toBe(100);
    expect(bins[1].binEndSeconds).toBe(200);
    expect(bins[3].binEndSeconds).toBe(400); // Last bin ends at max
  });
});

// =========================================
// fetchIntervalHistogramData Tests
// =========================================

describe('fetchIntervalHistogramData', () => {
  it('should return empty bins for all-null data', async () => {
    const bridge = {
      query: async () => [{
        min_val: null, max_val: null, median_val: null, count: 0, null_count: 10,
      }],
    } as unknown as WorkerBridge;

    const data = await fetchIntervalHistogramData('t', 'dur', [], bridge, 10);
    expect(data.bins).toHaveLength(0);
    expect(data.nullCount).toBe(10);
    expect(data.total).toBe(10);
    expect(data.isSingleValue).toBe(false);
    expect(data.minSeconds).toBeNull();
  });

  it('should handle single value', async () => {
    const bridge = {
      query: async () => [{
        min_val: '01:00:00', max_val: '01:00:00', median_val: '01:00:00',
        count: 50, null_count: 0,
      }],
    } as unknown as WorkerBridge;

    const data = await fetchIntervalHistogramData('t', 'dur', [], bridge, 10);
    expect(data.isSingleValue).toBe(true);
    expect(data.bins).toHaveLength(1);
    expect(data.bins[0].count).toBe(50);
    expect(data.minSeconds).toBe(3600);
    expect(data.maxSeconds).toBe(3600);
  });

  it('should fetch bins for normal data', async () => {
    let callCount = 0;
    const bridge = {
      query: async () => {
        callCount++;
        if (callCount === 1) {
          // Stats query
          return [{
            min_val: '00:00:00', max_val: '01:00:00', median_val: '00:30:00',
            count: 100, null_count: 5,
          }];
        }
        // Bin query
        return [
          { bin_idx: 0, count: 20 },
          { bin_idx: 1, count: 30 },
          { bin_idx: 2, count: 25 },
          { bin_idx: 3, count: 15 },
          { bin_idx: 4, count: 10 },
        ];
      },
    } as unknown as WorkerBridge;

    const data = await fetchIntervalHistogramData('t', 'dur', [], bridge, 5);
    expect(data.bins).toHaveLength(5);
    expect(data.nullCount).toBe(5);
    expect(data.total).toBe(105);
    expect(data.minSeconds).toBe(0);
    expect(data.maxSeconds).toBe(3600);
    expect(data.medianSeconds).toBe(1800);
    expect(data.isSingleValue).toBe(false);
  });
});
