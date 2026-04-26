/**
 * Phase 4: end-to-end Parquet loader tests against real fixtures.
 *
 * Drives `loadParquet` directly. Covers the four Parquet fixtures present
 * under `tests/fixtures/datasets/parquet/`. Exercises optional `columns`
 * selection and reserved-column rejection.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadParquet } from '@/worker/loaders/parquet';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { readBinaryFixture } from '../../helpers/fixtures';

describe('Parquet loader — fixture integration', () => {
  let harness: NodeDuckDBHarness;
  let testCounter = 0;
  const tableName = (suffix: string): string => `pq_${suffix}_${++testCounter}`;
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

  describe('titanic.parquet', () => {
    it('loads 891 rows × 13 columns with native types preserved', async () => {
      const data = await readBinaryFixture('parquet', 'titanic');
      const result = await loadParquet(data, { tableName: tableName('titanic') }, ctx());
      expect(result.rowCount).toBe(891);
      expect(result.columns).toHaveLength(13);
      expect(result.columns[0]).toBe('__rowid__');
      const types = Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
      expect(types['PassengerId']).toBe('integer');
      expect(types['Age']).toBe('float');
      expect(types['Fare']).toBe('float');
      expect(types['Name']).toBe('string');
    }, 15_000);
  });

  describe('nyc_taxi.parquet', () => {
    it('loads 100,000 rows preserving native TIMESTAMP types', async () => {
      const data = await readBinaryFixture('parquet', 'nyc_taxi');
      const result = await loadParquet(data, { tableName: tableName('nyc') }, ctx());
      expect(result.rowCount).toBe(100_000);
      const types = Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
      // Parquet's TIMESTAMP type maps directly — no VARCHAR coercion needed.
      expect(types['tpep_pickup_datetime']).toBe('timestamp');
      expect(types['tpep_dropoff_datetime']).toBe('timestamp');
      expect(types['fare_amount']).toBe('float');
      expect(types['VendorID']).toBe('integer');
    }, 30_000);

    it('loads with __rowid__ produced as 0..N-1', async () => {
      const data = await readBinaryFixture('parquet', 'nyc_taxi');
      const tn = tableName('nyc_rowid');
      await loadParquet(data, { tableName: tn }, ctx());
      const rows = await harness.conn.query(
        `SELECT MIN("__rowid__") AS lo, MAX("__rowid__") AS hi FROM "${tn}"`,
      );
      const summary = rows.toArray()[0]?.toJSON() as { lo: bigint; hi: bigint };
      expect(Number(summary.lo)).toBe(0);
      expect(Number(summary.hi)).toBe(99_999);
    }, 30_000);
  });

  describe('numeric-stress-tests.parquet', () => {
    it('loads with native numeric types preserved (no string coercion)', async () => {
      const data = await readBinaryFixture('parquet', 'numeric-stress-tests');
      const result = await loadParquet(data, { tableName: tableName('numeric') }, ctx());
      expect(result.rowCount).toBe(100);
      const types = Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
      expect(types['id']).toBe('integer');
      expect(types['extreme_large']).toBeDefined();
      expect(['integer', 'float'].includes(types['extreme_large'] ?? '')).toBe(true);
    }, 15_000);
  });

  describe('datetime-stress-tests.parquet', () => {
    it('loads 450 rows preserving date / time / timestamp types', async () => {
      const data = await readBinaryFixture('parquet', 'datetime-stress-tests');
      const result = await loadParquet(data, { tableName: tableName('datetime') }, ctx());
      expect(result.rowCount).toBe(450);
      const types = Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
      expect(types['date_standard']).toBe('date');
      expect(types['time_standard']).toBe('time');
      expect(types['timestamp_standard']).toBe('timestamp');
    }, 15_000);
  });

  describe('options', () => {
    it('honors columns option for selective loading', async () => {
      const data = await readBinaryFixture('parquet', 'titanic');
      const result = await loadParquet(
        data,
        { tableName: tableName('titanic_subset'), columns: ['PassengerId', 'Name', 'Age'] },
        ctx(),
      );
      expect(result.rowCount).toBe(891);
      expect(result.columns).toEqual(['__rowid__', 'PassengerId', 'Name', 'Age']);
    }, 15_000);

    it('rejects __rowid__ in the columns list with LOAD_RESERVED_COLUMN_NAME', async () => {
      const data = await readBinaryFixture('parquet', 'titanic');
      try {
        await loadParquet(
          data,
          { tableName: tableName('titanic_bad'), columns: ['__rowid__', 'Name'] },
          ctx(),
        );
        throw new Error('should have thrown');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('LOAD_RESERVED_COLUMN_NAME');
      }
    });

    it('rejects invalid timezone with LOAD_INVALID_TIMEZONE', async () => {
      const data = await readBinaryFixture('parquet', 'titanic');
      try {
        await loadParquet(data, { tableName: tableName('titanic_tz'), timezone: 'inva!id' }, ctx());
        throw new Error('should have thrown');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('LOAD_INVALID_TIMEZONE');
      }
    });
  });
});
