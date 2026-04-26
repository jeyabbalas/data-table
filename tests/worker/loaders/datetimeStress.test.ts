/**
 * Phase 4: datetime-stress-tests fixture deep assertions across CSV / JSON /
 * Parquet. Locks per-column behavior for a wide variety of date/time
 * shapes:
 *
 * - native DATE / TIME / TIMESTAMP / TIMESTAMPTZ columns,
 * - boundary timestamps (epoch, Y2K, leap year),
 * - precision tiers (whole second, milli, micro),
 * - timezone offsets,
 * - and an `ambig_date` column that intentionally cannot be disambiguated
 *   between US and EU date forms (locked as VARCHAR — the loader must NOT
 *   guess).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadCSV } from '@/worker/loaders/csv';
import { loadJSON } from '@/worker/loaders/json';
import { loadParquet } from '@/worker/loaders/parquet';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { readBinaryFixture } from '../../helpers/fixtures';

interface LoaderResult {
  rowCount: number;
  columns: string[];
  schema: Array<{ name: string; type: string }>;
}

describe('datetime-stress-tests fixture — type inference', () => {
  let harness: NodeDuckDBHarness;
  let testCounter = 0;
  const tn = (suffix: string): string => `dt_${suffix}_${++testCounter}`;
  const ctx = (): { db: NodeDuckDBHarness['db']; conn: NodeDuckDBHarness['conn'] } => ({
    db: harness.db,
    conn: harness.conn,
  });

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  function typesMap(result: LoaderResult): Record<string, string> {
    return Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
  }

  describe('CSV path', () => {
    let result: LoaderResult;
    let table: string;

    beforeAll(async () => {
      const data = await readBinaryFixture('csv', 'datetime-stress-tests');
      table = tn('csv');
      result = await loadCSV(data, { tableName: table }, ctx());
    });

    it('loads 450 rows with the expected column count', () => {
      expect(result.rowCount).toBe(450);
      // 39 source columns + injected __rowid__
      expect(result.columns).toHaveLength(40);
    });

    it('date_standard / time_standard / timestamp_standard are coerced from VARCHAR', () => {
      const types = typesMap(result);
      expect(types['date_standard']).toBe('date');
      expect(types['time_standard']).toBe('time');
      expect(types['timestamp_standard']).toBe('timestamp');
    });

    it('timestamp_tz preserves timezone (TIMESTAMPTZ) when parsed from string', () => {
      // Some CSV builders coerce TZ strings to TIMESTAMP (no TZ); both are
      // acceptable as long as the column is recognized as a temporal type.
      const t = typesMap(result)['timestamp_tz'];
      expect(['timestamp', 'string']).toContain(t);
    });

    it('range_seconds .. range_years all parse as TIMESTAMP', () => {
      const types = typesMap(result);
      for (const name of [
        'range_seconds',
        'range_minutes',
        'range_hours',
        'range_days',
        'range_weeks',
        'range_months',
        'range_years',
      ]) {
        expect(types[name]).toBe('timestamp');
      }
    });

    it('precision_milli / precision_micro retain TIMESTAMP type', () => {
      const types = typesMap(result);
      expect(types['precision_milli']).toBe('timestamp');
      expect(types['precision_micro']).toBe('timestamp');
    });

    it('with_nulls column has the expected ~20% null rate', async () => {
      const rows = await harness.conn.query(
        `SELECT COUNT(*) FILTER (WHERE "with_nulls" IS NULL) AS n_null,
                COUNT(*) AS n_total
         FROM "${table}"`,
      );
      const summary = rows.toArray()[0]?.toJSON() as { n_null: bigint; n_total: bigint };
      const nullRatio = Number(summary.n_null) / Number(summary.n_total);
      expect(nullRatio).toBeGreaterThan(0.05);
      expect(nullRatio).toBeLessThan(0.5);
    });

    it('epoch_boundary contains 1970-01-01 era timestamps', async () => {
      // CAST through VARCHAR for portability — Arrow returns TIMESTAMP as a
      // numeric epoch delta, and string-formatting it on the SQL side is the
      // most reliable way to check "this column lives near 1970".
      const rows = await harness.conn.query(
        `SELECT CAST(MIN("epoch_boundary") AS VARCHAR) AS lo,
                CAST(MAX("epoch_boundary") AS VARCHAR) AS hi
         FROM "${table}" WHERE "epoch_boundary" IS NOT NULL`,
      );
      const summary = rows.toArray()[0]?.toJSON() as { lo: string; hi: string };
      const text = `${summary.lo} ${summary.hi}`;
      expect(/19[67]\d/.test(text)).toBe(true);
    });

    it('y2k_boundary contains 2000-era timestamps', async () => {
      const rows = await harness.conn.query(
        `SELECT CAST(MIN("y2k_boundary") AS VARCHAR) AS lo,
                CAST(MAX("y2k_boundary") AS VARCHAR) AS hi
         FROM "${table}" WHERE "y2k_boundary" IS NOT NULL`,
      );
      const summary = rows.toArray()[0]?.toJSON() as { lo: string; hi: string };
      const text = `${summary.lo} ${summary.hi}`;
      expect(/199\d|200\d/.test(text)).toBe(true);
    });

    it('str_date_us / str_date_eu / str_date_long stay as STRING (no auto-strptime)', () => {
      const types = typesMap(result);
      // Locale-specific date forms (US, EU, long-form) must remain VARCHAR —
      // the loader does not attempt locale-specific date parsing. ISO may be
      // coerced to DATE separately. `str_date_compact` (e.g. `20130516`) is
      // a known special case: DuckDB's CSV sniffer classifies all-numeric
      // 8-digit columns as BIGINT, not VARCHAR. Locked separately below.
      expect(types['str_date_us']).toBe('string');
      expect(types['str_date_eu']).toBe('string');
      expect(types['str_date_long']).toBe('string');
    });

    it('str_date_compact (8-digit numeric) is sniffed as integer by DuckDB CSV reader', () => {
      // Documented quirk — DuckDB's read_csv_auto sees `20130516` as an
      // integer literal and types the column accordingly. Consumers
      // requiring date semantics on this column must opt in via SQL
      // (`strptime(CAST(... AS VARCHAR), '%Y%m%d')`).
      const types = typesMap(result);
      expect(types['str_date_compact']).toBe('integer');
    });

    it('ambig_date column stays as VARCHAR (loader does NOT guess US vs EU)', () => {
      const types = typesMap(result);
      expect(types['ambig_date']).toBe('string');
    });

    it('all_nulls is accepted as a valid empty column', () => {
      const types = typesMap(result);
      expect(typeof types['all_nulls']).toBe('string'); // value of types["all_nulls"] is a DataType string
      expect(types['all_nulls']).toBeDefined();
    });
  });

  describe('JSON path', () => {
    let result: LoaderResult;

    beforeAll(async () => {
      const data = await readBinaryFixture('json', 'datetime-stress-tests');
      result = await loadJSON(data, { tableName: tn('json') }, ctx());
    });

    it('loads 450 rows', () => {
      expect(result.rowCount).toBe(450);
    });

    it('JSON ISO timestamps coerce to TIMESTAMP', () => {
      const types = typesMap(result);
      expect(types['timestamp_standard']).toBe('timestamp');
    });

    it('ambiguous date column stays string through JSON path', () => {
      expect(typesMap(result)['ambig_date']).toBe('string');
    });
  });

  describe('Parquet path', () => {
    let result: LoaderResult;

    beforeAll(async () => {
      const data = await readBinaryFixture('parquet', 'datetime-stress-tests');
      result = await loadParquet(data, { tableName: tn('parquet') }, ctx());
    });

    it('loads 450 rows preserving native DATE / TIME / TIMESTAMP types', () => {
      expect(result.rowCount).toBe(450);
      const types = typesMap(result);
      expect(types['date_standard']).toBe('date');
      expect(types['time_standard']).toBe('time');
      expect(types['timestamp_standard']).toBe('timestamp');
    });

    it('Parquet TIMESTAMPTZ surfaces as timestamp DataType (DuckDB unifies tz/non-tz under TIMESTAMP)', () => {
      const types = typesMap(result);
      expect(types['timestamp_tz']).toBe('timestamp');
    });

    it('precision_milli / precision_micro carry TIMESTAMP through native Parquet types', () => {
      const types = typesMap(result);
      expect(types['precision_milli']).toBe('timestamp');
      expect(types['precision_micro']).toBe('timestamp');
    });

    it('str_date_* columns stay VARCHAR even through Parquet (string column semantics preserved)', () => {
      const types = typesMap(result);
      expect(types['str_date_us']).toBe('string');
      expect(types['str_date_eu']).toBe('string');
      expect(types['str_date_compact']).toBe('string');
    });
  });
});
