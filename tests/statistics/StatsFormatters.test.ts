import { describe, it, expect } from 'vitest';
import { defaultStrings, mergeStrings } from '../../src/core/Strings';
import {
  formatStatValue,
  formatCount,
  formatDefaultStats,
  formatStatsLine1,
  formatStatsLine2,
} from '../../src/statistics/StatsFormatters';
import type {
  NumericColumnStats,
  CategoricalColumnStats,
  TemporalColumnStats,
  TimeColumnStats,
  IntervalColumnStats,
  NestedColumnStats,
} from '../../src/statistics/ColumnStatsTypes';

// =========================================
// formatStatValue — follows formatAxisValue rules
// =========================================

describe('formatStatValue', () => {
  it('formats zero', () => {
    expect(formatStatValue(0)).toBe('0');
  });

  it('formats small integers with locale separators', () => {
    expect(formatStatValue(42)).toBe('42');
    expect(formatStatValue(999)).toBe('999');
  });

  it('formats mid-range integers with locale separators', () => {
    const result = formatStatValue(1234);
    expect(result.replace(/\D/g, '')).toBe('1234');

    const result2 = formatStatValue(999999);
    expect(result2.replace(/\D/g, '')).toBe('999999');
  });

  it('uses scientific notation for |value| >= 1e6', () => {
    expect(formatStatValue(1000000)).toBe('1.00e+6');
    expect(formatStatValue(1234567)).toBe('1.23e+6');
    expect(formatStatValue(1e9)).toBe('1.00e+9');
    expect(formatStatValue(1e15)).toBe('1.00e+15');
    expect(formatStatValue(6.02e23)).toBe('6.02e+23');
  });

  it('uses scientific notation for |value| < 0.01', () => {
    expect(formatStatValue(0.001)).toBe('1.00e-3');
    expect(formatStatValue(0.00001)).toBe('1.00e-5');
    expect(formatStatValue(0.000000001)).toBe('1.00e-9');
    expect(formatStatValue(1.23e-10)).toBe('1.23e-10');
  });

  it('formats normal-range floats with up to 2 decimal places', () => {
    expect(formatStatValue(3.14)).toBe('3.14');
    expect(formatStatValue(0.1)).toBe('0.1');
    expect(formatStatValue(0.5)).toBe('0.5');
    expect(formatStatValue(99.99)).toBe('99.99');
    expect(formatStatValue(0.01)).toBe('0.01');
  });

  it('formats negative numbers', () => {
    expect(formatStatValue(-42)).toBe('-42');
    expect(formatStatValue(-1234567)).toBe('-1.23e+6');
    expect(formatStatValue(-0.001)).toBe('-1.00e-3');
    expect(formatStatValue(-4.56e-8)).toBe('-4.56e-8');
  });

  it('handles NaN and Infinity', () => {
    expect(formatStatValue(NaN)).toBe('NaN');
    expect(formatStatValue(Infinity)).toBe('\u221E');
    expect(formatStatValue(-Infinity)).toBe('-\u221E');
  });

  // Values from numeric-stress-tests.json
  it('handles extreme_large values from test fixture', () => {
    expect(formatStatValue(1000000000)).toBe('1.00e+9'); // 1e9
    expect(formatStatValue(100000000000000)).toBe('1.00e+14'); // 1e14
    expect(formatStatValue(1000000000000000)).toBe('1.00e+15'); // 1e15
  });

  it('handles tiny_values from test fixture', () => {
    expect(formatStatValue(0.1)).toBe('0.1'); // normal range
    expect(formatStatValue(0.05)).toBe('0.05'); // normal range
    expect(formatStatValue(0.01)).toBe('0.01'); // boundary
    expect(formatStatValue(0.005)).toBe('5.00e-3'); // scientific
    expect(formatStatValue(0.00001)).toBe('1.00e-5');
    expect(formatStatValue(0.0000000001)).toBe('1.00e-10');
  });

  it('handles scientific_notation values from test fixture', () => {
    expect(formatStatValue(1.23e10)).toBe('1.23e+10');
    expect(formatStatValue(-4.56e-8)).toBe('-4.56e-8');
    expect(formatStatValue(9.87e15)).toBe('9.87e+15');
    expect(formatStatValue(6.02e23)).toBe('6.02e+23');
    expect(formatStatValue(1.38e-23)).toBe('1.38e-23');
  });
});

