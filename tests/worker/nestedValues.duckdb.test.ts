/**
 * Nested values leave the worker as plain data, on real DuckDB results.
 *
 * Arrow returns a LIST or fixed-size ARRAY value as a `Vector`, whose own
 * properties include closures (`isValid`, `get`, `set`, `indexOf`), and a
 * STRUCT or MAP value as a proxy. The worker posts query results with
 * `postMessage`, which structured-clones them: a row still holding a Vector,
 * or a Vector copied field by field, throws `DataCloneError`. In the browser
 * that left every row fetch selecting a list column pending for good.
 *
 * Each case runs the worker's own query functions against a real
 * connection and clones the rows as `postMessage` would. The last checks
 * that a row is converted column by column, never taken for an interval.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { __setConnForTests, executeQuery, executeQueryCancellable } from '@/worker/duckdb';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';

interface NestedCase {
  label: string;
  /** A SQL expression, selected as column `v`. */
  sql: string;
  /** DuckDB's name for its type, as `DESCRIBE` prints it. */
  type: string;
  expected: unknown;
}

const CASES: NestedCase[] = [
  {
    label: 'INTEGER[] with a NULL',
    sql: '[56, 3, NULL]::INTEGER[]',
    type: 'INTEGER[]',
    expected: [56, 3, null],
  },
  { label: 'empty list', sql: '[]::INTEGER[]', type: 'INTEGER[]', expected: [] },
  { label: 'NULL list', sql: 'NULL::INTEGER[]', type: 'INTEGER[]', expected: null },
  {
    label: 'BIGINT[] becomes numbers',
    sql: '[10000000000, -2]::BIGINT[]',
    type: 'BIGINT[]',
    expected: [10_000_000_000, -2],
  },
  { label: 'VARCHAR[]', sql: "['a', NULL, 'c']", type: 'VARCHAR[]', expected: ['a', null, 'c'] },
  {
    label: 'fixed-size ARRAY',
    sql: '[1, 2, 3]::INTEGER[3]',
    type: 'INTEGER[3]',
    expected: [1, 2, 3],
  },
  { label: 'list of lists', sql: '[[1, 2], [3]]', type: 'INTEGER[][]', expected: [[1, 2], [3]] },
  {
    label: 'STRUCT',
    sql: "{'x': 1.5::DOUBLE, 'y': 0.25::DOUBLE, 'tier': 'bronze'}",
    type: 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
    expected: { x: 1.5, y: 0.25, tier: 'bronze' },
  },
  {
    label: 'STRUCT[]',
    sql: "[{'k': 1}, {'k': 2}]",
    type: 'STRUCT(k INTEGER)[]',
    expected: [{ k: 1 }, { k: 2 }],
  },
  {
    label: 'list in a STRUCT',
    sql: "{'inner': [1, 2]::BIGINT[]}",
    type: 'STRUCT("inner" BIGINT[])',
    expected: { inner: [1, 2] },
  },
  {
    // A struct is a proxy reading its fields as properties: fields named
    // `type` and `data` must not pass it off as a Vector.
    label: 'STRUCT with fields named type and data',
    sql: "{'type': 'a', 'data': [1, 2]}",
    type: 'STRUCT("type" VARCHAR, "data" INTEGER[])',
    expected: { type: 'a', data: [1, 2] },
  },
  {
    label: 'MAP',
    sql: "MAP {'a': 1, 'b': 2}",
    type: 'MAP(VARCHAR, INTEGER)',
    expected: { a: 1, b: 2 },
  },
  {
    label: 'MAP of lists',
    sql: "MAP {'a': [1, 2], 'b': []::INTEGER[]}",
    type: 'MAP(VARCHAR, INTEGER[])',
    expected: { a: [1, 2], b: [] },
  },
];

const RUNNERS = [
  ['executeQueryCancellable', executeQueryCancellable],
  ['executeQuery', executeQuery],
] as const;

describe('nested values on real DuckDB', () => {
  let harness: NodeDuckDBHarness;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    __setConnForTests(harness.conn);
  }, 30_000);

  afterAll(async () => {
    __setConnForTests(null);
    await harness?.cleanup();
  });

  it('the cases have the types they claim', async () => {
    for (const c of CASES) {
      const [row] = await executeQuery<{ column_type: string }>(`DESCRIBE SELECT ${c.sql} AS v`);
      expect(row?.column_type, c.label).toBe(c.type);
    }
  });

  describe.each(RUNNERS)('%s', (_name, run) => {
    it.each(CASES)('$label comes back as plain data that clones', async ({ sql, expected }) => {
      const rows = await run(`SELECT 7 AS id, ${sql} AS v`);
      expect(rows).toEqual([{ id: 7, v: expected }]);
      expect(structuredClone(rows)).toEqual(rows);
    });

    it('a block of rows with list and struct columns clones whole', async () => {
      // The shape of a grid fetch on a wide table: __rowid__ first, then the
      // columns in view, some of them lists.
      const rows = await run(
        `SELECT range AS "__rowid__",
                list_transform(range(range % 4), x -> CAST(x * 7 AS INTEGER)) AS tags,
                {'x': range / 2, 'tier': 'gold'} AS point
         FROM range(5)`,
      );
      const cloned = structuredClone(rows);
      expect(cloned).toHaveLength(5);
      expect(cloned[3]).toEqual({
        __rowid__: 3,
        tags: [0, 7, 14],
        point: { x: 1.5, tier: 'gold' },
      });
      expect(cloned[0]).toMatchObject({ tags: [] });
    });

    it('a row with numeric months and days columns stays a row', async () => {
      // A row has the shape of an Arrow interval value when it has these
      // columns, and used to be turned into "1 year 2 months 3 days".
      const rows = await run(
        `SELECT 1 AS id, 14 AS months, 3 AS days, CAST(5 AS BIGINT) AS nanoseconds, 'x' AS note`,
      );
      expect(rows).toEqual([{ id: 1, months: 14, days: 3, nanoseconds: 5, note: 'x' }]);
    });
  });
});
