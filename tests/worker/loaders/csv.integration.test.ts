/**
 * Phase 4: end-to-end CSV loader tests against real fixtures.
 *
 * Drives `loadCSV` directly with an explicit `{ db, conn }` context built
 * by the Node-side DuckDB harness. Confirms row count, schema, sample
 * values, and `__rowid__` synthesis for every CSV fixture under
 * `tests/fixtures/datasets/csv/`. Reserved-column rejection covered with
 * a synthetic CSV.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadCSV } from '@/worker/loaders/csv';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { readBinaryFixture, readTextFixture } from '../../helpers/fixtures';

describe('CSV loader — fixture integration', () => {
  let harness: NodeDuckDBHarness;
  let testCounter = 0;
  const tableName = (suffix: string): string => `csv_${suffix}_${++testCounter}`;
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

  describe('titanic.csv', () => {
    it('loads 891 rows × 13 columns (12 + injected __rowid__)', async () => {
      const data = await readBinaryFixture('csv', 'titanic');
      const result = await loadCSV(data, { tableName: tableName('titanic') }, ctx());
      expect(result.rowCount).toBe(891);
      expect(result.columns).toEqual([
        '__rowid__',
        'PassengerId',
        'Survived',
        'Pclass',
        'Name',
        'Sex',
        'Age',
        'SibSp',
        'Parch',
        'Ticket',
        'Fare',
        'Cabin',
        'Embarked',
      ]);
    }, 15_000);

    it('infers schema types correctly', async () => {
      const data = await readBinaryFixture('csv', 'titanic');
      const result = await loadCSV(data, { tableName: tableName('titanic_schema') }, ctx());
      const types = Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
      expect(types['__rowid__']).toBe('integer');
      expect(types['PassengerId']).toBe('integer');
      expect(types['Survived']).toBe('integer');
      expect(types['Pclass']).toBe('integer');
      expect(types['Age']).toBe('float');
      expect(types['Fare']).toBe('float');
      expect(types['Name']).toBe('string');
      expect(types['Sex']).toBe('string');
      expect(types['Embarked']).toBe('string');
    }, 15_000);

    it('marks __rowid__ with system: true', async () => {
      const data = await readBinaryFixture('csv', 'titanic');
      const result = await loadCSV(data, { tableName: tableName('titanic_sys') }, ctx());
      const rowidCol = result.schema.find((c) => c.name === '__rowid__');
      expect(rowidCol?.system).toBe(true);
      // Other columns must NOT be marked system.
      const passengerCol = result.schema.find((c) => c.name === 'PassengerId');
      expect(passengerCol?.system).toBeUndefined();
    }, 15_000);

    it('produces __rowid__ as 0..N-1', async () => {
      const data = await readBinaryFixture('csv', 'titanic');
      const tn = tableName('titanic_rowid');
      await loadCSV(data, { tableName: tn }, ctx());
      const rows = await harness.conn.query(
        `SELECT MIN("__rowid__") AS lo, MAX("__rowid__") AS hi FROM "${tn}"`,
      );
      const summary = rows.toArray()[0]?.toJSON() as { lo: bigint; hi: bigint };
      expect(Number(summary.lo)).toBe(0);
      expect(Number(summary.hi)).toBe(890);
    }, 15_000);
  });

  describe('nyc_taxi.csv', () => {
    it('loads 100,000 rows with the expected schema', async () => {
      const data = await readBinaryFixture('csv', 'nyc_taxi');
      const result = await loadCSV(data, { tableName: tableName('nyc') }, ctx());
      expect(result.rowCount).toBe(100_000);
      expect(result.columns).toContain('VendorID');
      expect(result.columns).toContain('tpep_pickup_datetime');
      expect(result.columns).toContain('total_amount');
      expect(result.columns[0]).toBe('__rowid__');
      // 19 source columns + injected __rowid__.
      expect(result.columns).toHaveLength(20);
    }, 30_000);

    it('infers timestamp columns from VARCHAR ISO strings', async () => {
      const data = await readBinaryFixture('csv', 'nyc_taxi');
      const result = await loadCSV(data, { tableName: tableName('nyc_ts') }, ctx());
      const types = Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
      // CSV stores datetimes as strings; the loader's type planner coerces them.
      expect(types['tpep_pickup_datetime']).toBe('timestamp');
      expect(types['tpep_dropoff_datetime']).toBe('timestamp');
    }, 30_000);
  });

  describe('vins_de_france.csv (small fixture)', () => {
    it('loads 40 rows × 9 columns', async () => {
      const data = await readBinaryFixture('csv', 'vins_de_france');
      const result = await loadCSV(data, { tableName: tableName('vins') }, ctx());
      expect(result.rowCount).toBe(40);
      // 8 source columns + __rowid__
      expect(result.columns).toEqual([
        '__rowid__',
        'region',
        'appellation',
        'cepage',
        'couleur',
        'millesime',
        'prix_eur',
        'production_hl',
        'bio',
      ]);
    }, 15_000);
  });

  describe('us_customer_orders.csv', () => {
    it('loads 181 rows × 6 columns and detects ISO date format', async () => {
      const data = await readBinaryFixture('csv', 'us_customer_orders');
      const result = await loadCSV(data, { tableName: tableName('orders') }, ctx());
      expect(result.rowCount).toBe(181);
      expect(result.columns).toEqual([
        '__rowid__',
        'order_id',
        'state',
        'product_category',
        'order_total_usd',
        'order_date',
      ]);
      const types = Object.fromEntries(result.schema.map((c) => [c.name, c.type]));
      expect(types['order_date']).toBe('date');
      expect(types['order_total_usd']).toBe('float');
    }, 15_000);
  });

  describe('options & error paths', () => {
    it('throws LOAD_RESERVED_COLUMN_NAME for a CSV that already contains __rowid__', async () => {
      const data = '__rowid__,name\n1,alice\n2,bob\n';
      await expect(
        loadCSV(data, { tableName: tableName('reserved') }, ctx()),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/__rowid__|reserved/i),
      });
      try {
        await loadCSV(data, { tableName: tableName('reserved2') }, ctx());
      } catch (err) {
        expect((err as { code?: string }).code).toBe('LOAD_RESERVED_COLUMN_NAME');
      }
    });

    it('honors a custom delimiter option', async () => {
      const data = 'a;b;c\n1;2;3\n4;5;6\n';
      const result = await loadCSV(
        data,
        { tableName: tableName('semicolon'), delimiter: ';' },
        ctx(),
      );
      expect(result.rowCount).toBe(2);
      expect(result.columns).toEqual(['__rowid__', 'a', 'b', 'c']);
    });

    it('rejects multi-character delimiter with LOAD_INVALID_OPTIONS', async () => {
      try {
        await loadCSV('a,b\n1,2', { tableName: tableName('bad'), delimiter: ',,' }, ctx());
        throw new Error('should have thrown');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('LOAD_INVALID_OPTIONS');
      }
    });

    it('rejects invalid timezone with LOAD_INVALID_TIMEZONE', async () => {
      try {
        await loadCSV('a\n1\n', { tableName: tableName('tz'), timezone: 'inva!id;tz' }, ctx());
        throw new Error('should have thrown');
      } catch (err) {
        expect((err as { code?: string }).code).toBe('LOAD_INVALID_TIMEZONE');
      }
    });

    it('accepts a string source equivalently to ArrayBuffer', async () => {
      const text = await readTextFixture('csv', 'titanic');
      const result = await loadCSV(text, { tableName: tableName('titanic_str') }, ctx());
      expect(result.rowCount).toBe(891);
    }, 15_000);
  });
});