// =========================================
// formatCount
// =========================================

describe('formatCount', () => {
  it('formats integers with locale separators', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(42)).toBe('42');
    expect(formatCount(1234).replace(/\D/g, '')).toBe('1234');
    expect(formatCount(1234567).replace(/\D/g, '')).toBe('1234567');
  });
});

// =========================================
// formatDefaultStats - Line 1 (universal)
// =========================================

describe('formatDefaultStats - Line 1', () => {
  const makeNumericStats = (overrides: Partial<NumericColumnStats> = {}): NumericColumnStats => ({
    kind: 'numeric',
    totalRows: 1234,
    nonNullCount: 1234,
    nullCount: 0,
    filteredTotalRows: null,
    min: 0,
    max: 100,
    median: 50,
    distinctCount: 100,
    ...overrides,
  });

  it('shows row count with no filter and no nulls', () => {
    const result = formatDefaultStats(makeNumericStats(), 'integer');
    expect(result).toContain('1,234 rows');
    expect(result).not.toContain('null');
  });

  it('shows null count when nulls present', () => {
    const result = formatDefaultStats(
      makeNumericStats({ nullCount: 5, nonNullCount: 1229 }),
      'integer',
    );
    expect(result).toContain('1,234 rows');
    expect(result).toContain('5 null');
  });

  it('shows "all null" when all values are null', () => {
    const result = formatDefaultStats(
      makeNumericStats({
        nullCount: 1234,
        nonNullCount: 0,
        min: null,
        max: null,
        median: null,
      }),
      'integer',
    );
    expect(result).toContain('all null');
    // Should not have a line 2
    expect(result).not.toContain('dt-stats-line2');
  });

  it('shows filtered / total format', () => {
    const result = formatDefaultStats(makeNumericStats({ filteredTotalRows: 892 }), 'integer');
    expect(result).toContain('892');
    expect(result).toContain('1,234');
    expect(result).toContain('/');
  });

  it('shows filtered format with null count', () => {
    const result = formatDefaultStats(
      makeNumericStats({
        filteredTotalRows: 892,
        nullCount: 3,
        nonNullCount: 889,
      }),
      'integer',
    );
    expect(result).toContain('892');
    expect(result).toContain('1,234');
    expect(result).toContain('3 null');
  });

  it('uses singular "row" for count of 1', () => {
    const result = formatDefaultStats(
      makeNumericStats({
        totalRows: 1,
        nonNullCount: 1,
        nullCount: 0,
        distinctCount: 1,
      }),
      'integer',
    );
    expect(result).toContain('1 row');
    expect(result).not.toContain('1 rows');
  });

  it('shows nothing extra for 0 rows', () => {
    const result = formatDefaultStats(
      makeNumericStats({
        totalRows: 0,
        nonNullCount: 0,
        nullCount: 0,
        min: null,
        max: null,
        median: null,
      }),
      'integer',
    );
    expect(result).toContain('0 rows');
    expect(result).not.toContain('dt-stats-line2');
  });

  it('shows the fraction whenever a filter is active, even when filtered count equals total', () => {
    const result = formatDefaultStats(makeNumericStats({ filteredTotalRows: 1234 }), 'integer');
    expect(result).toContain('1,234 / 1,234 rows');
  });

  it('never shows a fraction when no filter is active', () => {
    const result = formatDefaultStats(makeNumericStats({ filteredTotalRows: null }), 'integer');
    expect(result).not.toContain(' / ');
  });
});

// =========================================
// formatStatsLine1 / formatStatsLine2 (granular formatters)
// =========================================

