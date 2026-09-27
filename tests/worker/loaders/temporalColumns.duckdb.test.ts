/**
 * Text columns of ISO dates, timestamps and times, against a real DuckDB.
 *
 * The loaders convert such columns to DATE / TIMESTAMP / TIME. These tests
 * pin down the two properties the conversion must keep:
 *
 * - No value is lost. A value that does not cast would become NULL, and one
 *   that casts but changes would be altered, so either keeps its whole
 *   column as text. A UTC offset is kept as TIMESTAMPTZ rather than dropped
 *   by a cast to TIMESTAMP. Blank text is missing and becomes NULL.
 * - The table is never copied. Parquet casts while it reads the file; CSV
 *   and JSON convert each column in place. Rebuilding the table needed a
 *   second copy of it in memory, which ran the 200K × 1,000 target out.
 *
 * The CSV and JSON cases load JSON: DuckDB's CSV reader types ISO columns
 * itself, while its JSON reader leaves `T`-separated timestamps with
 * fractional seconds as text for the loader to convert.
 */
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadJSON } from '@/worker/loaders/json';
import { loadParquet } from '@/worker/loaders/parquet';
import type { LoadResult } from '@/worker/loaders/types';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';

/** More rows than the loaders sample, so the full-column check is exercised. */
const ROWS = 5000;

