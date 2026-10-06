/**
 * ENUM values through the worker's query path, on a real DuckDB.
 *
 * `executeQueryCancellable` reads a query through duckdb-wasm's pending-query
 * API (`conn.send`), whose result comes without its dictionary batches: an
 * ENUM column, at the top or inside a LIST or STRUCT, arrived with an empty
 * dictionary and every value null. Such a result is read again through
 * `conn.query`, which carries them, when the SQL is a single query that can
 * run twice without changing anything.
 *
 * Anything else runs once, its ENUM values null. Read again, the whole SQL ran
 * a second time: an INSERT … RETURNING inserted twice, an UPDATE applied
 * twice, a DELETE … RETURNING returned nothing (the first run had deleted the
 * rows), and a query calling `nextval` advanced its sequence twice.
 */
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';

import { __setConnForTests, executeQuery, executeQueryCancellable } from '@/worker/duckdb';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';

let harness: NodeDuckDBHarness;

beforeAll(async () => {
  harness = await createNodeDuckDB();
  __setConnForTests(harness.conn);
  await harness.conn.query(
    `CREATE TABLE enums AS
     SELECT range AS i,
            CAST(CASE WHEN range % 2 = 0 THEN 'a' ELSE 'it''s' END AS ENUM('a', 'it''s')) AS e,
            [CAST('a' AS ENUM('a', 'b')), NULL] AS le,
            {'x': CAST('b' AS ENUM('a', 'b')), 'n': range} AS se
     FROM range(4)`,
  );
  await harness.conn.query(`CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy')`);
}, 30_000);

afterAll(async () => {
  __setConnForTests(null);
  await harness?.cleanup();
});

describe('executeQueryCancellable with ENUM columns', () => {
  it('reads ENUM values at the top and inside a LIST or STRUCT', async () => {
    const rows = await executeQueryCancellable('SELECT i, e, le, se FROM enums ORDER BY i');
    expect(rows).toEqual([
      { i: 0, e: 'a', le: ['a', null], se: { x: 'b', n: 0 } },
      { i: 1, e: "it's", le: ['a', null], se: { x: 'b', n: 1 } },
      { i: 2, e: 'a', le: ['a', null], se: { x: 'b', n: 2 } },
      { i: 3, e: "it's", le: ['a', null], se: { x: 'b', n: 3 } },
    ]);
  });

  it('keeps NULL, and an empty result empty', async () => {
    expect(await executeQueryCancellable("SELECT CAST(NULL AS ENUM('a')) AS e")).toEqual([
      { e: null },
    ]);
    expect(await executeQueryCancellable('SELECT e FROM enums WHERE i < 0')).toEqual([]);
  });

  it.each([
    ['a WITH query', 'WITH x AS (SELECT i, e FROM enums) SELECT e FROM x WHERE i < 2 ORDER BY i'],
    ['a FROM-first query', 'FROM enums SELECT e WHERE i < 2 ORDER BY i'],
    ['a query with trailing semicolons', 'SELECT e FROM enums WHERE i < 2 ORDER BY i ; ;\n'],
    ['a query ending in a comment', 'SELECT e FROM enums WHERE i < 2 ORDER BY i -- the first two'],
  ])('reads the ENUM values of %s', async (_label, sql) => {
    expect(await executeQueryCancellable(sql)).toEqual([{ e: 'a' }, { e: "it's" }]);
  });

  it('reads a query without a dictionary once, through the pending-query path', async () => {
    const query = vi.spyOn(harness.conn, 'query');
    try {
      expect(
        await executeQueryCancellable('SELECT i, CAST(e AS VARCHAR) AS e FROM enums WHERE i = 1'),
      ).toEqual([{ i: 1, e: "it's" }]);
      expect(query).not.toHaveBeenCalled();
    } finally {
      query.mockRestore();
    }
  });

  it('leaves the connection usable after reading a result again', async () => {
    await executeQueryCancellable('SELECT e FROM enums');
    expect(await executeQueryCancellable('SELECT 41 + 1 AS answer')).toEqual([{ answer: 42 }]);
  });
});