describe('formatStatsLine1', () => {
  const makeNumericStats = (overrides: Partial<NumericColumnStats> = {}): NumericColumnStats => ({
    kind: 'numeric',
    totalRows: 1234,
    nonNullCount: 1234,
    nullCount: 0,
    filteredTotalRows: null,
    min: 0,
    max: 100,
    median: 50,
    distinctCount: 100,
    ...overrides,
  });

  it('returns plain text without HTML wrapping', () => {
    const result = formatStatsLine1(makeNumericStats());
    expect(result).toBe('1,234 rows');
    expect(result).not.toContain('<');
  });

  it('shows fraction with F equal to N when a filter is active', () => {
    expect(formatStatsLine1(makeNumericStats({ filteredTotalRows: 1234 }))).toBe(
      '1,234 / 1,234 rows',
    );
  });

  it('shows fraction with null annotation counted within the filtered set', () => {
    const result = formatStatsLine1(
      makeNumericStats({ filteredTotalRows: 892, nullCount: 3, nonNullCount: 889 }),
    );
    expect(result).toBe('892 / 1,234 rows · 3 null');
  });

  it('shows "all null" when nulls equal the filtered count', () => {
    const result = formatStatsLine1(
      makeNumericStats({ filteredTotalRows: 10, nullCount: 10, nonNullCount: 0 }),
    );
    expect(result).toContain('all null');
  });
});

describe('formatStatsLine2', () => {
  const makeNumericStats = (overrides: Partial<NumericColumnStats> = {}): NumericColumnStats => ({
    kind: 'numeric',
    totalRows: 1234,
    nonNullCount: 1234,
    nullCount: 0,
    filteredTotalRows: null,
    min: 0,
    max: 100,
    median: 50,
    distinctCount: 100,
    ...overrides,
  });

  it('returns the type-specific summary as raw text', () => {
    const result = formatStatsLine2(makeNumericStats(), 'integer');
    expect(result).toContain('min');
    expect(result).toContain('max');
    expect(result).not.toContain('dt-stats-line2');
  });

  it('returns empty string for 0 rows', () => {
    const result = formatStatsLine2(
      makeNumericStats({ totalRows: 0, nonNullCount: 0, min: null, max: null, median: null }),
      'integer',
    );
    expect(result).toBe('');
  });

  it('returns empty string when all values in the filtered set are null', () => {
    const result = formatStatsLine2(
      makeNumericStats({ filteredTotalRows: 10, nullCount: 10, nonNullCount: 0 }),
      'integer',
    );
    expect(result).toBe('');
  });

  it('composes with formatStatsLine1 to reproduce formatDefaultStats output', () => {
    const stats = makeNumericStats({ filteredTotalRows: 892, nullCount: 3, nonNullCount: 889 });
    const line1 = formatStatsLine1(stats);
    const line2 = formatStatsLine2(stats, 'integer');
    expect(formatDefaultStats(stats, 'integer')).toBe(
      `<span class="dt-stats-line1">${line1}</span><br><span class="dt-stats-line2">${line2}</span>`,
    );
  });
});

// =========================================
// formatDefaultStats - Line 2: Numeric
// =========================================

describe('formatDefaultStats - Numeric Line 2', () => {
  const makeNumeric = (overrides: Partial<NumericColumnStats> = {}): NumericColumnStats => ({
    kind: 'numeric',
    totalRows: 1000,
    nonNullCount: 1000,
    nullCount: 0,
    filteredTotalRows: null,
    min: 0,
    max: 100,
    median: 50,
    distinctCount: 100,
    ...overrides,
  });

  it('shows min · med · max', () => {
    const result = formatDefaultStats(makeNumeric(), 'integer');
    expect(result).toContain('min 0');
    expect(result).toContain('med 50');
    expect(result).toContain('max 100');
    expect(result).toContain('dt-stats-line2');
  });

  it('shows "all values" for single value', () => {
    const result = formatDefaultStats(
      makeNumeric({ min: 42, max: 42, median: 42, distinctCount: 1 }),
      'integer',
    );
    expect(result).toContain('all values: 42');
  });

  it('uses scientific notation for large values', () => {
    const result = formatDefaultStats(
      makeNumeric({ min: 0, max: 1200000, median: 50000 }),
      'float',
    );
    expect(result).toContain('1.20e+6');
    // 50,000 is < 1e6, so locale-formatted as integer
    expect(result).toContain('50,000');
  });

  it('omits line 2 when min/max are null', () => {
    const result = formatDefaultStats(
      makeNumeric({
        min: null,
        max: null,
        median: null,
        nonNullCount: 0,
        nullCount: 1000,
      }),
      'integer',
    );
    expect(result).not.toContain('dt-stats-line2');
  });
});

// =========================================
// Line 2: Numeric, non-finite values
// =========================================

