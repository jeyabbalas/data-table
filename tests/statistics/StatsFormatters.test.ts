import { describe, it, expect } from 'vitest';
import { formatCompact, formatDefaultStats } from '../../src/statistics/StatsFormatters';
import type {
  NumericColumnStats,
  CategoricalColumnStats,
  TemporalColumnStats,
  TimeColumnStats,
  IntervalColumnStats,
} from '../../src/statistics/ColumnStatsTypes';

// =========================================
// formatCompact
// =========================================

describe('formatCompact', () => {
  it('formats zero', () => {
    expect(formatCompact(0)).toBe('0');
  });

  it('formats small integers with locale separators', () => {
    expect(formatCompact(42)).toBe('42');
    expect(formatCompact(999)).toBe('999');
  });

  it('formats integers under 10K with locale separators', () => {
    const result = formatCompact(1234);
    // Locale-dependent: could be "1,234" or "1.234" or "1 234"
    // Verify the digits are present in the right order
    expect(result.replace(/\D/g, '')).toBe('1234');
  });

  it('formats 10K+ with K suffix', () => {
    expect(formatCompact(10000)).toBe('10K');
    expect(formatCompact(12345)).toBe('12.3K');
    expect(formatCompact(100000)).toBe('100K');
    expect(formatCompact(999949)).toBe('999.9K');
  });

  it('promotes K to M when rounding overflows', () => {
    // 999,950+ / 1000 rounds to 1000.0 → promote to 1M
    expect(formatCompact(999950)).toBe('1M');
    expect(formatCompact(999999)).toBe('1M');
  });

  it('formats 1M+ with M suffix', () => {
    expect(formatCompact(1000000)).toBe('1M');
    expect(formatCompact(1234567)).toBe('1.23M');
  });

  it('promotes M to B when rounding overflows', () => {
    expect(formatCompact(999999999)).toBe('1B');
  });

  it('formats 1B+ with B suffix', () => {
    expect(formatCompact(1000000000)).toBe('1B');
    expect(formatCompact(2500000000)).toBe('2.5B');
  });

  it('formats negative numbers', () => {
    expect(formatCompact(-42)).toBe('-42');
    expect(formatCompact(-12345)).toBe('-12.3K');
    expect(formatCompact(-1234567)).toBe('-1.23M');
  });

  it('formats floats with significant digits', () => {
    expect(formatCompact(3.14159)).toBe('3.14');
    expect(formatCompact(0.123)).toBe('0.123');
    expect(formatCompact(0.1)).toBe('0.1');
    expect(formatCompact(42.0)).toBe('42');
  });

  it('handles NaN and Infinity', () => {
    expect(formatCompact(NaN)).toBe('NaN');
    expect(formatCompact(Infinity)).toBe('∞');
    expect(formatCompact(-Infinity)).toBe('-∞');
  });
});

// =========================================
// formatDefaultStats - Line 1 (universal)
// =========================================

describe('formatDefaultStats - Line 1', () => {
  const makeNumericStats = (
    overrides: Partial<NumericColumnStats> = {}
  ): NumericColumnStats => ({
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
      'integer'
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
      'integer'
    );
    expect(result).toContain('all null');
    // Should not have a line 2
    expect(result).not.toContain('dt-stats-line2');
  });

  it('shows filtered / total format', () => {
    const result = formatDefaultStats(
      makeNumericStats({ filteredTotalRows: 892 }),
      'integer'
    );
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
      'integer'
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
      'integer'
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
      'integer'
    );
    expect(result).toContain('0 rows');
    expect(result).not.toContain('dt-stats-line2');
  });
});

// =========================================
// formatDefaultStats - Line 2: Numeric
// =========================================

describe('formatDefaultStats - Numeric Line 2', () => {
  const makeNumeric = (
    overrides: Partial<NumericColumnStats> = {}
  ): NumericColumnStats => ({
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
      'integer'
    );
    expect(result).toContain('all values: 42');
  });

  it('uses compact notation for large values', () => {
    const result = formatDefaultStats(
      makeNumeric({ min: 0, max: 1200000, median: 50000 }),
      'float'
    );
    expect(result).toContain('1.2M');
    expect(result).toContain('50K');
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
      'integer'
    );
    expect(result).not.toContain('dt-stats-line2');
  });
});

// =========================================
// formatDefaultStats - Line 2: Categorical
// =========================================

