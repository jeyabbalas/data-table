/**
 * Source-file handling shared by every loader: the virtual file a source is
 * registered under, and its cleanup.
 *
 * The file name used to be `${tableName}.<ext>`, spliced unescaped into a
 * `read_xxx('…')` literal, so a caller-supplied table name containing a quote
 * broke the load (and was an injection surface). The cleanup ran unguarded in
 * a `finally`, so a `dropFile` failure replaced the load's own error.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadCSV } from '@/worker/loaders/csv';
import { loadJSON } from '@/worker/loaders/json';
import { loadParquet } from '@/worker/loaders/parquet';
import { quoteIdentifier } from '@/worker/loaders/common';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { readBinaryFixture } from '../../helpers/fixtures';

describe('loader source files', () => {
  let harness: NodeDuckDBHarness;
  let testCounter = 0;
  // A quote, a double quote and a path separator — each meaningful to SQL
  // literals, SQL identifiers or the virtual filesystem respectively.
  const awkwardName = (suffix: string): string => `it's/a "table" ${suffix}_${++testCounter}`;
  const ctx = (): { db: NodeDuckDBHarness['db']; conn: NodeDuckDBHarness['conn'] } => ({
    db: harness.db,
    conn: harness.conn,
  });
  const countRows = async (tableName: string): Promise<number> => {
    const result = await harness.conn.query(
      `SELECT COUNT(*) AS n FROM ${quoteIdentifier(tableName)}`,
    );
    return Number(result.toArray()[0]?.toJSON().n);
  };

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await harness?.cleanup();
  });

  describe('table names that are awkward in SQL', () => {
    it('loads CSV', async () => {
      const tableName = awkwardName('csv');
      const result = await loadCSV('a,b\n1,x\n2,y\n', { tableName }, ctx());
      expect(result.tableName).toBe(tableName);
      expect(result.rowCount).toBe(2);
      expect(await countRows(tableName)).toBe(2);
    });

    it('loads JSON', async () => {
      const tableName = awkwardName('json');
      const result = await loadJSON('[{"a":1,"b":"x"},{"a":2,"b":"y"}]', { tableName }, ctx());
      expect(result.rowCount).toBe(2);
      expect(await countRows(tableName)).toBe(2);
    });

    it('loads Parquet', async () => {
      const tableName = awkwardName('parquet');
      const data = await readBinaryFixture('parquet', 'titanic');
      const result = await loadParquet(data, { tableName }, ctx());
      expect(result.rowCount).toBe(891);
      expect(await countRows(tableName)).toBe(891);
    }, 15_000);
  });

  describe('cleanup failures', () => {
    it("do not replace the load's own error", async () => {
      vi.spyOn(harness.db, 'dropFile').mockRejectedValue(new Error('dropFile failed'));
      await expect(
        loadCSV('__rowid__,name\n1,alice\n', { tableName: `reserved_${++testCounter}` }, ctx()),
      ).rejects.toMatchObject({ code: 'LOAD_RESERVED_COLUMN_NAME' });
    });

    it('do not fail a load that succeeded', async () => {
      vi.spyOn(harness.db, 'dropFile').mockRejectedValue(new Error('dropFile failed'));
      const result = await loadCSV('a\n1\n2\n3\n', { tableName: `ok_${++testCounter}` }, ctx());
      expect(result.rowCount).toBe(3);
    });
  });
});
