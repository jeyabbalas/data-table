/**
 * The SQL a date histogram sends, by what it knows of the column, and the
 * bounds of its brush, against a recording bridge.
 *
 * The column's unfiltered fetch finds whether every value can be drawn
 * (`nonFiniteCount` 0). The later fetches use that: a column whose values
 * can all be drawn has no value tested, and one with values left out has
 * its stats test each value at once, instead of reading MIN and MAX first.
 * Real-DuckDB cases are in `DateHistogramData.extremes.duckdb.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import type { WorkerBridge } from '@/data/WorkerBridge';
import {
  dateBrushFilter,
  fetchDateHistogramBins,
  fetchDateHistogramData,
  fetchDateNumericBins,
  fetchDateStats,
  type DateHistogramBin,
} from '@/visualizations/histogram/DateHistogramData';

const MS_2000 = Date.UTC(2000, 0, 1);
const MS_2024 = Date.UTC(2024, 0, 1);

/** A bridge that answers the stats queries with `stats` and anything else with `[]`. */
function recordingBridge(stats: Record<string, unknown>): {
  bridge: WorkerBridge;
  sql: () => string[];
} {
  const query = vi.fn((sql: string) =>
    Promise.resolve(sql.includes('as min_ms') ? [{ ...stats }] : []),
  );
  return {
    bridge: { query } as unknown as WorkerBridge,
    sql: () => query.mock.calls.map((call) => call[0]),
  };
}

const QUICK = 'EXTRACT(EPOCH FROM MIN("d"))';
const PER_VALUE = 'CASE WHEN EXTRACT(EPOCH FROM "d") BETWEEN';
const TEST = 'EXTRACT(EPOCH FROM "d") BETWEEN -8600000000000 AND 8600000000000';

describe('fetchDateStats', () => {
  const chartable = { min_ms: MS_2000, max_ms: MS_2024, count: 10, null_count: 1 };

  it('unknown: reads MIN and MAX, and nothing more when both can be drawn', async () => {
    const { bridge, sql } = recordingBridge({ ...chartable, non_finite_count: 0 });

    const stats = await fetchDateStats('t', 'd', [], bridge);

    expect(sql()).toHaveLength(1);
    expect(sql()[0]).toContain(QUICK);
    expect(stats.nonFiniteCount).toBe(0);
  });

  it('unknown: tests each value when MIN or MAX cannot be drawn', async () => {
    const { bridge, sql } = recordingBridge({
      ...chartable,
      max_ms: null,
      non_finite_count: 0,
    });

    await fetchDateStats('t', 'd', [], bridge);

    expect(sql()).toHaveLength(2);
    expect(sql()[0]).toContain(QUICK);
    expect(sql()[1]).toContain(PER_VALUE);
  });

  it('known to hold values left out: tests each value at once', async () => {
    const { bridge, sql } = recordingBridge({ ...chartable, non_finite_count: 3 });

    const stats = await fetchDateStats('t', 'd', [], bridge, false);

    expect(sql()).toHaveLength(1);
    expect(sql()[0]).toContain(PER_VALUE);
    expect(sql()[0]).not.toContain(QUICK);
    expect(stats.nonFiniteCount).toBe(3);
  });

  it('known to hold only values the chart draws: reads MIN and MAX', async () => {
    const { bridge, sql } = recordingBridge({ ...chartable, non_finite_count: 0 });

    await fetchDateStats('t', 'd', [], bridge, true);

    expect(sql()).toEqual([expect.stringContaining(QUICK)]);
  });
});

describe('the bin queries', () => {
  it('test no value of a column whose values can all be drawn', async () => {
    const { bridge, sql } = recordingBridge({});

    await fetchDateNumericBins('t', 'd', 15, MS_2000, MS_2024, [], bridge, true);
    await fetchDateHistogramBins('t', 'd', 'quarter', [], bridge, true);

    for (const query of sql()) {
      expect(query).toContain('WHERE "d" IS NOT NULL');
      expect(query).not.toContain('BETWEEN');
      expect(query).not.toContain('CASE');
    }
    expect(sql()[1]).toContain(`DATE_TRUNC('quarter', "d")`);
  });

  it.each([
    ['unknown', undefined],
    ['holding values left out', false],
  ] as const)('keep to the values the chart draws for a column %s', async (_label, known) => {
    const { bridge, sql } = recordingBridge({});

    await fetchDateNumericBins('t', 'd', 15, MS_2000, MS_2024, [], bridge, known);
    await fetchDateHistogramBins('t', 'd', 'quarter', [], bridge, known);

    // The test is NULL for NULL, so no `IS NOT NULL` goes beside it.
    for (const query of sql()) {
      expect(query).toContain(`WHERE ${TEST}`);
      expect(query).not.toContain('IS NOT NULL');
    }
    // DuckDB plans DATE_TRUNC's range from the column's minimum and maximum,
    // before any row is filtered: the CASE hides them.
    expect(sql()[1]).toContain(`DATE_TRUNC('quarter', CASE WHEN ${TEST} THEN "d" END)`);
  });
});