describe('formatStatsLine2 - numeric non-finite note', () => {
  // 1,000 rows: 960 finite, 30 NaN or ±Infinity, 10 null.
  const makeNumeric = (overrides: Partial<NumericColumnStats> = {}): NumericColumnStats => ({
    kind: 'numeric',
    totalRows: 1000,
    nonNullCount: 990,
    nullCount: 10,
    filteredTotalRows: null,
    min: 0.57,
    max: 142.71,
    median: 71.61,
    distinctCount: 960,
    nonFiniteCount: 30,
    ...overrides,
  });

  it('ends line 2 with the count of values the chart leaves out', () => {
    expect(formatStatsLine2(makeNumeric(), 'float')).toBe(
      'min 0.57 · med 71.61 · max 142.71 · 30 non-finite',
    );
    expect(formatDefaultStats(makeNumeric(), 'float')).toBe(
      '<span class="dt-stats-line1">1,000 rows · 10 null</span><br>' +
        '<span class="dt-stats-line2">min 0.57 · med 71.61 · max 142.71 · 30 non-finite</span>',
    );
  });

  it('adds nothing for a count of 0, or none', () => {
    const plain = 'min 0.57 · med 71.61 · max 142.71';
    expect(formatStatsLine2(makeNumeric({ nonFiniteCount: 0 }), 'float')).toBe(plain);
    expect(formatStatsLine2(makeNumeric({ nonFiniteCount: undefined }), 'float')).toBe(plain);
    const { nonFiniteCount: _omitted, ...withoutField } = makeNumeric();
    expect(formatStatsLine2(withoutField, 'float')).toBe(plain);
  });

  it('shows the note alone when no value is finite', () => {
    const stats = makeNumeric({
      totalRows: 5,
      nonNullCount: 4,
      nullCount: 1,
      min: null,
      max: null,
      median: null,
      distinctCount: 0,
      nonFiniteCount: 4,
    });
    expect(formatStatsLine2(stats, 'float')).toBe('4 non-finite');
    // No nulls either: the chart draws "No data", and line 2 says why.
    expect(formatStatsLine2({ ...stats, totalRows: 4, nullCount: 0 }, 'float')).toBe(
      '4 non-finite',
    );
  });

  it('keeps min · med · max for one finite value beside non-finite ones', () => {
    const stats = makeNumeric({ min: 5, max: 5, median: 5, distinctCount: 1, nonFiniteCount: 1 });
    // "all values: 5" would be false.
    expect(formatStatsLine2(stats, 'float')).toBe('min 5 · med 5 · max 5 · 1 non-finite');
    expect(formatStatsLine2({ ...stats, nonFiniteCount: 0 }, 'float')).toBe('all values: 5');
  });

  it('takes the note from messages', () => {
    const messages = mergeStrings(defaultStrings, {
      statistics: { nonFiniteCount: (count) => `${count} non finies` },
    });
    expect(formatStatsLine2(makeNumeric(), 'float', messages)).toBe(
      'min 0.57 · med 71.61 · max 142.71 · 30 non finies',
    );
  });
});

// =========================================
// formatDefaultStats - Line 2: Categorical
// =========================================

