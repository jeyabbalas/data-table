/**
 * Phase 1 — `planTypeConversions` parity and shape.
 *
 * The planner replaced three near-identical per-column detect passes with
 * one batched head-sample probe. These tests pin the two things that could
 * silently regress:
 *
 * 1. **Parity** — the batched probe classifies the `datetime-stress-tests`
 *    fixture identically to a faithful re-implementation of the deleted
 *    per-column probes, on all three source formats.
 * 2. **Shape** — priority order, the confidence boundary, all-NULL columns,
 *    chunk boundaries, and the per-column fallback that preserves the old
 *    `catch { continue }` tolerance when a batched statement throws.
 *
 * The behavioral lock for the *outcome* of detection lives in
 * `datetimeStress.test.ts`, which is deliberately unmodified by this phase.
 */
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DETECT_CONFIDENCE,
  DETECT_SAMPLE_ROWS,
  DETECT_SAMPLE_VALUES,
  PROBE_CHUNK_COLUMNS,
  planTypeConversions,
  quoteIdentifier,
} from '@/worker/loaders/common';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { readBinaryFixture } from '../../helpers/fixtures';

/**
 * The deleted implementation, kept alive here as the parity reference:
 * one whole-table `SELECT DISTINCT … LIMIT 100` per column per pass, JS
 * classification at 0.95, timestamp → date → time with each matched column
 * removed from the pool before the next pass.
 *
 * Copied from `common.ts` as it stood at `65fe9af`. If a future change to
 * the matchers makes this drift, that is a signal to update *both* — the
 * point of the copy is that the planner cannot quietly redefine the
 * behavior it replaced.
 */
const LEGACY_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const LEGACY_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_TIME = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;

function legacyIsTimestamp(value: string): boolean {
  const trimmed = value.trim();
  if (!LEGACY_TIMESTAMP.test(trimmed)) return false;
  return !isNaN(new Date(trimmed.replace(' ', 'T')).getTime());
}

function legacyIsDate(value: string): boolean {
  const trimmed = value.trim();
  if (!LEGACY_DATE.test(trimmed)) return false;
  return !isNaN(new Date(trimmed + 'T00:00:00').getTime());
}

function legacyIsTime(value: string): boolean {
  const trimmed = value.trim();
  if (!LEGACY_TIME.test(trimmed)) return false;
  const parts = trimmed.split(':');
  const hours = parseInt(parts[0]!, 10);
  const minutes = parseInt(parts[1]!, 10);
  const seconds = parseFloat(parts[2]!);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds < 60;
}

async function legacyDetect(
  conn: AsyncDuckDBConnection,
  tableName: string,
  columns: string[],
  match: (value: string) => boolean,
): Promise<string[]> {
  const hits: string[] = [];
  for (const column of columns) {
    try {
      const col = quoteIdentifier(column);
      const result = await conn.query(
        `SELECT DISTINCT ${col} as value FROM ${quoteIdentifier(tableName)} ` +
          `WHERE ${col} IS NOT NULL LIMIT 100`,
      );
      const values = result.toArray().map((row) => String(row.toJSON().value));
      if (values.length === 0) continue;
      if (values.filter(match).length / values.length >= 0.95) hits.push(column);
    } catch {
      continue;
    }
  }
  return hits;
}

async function legacyPlan(
  conn: AsyncDuckDBConnection,
  tableName: string,
  stringColumns: string[],
): Promise<{ timestamp: string[]; date: string[]; time: string[] }> {
  let remaining = [...stringColumns];
  const timestamp = await legacyDetect(conn, tableName, remaining, legacyIsTimestamp);
  remaining = remaining.filter((c) => !timestamp.includes(c));
  const date = await legacyDetect(conn, tableName, remaining, legacyIsDate);
  remaining = remaining.filter((c) => !date.includes(c));
  const time = await legacyDetect(conn, tableName, remaining, legacyIsTime);
  return { timestamp, date, time };
}