describe('executeQueryCancellable with an ENUM in a statement that must run once', () => {
  let query: MockInstance<typeof harness.conn.query>;

  /** The SQL texts that reached `conn.query` since the test's setup. */
  const ranThroughQuery = (): string[] => query.mock.calls.map(([sql]) => sql);

  /** Run a test's setup SQL, and forget that it ran. */
  const setUp = async (sql: string): Promise<void> => {
    await harness.conn.query(sql);
    query.mockClear();
  };

  const rowsOf = (sql: string): Promise<Record<string, unknown>[]> => executeQuery(sql);

  beforeAll(() => {
    query = vi.spyOn(harness.conn, 'query');
  });

  afterAll(() => {
    query.mockRestore();
  });

  it('inserts once with INSERT … RETURNING', async () => {
    await setUp('CREATE TABLE inserted (id INTEGER, e mood)');
    const sql = "INSERT INTO inserted VALUES (1, 'ok') RETURNING e";
    expect(await executeQueryCancellable(sql)).toEqual([{ e: null }]);
    expect(ranThroughQuery()).not.toContain(sql);
    expect(await rowsOf('SELECT id, CAST(e AS VARCHAR) AS e FROM inserted')).toEqual([
      { id: 1, e: 'ok' },
    ]);
  });

  it('updates once with UPDATE … RETURNING', async () => {
    await setUp("CREATE TABLE updated AS SELECT 1 AS id, CAST('sad' AS mood) AS e");
    expect(
      await executeQueryCancellable('UPDATE updated SET id = id + 10 RETURNING id, e'),
    ).toEqual([{ id: 11, e: null }]);
    expect(await rowsOf('SELECT id FROM updated')).toEqual([{ id: 11 }]);
  });

  it('returns the rows that DELETE … RETURNING deleted', async () => {
    await setUp(
      "CREATE TABLE deleted AS SELECT range AS id, CAST('happy' AS mood) AS e FROM range(1, 3)",
    );
    const rows = await executeQueryCancellable('DELETE FROM deleted RETURNING id, e');
    expect(rows.sort((a, b) => Number(a['id']) - Number(b['id']))).toEqual([
      { id: 1, e: null },
      { id: 2, e: null },
    ]);
    expect(await rowsOf('SELECT count(*) AS n FROM deleted')).toEqual([{ n: 0 }]);
  });

  it('resolves an INSERT into a primary key with the row it inserted', async () => {
    // Run twice, the second insert failed on the key the first had
    // committed, and the caller was told the insert had failed.
    await setUp('CREATE TABLE keyed (id INTEGER PRIMARY KEY, e mood)');
    expect(
      await executeQueryCancellable("INSERT INTO keyed VALUES (1, 'ok') RETURNING id, e"),
    ).toEqual([{ id: 1, e: null }]);
    expect(await rowsOf('SELECT count(*) AS n FROM keyed')).toEqual([{ n: 1 }]);
  });

  it('runs several statements once', async () => {
    await setUp('CREATE TABLE several (id INTEGER, e mood)');
    const sql = "INSERT INTO several VALUES (1, 'ok'); SELECT e FROM several";
    expect(await executeQueryCancellable(sql)).toEqual([{ e: null }]);
    expect(ranThroughQuery()).not.toContain(sql);
    expect(await rowsOf('SELECT count(*) AS n FROM several')).toEqual([{ n: 1 }]);
  });

  it('advances a sequence once for a query calling nextval', async () => {
    // Sequences are not transactional: a second run would advance it again.
    await setUp('CREATE SEQUENCE ticket');
    const sql = "SELECT nextval('ticket') AS v, CAST('ok' AS mood) AS e";
    expect(await executeQueryCancellable(sql)).toEqual([{ v: 1, e: null }]);
    expect(ranThroughQuery()).not.toContain(sql);
    expect(await rowsOf("SELECT currval('ticket') AS v")).toEqual([{ v: 1 }]);
  });

  it('leaves a transaction the caller has open as it was', async () => {
    // The check that the INSERT is not a query fails to parse, which must
    // not abort the transaction.
    await setUp('CREATE TABLE in_transaction (id INTEGER, e mood)');
    await executeQueryCancellable('BEGIN TRANSACTION');
    await executeQueryCancellable("INSERT INTO in_transaction VALUES (1, 'ok') RETURNING e");
    await executeQueryCancellable('COMMIT');
    expect(await rowsOf('SELECT count(*) AS n FROM in_transaction')).toEqual([{ n: 1 }]);
  });
});