describe('formatDefaultStats - Categorical Line 2', () => {
  const makeCategorical = (
    overrides: Partial<CategoricalColumnStats> = {},
  ): CategoricalColumnStats => ({
    kind: 'categorical',
    totalRows: 1000,
    nonNullCount: 1000,
    nullCount: 0,
    filteredTotalRows: null,
    distinctCount: 12,
    ...overrides,
  });

  it('shows unique count for strings', () => {
    const result = formatDefaultStats(makeCategorical(), 'string');
    expect(result).toContain('12 unique');
  });

  it('shows "all unique" when all values are distinct', () => {
    const result = formatDefaultStats(makeCategorical({ distinctCount: 1000 }), 'string');
    expect(result).toContain('all unique');
  });

  it('does not show "all unique" for single-row data', () => {
    const result = formatDefaultStats(
      makeCategorical({
        totalRows: 1,
        nonNullCount: 1,
        distinctCount: 1,
      }),
      'string',
    );
    // Single value doesn't qualify as "all unique" (need > 1)
    expect(result).not.toContain('all unique');
    expect(result).toContain('1 unique');
  });

  it('shows percentage true for booleans', () => {
    const result = formatDefaultStats(
      makeCategorical({ trueCount: 670, nonNullCount: 1000 }),
      'boolean',
    );
    expect(result).toContain('67% true');
  });

  it('shows 0% true for all-false boolean', () => {
    const result = formatDefaultStats(
      makeCategorical({ trueCount: 0, nonNullCount: 1000 }),
      'boolean',
    );
    expect(result).toContain('0% true');
  });

  it('shows 100% true for all-true boolean', () => {
    const result = formatDefaultStats(
      makeCategorical({ trueCount: 1000, nonNullCount: 1000 }),
      'boolean',
    );
    expect(result).toContain('100% true');
  });

  it('rounds boolean percentage correctly at boundary', () => {
    // 999/1000 = 99.9% → rounds to 100% (Math.round behavior)
    const result = formatDefaultStats(
      makeCategorical({ trueCount: 999, nonNullCount: 1000 }),
      'boolean',
    );
    expect(result).toContain('100% true');

    // 1/3 = 33.33% → rounds to 33%
    const result2 = formatDefaultStats(
      makeCategorical({ trueCount: 1, nonNullCount: 3 }),
      'boolean',
    );
    expect(result2).toContain('33% true');

    // 2/3 = 66.67% → rounds to 67%
    const result3 = formatDefaultStats(
      makeCategorical({ trueCount: 2, nonNullCount: 3 }),
      'boolean',
    );
    expect(result3).toContain('67% true');
  });

  it('shows unique count with percentage for uuid', () => {
    const result = formatDefaultStats(makeCategorical(), 'uuid');
    expect(result).toContain('12 unique');
    expect(result).toContain('(1%)');
  });

  it('shows "all unique" for uuid when all distinct', () => {
    const result = formatDefaultStats(makeCategorical({ distinctCount: 1000 }), 'uuid');
    expect(result).toContain('all unique');
  });
});

// =========================================
// formatDefaultStats - Line 2: Temporal
// =========================================

describe('formatDefaultStats - Temporal Line 2', () => {
  const makeTemporal = (overrides: Partial<TemporalColumnStats> = {}): TemporalColumnStats => ({
    kind: 'temporal',
    totalRows: 1000,
    nonNullCount: 1000,
    nullCount: 0,
    filteredTotalRows: null,
    min: '2020-01-01',
    max: '2024-12-31',
    ...overrides,
  });

  it('shows date range', () => {
    const result = formatDefaultStats(makeTemporal(), 'date');
    expect(result).toContain('2020-01-01');
    expect(result).toContain('2024-12-31');
    // Uses en-dash
    expect(result).toContain('\u2013');
  });

  it('shows "all values" for single date', () => {
    const result = formatDefaultStats(
      makeTemporal({ min: '2024-01-01', max: '2024-01-01' }),
      'date',
    );
    expect(result).toContain('all values: 2024-01-01');
  });

  it('handles timestamp format by extracting date', () => {
    const result = formatDefaultStats(
      makeTemporal({
        min: '2020-01-01 08:00:00',
        max: '2024-12-31 23:59:59',
      }),
      'timestamp',
    );
    expect(result).toContain('2020-01-01');
    expect(result).toContain('2024-12-31');
  });

  it('omits line 2 when min/max are null', () => {
    const result = formatDefaultStats(
      makeTemporal({
        min: null,
        max: null,
        nonNullCount: 0,
        nullCount: 1000,
      }),
      'date',
    );
    expect(result).not.toContain('dt-stats-line2');
  });
});

// =========================================
// Line 2: Temporal, years before 1 or past 9999, and non-finite values
// =========================================