describe('fetchDateHistogramData', () => {
  it('bins with no test once its unfiltered stats left nothing out', async () => {
    const { bridge, sql } = recordingBridge({
      min_ms: MS_2000,
      max_ms: MS_2024,
      count: 10,
      null_count: 0,
      non_finite_count: 0,
    });

    await fetchDateHistogramData('t', 'd', [], bridge);

    expect(sql()).toHaveLength(2);
    expect(sql()[1]).not.toContain('BETWEEN');
  });

  it('keeps the test under a filter, where the stats do not cover the column', async () => {
    const { bridge, sql } = recordingBridge({
      min_ms: MS_2000,
      max_ms: MS_2024,
      count: 10,
      null_count: 0,
      non_finite_count: 0,
    });

    await fetchDateHistogramData('t', 'd', [{ type: 'null', column: 'other' }], bridge);

    expect(sql()[1]).toContain(TEST);
  });
});

describe('dateBrushFilter', () => {
  const at = (iso: string): Date => new Date(iso);
  const bins = (...edges: string[]): DateHistogramBin[] =>
    edges.slice(1).map((end, i) => ({ binStart: at(edges[i]!), binEnd: at(end), count: 1 }));

  it('writes bounds DuckDB reads, the last equal-width bar inclusive', () => {
    const data = {
      bins: bins(
        '-000043-03-15T00:00:00.000Z',
        '6000-01-01T00:00:00.000Z',
        '+012000-01-01T00:00:00.000Z',
      ),
      isNumericBinning: true,
    };
    expect(dateBrushFilter('d', 'DATE', data, 1, 1)).toEqual({
      column: 'd',
      type: 'range',
      min: '6000-01-01T00:00:00.000Z',
      max: '12000-01-01T00:00:00.000Z',
      maxInclusive: true,
    });
    expect(dateBrushFilter('d', 'DATE', data, 0, 0)).toEqual({
      column: 'd',
      type: 'range',
      min: '-000043-03-15T00:00:00.000Z',
      max: '6000-01-01T00:00:00.000Z',
    });
    expect(dateBrushFilter('d', 'DATE', data, 0, 2)).toBeNull();
  });

  it('keeps a TIMESTAMP_NS bound inside the type: its last value, from 1677-09-22', () => {
    // An equal-width chart's maximum rounds up past 23:47:16.854775806, and
    // calendar units start before 1677-09-22 and end after 2262-04-11.
    const numeric = {
      bins: bins('2000-01-01T00:00:00.000Z', '2262-04-11T23:47:16.855Z'),
      isNumericBinning: true,
    };
    const byQuarter = {
      bins: bins(
        '1677-07-01T00:00:00.000Z',
        '1677-10-01T00:00:00.000Z',
        '2262-04-01T00:00:00.000Z',
        '2262-07-01T00:00:00.000Z',
      ),
      isNumericBinning: false,
    };
    const last = { max: '2262-04-11T23:47:16.854775806Z', maxInclusive: true };

    expect(dateBrushFilter('d', 'TIMESTAMP_NS', numeric, 0, 0)).toMatchObject(last);
    expect(dateBrushFilter('d', 'TIMESTAMP_NS', byQuarter, 2, 2)).toMatchObject(last);
    expect(dateBrushFilter('d', 'TIMESTAMP_NS', byQuarter, 0, 0)).toEqual({
      column: 'd',
      type: 'range',
      min: '1677-09-22T00:00:00.000Z',
      max: '1677-10-01T00:00:00.000Z',
    });
    // Inside the type, the bounds are the bars' edges.
    expect(dateBrushFilter('d', 'TIMESTAMP_NS', byQuarter, 1, 1)).toEqual({
      column: 'd',
      type: 'range',
      min: '1677-10-01T00:00:00.000Z',
      max: '2262-04-01T00:00:00.000Z',
    });
    // Another type holds those times.
    expect(dateBrushFilter('d', 'TIMESTAMP', numeric, 0, 0)).toMatchObject({
      max: '2262-04-11T23:47:16.855Z',
    });
  });
});

describe('fetchDateNumericBins', () => {
  it('fills every bar, empty or not', async () => {
    const query = vi.fn(() => Promise.resolve([{ bin_idx: 1, count: 7 }]));
    const bridge = { query } as unknown as WorkerBridge;

    const result = await fetchDateNumericBins('t', 'd', 3, 0, 3000, [], bridge, true);

    expect(result.map((bin) => [bin.binStart.getTime(), bin.binEnd.getTime(), bin.count])).toEqual([
      [0, 1000, 0],
      [1000, 2000, 7],
      [2000, 3000, 0],
    ]);
  });
});
