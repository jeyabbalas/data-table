/**
 * The Parquet memory check against a real DuckDB (Node target, buffer path —
 * file handles need a browser; tests/browser/parquet-file-load.spec.ts covers
 * those).
 *
 * The first test is the calibration guard: the per-type costs in
 * memoryBudget.ts were measured on DuckDB 1.5.4, and if an upgrade changes
 * how much an in-memory table takes, the estimate stops matching DuckDB's
 * own accounting here. The nested-column tests guard the storage model for
 * lists, structs, maps and embeddings the same way.
 */
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { quoteIdentifier } from '@/worker/loaders/common';
import { measureParquetFootprint, scanBytesPerColumn } from '@/worker/loaders/memoryBudget';
import { loadParquet } from '@/worker/loaders/parquet';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { loadNestedFixture, MANIFEST } from '../../helpers/nestedFixture';

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

  describe('nested columns', () => {
    /**
     * Estimate the Parquet file of `select`, then load it and measure what
     * DuckDB reports the table takes, as the first test does.
     */
    async function estimateAndLoad(select: string, tableName: string) {
      const data = await parquet(select);
      const fileName = `budget_nested_${files.length}.parquet`;
      await harness.db.registerFileBuffer(fileName, new Uint8Array(data.slice(0)));
      const describe = (
        await harness.conn.query(`DESCRIBE SELECT * FROM read_parquet('${fileName}')`)
      )
        .toArray()
        .map((row) => row.toJSON());
      const footprint = await measureParquetFootprint(harness.conn, fileName, describe);
      await harness.db.dropFile(fileName);

      const before = await usedBytes();
      await loadParquet(data, { tableName }, ctx());
      const actual = (await usedBytes()) - before;
      await harness.conn.query(`DROP TABLE ${quoteIdentifier(tableName)}`);
      return { footprint, actual };
    }

    it('estimates long text beside a VARCHAR[] column within 15%', async () => {
      // strlen() of a VARCHAR[] is a Binder error. While the text sample
      // took the column in, the whole sample failed, every text column here
      // counted 8 bytes, and the estimate came out 59% low.
      const { footprint, actual } = await estimateAndLoad(
        `SELECT range AS id,
                'customer note ' || repeat('lorem ipsum dolor ', 6) || range AS note,
                'shipping address for order ' || range || ', building ' || (range % 97) AS address,
                list_transform(range(range % 6), lambda i: 'tag_' || i) AS tags,
                random() AS score
         FROM range(${ROWS})`,
        'budget_text_list',
      );
      expect(footprint.tableBytes / actual).toBeGreaterThan(0.85);
      expect(footprint.tableBytes / actual).toBeLessThan(1.15);
    }, 60_000);

    it('estimates 20,000 FLOAT[768] embeddings within 25%', async () => {
      // About 3 KB a row: a flat 40 bytes per nested value put the estimate
      // at 3% of the table. Parquet returns the array as a FLOAT[].
      const { footprint, actual } = await estimateAndLoad(
        `SELECT range AS id,
                CAST(list_transform(range(768), lambda i: random()) AS FLOAT[768]) AS embedding
         FROM range(20000)`,
        'budget_embedding',
      );
      expect(footprint.tableBytes / 20_000).toBeGreaterThan(3000);
      expect(footprint.tableBytes / actual).toBeGreaterThan(0.75);
      expect(footprint.tableBytes / actual).toBeLessThan(1.25);
    }, 120_000);

    it.each([
      [
        'STRUCT',
        `{'x': random(), 'y': random(), 'tier': (['bronze', 'silver', 'gold'])[1 + range % 3]}`,
        'budget_struct',
      ],
      [
        'MAP',
        `map_from_entries(list_transform(range(range % 7), lambda i: {'k': 'key' || i, 'v': CAST(i AS INTEGER)}))`,
        'budget_map',
      ],
      ['LIST', 'list_transform(range(range % 9), lambda i: CAST(i AS INTEGER))', 'budget_list'],
      [
        'JSON[]',
        `list_transform(range(range % 5), lambda i: CAST(json_object('a', i, 'b', 'v' || range) AS JSON))`,
        'budget_json_list',
      ],
    ])(
      'estimates 3,000 rows of a %s column within 25%',
      async (_kind, value, tableName) => {
        // Short tables, where each column of the type's tree pays for its own
        // first segments.
        const { footprint, actual } = await estimateAndLoad(
          `SELECT range AS id, ${value} AS value FROM range(3000)`,
          tableName,
        );
        expect(footprint.tableBytes / actual).toBeGreaterThan(0.75);
        expect(footprint.tableBytes / actual).toBeLessThan(1.25);
      },
      60_000,
    );

    it.each([
      [
        'a short list of long text and a long list of ids',
        `{'chunks': [repeat(chr(97 + CAST(range % 26 AS INTEGER)), 5000),
                     repeat('z', 4999) || CAST(range % 10 AS VARCHAR)],
          'ids': list_transform(range(2000), lambda i: i + range)}`,
        'budget_struct_lists',
      ],
      [
        'a tag list and an embedding',
        `{'tags': list_transform(range(5), lambda i:
                    (['outdoor', 'portrait', 'sunset', 'city', 'people'])[1 + CAST((i + range) % 5 AS INTEGER)]),
          'embedding': CAST(list_transform(range(768), lambda i: CAST(i AS FLOAT)) AS FLOAT[768])}`,
        'budget_struct_embedding',
      ],
    ])(
      'estimates 20,000 rows of a struct of %s within 3%',
      async (_label, value, tableName) => {
        // One items average for every list in the column, and one length
        // for all its text, charged each list the other's: the first came
        // out 189 times the table's 0.53 GB, and the load was refused; the
        // second 1.7 times, which refused 600,000 rows that fit.
        const { footprint, actual } = await estimateAndLoad(
          `SELECT range AS id, ${value} AS doc FROM range(20000)`,
          tableName,
        );
        expect(footprint.tableBytes / actual).toBeGreaterThan(0.97);
        expect(footprint.tableBytes / actual).toBeLessThan(1.03);
      },
      120_000,
    );

    it('errs high on VARIANT, by less than half', async () => {
      // Sized from its text: objects come out 1.3× here, 1.6× at 200,000 rows.
      const { footprint, actual } = await estimateAndLoad(
        `SELECT range AS id, CAST({'a': range, 'b': 'xy' || range, 'c': [1, 2, 3]} AS VARIANT) AS doc
         FROM range(20000)`,
        'budget_variant',
      );
      expect(footprint.tableBytes / actual).toBeGreaterThan(1);
      expect(footprint.tableBytes / actual).toBeLessThan(1.5);
    }, 60_000);

    it('samples every column of the nested fixture on a fresh DuckDB', async () => {
      // Nothing has loaded the json extension on a fresh DuckDB, and until
      // it loads, strlen() of the fixture's JSON column is a Binder error:
      // the text sample used to fail whole on it.
      const fresh = await createNodeDuckDB();
      try {
        const samples: string[] = [];
        const errors: unknown[] = [];
        const conn = new Proxy(fresh.conn, {
          get(target, prop) {
            if (prop === 'query') {
              return async (sql: string) => {
                // The text sample, and the nested one.
                const sample = /^SELECT (avg\(|count\(\*\) AS n,)/.test(sql);
                if (sample) samples.push(sql);
                try {
                  return await target.query(sql);
                } catch (err) {
                  if (sample) errors.push(err);
                  throw err;
                }
              };
            }
            const value: unknown = Reflect.get(target, prop);
            return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
          },
        });
        const result = await loadNestedFixture({ ...fresh, conn }, 'parquet', 'budget_fixture');
        expect(result.rowCount).toBe(MANIFEST.rowCount);
        expect(samples).toHaveLength(2);
        expect(errors).toEqual([]);
      } finally {
        await fresh.cleanup();
      }
    }, 60_000);
  });

  describe('with a projection', () => {
    // A struct holding a struct (three leaf columns, two a level down), a
    // name holding the ", " parquet_metadata joins path parts with, and
    // twenty columns of random doubles the projections leave out. Four row
    // groups.
    const WIDE = Array.from({ length: 20 }, (_, i) => `random() + ${i} AS w${i}`).join(', ');
    const fileName = 'budget_projection.parquet';
    let meta: Record<string, unknown>[];

    async function footprint(projection?: string[]) {
      const relation = projection
        ? `(SELECT ${projection.map(quoteIdentifier).join(', ')} FROM read_parquet('${fileName}'))`
        : `read_parquet('${fileName}')`;
      const describe = (await harness.conn.query(`DESCRIBE SELECT * FROM ${relation}`))
        .toArray()
        .map((row) => row.toJSON());
      return measureParquetFootprint(harness.conn, fileName, describe, projection);
    }

    beforeAll(async () => {
      const data = await parquet(
        `SELECT range AS id, {'x': range, 'y': {'p': random(), 'q': random()}} AS s,
                random() AS "a, b", ${WIDE}
         FROM range(${ROWS})`,
        50_000,
      );
      await harness.db.registerFileBuffer(fileName, new Uint8Array(data));
      meta = (
        await harness.conn.query(
          `SELECT row_group_id, path_in_schema, total_compressed_size, total_uncompressed_size
           FROM parquet_metadata('${fileName}')`,
        )
      )
        .toArray()
        .map((row) => row.toJSON() as Record<string, unknown>);
    });

    afterAll(async () => {
      await harness.db.dropFile(fileName);
    });

    it('counts only its columns in the scan and prefetch estimates', async () => {
      const leaves = meta.filter((m) =>
        ['s, x', 's, y, p', 's, y, q', 'a, b'].includes(String(m['path_in_schema'])),
      );
      expect(leaves).toHaveLength(16); // four leaves in each of four row groups
      const groups = new Map<number, number>();
      const chunks = new Map<string, number>();
      for (const m of leaves) {
        const group = Number(m['row_group_id']);
        groups.set(group, (groups.get(group) ?? 0) + Number(m['total_compressed_size']));
        const path = String(m['path_in_schema']);
        chunks.set(path, Math.max(chunks.get(path) ?? 0, Number(m['total_uncompressed_size'])));
      }

      const projected = await footprint(['s', 'a, b']);
      const whole = await footprint();

      expect(projected.largestRowGroupBytes).toBe(Math.max(...groups.values()));
      expect(projected.scanBytes).toBe(
        [...chunks.values()].reduce((sum, bytes) => sum + scanBytesPerColumn(bytes), 0),
      );
      expect(projected.largestRowGroupBytes).toBeLessThan(whole.largestRowGroupBytes / 5);
      expect(projected.scanBytes).toBeLessThan(whole.scanBytes / 5);
      expect(projected.columns).toBe(3);
    });

    it('counts a whole row group once its columns are nearly all of it', async () => {
      // Everything but the id, which compresses to almost nothing: DuckDB
      // prefetches the whole group.
      const allButId = ['s', 'a, b', ...Array.from({ length: 20 }, (_, i) => `w${i}`)];
      const projected = await footprint(allButId);
      const whole = await footprint();
      expect(projected.largestRowGroupBytes).toBe(whole.largestRowGroupBytes);
      expect(projected.scanBytes).toBeLessThan(whole.scanBytes);
    });

    it('counts every column when the schema does not name a projected column', async () => {
      const whole = await footprint();
      const describe = (
        await harness.conn.query(`DESCRIBE SELECT * FROM read_parquet('${fileName}')`)
      )
        .toArray()
        .map((row) => row.toJSON());
      const unmatched = await measureParquetFootprint(harness.conn, fileName, describe, ['nope']);
      expect(unmatched.scanBytes).toBe(whole.scanBytes);
      expect(unmatched.largestRowGroupBytes).toBe(whole.largestRowGroupBytes);
    });
  });

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

  it('drops the table it built when a later step fails', async () => {
    // Date text converts inside the one CREATE, so nothing after it needs
    // much memory; this fails the row count that follows it instead. The
    // caller never learns the table's name, so the loader must drop it.
    const data = await parquet(
      `SELECT range AS id, ${Array.from({ length: 30 }, (_, i) => `random() + ${i} AS n${i}`).join(', ')}
       FROM range(200000)`,
    );
    const before = await usedBytes();
    const conn = harness.conn;
    const failing = new Proxy(conn, {
      get(target, prop) {
        if (prop === 'query') {
          return (sql: string) =>
            /^SELECT COUNT\(\*\)/i.test(sql)
              ? Promise.reject(new Error('count failed'))
              : target.query(sql);
        }
        const value: unknown = Reflect.get(target, prop);
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      },
    });

    await expect(
      loadParquet(data, { tableName: 'budget_after' }, { db: harness.db, conn: failing }),
    ).rejects.toThrow('count failed');
    const tables = await harness.conn.query(
      "SELECT count(*) AS n FROM duckdb_tables() WHERE table_name = 'budget_after'",
    );
    expect(Number(tables.toArray()[0]?.toJSON().n)).toBe(0);
    // The table would hold about 50 MiB.
    expect(await usedBytes()).toBeLessThan(before + 4 * 2 ** 20);
  }, 60_000);
});