describe('formatStatsLine2 - temporal extremes', () => {
  // 1,000 rows: 988 dates from 44 BC to the year 12000, 2 infinity, 10 null.
  const makeTemporal = (overrides: Partial<TemporalColumnStats> = {}): TemporalColumnStats => ({
    kind: 'temporal',
    totalRows: 1000,
    nonNullCount: 990,
    nullCount: 10,
    filteredTotalRows: null,
    min: '-000043-03-15T00:00:00.000Z',
    max: '+012000-01-01T00:00:00.000Z',
    nonFiniteCount: 2,
    ...overrides,
  });

  it('writes a year before 1 or past 9999 as the grid does, and ends with the note', () => {
    expect(formatStatsLine2(makeTemporal(), 'date')).toBe(
      '-000043-03-15 – +012000-01-01 · 2 non-finite',
    );
    expect(formatStatsLine2(makeTemporal({ nonFiniteCount: 0 }), 'timestamp')).toBe(
      '-000043-03-15 – +012000-01-01',
    );
    expect(
      formatStatsLine2(
        makeTemporal({ min: '0050-06-15T00:00:00.000Z', max: '2024-12-31T23:59:59.000Z' }),
        'timestamp',
      ),
    ).toBe('0050-06-15 – 2024-12-31 · 2 non-finite');
  });

  it('adds nothing for a count of 0, or none', () => {
    const plain = '-000043-03-15 – +012000-01-01';
    expect(formatStatsLine2(makeTemporal({ nonFiniteCount: undefined }), 'date')).toBe(plain);
    const { nonFiniteCount: _omitted, ...withoutField } = makeTemporal();
    expect(formatStatsLine2(withoutField, 'date')).toBe(plain);
  });

  it('shows the note alone when no date can be drawn', () => {
    const stats = makeTemporal({ min: null, max: null, nonNullCount: 3, nonFiniteCount: 3 });
    expect(formatStatsLine2(stats, 'date')).toBe('3 non-finite');
  });

  it('keeps the range for one date beside non-finite ones', () => {
    const one = { min: '2024-06-15T12:00:00.000Z', max: '2024-06-15T12:00:00.000Z' };
    // "all values: 2024-06-15" would be false.
    expect(formatStatsLine2(makeTemporal({ ...one, nonFiniteCount: 1 }), 'timestamp')).toBe(
      '2024-06-15 – 2024-06-15 · 1 non-finite',
    );
    expect(formatStatsLine2(makeTemporal({ ...one, nonFiniteCount: 0 }), 'timestamp')).toBe(
      'all values: 2024-06-15',
    );
  });

  it('takes the note from messages', () => {
    const messages = mergeStrings(defaultStrings, {
      statistics: { nonFiniteCount: (count) => `${count} non finies`, separator: ' | ' },
    });
    expect(formatStatsLine2(makeTemporal(), 'date', messages)).toBe(
      '-000043-03-15 – +012000-01-01 | 2 non finies',
    );
  });
});

// =========================================
// formatDefaultStats - Line 2: Time
// =========================================

describe('formatDefaultStats - Time Line 2', () => {
  const makeTime = (overrides: Partial<TimeColumnStats> = {}): TimeColumnStats => ({
    kind: 'time',
    totalRows: 1000,
    nonNullCount: 1000,
    nullCount: 0,
    filteredTotalRows: null,
    minSeconds: 8 * 3600, // 08:00:00
    maxSeconds: 23 * 3600 + 45 * 60, // 23:45:00
    ...overrides,
  });

  it('shows time range', () => {
    const result = formatDefaultStats(makeTime(), 'time');
    expect(result).toContain('08:00:00');
    expect(result).toContain('23:45:00');
    expect(result).toContain('\u2013');
  });

  it('shows "all values" for single time', () => {
    const result = formatDefaultStats(makeTime({ minSeconds: 3600, maxSeconds: 3600 }), 'time');
    expect(result).toContain('all values: 01:00:00');
  });

  it('omits line 2 when null', () => {
    const result = formatDefaultStats(
      makeTime({
        minSeconds: null,
        maxSeconds: null,
        nonNullCount: 0,
        nullCount: 1000,
      }),
      'time',
    );
    expect(result).not.toContain('dt-stats-line2');
  });
});

// =========================================
// formatDefaultStats - Line 2: Interval
// =========================================

describe('formatDefaultStats - Interval Line 2', () => {
  const makeInterval = (overrides: Partial<IntervalColumnStats> = {}): IntervalColumnStats => ({
    kind: 'interval',
    totalRows: 1000,
    nonNullCount: 1000,
    nullCount: 0,
    filteredTotalRows: null,
    minDisplay: '2m',
    maxDisplay: '2h',
    medianDisplay: '30m',
    ...overrides,
  });

  it('shows min · med · max for intervals', () => {
    const result = formatDefaultStats(makeInterval(), 'interval');
    expect(result).toContain('min 2m');
    expect(result).toContain('med 30m');
    expect(result).toContain('max 2h');
  });

  it('shows "all values" for single interval', () => {
    const result = formatDefaultStats(
      makeInterval({
        minDisplay: '1h',
        maxDisplay: '1h',
        medianDisplay: '1h',
      }),
      'interval',
    );
    expect(result).toContain('all values: 1h');
  });

  it('HTML-escapes interval display values', () => {
    const result = formatDefaultStats(
      makeInterval({
        minDisplay: '<script>',
        maxDisplay: '&danger',
        medianDisplay: '"quoted"',
      }),
      'interval',
    );
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&amp;danger');
    expect(result).toContain('&quot;quoted&quot;');
  });
});

