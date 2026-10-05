/**
 * ENUM values through the worker's query path, on a real DuckDB.
 *
 * `executeQueryCancellable` reads a query through duckdb-wasm's pending-query
 * API (`conn.send`), whose result comes without its dictionary batches: an
 * ENUM column, at the top or inside a LIST or STRUCT, arrived with an empty
 * dictionary and every value null. Such a result is now read again through
 * `conn.query`, which carries them.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { __setConnForTests, executeQueryCancellable } from '@/worker/duckdb';

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