describe('planTypeConversions', () => {
  let harness: NodeDuckDBHarness;
  let counter = 0;
  const tn = (suffix: string): string => `plan_${suffix}_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  /** VARCHAR column names of `table`, in DESCRIBE order. */
  async function varcharColumns(table: string): Promise<string[]> {
    const described = await harness.conn.query(`DESCRIBE ${quoteIdentifier(table)}`);
    return described
      .toArray()
      .map((row) => row.toJSON() as { column_name: unknown; column_type: unknown })
      .filter((row) => String(row.column_type).toUpperCase() === 'VARCHAR')
      .map((row) => String(row.column_name));
  }

  /** Materialize a fixture through the same shape the loaders use. */
  async function loadFixtureTable(
    format: 'csv' | 'json' | 'parquet',
    name: string,
    table: string,
  ): Promise<void> {
    const data = await readBinaryFixture(format, name);
    const file = `${table}.${format}`;
    await harness.db.registerFileBuffer(file, new Uint8Array(data));
    const reader =
      format === 'csv'
        ? `read_csv_auto('${file}')`
        : format === 'json'
          ? `read_json_auto('${file}', format = 'array', auto_detect = true)`
          : `read_parquet('${file}')`;
    await harness.conn.query(
      `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS ` +
        `SELECT CAST(row_number() OVER () - 1 AS BIGINT) AS "__rowid__", * FROM ${reader}`,
    );
    await harness.db.dropFile(file);
  }

  describe('parity with the per-column probes it replaced', () => {
    for (const format of ['csv', 'json', 'parquet'] as const) {
      it(`classifies datetime-stress-tests identically on the ${format} path`, async () => {
        const table = tn(format);
        await loadFixtureTable(format, 'datetime-stress-tests', table);
        const columns = await varcharColumns(table);
        expect(columns.length).toBeGreaterThan(0);

        const legacy = await legacyPlan(harness.conn, table, columns);
        const batched = await planTypeConversions(
          harness.conn,
          quoteIdentifier(table),
          columns,
          `"__rowid__" < ${DETECT_SAMPLE_ROWS}`,
        );

        expect(batched).toEqual(legacy);
      }, 60_000);
    }

    it('finds the temporal columns the fixture is built to trip', async () => {
      // Parity against a re-implementation is only meaningful if the
      // reference actually classifies something. Parquet preserves the
      // fixture's native DATE/TIME/TIMESTAMP columns, so the ones that
      // reach the planner as VARCHAR are the deliberately string-typed
      // `str_*` columns — those are what detection exists for.
      const table = tn('nonempty');
      await loadFixtureTable('parquet', 'datetime-stress-tests', table);
      const plan = await planTypeConversions(
        harness.conn,
        quoteIdentifier(table),
        await varcharColumns(table),
        `"__rowid__" < ${DETECT_SAMPLE_ROWS}`,
      );
      expect(plan.timestamp).toContain('str_datetime_iso');
      expect(plan.date).toContain('str_date_iso');
      expect(plan.time).toContain('str_time_24h');
      // The fixture's deliberately undecidable columns must stay VARCHAR —
      // the loader does not guess US vs EU, and does not parse long forms.
      const all = [...plan.timestamp, ...plan.date, ...plan.time];
      expect(all).not.toContain('ambig_date');
      expect(all).not.toContain('str_date_us');
      expect(all).not.toContain('str_date_eu');
      expect(all).not.toContain('str_date_long');
    }, 60_000);
  });

  describe('classification shape', () => {
    it('assigns timestamp before date before time and keeps the lists disjoint', async () => {
      const table = tn('priority');
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS SELECT * FROM (VALUES ` +
          `('2020-01-01T00:00:00', '2020-01-01', '00:00:00'), ` +
          `('2020-01-02T01:02:03', '2020-01-02', '01:02:03')) ` +
          `t(ts, d, tm)`,
      );
      const plan = await planTypeConversions(harness.conn, quoteIdentifier(table), [
        'ts',
        'd',
        'tm',
      ]);
      expect(plan).toEqual({ timestamp: ['ts'], date: ['d'], time: ['tm'] });
    });

    it('preserves source column order within each class', async () => {
      const table = tn('order');
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS SELECT * FROM (VALUES ` +
          `('2020-01-01', '2020-02-01', '2020-03-01')) t(a, b, c)`,
      );
      const plan = await planTypeConversions(harness.conn, quoteIdentifier(table), ['c', 'a', 'b']);
      expect(plan.date).toEqual(['c', 'a', 'b']);
    });

    it('classifies at exactly the confidence threshold and not below it', async () => {
      // 100 distinct values, 95 of them ISO dates: ratio === DETECT_CONFIDENCE.
      const table = tn('threshold');
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS ` +
          `SELECT CASE WHEN i < 95 THEN strftime(DATE '2020-01-01' + CAST(i AS INTEGER), '%Y-%m-%d') ` +
          `ELSE 'junk-' || i END AS at_threshold, ` +
          `CASE WHEN i < 94 THEN strftime(DATE '2020-01-01' + CAST(i AS INTEGER), '%Y-%m-%d') ` +
          `ELSE 'junk-' || i END AS below_threshold ` +
          `FROM range(0, ${DETECT_SAMPLE_VALUES}) t(i)`,
      );
      const plan = await planTypeConversions(harness.conn, quoteIdentifier(table), [
        'at_threshold',
        'below_threshold',
      ]);
      expect(DETECT_CONFIDENCE).toBe(0.95);
      expect(plan.date).toEqual(['at_threshold']);
    });

    it('leaves an all-NULL column unclassified', async () => {
      const table = tn('nulls');
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS ` +
          `SELECT CAST(NULL AS VARCHAR) AS empty_col, '2020-01-01' AS real_col ` +
          `FROM range(0, 10)`,
      );
      const plan = await planTypeConversions(harness.conn, quoteIdentifier(table), [
        'empty_col',
        'real_col',
      ]);
      expect(plan).toEqual({ timestamp: [], date: ['real_col'], time: [] });
    });

    it('returns empty lists for an empty column list without querying', async () => {
      let queried = false;
      const conn = {
        query: () => {
          queried = true;
          throw new Error('should not be reached');
        },
      } as unknown as AsyncDuckDBConnection;
      const plan = await planTypeConversions(conn, '"nope"', []);
      expect(plan).toEqual({ timestamp: [], date: [], time: [] });
      expect(queried).toBe(false);
    });

    it('samples only the head window, not the whole relation', async () => {
      // Rows past DETECT_SAMPLE_ROWS are ISO dates; rows inside the window
      // are not. A whole-table probe would classify this as a date column;
      // the head sample must not.
      const table = tn('window');
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS ` +
          `SELECT CAST(i AS BIGINT) AS "__rowid__", ` +
          `CASE WHEN i < ${DETECT_SAMPLE_ROWS} THEN 'x' || i ` +
          `ELSE strftime(DATE '2020-01-01' + CAST(i % 3000 AS INTEGER), '%Y-%m-%d') END AS late_dates ` +
          `FROM range(0, ${DETECT_SAMPLE_ROWS * 2}) t(i)`,
      );
      const plan = await planTypeConversions(
        harness.conn,
        quoteIdentifier(table),
        ['late_dates'],
        `"__rowid__" < ${DETECT_SAMPLE_ROWS}`,
      );
      expect(plan.date).toEqual([]);
    }, 30_000);
  });

  describe('chunking', () => {
    /**
     * Build a table with `count` date columns so the probe has to span
     * several batches, and assert every one of them is classified — a
     * chunking off-by-one drops columns silently otherwise.
     */
    async function planWideTable(count: number): Promise<string[]> {
      const table = tn(`wide${count}`);
      const projection = Array.from(
        { length: count },
        (_, c) =>
          `strftime(DATE '2020-01-01' + CAST((i + ${c}) % 3000 AS INTEGER), '%Y-%m-%d') AS "col_${c}"`,
      ).join(', ');
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS ` +
          `SELECT ${projection} FROM range(0, 200) t(i)`,
      );
      const columns = Array.from({ length: count }, (_, c) => `col_${c}`);
      const plan = await planTypeConversions(harness.conn, quoteIdentifier(table), columns);
      return plan.date;
    }

    for (const count of [
      PROBE_CHUNK_COLUMNS - 1,
      PROBE_CHUNK_COLUMNS,
      PROBE_CHUNK_COLUMNS + 1,
      PROBE_CHUNK_COLUMNS * 2 + 3,
    ]) {
      it(`classifies all ${count} columns across chunk boundaries`, async () => {
        const dates = await planWideTable(count);
        expect(dates).toHaveLength(count);
        expect(dates[0]).toBe('col_0');
        expect(dates[count - 1]).toBe(`col_${count - 1}`);
      }, 60_000);
    }

    it('issues ceil(columns / PROBE_CHUNK_COLUMNS) statements, not one per column', async () => {
      const table = tn('count');
      const count = PROBE_CHUNK_COLUMNS + 5;
      const projection = Array.from(
        { length: count },
        (_, c) =>
          `strftime(DATE '2020-01-01' + CAST((i + ${c}) % 3000 AS INTEGER), '%Y-%m-%d') AS "col_${c}"`,
      ).join(', ');
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS ` +
          `SELECT ${projection} FROM range(0, 50) t(i)`,
      );

      const statements: string[] = [];
      const counting = new Proxy(harness.conn, {
        get(target, prop, receiver) {
          if (prop === 'query') {
            return (sql: string) => {
              statements.push(sql);
              return target.query(sql);
            };
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      });

      const columns = Array.from({ length: count }, (_, c) => `col_${c}`);
      await planTypeConversions(counting, quoteIdentifier(table), columns);

      expect(statements).toHaveLength(Math.ceil(count / PROBE_CHUNK_COLUMNS));
      // The batched shape — not a per-column fallback that happened to work.
      expect(statements[0]).toContain('AS MATERIALIZED');
      expect(statements[0]).toContain('UNION ALL');
    }, 60_000);
  });

  describe('per-column fallback', () => {
    it('falls back to single-column probes when a batched statement throws', async () => {
      const table = tn('fallback');
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS SELECT * FROM (VALUES ` +
          `('2020-01-01', '00:00:00'), ('2020-01-02', '01:02:03')) t(d, tm)`,
      );

      const statements: string[] = [];
      const flaky = new Proxy(harness.conn, {
        get(target, prop, receiver) {
          if (prop === 'query') {
            return (sql: string) => {
              statements.push(sql);
              if (sql.includes('UNION ALL')) {
                return Promise.reject(new Error('simulated batched-probe failure'));
              }
              return target.query(sql);
            };
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      });

      const plan = await planTypeConversions(flaky, quoteIdentifier(table), ['d', 'tm']);
      expect(plan).toEqual({ timestamp: [], date: ['d'], time: ['tm'] });
      // One failed batch, then one probe per column in the chunk.
      expect(statements).toHaveLength(3);
      expect(statements.slice(1).every((sql) => !sql.includes('UNION ALL'))).toBe(true);
    });

    it('skips a column whose fallback probe also throws and keeps its neighbours', async () => {
      const table = tn('partial');
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS SELECT * FROM (VALUES ` +
          `('2020-01-01', '2020-02-01'), ('2020-01-02', '2020-02-02')) t(good, bad)`,
      );

      const flaky = new Proxy(harness.conn, {
        get(target, prop, receiver) {
          if (prop === 'query') {
            return (sql: string) => {
              if (sql.includes('UNION ALL') || sql.includes('"bad"')) {
                return Promise.reject(new Error('simulated probe failure'));
              }
              return target.query(sql);
            };
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      });

      const plan = await planTypeConversions(flaky, quoteIdentifier(table), ['good', 'bad']);
      expect(plan).toEqual({ timestamp: [], date: ['good'], time: [] });
    });
  });

  describe('relation genericity', () => {
    it('probes a read_xxx() relation without materializing it first', async () => {
      // The seam Phase 10's direct-scan mode retargets: no table, no
      // __rowid__ predicate, just a FROM-able reader call.
      const file = `${tn('rel')}.parquet`;
      const data = await readBinaryFixture('parquet', 'datetime-stress-tests');
      await harness.db.registerFileBuffer(file, new Uint8Array(data));
      try {
        const plan = await planTypeConversions(harness.conn, `read_parquet('${file}')`, [
          'timestamp_standard',
          'date_standard',
          'time_standard',
        ]);
        expect(plan).toEqual({
          timestamp: ['timestamp_standard'],
          date: ['date_standard'],
          time: ['time_standard'],
        });
      } finally {
        await harness.db.dropFile(file);
      }
    }, 60_000);
  });
});
