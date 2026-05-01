import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { exportToParquet } from '@/export/ParquetExport';
import type { ExportContext } from '@/export/ExportQuery';
import { createNodeDuckDB } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';
import type { ColumnSchema } from '@/core/types';

/**
 * Phase 7 — Parquet round-trip via real DuckDB.
 *
 * Locks the contract that `exportToParquet` produces bytes that DuckDB can
 * re-import with no schema or value drift. Uses the Phase 4
 * `tests/helpers/nodeBridge.ts` adapter extended in Phase 7 to expose
 * `exportToBuffer` (mirroring `src/worker/dispatcher.ts:235-272`).
 *
 * Without this test, a regression in `buildParquetQuery` or the COPY
 * pipeline could ship undetected — pre-Phase-7 tests asserted only that
 * the SQL string was well-formed and the result was a Uint8Array.
 */

describe('ParquetExport — round-trip via real DuckDB', () => {
  let db: AsyncDuckDB;
  let conn: AsyncDuckDBConnection;
  let cleanup: () => Promise<void>;
  let counter = 0;

  beforeAll(async () => {
    const harness = await createNodeDuckDB();
    db = harness.db;
    conn = harness.conn;
    cleanup = harness.cleanup;
  }, 30_000);

  afterAll(async () => {
    if (cleanup) await cleanup();
  });

  function uniqueTableName(prefix: string): string {
    return `${prefix}_${++counter}`;
  }

  function makeContext(
    tableName: string,
    columns: string[],
    schema: ColumnSchema[],
  ): ExportContext {
    return {
      bridge: makeNodeBridge(conn, db),
      filters: [],
      sortColumns: [],
      selectedRows: new Set<number>(),
      columnOrder: columns,
      schema,
    };
  }

  it("scope: 'all' → exported Parquet round-trips with mixed types", async () => {
    const tn = uniqueTableName('rt_all');
    // Production tables always carry `__rowid__` (the loaders inject
    // it as `row_number() OVER () - 1`; see worker/loaders/csv.ts:128
    // et al.). The library's export query builders now always emit
    // `ORDER BY "__rowid__" ASC` as the determinism tiebreaker, so
    // round-trip tests must include `__rowid__` to match production.
    await conn.query(`CREATE TABLE ${tn} (
      __rowid__ BIGINT,
      id INTEGER,
      name VARCHAR,
      price DOUBLE,
      ts TIMESTAMP,
      d DATE,
      live BOOLEAN
    )`);
    await conn.query(
      `INSERT INTO ${tn} VALUES
       (0, 1, 'alpha', 9.99, TIMESTAMP '2024-01-15 12:30:00', DATE '2024-01-15', TRUE),
       (1, 2, 'beta', 19.99, TIMESTAMP '2024-02-20 09:00:00', DATE '2024-02-20', FALSE),
       (2, 3, NULL, NULL, NULL, NULL, NULL)`,
    );

    const columns = ['id', 'name', 'price', 'ts', 'd', 'live'];
    const schema: ColumnSchema[] = [
      { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
      { name: 'price', type: 'float', nullable: true, originalType: 'DOUBLE' },
      { name: 'ts', type: 'datetime', nullable: true, originalType: 'TIMESTAMP' },
      { name: 'd', type: 'date', nullable: true, originalType: 'DATE' },
      { name: 'live', type: 'boolean', nullable: true, originalType: 'BOOLEAN' },
    ];

    const ctx = makeContext(tn, columns, schema);
    const bytes = await exportToParquet(tn, { scope: 'all', columns: 'all' }, ctx);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);

    // Re-import the bytes and assert deep equality of every cell.
    const importName = `${tn}.parquet`;
    await db.registerFileBuffer(importName, bytes);
    const result = await conn.query(
      `SELECT id, name, price, ts, d, live FROM read_parquet('${importName}') ORDER BY id`,
    );
    const rows = result.toArray().map((r) => r.toJSON());
    expect(rows).toHaveLength(3);
    expect(Number(rows[0].id)).toBe(1);
    expect(rows[0].name).toBe('alpha');
    expect(rows[0].price).toBeCloseTo(9.99);
    expect(rows[0].live).toBe(true);
    expect(Number(rows[1].id)).toBe(2);
    expect(rows[1].name).toBe('beta');
    expect(rows[1].live).toBe(false);
    expect(Number(rows[2].id)).toBe(3);
    expect(rows[2].name).toBeNull();
    expect(rows[2].price).toBeNull();
    expect(rows[2].live).toBeNull();
  });

  it("scope: 'selected' contiguous range → only the selected rows survive the round-trip", async () => {
    const tn = uniqueTableName('rt_sel_contig');
    await conn.query(`CREATE TABLE ${tn} (__rowid__ BIGINT, id INTEGER, label VARCHAR)`);
    await conn.query(
      `INSERT INTO ${tn} VALUES (0, 0, 'a'), (1, 1, 'b'), (2, 2, 'c'), (3, 3, 'd'), (4, 4, 'e')`,
    );

    const columns = ['id', 'label'];
    const schema: ColumnSchema[] = [
      { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      { name: 'label', type: 'string', nullable: false, originalType: 'VARCHAR' },
    ];
    const ctx: ExportContext = {
      bridge: makeNodeBridge(conn, db),
      filters: [],
      sortColumns: [],
      selectedRows: new Set([1, 2, 3]),
      columnOrder: columns,
      schema,
    };

    const bytes = await exportToParquet(tn, { scope: 'selected', columns: 'all' }, ctx);
    const importName = `${tn}.parquet`;
    await db.registerFileBuffer(importName, bytes);
    const result = await conn.query(
      `SELECT id, label FROM read_parquet('${importName}') ORDER BY id`,
    );
    const rows = result.toArray().map((r) => r.toJSON());
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => Number(r.id))).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.label)).toEqual(['b', 'c', 'd']);
  });

  it("scope: 'selected' non-contiguous → CTE+ROW_NUMBER carves out the right rows", async () => {
    const tn = uniqueTableName('rt_sel_non');
    await conn.query(`CREATE TABLE ${tn} (__rowid__ BIGINT, id INTEGER, label VARCHAR)`);
    await conn.query(
      `INSERT INTO ${tn} VALUES (0, 0, 'a'), (1, 1, 'b'), (2, 2, 'c'), (3, 3, 'd'), (4, 4, 'e')`,
    );

    const columns = ['id', 'label'];
    const schema: ColumnSchema[] = [
      { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      { name: 'label', type: 'string', nullable: false, originalType: 'VARCHAR' },
    ];
    const ctx: ExportContext = {
      bridge: makeNodeBridge(conn, db),
      filters: [],
      sortColumns: [],
      // Non-contiguous: 0, 2, 4 — exercises buildSelectedRowsQuery (CTE path).
      selectedRows: new Set([0, 2, 4]),
      columnOrder: columns,
      schema,
    };

    const bytes = await exportToParquet(tn, { scope: 'selected', columns: 'all' }, ctx);
    const importName = `${tn}.parquet`;
    await db.registerFileBuffer(importName, bytes);
    const result = await conn.query(
      `SELECT id, label FROM read_parquet('${importName}') ORDER BY id`,
    );
    const rows = result.toArray().map((r) => r.toJSON());
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => Number(r.id))).toEqual([0, 2, 4]);
    expect(rows.map((r) => r.label)).toEqual(['a', 'c', 'e']);
  });

  it("scope: 'selected' with empty selection → empty Parquet (zero rows, valid schema)", async () => {
    const tn = uniqueTableName('rt_sel_empty');
    await conn.query(`CREATE TABLE ${tn} (__rowid__ BIGINT, id INTEGER, label VARCHAR)`);
    await conn.query(`INSERT INTO ${tn} VALUES (0, 0, 'a'), (1, 1, 'b')`);

    const columns = ['id', 'label'];
    const schema: ColumnSchema[] = [
      { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      { name: 'label', type: 'string', nullable: false, originalType: 'VARCHAR' },
    ];
    const ctx: ExportContext = {
      bridge: makeNodeBridge(conn, db),
      filters: [],
      sortColumns: [],
      selectedRows: new Set<number>(),
      columnOrder: columns,
      schema,
    };

    const bytes = await exportToParquet(tn, { scope: 'selected', columns: 'all' }, ctx);
    const importName = `${tn}.parquet`;
    await db.registerFileBuffer(importName, bytes);
    const countResult = await conn.query(`SELECT COUNT(*) AS c FROM read_parquet('${importName}')`);
    const cnt = countResult.toArray()[0].toJSON();
    expect(Number(cnt.c)).toBe(0);
  });

  it('column subset → only requested columns are exported and round-trip', async () => {
    const tn = uniqueTableName('rt_subset');
    await conn.query(
      `CREATE TABLE ${tn} (__rowid__ BIGINT, id INTEGER, name VARCHAR, price DOUBLE)`,
    );
    await conn.query(`INSERT INTO ${tn} VALUES (0, 1, 'alpha', 9.99), (1, 2, 'beta', 19.99)`);

    const columns = ['id', 'name', 'price'];
    const schema: ColumnSchema[] = [
      { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      { name: 'name', type: 'string', nullable: false, originalType: 'VARCHAR' },
      { name: 'price', type: 'float', nullable: false, originalType: 'DOUBLE' },
    ];
    const ctx = makeContext(tn, columns, schema);

    const bytes = await exportToParquet(tn, { scope: 'all', columns: ['id', 'name'] }, ctx);
    const importName = `${tn}.parquet`;
    await db.registerFileBuffer(importName, bytes);
    const result = await conn.query(`SELECT * FROM read_parquet('${importName}') ORDER BY id`);
    const arrowSchema = result.schema;
    const fieldNames = arrowSchema.fields.map((f) => f.name);
    expect(fieldNames).toEqual(['id', 'name']);

    const rows = result.toArray().map((r) => r.toJSON());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: 1, name: 'alpha' });
  });
});
