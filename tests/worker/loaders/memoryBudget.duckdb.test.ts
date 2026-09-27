/**
 * The Parquet memory check against a real DuckDB (Node target, buffer path —
 * file handles need a browser; tests/browser/parquet-file-load.spec.ts covers
 * those).
 *
 * The first test is the calibration guard: the per-type costs in
 * memoryBudget.ts were measured on DuckDB 1.5.4, and if an upgrade changes
 * how much an in-memory table takes, the estimate stops matching DuckDB's
 * own accounting here.
 */
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { measureParquetFootprint } from '@/worker/loaders/memoryBudget';
import { loadParquet } from '@/worker/loaders/parquet';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';

const ROWS = 200_000;

describe('Parquet memory check (real DuckDB)', () => {
  let harness: NodeDuckDBHarness;
  const files: string[] = [];

  /** Write `select` to a Parquet file and return its bytes. */
  async function parquet(select: string, rowGroupSize = 122_880): Promise<ArrayBuffer> {
    const path = join(tmpdir(), `dt_budget_${process.pid}_${files.length}.parquet`);
    files.push(path);
    await harness.conn.query(
      `COPY (${select}) TO '${path}' (FORMAT parquet, ROW_GROUP_SIZE ${rowGroupSize})`,
    );
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  async function usedBytes(): Promise<number> {
    const result = await harness.conn.query(
      'SELECT sum(memory_usage_bytes) AS used FROM duckdb_memory()',
    );
    return Number(result.toArray()[0]?.toJSON().used ?? 0);
  }

  const ctx = () => ({ db: harness.db, conn: harness.conn });

  /**
   * Run `fn` under a lower memory limit. The old value is restored by
   * setting it back: `RESET memory_limit` does not restore it in DuckDB-WASM.
   */
  async function withMemoryLimit(limit: string, fn: () => Promise<void>): Promise<void> {
    const result = await harness.conn.query("SELECT current_setting('memory_limit') AS m");
    const original = String(result.toArray()[0]?.toJSON().m);
    await harness.conn.query(`SET memory_limit = '${limit}'`);
    try {
      await fn();
    } finally {
      await harness.conn.query(`SET memory_limit = '${original}'`);
    }
  }

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
    await Promise.all(files.map((f) => unlink(f).catch(() => {})));
  });

  it('estimates a mixed table within 15% of what DuckDB reports', async () => {
    const data = await parquet(
      `SELECT CASE WHEN range % 50 = 0 THEN NULL ELSE random() * 1000 END AS price,
              CAST(range % 100000 AS INTEGER) AS qty,
              CAST(range AS BIGINT) AS id,
              'c' || (range % 20) AS category,
              'order note for ' || range || ', shipped by ground freight' AS note,
              TIMESTAMP '2020-01-01' + to_seconds(range) AS placed_at,
              DATE '2020-01-01' + CAST(range % 3000 AS INTEGER) AS due,
              CAST(range % 7 AS DECIMAL(10, 2)) AS discount,
              range % 2 = 0 AS paid
       FROM range(${ROWS})`,
    );

    const fileName = 'budget_probe.parquet';
    await harness.db.registerFileBuffer(fileName, new Uint8Array(data.slice(0)));
    const describe = (
      await harness.conn.query(`DESCRIBE SELECT * FROM read_parquet('${fileName}')`)
    )
      .toArray()
      .map((row) => row.toJSON());
    const footprint = await measureParquetFootprint(harness.conn, fileName, describe);
    await harness.db.dropFile(fileName);

    expect(footprint.rows).toBe(ROWS);
    expect(footprint.columns).toBe(10);
    expect(footprint.largestRowGroupBytes).toBeGreaterThan(0);

    const before = await usedBytes();
    await loadParquet(data, { tableName: 'budget_mixed' }, ctx());
    const actual = (await usedBytes()) - before;
    await harness.conn.query('DROP TABLE budget_mixed');

    expect(footprint.tableBytes / actual).toBeGreaterThan(0.85);
    expect(footprint.tableBytes / actual).toBeLessThan(1.15);
  }, 60_000);

  it.each([
    [5, 3000],
    [10_000, 3000],
  ])(
    'loads %d rows × %d columns, and estimates the table within 5%',
    async (rows, columns) => {
      // Short, wide tables: whole-block estimates put these at 1.5 GiB and
      // refused them, where DuckDB holds 64 and 815 MiB.
      const select = Array.from({ length: columns }, (_, i) => `random() + ${i} AS c${i}`);
      const data = await parquet(`SELECT ${select.join(', ')} FROM range(${rows})`);

      const fileName = `budget_wide_${rows}.parquet`;
      await harness.db.registerFileBuffer(fileName, new Uint8Array(data.slice(0)));
      const describe = (
        await harness.conn.query(`DESCRIBE SELECT * FROM read_parquet('${fileName}')`)
      )
        .toArray()
        .map((row) => row.toJSON());
      const footprint = await measureParquetFootprint(harness.conn, fileName, describe);
      await harness.db.dropFile(fileName);

      const before = await usedBytes();
      const result = await loadParquet(data, { tableName: 'budget_wide' }, ctx());
      const actual = (await usedBytes()) - before;
      await harness.conn.query('DROP TABLE budget_wide');

      expect(result.rowCount).toBe(rows);
      expect(footprint.tableBytes / actual).toBeGreaterThan(0.95);
      expect(footprint.tableBytes / actual).toBeLessThan(1.05);
    },
    120_000,
  );

  it('rejects a load that cannot fit before building anything', async () => {
    // ~33 MB once loaded; the footer and DESCRIBE need well under 16 MB.
    const data = await parquet('SELECT range AS a, random() AS b FROM range(1000000)');
    await withMemoryLimit('16MB', async () => {
      await expect(loadParquet(data, { tableName: 'budget_tiny' }, ctx())).rejects.toMatchObject({
        code: 'LOAD_MEMORY_EXCEEDED',
        details: { stage: 'estimate', check: 'table', rows: 1_000_000, columns: 2 },
      });
    });
    const tables = await harness.conn.query(
      "SELECT count(*) AS n FROM duckdb_tables() WHERE table_name = 'budget_tiny'",
    );
    expect(Number(tables.toArray()[0]?.toJSON().n)).toBe(0);
  }, 60_000);

  it('reports an out-of-memory failure during the load with the same code', async () => {
    // The estimate samples text lengths from the first rows only. Short
    // strings in the first row group and 1 KB ones after make it undershoot
    // (~4 MB against ~200 MB), so the load passes the check and then runs
    // out of memory building the table. Small row groups keep the sample
    // itself cheap.
    const data = await parquet(
      `SELECT CASE WHEN range < 4096 THEN 'x' ELSE repeat('y', 1000) || range END AS body
       FROM range(${ROWS})`,
      4096,
    );
    await withMemoryLimit('64MB', async () => {
      await expect(loadParquet(data, { tableName: 'budget_long' }, ctx())).rejects.toMatchObject({
        code: 'LOAD_MEMORY_EXCEEDED',
        details: {
          stage: 'load',
          rows: ROWS,
          columns: 1,
          duckdbMessage: expect.stringMatching(/^Out of Memory Error/),
        },
        cause: expect.objectContaining({ message: expect.stringMatching(/Out of Memory/) }),
      });
    });
  }, 60_000);

  it('drops the table it built when the load then runs out of memory', async () => {
    // ISO date strings make the loader rebuild the table to convert them,
    // which needs a second copy. A limit of 1.35× the table fits the first
    // copy and the estimate, but not the rebuild.
    const numbers = Array.from({ length: 30 }, (_, i) => `random() + ${i} AS n${i}`);
    const data = await parquet(
      `SELECT strftime(DATE '2020-01-01' + CAST(range % 3000 AS INTEGER), '%Y-%m-%d') AS day,
              ${numbers.join(', ')}
       FROM range(600000)`,
    );
    const fileName = 'budget_dates.parquet';
    await harness.db.registerFileBuffer(fileName, new Uint8Array(data.slice(0)));
    const describe = (
      await harness.conn.query(`DESCRIBE SELECT * FROM read_parquet('${fileName}')`)
    )
      .toArray()
      .map((row) => row.toJSON());
    const footprint = await measureParquetFootprint(harness.conn, fileName, describe);
    await harness.db.dropFile(fileName);

    const limitMiB = Math.ceil((footprint.tableBytes * 1.35) / 2 ** 20);
    await withMemoryLimit(`${limitMiB}MiB`, async () => {
      await expect(loadParquet(data, { tableName: 'budget_dates' }, ctx())).rejects.toMatchObject({
        code: 'LOAD_MEMORY_EXCEEDED',
        details: { stage: 'load', duckdbMessage: expect.stringMatching(/^Out of Memory Error/) },
      });
    });
    const tables = await harness.conn.query(
      "SELECT count(*) AS n FROM duckdb_tables() WHERE table_name LIKE '%budget_dates%'",
    );
    expect(Number(tables.toArray()[0]?.toJSON().n)).toBe(0);
    expect(await usedBytes()).toBeLessThan(footprint.tableBytes / 2);
  }, 60_000);
});