describe('text columns of dates and times (real DuckDB)', () => {
  let harness: NodeDuckDBHarness;
  const files: string[] = [];
  let tableCounter = 0;
  const ctx = () => ({ db: harness.db, conn: harness.conn });
  const nextTable = () => `temporal_${++tableCounter}`;

  /** Write `select` to a file in `format` and return its bytes. */
  async function write(
    select: string,
    format: 'parquet' | 'csv' | 'json',
    rowGroupSize = 122_880,
  ): Promise<ArrayBuffer> {
    const path = join(tmpdir(), `dt_temporal_${process.pid}_${files.length}.${format}`);
    files.push(path);
    const options = {
      parquet: `FORMAT parquet, ROW_GROUP_SIZE ${rowGroupSize}`,
      csv: 'FORMAT csv, HEADER true',
      json: 'FORMAT json, ARRAY true',
    }[format];
    await harness.conn.query(`COPY (${select}) TO '${path}' (${options})`);
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  async function rows(sql: string): Promise<Record<string, unknown>[]> {
    const result = await harness.conn.query(sql);
    return result.toArray().map((row) => row.toJSON() as Record<string, unknown>);
  }

  function types(result: LoadResult): Record<string, string | undefined> {
    return Object.fromEntries(result.schema.map((c) => [c.name, c.originalType]));
  }

  /**
   * Run `fn` under a lower memory limit. The old value is restored by
   * setting it back: `RESET memory_limit` does not restore it in DuckDB-WASM.
   */
  async function withMemoryLimit(limit: string, fn: () => Promise<void>): Promise<void> {
    const [row] = await rows("SELECT current_setting('memory_limit') AS m");
    await harness.conn.query(`SET memory_limit = '${limit}'`);
    try {
      await fn();
    } finally {
      await harness.conn.query(`SET memory_limit = '${String(row?.m)}'`);
    }
  }

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
    await Promise.all(files.map((f) => unlink(f).catch(() => {})));
  });

  describe('Parquet', () => {
    it('converts ISO dates, timestamps and times, and leaves other text alone', async () => {
      const data = await write(
        `SELECT strftime(DATE '2020-01-01' + CAST(range % 900 AS INTEGER), '%Y-%m-%d') AS day,
                CASE WHEN range % 7 = 0 THEN NULL
                     ELSE strftime(TIMESTAMP '2020-01-01' + to_seconds(range * 3601), '%Y-%m-%dT%H:%M:%S') END AS stamp,
                strftime(TIMESTAMP '2020-01-01' + to_seconds(range * 17), '%H:%M:%S') AS clock,
                'order ' || range AS note
         FROM range(${ROWS})`,
        'parquet',
      );
      const table = nextTable();
      const result = await loadParquet(data, { tableName: table }, ctx());

      expect(types(result)).toMatchObject({
        day: 'DATE',
        stamp: 'TIMESTAMP',
        clock: 'TIME',
        note: 'VARCHAR',
      });
      const [check] = await rows(
        `SELECT count(*) FILTER (WHERE day <> DATE '2020-01-01' + CAST("__rowid__" % 900 AS INTEGER)) AS wrong_days,
                count(stamp) AS timestamps,
                max(stamp) = TIMESTAMP '2020-01-01' + to_seconds(4999 * 3601) AS last_timestamp
         FROM "${table}"`,
      );
      expect(Number(check?.wrong_days)).toBe(0);
      expect(Number(check?.timestamps)).toBe(ROWS - Math.ceil(ROWS / 7));
      expect(check?.last_timestamp).toBe(true);
    });

    it('keeps a column as text when any value would not convert', async () => {
      // Every sampled value is a valid date. Row 4000, past the sample, is
      // 30 February: TRY_CAST would turn it into NULL.
      const data = await write(
        `SELECT CASE WHEN range = 4000 THEN '2020-02-30'
                     ELSE strftime(DATE '2020-01-01' + CAST(range % 900 AS INTEGER), '%Y-%m-%d') END AS day,
                CASE WHEN range = 10 THEN 'unknown'
                     ELSE strftime(DATE '2020-01-01' + CAST(range % 900 AS INTEGER), '%Y-%m-%d') END AS due
         FROM range(${ROWS})`,
        'parquet',
      );
      const table = nextTable();
      const result = await loadParquet(data, { tableName: table }, ctx());

      expect(types(result)).toMatchObject({ day: 'VARCHAR', due: 'VARCHAR' });
      const [check] = await rows(
        `SELECT count(day) AS days, count(due) AS dues,
                max(day) FILTER (WHERE "__rowid__" = 4000) AS invalid,
                max(due) FILTER (WHERE "__rowid__" = 10) AS unknown
         FROM "${table}"`,
      );
      expect(check).toMatchObject({ invalid: '2020-02-30', unknown: 'unknown' });
      expect(Number(check?.days)).toBe(ROWS);
      expect(Number(check?.dues)).toBe(ROWS);
    });

    it('keeps a column as text when a value would convert but change', async () => {
      // DuckDB's casts keep a valid prefix and drop the rest, so none of
      // row 4000's values would turn into NULL; each would silently change.
      const date = `strftime(DATE '2020-01-01' + CAST(range % 900 AS INTEGER), '%Y-%m-%d')`;
      const clock = `strftime(TIMESTAMP '2020-01-01' + to_seconds(range * 17), '%H:%M:%S')`;
      const data = await write(
        `SELECT CASE WHEN range = 4000 THEN '2020-03-15 to 2020-04-01' ELSE ${date} END AS span,
                CASE WHEN range = 4000 THEN '2020-03-15 14:30:00' ELSE ${date} END AS mixed,
                CASE WHEN range = 4000 THEN '02:30:00 PM' ELSE ${clock} END AS clock,
                CASE WHEN range = 4000 THEN '2020-03-15' ELSE ${clock} END AS clock2,
                strftime(TIMESTAMP '2020-01-01' + to_seconds(range * 61), '%Y-%m-%dT%H:%M:%S') || '.123456789' AS nanos,
                strftime(TIMESTAMP '2020-01-01' + to_seconds(range * 61), '%Y-%m-%dT%H:%M:%S') || '.123456' AS micros
         FROM range(${ROWS})`,
        'parquet',
      );
      const table = nextTable();
      const result = await loadParquet(data, { tableName: table }, ctx());

      expect(types(result)).toMatchObject({
        span: 'VARCHAR',
        mixed: 'VARCHAR',
        clock: 'VARCHAR',
        clock2: 'VARCHAR',
        nanos: 'VARCHAR',
        // Six fractional digits fit a TIMESTAMP exactly.
        micros: 'TIMESTAMP',
      });
      const [check] = await rows(
        `SELECT span, mixed, clock, clock2, nanos FROM "${table}" WHERE "__rowid__" = 4000`,
      );
      expect(check).toEqual({
        span: '2020-03-15 to 2020-04-01',
        mixed: '2020-03-15 14:30:00',
        clock: '02:30:00 PM',
        clock2: '2020-03-15',
        nanos: '2020-01-03T19:46:40.123456789',
      });
    });

    it('treats blank text as missing, so a date column with blanks converts', async () => {
      const data = await write(
        `SELECT CASE WHEN range % 50 = 0 THEN '' WHEN range % 50 = 1 THEN '   '
                     ELSE strftime(DATE '2020-01-01' + CAST(range % 900 AS INTEGER), '%Y-%m-%d') END AS day
         FROM range(${ROWS})`,
        'parquet',
      );
      const table = nextTable();
      const result = await loadParquet(data, { tableName: table }, ctx());

      expect(types(result)['day']).toBe('DATE');
      const [check] = await rows(
        `SELECT count(day) AS days,
                count(*) FILTER (WHERE day IS NOT NULL
                                 AND day <> DATE '2020-01-01' + CAST("__rowid__" % 900 AS INTEGER)) AS wrong
         FROM "${table}"`,
      );
      expect(Number(check?.days)).toBe(ROWS - (2 * ROWS) / 50);
      expect(Number(check?.wrong)).toBe(0);
    });

    it('keeps UTC offsets by loading them as TIMESTAMPTZ', async () => {
      const data = await write(
        `SELECT CASE WHEN range % 2 = 0 THEN '2020-01-05T10:00:00+05:30'
                     ELSE '2020-01-05T10:00:00Z' END AS zoned,
                '2020-01-05T10:00:00Z' AS utc
         FROM range(${ROWS})`,
        'parquet',
      );
      const table = nextTable();
      const result = await loadParquet(data, { tableName: table }, ctx());

      // Z in a UTC session is the same instant as a plain TIMESTAMP.
      expect(types(result)).toMatchObject({ zoned: 'TIMESTAMP WITH TIME ZONE', utc: 'TIMESTAMP' });
      const instants = await rows(
        `SELECT DISTINCT epoch(zoned) AS zoned, epoch(utc) AS utc FROM "${table}" ORDER BY zoned`,
      );
      const tenUtc = Date.UTC(2020, 0, 5, 10) / 1000;
      expect(instants).toEqual([
        { zoned: tenUtc - 5.5 * 3600, utc: tenUtc },
        { zoned: tenUtc, utc: tenUtc },
      ]);
    });

    it('converts the listed columns when loading a subset', async () => {
      const data = await write(
        `SELECT range AS id,
                strftime(DATE '2020-01-01' + CAST(range % 900 AS INTEGER), '%Y-%m-%d') AS day,
                'x' AS skipped
         FROM range(${ROWS})`,
        'parquet',
      );
      const result = await loadParquet(
        data,
        { tableName: nextTable(), columns: ['day', 'id'] },
        ctx(),
      );
      expect(result.schema.map((c) => [c.name, c.originalType])).toEqual([
        ['__rowid__', 'BIGINT'],
        ['day', 'DATE'],
        ['id', 'BIGINT'],
      ]);
    });

    it('loads a table that fits in memory once but not twice', async () => {
      // 1M rows × 11 columns: about 122 MiB once loaded. Converting the
      // date text after loading needed a second copy of the table.
      const numbers = Array.from(
        { length: 10 },
        (_, i) => `CAST(range % 1000 + ${i} AS DOUBLE) AS n${i}`,
      ).join(', ');
      const data = await write(
        `SELECT ${numbers},
                strftime(DATE '2000-01-01' + CAST(range % 9000 AS INTEGER), '%Y-%m-%d') AS day
         FROM range(1000000)`,
        'parquet',
      );
      const table = nextTable();
      await withMemoryLimit('180MB', async () => {
        const result = await loadParquet(data, { tableName: table }, ctx());
        expect(types(result)['day']).toBe('DATE');
      });
      const [check] = await rows(
        `SELECT count(*) FILTER (WHERE day = DATE '2000-01-01' + CAST("__rowid__" % 9000 AS INTEGER)) AS ok
         FROM "${table}"`,
      );
      expect(Number(check?.ok)).toBe(1_000_000);
      await harness.conn.query(`DROP TABLE "${table}"`);
    }, 60_000);
  });

  describe('JSON (CSV converts the same way)', () => {
    it('JSON: keeps a date column as text when a value would not convert', async () => {
      const data = await write(
        `SELECT range AS id,
                CASE WHEN range = 4000 THEN 'N/A'
                     ELSE strftime(DATE '2020-01-01' + CAST(range % 900 AS INTEGER), '%Y-%m-%d') END AS day,
                strftime(TIMESTAMP '2020-01-01' + to_seconds(range * 61), '%Y-%m-%dT%H:%M:%S.%g') AS stamp
         FROM range(${ROWS})`,
        'json',
      );
      const table = nextTable();
      const result = await loadJSON(data, { tableName: table }, ctx());

      expect(types(result)).toMatchObject({ day: 'VARCHAR', stamp: 'TIMESTAMP' });
      const [check] = await rows(
        `SELECT count(day) AS days, max(day) FILTER (WHERE id = 4000) AS missing FROM "${table}"`,
      );
      expect(check?.missing).toBe('N/A');
      expect(Number(check?.days)).toBe(ROWS);
    });

    it('JSON: converts in place, keeping every value on its row', async () => {
      const data = await write(
        `SELECT range AS id,
                'order ' || range AS label,
                strftime(TIMESTAMP '2020-01-01' + to_seconds(range * 61), '%Y-%m-%dT%H:%M:%S.%g') AS stamp
         FROM range(${ROWS})`,
        'json',
      );
      const table = nextTable();
      const result = await loadJSON(data, { tableName: table }, ctx());

      expect(types(result)['stamp']).toBe('TIMESTAMP');
      expect(result.columns).toEqual(['__rowid__', 'id', 'label', 'stamp']);
      const [check] = await rows(
        `SELECT count(*) FILTER (WHERE id <> "__rowid__"
                                 OR label <> 'order ' || id
                                 OR stamp <> TIMESTAMP '2020-01-01' + to_seconds(id * 61)) AS misplaced
         FROM "${table}"`,
      );
      expect(Number(check?.misplaced)).toBe(0);
    });

    it('JSON: converts a table that fits in memory once but not twice', async () => {
      // 1M rows: about 53 MiB once loaded, and the JSON reader needs its own
      // working memory. Converting by rebuilding the table ran out here.
      const data = await write(
        `SELECT range AS id, CAST(range % 1000 AS DOUBLE) AS a, CAST(range % 999 AS DOUBLE) AS b,
                strftime(TIMESTAMP '2000-01-01' + to_seconds(range * 61), '%Y-%m-%dT%H:%M:%S.%g') AS stamp
         FROM range(1000000)`,
        'json',
      );
      const table = nextTable();
      await withMemoryLimit('160MB', async () => {
        const result = await loadJSON(data, { tableName: table }, ctx());
        expect(types(result)['stamp']).toBe('TIMESTAMP');
      });
      await harness.conn.query(`DROP TABLE "${table}"`);
    }, 60_000);
  });
});
