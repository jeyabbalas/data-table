/**
 * @vitest-environment jsdom
 *
 * Time-of-day histograms on TIME WITH TIME ZONE, `24:00:00` and TIME_NS,
 * against real DuckDB-WASM.
 *
 * The chart read its minimum and maximum from DuckDB's text, which it could
 * not parse with an offset (`23:00:00+05:30`) or at hour 24, so a TIME WITH
 * TIME ZONE column, and a TIME column holding `24:00:00`, drew no bars. A
 * TIME_NS minimum kept its nanoseconds while the bins, from
 * `EXTRACT(EPOCH …)`, truncate to microseconds, so the smallest value fell
 * below the first bin and was dropped. Now the range comes from
 * `MIN/MAX(EXTRACT(EPOCH …))`, the time of day as written with the offset
 * ignored, and `24:00:00` is counted in the day's last bar.
 *
 * Every case asserts that the chart draws, that its bins add up to the
 * column's non-null count, and that its range is DuckDB's. TIME WITH TIME
 * ZONE values are built in SQL: Parquet drops their offsets.
 *
 * jsdom, for the brush cases, which drag across a real `TimeHistogram`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ColumnSchema } from '@/core/types';
import { filtersToWhereClause } from '@/filters/FilterSQL';
import type { RangeFilter } from '@/filters/FilterTypes';
import type { VisualizationOptions } from '@/visualizations/BaseVisualization';
import { TimeHistogram } from '@/visualizations/histogram/TimeHistogram';
import {
  fetchTimeHistogramBins,
  fetchTimeHistogramData,
  fetchTimeNumericBins,
  type TimeHistogramData,
} from '@/visualizations/histogram/TimeHistogramData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  arc: vi.fn(),
  arcTo: vi.fn(),
  rect: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 30 }),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left',
  textBaseline: 'top',
}) as never;

globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

/**
 * Nine TIME WITH TIME ZONE rows, one NULL. By time of day, 01:30 to 24:00:
 * 22.5 hours, so 15 equal-width bins of 5,400 s, and bins 0–2 (01:30 to
 * 06:00) hold the first three rows, one each. By instant they are spread
 * over two days: `01:30:00+05:30` is 20:00 UTC the day before, and
 * `03:00:00-08` 11:00 UTC.
 */
const TIMETZ_ROWS = `SELECT CAST(t AS TIMETZ) AS t FROM (VALUES
  ('01:30:00+05:30'), ('03:00:00-08'), ('05:00:00+00'), ('10:00:00-05:30:45'),
  ('14:05:06.5-08'), ('18:00:00+09'), ('23:00:00+05:30'), ('24:00:00-15:59:59'),
  (NULL)) AS s(t)`;

/** TIME at 22:10, 23:30 and twice 24:00:00, and a NULL: hour bins. */
const MIDNIGHT_ROWS = `SELECT CAST(t AS TIME) AS t FROM (VALUES
  ('22:10:00'), ('23:30:00'), ('24:00:00'), ('24:00:00'), (NULL)) AS s(t)`;

/** `[label, SELECT producing one column t]`. */
const CASES: ReadonlyArray<readonly [string, string]> = [
  ['TIME WITH TIME ZONE, offsets of every kind, with a NULL', TIMETZ_ROWS],
  [
    'TIME WITH TIME ZONE within five hours, in hour bins',
    `SELECT CAST(t AS TIMETZ) AS t FROM (VALUES
       ('09:15:00+05:30'), ('09:45:00-08'), ('10:30:00+00'), ('11:00:00+09'),
       ('13:59:59-03:30')) AS s(t)`,
  ],
  ['TIME at 22:10, 23:30 and 24:00:00, in hour bins', MIDNIGHT_ROWS],
  [
    'TIME over a whole day up to 24:00:00, in equal-width bins',
    'SELECT make_time(range // 4, (range % 4) * 15, 0) AS t FROM range(0, 97)',
  ],
  [
    'TIME_NS with nanosecond fractions',
    `SELECT CAST(t AS TIME_NS) AS t FROM (VALUES
       ('00:00:00.000000001'), ('06:30:00.5'), ('12:00:00'), ('18:00:00.123456789'),
       ('23:59:59.999999999')) AS s(t)`,
  ],
  ['TIME, every value 24:00:00', `SELECT CAST('24:00:00' AS TIME) AS t FROM range(4)`],
];

/** The session time zones the zone-independence cases run under. */
const ZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles'] as const;