// =========================================
// formatDefaultStats - Line 2: Nested
// =========================================

describe('formatDefaultStats - Nested Line 2', () => {
  const makeNested = (overrides: Partial<NestedColumnStats> = {}): NestedColumnStats => ({
    kind: 'nested',
    totalRows: 1000,
    nonNullCount: 990,
    nullCount: 10,
    filteredTotalRows: null,
    outline: 'x double · y double · tier varchar',
    ...overrides,
  });

  it('shows the type outline as line 2, and the counts as line 1', () => {
    const stats = makeNested();
    expect(formatStatsLine2(stats, 'nested')).toBe('x double · y double · tier varchar');
    expect(formatDefaultStats(stats, 'nested')).toBe(
      '<span class="dt-stats-line1">1,000 rows · 10 null</span><br>' +
        '<span class="dt-stats-line2">x double · y double · tier varchar</span>',
    );
  });

  it('counts the filtered rows in line 1', () => {
    const stats = makeNested({ filteredTotalRows: 120, nonNullCount: 118, nullCount: 2 });
    expect(formatStatsLine1(stats)).toBe('120 / 1,000 rows · 2 null');
    expect(formatStatsLine2(stats, 'nested')).toBe('x double · y double · tier varchar');
  });

  it('HTML-escapes field names from the data file', () => {
    const result = formatStatsLine2(
      makeNested({ outline: '<img src=x onerror=alert(1)> integer · a&b "q" varchar' }),
      'nested',
    );
    // Written as HTML, the line is text: no tag survives.
    expect(result).toBe(
      '&lt;img src=x onerror=alert(1)&gt; integer · a&amp;b &quot;q&quot; varchar',
    );
    expect(formatDefaultStats(makeNested({ outline: '<b>x</b> integer' }), 'nested')).toContain(
      '<span class="dt-stats-line2">&lt;b&gt;x&lt;/b&gt; integer</span>',
    );
  });

  it('shows no line 2 for an all-null or empty column', () => {
    expect(formatStatsLine2(makeNested({ nonNullCount: 0, nullCount: 1000 }), 'nested')).toBe('');
    expect(
      formatStatsLine2(makeNested({ totalRows: 0, nonNullCount: 0, nullCount: 0 }), 'nested'),
    ).toBe('');
  });
});

// =========================================
// HTML Structure
// =========================================

describe('formatDefaultStats - HTML structure', () => {
  it('wraps line1 in dt-stats-line1 span', () => {
    const stats: NumericColumnStats = {
      kind: 'numeric',
      totalRows: 100,
      nonNullCount: 100,
      nullCount: 0,
      filteredTotalRows: null,
      min: 0,
      max: 100,
      median: 50,
      distinctCount: 100,
    };
    const result = formatDefaultStats(stats, 'integer');
    expect(result).toMatch(/<span class="dt-stats-line1">.*<\/span>/);
  });

  it('wraps line2 in dt-stats-line2 span with br separator', () => {
    const stats: NumericColumnStats = {
      kind: 'numeric',
      totalRows: 100,
      nonNullCount: 100,
      nullCount: 0,
      filteredTotalRows: null,
      min: 0,
      max: 100,
      median: 50,
      distinctCount: 100,
    };
    const result = formatDefaultStats(stats, 'integer');
    expect(result).toMatch(/<br><span class="dt-stats-line2">.*<\/span>/);
  });

  it('omits line2 span when line2 is empty', () => {
    const stats: NumericColumnStats = {
      kind: 'numeric',
      totalRows: 0,
      nonNullCount: 0,
      nullCount: 0,
      filteredTotalRows: null,
      min: null,
      max: null,
      median: null,
      distinctCount: 0,
    };
    const result = formatDefaultStats(stats, 'integer');
    expect(result).not.toContain('dt-stats-line2');
    expect(result).not.toContain('<br>');
  });
});