describe('formatDefaultStats - Categorical Line 2', () => {
  const makeCategorical = (
    overrides: Partial<CategoricalColumnStats> = {}
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
    const result = formatDefaultStats(
      makeCategorical({ distinctCount: 1000 }),
      'string'
    );
    expect(result).toContain('all unique');
  });

  it('does not show "all unique" for single-row data', () => {
    const result = formatDefaultStats(
      makeCategorical({
        totalRows: 1,
        nonNullCount: 1,
        distinctCount: 1,
      }),
      'string'
    );
    // Single value doesn't qualify as "all unique" (need > 1)
    expect(result).not.toContain('all unique');
    expect(result).toContain('1 unique');
  });

  it('shows percentage true for booleans', () => {
    const result = formatDefaultStats(
      makeCategorical({ trueCount: 670, nonNullCount: 1000 }),
      'boolean'
    );
    expect(result).toContain('67% true');
  });

  it('shows 0% true for all-false boolean', () => {
    const result = formatDefaultStats(
      makeCategorical({ trueCount: 0, nonNullCount: 1000 }),
      'boolean'
    );
    expect(result).toContain('0% true');
  });

  it('shows 100% true for all-true boolean', () => {
    const result = formatDefaultStats(
      makeCategorical({ trueCount: 1000, nonNullCount: 1000 }),
      'boolean'
    );
    expect(result).toContain('100% true');
  });

  it('rounds boolean percentage correctly at boundary', () => {
    // 999/1000 = 99.9% → rounds to 100% (Math.round behavior)
    const result = formatDefaultStats(
      makeCategorical({ trueCount: 999, nonNullCount: 1000 }),
      'boolean'
    );
    expect(result).toContain('100% true');

    // 1/3 = 33.33% → rounds to 33%
    const result2 = formatDefaultStats(
      makeCategorical({ trueCount: 1, nonNullCount: 3 }),
      'boolean'
    );
    expect(result2).toContain('33% true');

    // 2/3 = 66.67% → rounds to 67%
    const result3 = formatDefaultStats(
      makeCategorical({ trueCount: 2, nonNullCount: 3 }),
      'boolean'
    );
    expect(result3).toContain('67% true');
  });

  it('shows unique count with percentage for uuid', () => {
    const result = formatDefaultStats(makeCategorical(), 'uuid');
    expect(result).toContain('12 unique');
    expect(result).toContain('(1%)');
  });

  it('shows "all unique" for uuid when all distinct', () => {
    const result = formatDefaultStats(
      makeCategorical({ distinctCount: 1000 }),
      'uuid'
    );
    expect(result).toContain('all unique');
  });
});

// =========================================
// formatDefaultStats - Line 2: Temporal
// =========================================

describe('formatDefaultStats - Temporal Line 2', () => {
  const makeTemporal = (
    overrides: Partial<TemporalColumnStats> = {}
  ): TemporalColumnStats => ({
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
      'date'
    );
    expect(result).toContain('all values: 2024-01-01');
  });

  it('handles timestamp format by extracting date', () => {
    const result = formatDefaultStats(
      makeTemporal({
        min: '2020-01-01 08:00:00',
        max: '2024-12-31 23:59:59',
      }),
      'timestamp'
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
      'date'
    );
    expect(result).not.toContain('dt-stats-line2');
  });
});

// =========================================
// formatDefaultStats - Line 2: Time
// =========================================

describe('formatDefaultStats - Time Line 2', () => {
  const makeTime = (
    overrides: Partial<TimeColumnStats> = {}
  ): TimeColumnStats => ({
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
    const result = formatDefaultStats(
      makeTime({ minSeconds: 3600, maxSeconds: 3600 }),
      'time'
    );
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
      'time'
    );
    expect(result).not.toContain('dt-stats-line2');
  });
});

// =========================================
// formatDefaultStats - Line 2: Interval
// =========================================

describe('formatDefaultStats - Interval Line 2', () => {
  const makeInterval = (
    overrides: Partial<IntervalColumnStats> = {}
  ): IntervalColumnStats => ({
    kind: 'interval',
    totalRows: 1000,
    nonNullCount: 1000,
    nullCount: 0,
    filteredTotalRows: null,
    minDisplay: '00:02:00',
    maxDisplay: '02:00:00',
    medianDisplay: '00:30:00',
    ...overrides,
  });

  it('shows min · med · max for intervals', () => {
    const result = formatDefaultStats(makeInterval(), 'interval');
    expect(result).toContain('min 00:02:00');
    expect(result).toContain('med 00:30:00');
    expect(result).toContain('max 02:00:00');
  });

  it('shows "all values" for single interval', () => {
    const result = formatDefaultStats(
      makeInterval({
        minDisplay: '01:00:00',
        maxDisplay: '01:00:00',
        medianDisplay: '01:00:00',
      }),
      'interval'
    );
    expect(result).toContain('all values: 01:00:00');
  });

  it('HTML-escapes interval display values', () => {
    const result = formatDefaultStats(
      makeInterval({
        minDisplay: '<script>',
        maxDisplay: '&danger',
        medianDisplay: '"quoted"',
      }),
      'interval'
    );
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&amp;danger');
    expect(result).toContain('&quot;quoted&quot;');
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
