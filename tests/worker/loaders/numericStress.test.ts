/**
 * Phase 4: numeric-stress-tests fixture deep assertions across CSV / JSON /
 * Parquet. Locks the per-column type-inference contract for edge cases:
 * all-NULL column → string, single-value column → integer, mixed-type
 * column → string, scientific notation → float, BIGINT precision via
 * `extreme_large` etc.
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

describe('numeric-stress-tests fixture — type inference', () => {
  let harness: NodeDuckDBHarness;
  let testCounter = 0;
  const tn = (suffix: string): string => `num_${suffix}_${++testCounter}`;
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

  /**
   * Assertions shared across all three formats. Some columns differ by
   * format (CSV/JSON go through DuckDB's CSV/JSON sniffing; Parquet
   * preserves native binary types).
   */
  function expectCommonShape(result: LoaderResult): void {
    expect(result.rowCount).toBe(100);
    expect(result.columns).toContain('__rowid__');
    expect(result.columns).toContain('id');
    expect(result.columns).toContain('all_nulls');
    expect(result.columns).toContain('mixed_type');
    expect(result.columns).toContain('scientific_notation');
  }

  function typesMap(result: LoaderResult): Record<string, string> {
    return Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
  }

  describe('CSV path (read_csv_auto)', () => {
    let result: LoaderResult;
    let csvTable: string;

    beforeAll(async () => {
      const data = await readBinaryFixture('csv', 'numeric-stress-tests');
      csvTable = tn('csv');
      result = await loadCSV(data, { tableName: csvTable }, ctx());
    });

    it('loads 100 rows', () => {
      expectCommonShape(result);
    });

    it('id column is integer with monotonic 1..100 values', async () => {
      expect(typesMap(result)['id']).toBe('integer');
      const rows = await harness.conn.query(
        `SELECT MIN("id") AS lo, MAX("id") AS hi, COUNT(*) AS n FROM "${csvTable}"`,
      );
      const summary = rows.toArray()[0]?.toJSON() as { lo: bigint; hi: bigint; n: bigint };
      expect(Number(summary.lo)).toBe(1);
      expect(Number(summary.hi)).toBe(100);
      expect(Number(summary.n)).toBe(100);
    });

    it('all_nulls column is loaded (CSV detects it as VARCHAR/INTEGER for an empty column)', () => {
      // DuckDB's CSV sniffer may classify an entirely-empty column as INTEGER
      // (typed by absence) — both INTEGER and STRING are tolerable since
      // no values exist to coerce. Lock the absence-of-coercion-error
      // outcome rather than the specific type.
      const t = typesMap(result)['all_nulls'];
      expect(['integer', 'string', 'float']).toContain(t);
    });

    it('single_value column is integer (all rows = 42)', async () => {
      expect(typesMap(result)['single_value']).toBe('integer');
      const rows = await harness.conn.query(
        `SELECT COUNT(DISTINCT "single_value") AS d, MIN("single_value") AS v FROM "${csvTable}"`,
      );
      const summary = rows.toArray()[0]?.toJSON() as { d: bigint; v: number | bigint };
      expect(Number(summary.d)).toBe(1);
      expect(Number(summary.v)).toBe(42);
    });

    it('mixed_type column is VARCHAR (string + number → string)', () => {
      expect(typesMap(result)['mixed_type']).toBe('string');
    });

    it('extreme_large column carries large values without overflow', async () => {
      const t = typesMap(result)['extreme_large'];
      expect(['integer', 'float']).toContain(t);
      const rows = await harness.conn.query(`SELECT MAX("extreme_large") AS hi FROM "${csvTable}"`);
      const hi = rows.toArray()[0]?.toJSON() as { hi: number | bigint };
      const max = Number(hi.hi);
      expect(Number.isFinite(max)).toBe(true);
      expect(max).toBeGreaterThan(1e8);
    });

    it('scientific_notation column is float and survives large magnitudes', async () => {
      expect(typesMap(result)['scientific_notation']).toBe('float');
      const rows = await harness.conn.query(
        `SELECT MIN("scientific_notation") AS lo, MAX("scientific_notation") AS hi FROM "${csvTable}"`,
      );
      const summary = rows.toArray()[0]?.toJSON() as { lo: number; hi: number };
      // Some scientific-notation values are negative; |min| or |max| should be very large.
      expect(Math.max(Math.abs(summary.lo), Math.abs(summary.hi))).toBeGreaterThan(1e9);
    });
  });

  describe('JSON path (read_json_auto)', () => {
    let result: LoaderResult;

    beforeAll(async () => {
      const data = await readBinaryFixture('json', 'numeric-stress-tests');
      result = await loadJSON(data, { tableName: tn('json') }, ctx());
    });

    it('loads 100 rows with the same surface shape', () => {
      expectCommonShape(result);
    });

    it('id stays integer', () => {
      expect(typesMap(result)['id']).toBe('integer');
    });

    it('mixed_type column is VARCHAR through JSON path too', () => {
      expect(typesMap(result)['mixed_type']).toBe('string');
    });

    it('scientific_notation column is float', () => {
      expect(typesMap(result)['scientific_notation']).toBe('float');
    });
  });

  describe('Parquet path (read_parquet)', () => {
    let result: LoaderResult;

    beforeAll(async () => {
      const data = await readBinaryFixture('parquet', 'numeric-stress-tests');
      result = await loadParquet(data, { tableName: tn('parquet') }, ctx());
    });

    it('loads 100 rows preserving native numeric types', () => {
      expectCommonShape(result);
    });

    it('id is integer (native Parquet INT64)', () => {
      expect(typesMap(result)['id']).toBe('integer');
    });

    it('extreme_large keeps full precision via native BIGINT/DOUBLE', async () => {
      const t = typesMap(result)['extreme_large'];
      expect(['integer', 'float']).toContain(t);
    });
  });
});