// =========================================
// Phase 6 additions
// =========================================

describe('formatDefaultStats — Phase 6 edge cases', () => {
  it('Numeric Line 2 with median === null: "min ... · max ..." (no med segment)', () => {
    const stats: NumericColumnStats = {
      kind: 'numeric',
      totalRows: 5,
      nonNullCount: 5,
      nullCount: 0,
      filteredTotalRows: null,
      min: 1,
      max: 9,
      median: null,
      distinctCount: 5,
    };
    const result = formatDefaultStats(stats, 'integer');
    expect(result).toContain('min 1');
    expect(result).toContain('max 9');
    expect(result).not.toContain('med');
  });

  it('Numeric Line 2: when min === max (single-value), "all values" supersedes the min/med/max layout even with non-null median', () => {
    const stats: NumericColumnStats = {
      kind: 'numeric',
      totalRows: 10,
      nonNullCount: 10,
      nullCount: 0,
      filteredTotalRows: null,
      min: 7,
      max: 7,
      median: 7,
      distinctCount: 1,
    };
    const result = formatDefaultStats(stats, 'integer');
    expect(result).toContain('all values: 7');
    expect(result).not.toMatch(/min 7.*max 7/);
  });

  it('Interval Line 2 with medianDisplay === null: shows "min ... · max ..." only', () => {
    const stats: IntervalColumnStats = {
      kind: 'interval',
      totalRows: 4,
      nonNullCount: 4,
      nullCount: 0,
      filteredTotalRows: null,
      minDisplay: '1h',
      maxDisplay: '12h',
      medianDisplay: null,
    };
    const result = formatDefaultStats(stats, 'interval');
    expect(result).toContain('min 1h');
    expect(result).toContain('max 12h');
    expect(result).not.toContain('med');
  });

  it('Time Line 2: 00:00:00 and 23:59:59 form an end-to-end day range (en-dash separator)', () => {
    const stats: TimeColumnStats = {
      kind: 'time',
      totalRows: 100,
      nonNullCount: 100,
      nullCount: 0,
      filteredTotalRows: null,
      minSeconds: 0,
      maxSeconds: 23 * 3600 + 59 * 60 + 59,
    };
    const result = formatDefaultStats(stats, 'time');
    expect(result).toContain('00:00:00');
    expect(result).toContain('23:59:59');
    // En-dash (U+2013) separator, not a hyphen-minus.
    expect(result).toContain('–');
  });

  it('Temporal Line 2: en-dash separator between min and max (locale-stable)', () => {
    const stats: TemporalColumnStats = {
      kind: 'temporal',
      totalRows: 100,
      nonNullCount: 100,
      nullCount: 0,
      filteredTotalRows: null,
      min: '2020-01-01',
      max: '2024-12-31',
    };
    const result = formatDefaultStats(stats, 'date');
    expect(result).toContain('2020-01-01');
    expect(result).toContain('2024-12-31');
    expect(result).toContain('–');
  });

  it('Categorical boolean: rounds 1/3 ≈ 33% (locks Math.round behavior at non-trivial fractions)', () => {
    const stats: CategoricalColumnStats = {
      kind: 'categorical',
      totalRows: 3,
      nonNullCount: 3,
      nullCount: 0,
      filteredTotalRows: null,
      distinctCount: 2,
      trueCount: 1,
    };
    const result = formatDefaultStats(stats, 'boolean');
    expect(result).toContain('33%');
  });

  it('locale strategy: integer values use toLocaleString separators (not raw digits)', () => {
    // The library relies on Number.toLocaleString() for thousands separators
    // (no explicit Intl.NumberFormat in StatsFormatters.ts). Lock the
    // locale-stable contract: a 4-digit integer is rendered with at least
    // one non-digit separator (comma, NBSP, or thin space depending on the
    // host locale).
    const formatted = formatStatValue(12345);
    expect(formatted.replace(/[\d-]/g, '').length).toBeGreaterThan(0);
    // Sanity: digits round-trip correctly.
    expect(formatted.replace(/\D/g, '')).toBe('12345');
  });
});