describe('time histogram — TIME WITH TIME ZONE, 24:00:00 and TIME_NS', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let counter = 0;
  const tableName = (): string => `viz_time_of_day_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  async function table(select: string): Promise<string> {
    const t = tableName();
    await harness.conn.query(`CREATE TABLE "${t}" AS ${select}`);
    return t;
  }

  async function count(t: string, where = 'TRUE'): Promise<number> {
    const [row] = await bridge.query<{ n: number }>(
      `SELECT COUNT(t) AS n FROM "${t}" WHERE ${where}`,
    );
    return Number(row!.n);
  }

  /** `fn` under each of {@link ZONES}, the session's zone reset afterwards. */
  async function inEachZone(fn: (zone: string) => Promise<void>): Promise<void> {
    try {
      for (const zone of ZONES) {
        await harness.conn.query(`SET TimeZone = '${zone}'`);
        await fn(zone);
      }
    } finally {
      await harness.conn.query('RESET TimeZone');
    }
  }

  const binned = (data: TimeHistogramData): number =>
    data.bins.reduce((sum, bin) => sum + bin.count, 0);

  it.each(CASES)('%s: bins every non-null value', async (_label, select) => {
    const t = await table(select);

    const data = await fetchTimeHistogramData(t, 't', [], bridge);

    const [range] = await bridge.query<{ min: number; max: number; total: number }>(
      `SELECT MIN(EXTRACT(EPOCH FROM t)) AS min, MAX(EXTRACT(EPOCH FROM t)) AS max,
              COUNT(*) AS total FROM "${t}"`,
    );
    expect(data.bins.length).toBeGreaterThan(0);
    expect(binned(data)).toBe(await count(t));
    expect(data.minSeconds).toBe(range!.min);
    expect(data.maxSeconds).toBe(range!.max);
    expect(data.total).toBe(Number(range!.total));
    // Every bar lies within the day.
    for (const bin of data.bins) {
      expect(bin.binStartSeconds).toBeGreaterThanOrEqual(0);
      expect(bin.binEndSeconds).toBeLessThanOrEqual(86400);
    }
  });

  it('charts TIME WITH TIME ZONE by its time of day, the same in every session time zone', async () => {
    const t = await table(TIMETZ_ROWS);
    const byZone: TimeHistogramData[] = [];

    await inEachZone(async () => {
      byZone.push(await fetchTimeHistogramData(t, 't', [], bridge));
    });

    const [utc] = byZone;
    expect(utc!.isNumericBinning).toBe(true);
    // 24:00:00 shares the last bar with 23:00:00.
    expect(utc!.bins.map((bin) => bin.count)).toEqual([
      1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 2,
    ]);
    expect(utc!.minSeconds).toBe(5400);
    expect(utc!.maxSeconds).toBe(86400);
    expect(utc!.nullCount).toBe(1);
    for (const data of byZone) expect(data).toEqual(utc);
  });

  it('counts 24:00:00 in the day’s last bar', async () => {
    const t = await table(MIDNIGHT_ROWS);

    const data = await fetchTimeHistogramData(t, 't', [], bridge);
    const aligned = await fetchTimeHistogramBins(t, 't', data.interval, [], bridge);

    expect(data.interval).toBe('hour');
    expect(data.bins).toEqual([
      { binStartSeconds: 79200, binEndSeconds: 82800, count: 1 },
      { binStartSeconds: 82800, binEndSeconds: 86400, count: 3 },
    ]);
    // The crossfilter's bins use the same edges.
    expect(aligned).toEqual(data.bins);
  });

  it('draws a column of 24:00:00 alone as one bar ending at 24:00:00', async () => {
    const t = await table(`SELECT CAST('24:00:00' AS TIME) AS t FROM range(4)`);

    const data = await fetchTimeHistogramData(t, 't', [], bridge);

    expect(data.isSingleValue).toBe(true);
    expect(data.minSeconds).toBe(86400);
    expect(data.bins).toEqual([{ binStartSeconds: 86399, binEndSeconds: 86400, count: 4 }]);
  });

  it('keeps a single value’s bar under a filter, a fraction of a second included', async () => {
    const t = await table(
      `SELECT CAST(t AS TIME) AS t FROM (VALUES ('12:30:00.5'), ('12:30:00.5'), (NULL)) AS s(t)`,
    );

    const data = await fetchTimeHistogramData(t, 't', [], bridge);
    // What the chart fetches for its bars once any filter is on.
    const filtered = await fetchTimeHistogramBins(
      t,
      't',
      data.interval,
      [{ type: 'not-null', column: 't' }],
      bridge,
    );

    expect(data.isSingleValue).toBe(true);
    expect(data.minSeconds).toBe(45000.5);
    expect(data.bins).toEqual([{ binStartSeconds: 45000, binEndSeconds: 45001, count: 2 }]);
    // The chart finds a filtered bar by its start: 45000.5 found none.
    expect(filtered).toEqual(data.bins);
  });

  describe('brushing', () => {
    const WIDTH = 150;
    const HEIGHT = 60;
    /** Inside the chart band. */
    const Y = 20;

    interface Mounted {
      viz: TimeHistogram;
      bars: { x: number; width: number; binIndex: number }[];
      emitted: () => RangeFilter;
    }

    async function mount(t: string, originalType: string): Promise<Mounted> {
      const container = document.createElement('div');
      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        width: WIDTH,
        height: HEIGHT,
        top: 0,
        left: 0,
        bottom: HEIGHT,
        right: WIDTH,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      document.body.appendChild(container);
      const column: ColumnSchema = { name: 't', type: 'time', nullable: true, originalType };
      const onFilterChange = vi.fn();
      const options: VisualizationOptions = {
        tableName: t,
        bridge: bridge as unknown as VisualizationOptions['bridge'],
        filters: [],
        onFilterChange,
      };
      const viz = new TimeHistogram(container, column, options);
      await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;
      const bars = (viz as unknown as { barPositions: Mounted['bars'] }).barPositions;
      return {
        viz,
        bars,
        emitted: () => {
          expect(onFilterChange).toHaveBeenCalledTimes(1);
          return onFilterChange.mock.calls[0]![0] as RangeFilter;
        },
      };
    }

    /** Press on bar `from`, drag to bar `to` and let go, as a user brushes. */
    function drag(viz: TimeHistogram, bars: Mounted['bars'], from: number, to: number): void {
      const canvas = (viz as unknown as { canvas: HTMLCanvasElement }).canvas;
      const centre = (i: number): number => bars[i]!.x + bars[i]!.width / 2;
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: centre(from), clientY: Y }));
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: centre(to), clientY: Y }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: centre(to), clientY: Y }));
    }

    it('filters a TIME WITH TIME ZONE column to the rows its bars count, in every zone', async () => {
      const t = await table(TIMETZ_ROWS);
      const { viz, bars, emitted } = await mount(t, 'TIME WITH TIME ZONE');
      expect(bars).toHaveLength(15);

      drag(viz, bars, 0, 2);

      const filter = emitted();
      expect(filter).toEqual({
        column: 't',
        type: 'range',
        min: '01:30:00',
        max: '06:00:00',
        valueType: 'time',
      });
      await inEachZone(async (zone) => {
        expect(await count(t, filtersToWhereClause([filter])), zone).toBe(3);
        // Brushed, the crossfilter's bins keep the counts of bars 0–2.
        const bins = await fetchTimeNumericBins(t, 't', 15, 5400, 86400, [filter], bridge);
        expect(
          bins.map((bin) => bin.count),
          zone,
        ).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        if (zone !== 'America/Los_Angeles') {
          // Compared as TIME WITH TIME ZONE, the bounds take the session's
          // offset and rows compare by instant: one of the three, 05:00:00+00
          // in UTC and 01:30:00+05:30 in Kolkata. (Los Angeles's offset, and
          // so its count, changes with daylight saving time.)
          const { valueType: _, ...byInstant } = filter;
          expect(await count(t, filtersToWhereClause([byInstant])), zone).toBe(1);
        }
      });
      viz.destroy();
    });

    it('takes in 24:00:00 when it brushes the day’s last bar', async () => {
      const t = await table(MIDNIGHT_ROWS);
      const { viz, bars, emitted } = await mount(t, 'TIME');
      expect(bars).toHaveLength(2);

      drag(viz, bars, 1, 1);

      const filter = emitted();
      expect(filter).toEqual({
        column: 't',
        type: 'range',
        min: '23:00:00',
        max: '24:00:00',
        maxInclusive: true,
      });
      // 23:30 and both 24:00:00 rows, as the bar counts.
      expect(await count(t, filtersToWhereClause([filter]))).toBe(3);
      viz.destroy();
    });

    it('takes in 24:00:00-15:59:59 when it brushes a TIME WITH TIME ZONE column’s last bar', async () => {
      const t = await table(TIMETZ_ROWS);
      const { viz, bars, emitted } = await mount(t, 'TIME WITH TIME ZONE');

      drag(viz, bars, 14, 14);

      const filter = emitted();
      expect(filter).toEqual({
        column: 't',
        type: 'range',
        min: '22:30:00',
        max: '24:00:00',
        maxInclusive: true,
        valueType: 'time',
      });
      // 23:00:00+05:30 and 24:00:00-15:59:59, as the bar counts.
      await inEachZone(async (zone) => {
        expect(await count(t, filtersToWhereClause([filter])), zone).toBe(2);
      });
      viz.destroy();
    });
  });
});
