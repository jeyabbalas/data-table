import { describe, it, expect, vi } from 'vitest';
import {
  parseIntervalToSeconds,
  parseIntervalFields,
  secondsToIntervalString,
  intervalFieldsToString,
  intervalToSecondsSQL,
  intervalBrushFilter,
  intervalFilterBars,
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
  });

  it('keeps the fraction of a second', () => {
    // EXTRACT(second …) is a whole number; the microseconds hold the
    // seconds within the minute with their fraction.
    const sql = intervalToSecondsSQL('"duration"');
    expect(sql).toContain('EXTRACT(microseconds FROM "duration") / 1000000.0');
    expect(sql).not.toContain('EXTRACT(second');
  });

  it('should use correct conversion constants', () => {
    const sql = intervalToSecondsSQL('"col"');
    // Integer constants keep the whole seconds BIGINT, not DECIMAL, arithmetic.
    expect(sql).toContain(`* ${MONTH_SECONDS} +`);
    expect(sql).toContain('* 86400 +'); // DAY_SECONDS
    expect(sql).toContain('* 3600 +');
    expect(sql).toContain('* 60 +');
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

  it('should parse 100 hours or more', () => {
    // DuckDB writes every hour of the time part.
    expect(parseIntervalToSeconds('100:00:01.5')).toBe(360001.5);
    expect(parseIntervalToSeconds('-100:00:00')).toBe(-360000);
    expect(parseIntervalToSeconds('-1 day -100:00:01.5')).toBe(-86400 - 360001.5);
    expect(parseIntervalToSeconds('2562047788:00:54.775807')).toBeCloseTo(9223372036854.775, 3);
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

  it('reads every unit DuckDB reads, by any of its names', () => {
    expect(parseIntervalToSeconds('2 hours')).toBe(7200);
    expect(parseIntervalToSeconds('90 minutes')).toBe(5400);
    expect(parseIntervalToSeconds('1.5 seconds')).toBe(1.5);
    expect(parseIntervalToSeconds('500 milliseconds')).toBe(0.5);
    expect(parseIntervalToSeconds('250 microseconds')).toBeCloseTo(0.00025, 12);
    // Singular, short, unspaced, any case
    expect(parseIntervalToSeconds('1 hour')).toBe(3600);
    expect(parseIntervalToSeconds('2 hrs')).toBe(7200);
    expect(parseIntervalToSeconds('2h')).toBe(7200);
    expect(parseIntervalToSeconds('2HOURS')).toBe(7200);
    expect(parseIntervalToSeconds('30 mins')).toBe(1800);
    expect(parseIntervalToSeconds('45 secs')).toBe(45);
    expect(parseIntervalToSeconds('500ms')).toBe(0.5);
    expect(parseIntervalToSeconds('250 us')).toBeCloseTo(0.00025, 12);
    expect(parseIntervalToSeconds('2 w')).toBe(14 * 86400);
    expect(parseIntervalToSeconds('1 mon')).toBe(MONTH_SECONDS);
    expect(parseIntervalToSeconds('1 quarter')).toBe(3 * MONTH_SECONDS);
    expect(parseIntervalToSeconds('1 yr')).toBe(YEAR_SECONDS);
    expect(parseIntervalToSeconds('1 decade')).toBe(10 * YEAR_SECONDS);
    expect(parseIntervalToSeconds('1 century')).toBe(100 * YEAR_SECONDS);
    expect(parseIntervalToSeconds('1 millennium')).toBe(1000 * YEAR_SECONDS);
    // Several pairs, and a pair beside a clock part
    expect(parseIntervalToSeconds('1 hour 30 minutes')).toBe(5400);
    expect(parseIntervalToSeconds('1h 30m')).toBe(5400);
    expect(parseIntervalToSeconds('2 hours -30 minutes')).toBe(5400);
    expect(parseIntervalToSeconds('1 day 2 hours')).toBe(93600);
    expect(parseIntervalToSeconds('1 week 01:00:00')).toBe(7 * 86400 + 3600);
  });

  it('splits a fraction as DuckDB stores it', () => {
    // A month's fraction becomes whole days, 30 to a month: 1 month 15 days.
    expect(parseIntervalToSeconds('1.5 months')).toBe(MONTH_SECONDS + 15 * 86400);
    // 1 month 9 days: the 0.9 day left over is dropped.
    expect(parseIntervalToSeconds('1.33 months')).toBe(MONTH_SECONDS + 9 * 86400);
    expect(parseIntervalToSeconds('0.3 quarters')).toBe(27 * 86400);
    // A year's fraction becomes whole months only: 13 months.
    expect(parseIntervalToSeconds('1.1 years')).toBe(13 * MONTH_SECONDS);
    // A day's fraction becomes time.
    expect(parseIntervalToSeconds('1.5 days')).toBe(1.5 * 86400);
    expect(parseIntervalToSeconds('-1.5 days')).toBe(-1.5 * 86400);
    expect(parseIntervalToSeconds('1.7 weeks')).toBeCloseTo(11.9 * 86400, 6);
  });

  it('reads a short clock part and a trailing "ago" as DuckDB does', () => {
    expect(parseIntervalToSeconds('10:00')).toBe(36000);
    expect(parseIntervalToSeconds('1:02:03')).toBe(3723);
    expect(parseIntervalToSeconds('2 hours ago')).toBe(-7200);
    expect(parseIntervalToSeconds('1 month ago')).toBe(-MONTH_SECONDS);
    // DuckDB ignores "ago" after a clock part.
    expect(parseIntervalToSeconds('1 day 01:00:00 ago')).toBe(90000);
  });

  it('should handle Arrow MonthDayNano interval objects', () => {
    expect(parseIntervalToSeconds({ months: 0, days: 0, nanoseconds: 3_600_000_000_000 })).toBe(
      3600,
    );
    expect(parseIntervalToSeconds({ months: 0, days: 1, nanoseconds: 0 })).toBe(86400);
    expect(parseIntervalToSeconds({ months: 1, days: 0, nanoseconds: 0 })).toBe(MONTH_SECONDS);
  });

  it('should handle DuckDB internal interval objects with micros', () => {
    expect(parseIntervalToSeconds({ months: 0, days: 0, micros: 3_600_000_000 })).toBe(3600);
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

  it("splits a total on the chart's scale, a month 30.4375 days", () => {
    // A grid cell shows `45 days` as stored, `45d` (intervalFieldsToString).
    expect(secondsToIntervalString(45 * 86400)).toBe('1mo 14d 13h 30m');
  });

  it('keeps the microseconds of a value under a second', () => {
    // Rounded to milliseconds, these read 0s and 0.001s.
    expect(secondsToIntervalString(1e-6)).toBe('0.000001s');
    expect(secondsToIntervalString(0.0005)).toBe('0.0005s');
    expect(secondsToIntervalString(-0.0005)).toBe('-0.0005s');
    expect(secondsToIntervalString(0.496)).toBe('0.496s');
    // From a second up, milliseconds.
    expect(secondsToIntervalString(1.25)).toBe('1.25s');
    expect(secondsToIntervalString(1.0004)).toBe('1s');
  });

  it('carries rounding into the minutes, hours and days', () => {
    expect(secondsToIntervalString(119.9999999)).toBe('2m'); // not 1m 60s
    expect(secondsToIntervalString(3599.9999)).toBe('1h');
    expect(secondsToIntervalString(86399.9999)).toBe('1d');
    expect(secondsToIntervalString(0.9999999)).toBe('1s');
    expect(secondsToIntervalString(-119.9999999)).toBe('-2m');
  });
});

// =========================================
// parseIntervalFields Tests
// =========================================

describe('parseIntervalFields', () => {
  it('reads the fields DuckDB stores', () => {
    expect(parseIntervalFields('1 year 2 months 3 days 04:05:06.789')).toEqual({
      months: 14,
      days: 3,
      micros: 14_706_789_000,
    });
    expect(parseIntervalFields('-1 day -01:00:00')).toEqual({
      months: 0,
      days: -1,
      micros: -3_600_000_000,
    });
    expect(parseIntervalFields('1.5 months')).toEqual({ months: 1, days: 15, micros: 0 });
    expect(parseIntervalFields('1.7 weeks')).toEqual({
      months: 0,
      days: 11,
      micros: 77_760_000_000,
    });
    expect(parseIntervalFields('2 hours ago')).toEqual({
      months: 0,
      days: 0,
      micros: -7_200_000_000,
    });
    expect(parseIntervalFields('  ')).toBeNull();
  });

  it('drops what is finer than a microsecond, as DuckDB does', () => {
    expect(parseIntervalFields('01:02:03.1234567')!.micros).toBe(3_723_123_456);
    expect(parseIntervalFields('01:02:03.9999999')!.micros).toBe(3_723_999_999);
    expect(parseIntervalFields('00:00:00.0000009')!.micros).toBe(0);
    expect(parseIntervalFields('0.0000015 seconds')!.micros).toBe(1);
    expect(parseIntervalFields('1.0000015 seconds')!.micros).toBe(1_000_001);
    expect(parseIntervalFields('-0.0000015 seconds')!.micros).toBe(-1);
    expect(parseIntervalFields('0.0015 ms')!.micros).toBe(1);
    // A number keeps six digits of its fraction: 0.123456 minutes.
    expect(parseIntervalFields('0.123456789 minutes')!.micros).toBe(7_407_360);
    expect(parseIntervalFields('1.0000000001 days')).toEqual({ months: 0, days: 1, micros: 0 });
    // Microseconds round, half away from zero.
    expect(parseIntervalFields('2.5 us')!.micros).toBe(3);
    expect(parseIntervalFields('2.4 us')!.micros).toBe(2);
    expect(parseIntervalFields('-2.5 us')!.micros).toBe(-3);
  });
});

// =========================================
// intervalFieldsToString Tests
// =========================================

describe('intervalFieldsToString', () => {
  it('shows each field as DuckDB stores it', () => {
    expect(intervalFieldsToString({ months: 14, days: 3, micros: 14_706_000_000 })).toBe(
      '1y 2mo 3d 4h 5m 6s',
    );
    // Not split on the chart's 30.4375-day month.
    expect(intervalFieldsToString({ months: 0, days: 45, micros: 0 })).toBe('45d');
    expect(intervalFieldsToString({ months: 0, days: 0, micros: 360_000_500_000 })).toBe(
      '100h 0.5s',
    );
    expect(intervalFieldsToString({ months: 0, days: 0, micros: 1 })).toBe('0.000001s');
    expect(intervalFieldsToString({ months: 0, days: 0, micros: 0 })).toBe('0s');
  });

  it('leads with one sign when every field is negative, and keeps each one otherwise', () => {
    expect(intervalFieldsToString({ months: -14, days: -3, micros: -14_706_000_000 })).toBe(
      '-1y 2mo 3d 4h 5m 6s',
    );
    expect(intervalFieldsToString({ months: 0, days: 1, micros: -3_600_000_000 })).toBe('1d -1h');
  });
});

// =========================================
// Brush ↔ Filter Tests
// =========================================

describe('intervalBrushFilter and intervalFilterBars', () => {
  const bar = (start: number, end: number, count: number, values?: [string, string]) => ({
    binStartSeconds: start,
    binEndSeconds: end,
    count,
    ...(values && { minValue: values[0], maxValue: values[1] }),
  });
  // 0 to 60 minutes in five bars, as the unfiltered fetch fills them; bar 2 holds no value.
  const bins = [
    bar(0, 720, 3, ['00:01:00', '00:11:00']),
    bar(720, 1440, 2, ['00:12:00', '00:23:59.999999']),
    bar(1440, 2160, 0),
    bar(2160, 2880, 4, ['00:36:00.5', '00:47:00']),
    bar(2880, 3600, 1, ['01:00:00', '01:00:00']),
  ];
  const range = (min: string | number, max: string | number, maxInclusive = false) => ({
    type: 'range' as const,
    column: 'd',
    min,
    max,
    valueType: 'interval' as const,
    ...(maxInclusive && { maxInclusive }),
  });

  it("filters from the first bar's smallest value to the last one's largest, inclusive", () => {
    expect(intervalBrushFilter('d', bins, 0, 1)).toEqual({
      column: 'd',
      type: 'range',
      min: '00:01:00',
      max: '00:23:59.999999',
      valueType: 'interval',
      maxInclusive: true,
    });
  });

  it('skips bars holding no value, and writes nothing for those alone', () => {
    expect(intervalBrushFilter('d', bins, 1, 3)).toMatchObject({
      min: '00:12:00',
      max: '00:47:00',
    });
    expect(intervalBrushFilter('d', bins, 2, 2)).toBeNull();
  });

  it('restores every brush onto the bars holding its values', () => {
    for (let start = 0; start < bins.length; start++) {
      for (let end = start; end < bins.length; end++) {
        const holding = [0, 1, 3, 4].filter((i) => i >= start && i <= end);
        const filter = intervalBrushFilter('d', bins, start, end);
        if (holding.length === 0) {
          expect(filter).toBeNull();
          continue;
        }
        expect(intervalFilterBars(filter!, bins), `bars ${start}–${end}`).toEqual([
          holding[0],
          holding[holding.length - 1],
        ]);
      }
    }
  });

  it('reads a filter added in code, or written by an older version from bar edges', () => {
    // Unit text: from 12 minutes up to, not including, 36.
    expect(intervalFilterBars(range('12 minutes', '0.6 hours'), bins)).toEqual([1, 1]);
    // Bars 1–3 as an older version wrote them: edges, the last one excluded.
    expect(intervalFilterBars(range('00:12:00', '00:48:00'), bins)).toEqual([1, 3]);
    // A bound inside a bar's values takes the bar in.
    expect(intervalFilterBars(range('00:11:00', '00:30:00'), bins)).toEqual([0, 1]);
    expect(intervalFilterBars(range(-Infinity, '00:20:00'), bins)).toEqual([0, 1]);
    expect(intervalFilterBars(range('00:40:00', Infinity), bins)).toEqual([3, 4]);
    expect(intervalFilterBars(range('01:00:00', '01:00:00', true), bins)).toEqual([4, 4]);
    expect(intervalFilterBars(range('2 hours', '3 hours'), bins)).toBeNull();
  });
});

// =========================================
// fetchIntervalColumnStats Tests
// =========================================

describe('fetchIntervalColumnStats', () => {
  function mockBridge(rows: unknown[]): WorkerBridge {
    return {
      query: vi.fn(async () => rows),
    } as unknown as WorkerBridge;
  }

  it('should read the stats in seconds', async () => {
    const bridge = mockBridge([
      {
        min_sec: 3600,
        max_sec: 86400 + 2 * 3600 + 30 * 60,
        median_sec: 12 * 3600,
        count: 100,
        null_count: 5,
      },
    ]);

    const stats = await fetchIntervalColumnStats('t', 'dur', [], bridge);
    expect(stats.minSeconds).toBe(3600);
    expect(stats.maxSeconds).toBe(86400 + 2 * 3600 + 30 * 60);
    expect(stats.medianSeconds).toBe(12 * 3600);
    expect(stats.count).toBe(100);
    expect(stats.nullCount).toBe(5);
  });

  it('computes the stats on the seconds the bins use, in one query', async () => {
    const bridge = mockBridge([
      { min_sec: 1, max_sec: 2, median_sec: 1.5, count: 2, null_count: 0 },
    ]);

    await fetchIntervalColumnStats('t', 'dur', [], bridge);

    expect(bridge.query).toHaveBeenCalledOnce();
    const sql = vi.mocked(bridge.query).mock.calls[0]![0];
    const sec = intervalToSecondsSQL('"dur"');
    expect(sql).toContain(`MIN(${sec})`);
    expect(sql).toContain(`MAX(${sec})`);
    expect(sql).toContain(`APPROX_QUANTILE(${sec}, 0.5)`);
    expect(sql).not.toContain('VARCHAR');
  });

  it('should handle all-null column', async () => {
    const bridge = mockBridge([
      {
        min_sec: null,
        max_sec: null,
        median_sec: null,
        count: 0,
        null_count: 10,
      },
    ]);

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

  it('gives each bin its smallest and largest value when asked', async () => {
    const query = vi.fn(async () => [
      { bin_idx: 0, count: 2, min_value: '00:00:01', max_value: '00:00:02' },
      { bin_idx: 2, count: 1, min_value: '00:00:09', max_value: '00:00:09' },
    ]);
    const bridge = { query } as unknown as WorkerBridge;

    const bins = await fetchIntervalNumericBins('t', 'dur', 3, 1, 9, [], bridge, true);

    expect(query.mock.calls[0]![0]).toContain('arg_min("dur", ');
    expect(bins.map((bin) => [bin.minValue, bin.maxValue])).toEqual([
      ['00:00:01', '00:00:02'],
      [undefined, undefined],
      ['00:00:09', '00:00:09'],
    ]);
  });
});

// =========================================
// fetchIntervalHistogramData Tests
// =========================================

describe('fetchIntervalHistogramData', () => {
  it('should return empty bins for all-null data', async () => {
    const bridge = {
      query: async () => [
        {
          min_sec: null,
          max_sec: null,
          median_sec: null,
          count: 0,
          null_count: 10,
        },
      ],
    } as unknown as WorkerBridge;

    const data = await fetchIntervalHistogramData('t', 'dur', [], bridge, 10);
    expect(data.bins).toHaveLength(0);
    expect(data.nullCount).toBe(10);
    expect(data.total).toBe(10);
    expect(data.isSingleValue).toBe(false);
    expect(data.minSeconds).toBeNull();
  });

  it('should handle single value', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { min_sec: 3600, max_sec: 3600, median_sec: 3600, count: 50, null_count: 0 },
      ])
      // One bin takes every value, with the value for a brush.
      .mockResolvedValueOnce([
        { bin_idx: 0, count: 50, min_value: '01:00:00', max_value: '01:00:00' },
      ]);
    const bridge = { query } as unknown as WorkerBridge;

    const data = await fetchIntervalHistogramData('t', 'dur', [], bridge, 10);
    expect(data.isSingleValue).toBe(true);
    expect(data.bins).toEqual([
      {
        binStartSeconds: 3600,
        binEndSeconds: 3600,
        count: 50,
        minValue: '01:00:00',
        maxValue: '01:00:00',
      },
    ]);
    expect(query.mock.calls[1]![0]).toContain('0 as bin_idx');
    expect(data.minSeconds).toBe(3600);
    expect(data.maxSeconds).toBe(3600);
  });

  it('makes no bin narrower than a microsecond', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { min_sec: 0.000001, max_sec: 0.000003, median_sec: 0.000002, count: 2, null_count: 0 },
      ])
      .mockResolvedValueOnce([]);
    const bridge = { query } as unknown as WorkerBridge;

    // 1 µs and 3 µs: two bins of a microsecond, not fifteen of 0.13 µs.
    const data = await fetchIntervalHistogramData('t', 'dur', [], bridge);
    expect(data.bins).toHaveLength(2);
  });

  it('should fetch bins for normal data', async () => {
    let callCount = 0;
    const bridge = {
      query: async () => {
        callCount++;
        if (callCount === 1) {
          // Stats query
          return [
            {
              min_sec: 0,
              max_sec: 3600,
              median_sec: 1800,
              count: 100,
              null_count: 5,
            },
          ];
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
