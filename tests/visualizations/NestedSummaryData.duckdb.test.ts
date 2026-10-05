/**
 * The nested summary chart's counts against real DuckDB-WASM.
 *
 * One table holds a column of each nested kind — LIST, fixed-size ARRAY,
 * STRUCT, MAP, UNION and a `FLOAT[768]` embedding — each NULL on its own
 * schedule of row ids, so the expected counts come from the schedule, not
 * from DuckDB. The counts must be right with no filter, with a filter on
 * another column, with one on the column itself, and on a derived view; and
 * the query must stay one ungrouped scan that never casts the values, which
 * is what makes it cheap on embeddings (grouping a `FLOAT[768]` column by
 * value took the value counts 18–21 s).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Filter } from '@/core/types';
import { filtersToWhereClause } from '@/filters/FilterSQL';
import {
  fetchNestedSummaryData,
  nestedSummarySQL,
} from '@/visualizations/nested/NestedSummaryData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

const ROWS = 200;
const IDS = Array.from({ length: ROWS }, (_, id) => id);

/** Each nested column, and the row ids at which it is NULL. */
const COLUMNS = {
  tags: (id: number) => id % 5 === 0, // VARCHAR[]
  point: (id: number) => id % 7 === 0, // STRUCT(x, y, tier)
  attrs: (id: number) => id % 6 === 0, // MAP(VARCHAR, INTEGER)
  trio: (id: number) => id % 4 === 0, // INTEGER[3]
  u: (id: number) => id % 8 === 0, // UNION(num INTEGER, str VARCHAR)
  emb: (id: number) => id % 10 === 0, // FLOAT[768]
} as const;
type ColumnName = keyof typeof COLUMNS;

/** The column `n` is `id % 10`. */
const nOf = (id: number): number => id % 10;

/** The counts the schedule says, over the rows `keep` keeps. */
function expected(column: ColumnName, keep: (id: number) => boolean) {
  const rows = IDS.filter(keep);
  return { total: rows.length, nonNullCount: rows.filter((id) => !COLUMNS[column](id)).length };
}

describe('nested summary counts — real DuckDB', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
    const q = (sql: string) => harness.conn.query(sql);
    await q(
      `CREATE TABLE t AS SELECT
         range::INTEGER AS id,
         (range % 10)::INTEGER AS n,
         CASE WHEN range % 5 = 0 THEN NULL ELSE ['a', 'b'][1:(range % 3)::INTEGER] END AS tags,
         CASE WHEN range % 7 = 0 THEN NULL
              ELSE {'x': range * 0.5, 'y': range * 2.0, 'tier': 'gold'} END AS point,
         CASE WHEN range % 6 = 0 THEN NULL ELSE MAP {'k': range::INTEGER} END AS attrs
       FROM range(${ROWS})`,
    );
    // CASE over a fixed-size ARRAY is not implemented: set those columns by UPDATE.
    await q(`ALTER TABLE t ADD COLUMN trio INTEGER[3]`);
    await q(`UPDATE t SET trio = [id, id + 1, id + 2]::INTEGER[3] WHERE id % 4 <> 0`);
    await q(`ALTER TABLE t ADD COLUMN u UNION(num INTEGER, str VARCHAR)`);
    await q(
      `UPDATE t SET u = CASE WHEN id % 2 = 0
         THEN union_value(num := id)::UNION(num INTEGER, str VARCHAR)
         ELSE union_value(str := id::VARCHAR)::UNION(num INTEGER, str VARCHAR) END
       WHERE id % 8 <> 0`,
    );
    await q(`ALTER TABLE t ADD COLUMN emb FLOAT[768]`);
    await q(
      `UPDATE t SET emb = list_transform(range(768), x -> (x * 0.001 + id)::FLOAT)::FLOAT[768]
       WHERE id % 10 <> 0`,
    );
    // What a derived nested column makes of the relation: a view over it.
    await q(
      `CREATE VIEW v AS SELECT *,
         CASE WHEN n % 2 = 0 THEN NULL ELSE [n, n + 1] END AS pair,
         CASE WHEN n = 3 THEN NULL ELSE {'k': n} END AS boxed
       FROM t`,
    );
  }, 60_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('has a column of each nested kind', async () => {
    const rows = await bridge.query<{ column_name: string; column_type: string }>(`DESCRIBE t`);
    const types = Object.fromEntries(rows.map((r) => [r.column_name, r.column_type]));
    expect(types).toMatchObject({
      tags: 'VARCHAR[]',
      point: 'STRUCT(x DECIMAL(21,1), y DECIMAL(21,1), tier VARCHAR)',
      attrs: 'MAP(VARCHAR, INTEGER)',
      trio: 'INTEGER[3]',
      u: 'UNION(num INTEGER, str VARCHAR)',
      emb: 'FLOAT[768]',
    });
  });

  it.each(Object.keys(COLUMNS) as ColumnName[])('counts %s with no filter', async (column) => {
    const data = await fetchNestedSummaryData('t', column, [], bridge);
    expect(data).toEqual({ ...expected(column, () => true), filtered: null });
  });

  it.each(Object.keys(COLUMNS) as ColumnName[])(
    'counts %s with a filter on another column',
    async (column) => {
      const filters: Filter[] = [{ type: 'set', column: 'n', values: [0, 1, 2, 3, 4] }];
      const data = await fetchNestedSummaryData('t', column, filters, bridge);
      expect(data).toEqual({
        ...expected(column, () => true),
        filtered: expected(column, (id) => nOf(id) < 5),
      });
    },
  );

  it('counts a column with a filter on itself', async () => {
    const notNull = await fetchNestedSummaryData(
      't',
      'tags',
      [{ type: 'not-null', column: 'tags' }],
      bridge,
    );
    expect(notNull.filtered).toEqual({ total: 160, nonNullCount: 160 });

    const isNull = await fetchNestedSummaryData(
      't',
      'emb',
      [{ type: 'null', column: 'emb' }],
      bridge,
    );
    expect(isNull).toEqual({
      total: 200,
      nonNullCount: 180,
      filtered: { total: 20, nonNullCount: 0 },
    });

    // A pattern filter compares the list's text: `[a, b]` contains "b".
    const pattern = await fetchNestedSummaryData(
      't',
      'tags',
      [{ type: 'pattern', column: 'tags', pattern: 'b', mode: 'contains' }],
      bridge,
    );
    const withB = IDS.filter((id) => id % 3 === 2 && !COLUMNS.tags(id)).length;
    expect(pattern.filtered).toEqual({ total: withB, nonNullCount: withB });
  });

  it('counts with filters on itself and on another column together', async () => {
    const filters: Filter[] = [
      { type: 'not-null', column: 'point' },
      { type: 'set', column: 'n', values: [7] },
    ];
    const data = await fetchNestedSummaryData('t', 'point', filters, bridge);
    const kept = IDS.filter((id) => nOf(id) === 7 && !COLUMNS.point(id)).length;
    expect(data.filtered).toEqual({ total: kept, nonNullCount: kept });
  });

  it('counts derived nested columns of a view', async () => {
    const pair = await fetchNestedSummaryData('v', 'pair', [], bridge);
    expect(pair).toEqual({ total: 200, nonNullCount: 100, filtered: null });

    const boxed = await fetchNestedSummaryData(
      'v',
      'boxed',
      [{ type: 'set', column: 'n', values: [3, 4] }],
      bridge,
    );
    expect(boxed).toEqual({
      total: 200,
      nonNullCount: 180,
      filtered: { total: 40, nonNullCount: 20 },
    });

    // A source column read through the view counts as it does in the table.
    const emb = await fetchNestedSummaryData('v', 'emb', [], bridge);
    expect(emb).toEqual({ total: 200, nonNullCount: 180, filtered: null });
  });

  it('runs one query per fetch, with no GROUP BY and no cast of the nested column', async () => {
    const spy = vi.spyOn(bridge, 'query');
    try {
      const filters: Filter[] = [{ type: 'set', column: 'n', values: [1, 2] }];
      for (const column of Object.keys(COLUMNS) as ColumnName[]) {
        spy.mockClear();
        await fetchNestedSummaryData('t', column, filters, bridge);
        await fetchNestedSummaryData('t', column, [], bridge);
        expect(spy).toHaveBeenCalledTimes(2);
        for (const [sql] of spy.mock.calls) {
          expect(sql).not.toMatch(/GROUP\s+BY/i);
          expect(sql).not.toMatch(/CAST\s*\(/i);
          expect(sql).not.toMatch(/DISTINCT/i);
          // The column appears only as COUNT's argument: once, and once more
          // for the filtered count.
          const filtered = sql.includes(filtersToWhereClause(filters));
          expect(sql.split(`COUNT("${column}")`).length - 1).toBe(filtered ? 2 : 1);
          expect(sql.split(`"${column}"`).length - 1).toBe(filtered ? 2 : 1);
        }
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('counts an embedding column in one ungrouped scan, with no work per value', async () => {
    const filters: Filter[] = [{ type: 'set', column: 'n', values: [1, 2, 3] }];
    const sql = nestedSummarySQL('t', 'emb', filters);
    const plan = (await bridge.query<{ explain_value: string }>(`EXPLAIN ${sql}`))
      .map((r) => r.explain_value)
      .join('\n');
    expect(plan).toContain('UNGROUPED_AGGREGATE');
    expect(plan).not.toMatch(/HASH_GROUP_BY|ORDER_BY|CAST/);

    // A loose bound on a loaded machine; it measures milliseconds.
    const started = performance.now();
    const data = await fetchNestedSummaryData('t', 'emb', filters, bridge);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(data.filtered).toEqual(expected('emb', (id) => [1, 2, 3].includes(nOf(id))));
  });

  it('quotes column and table names', async () => {
    await harness.conn.query(
      `CREATE TABLE "odd ""names""" AS SELECT CASE WHEN range = 0 THEN NULL ELSE [range] END AS "my ""list""" FROM range(3)`,
    );
    const data = await fetchNestedSummaryData('odd "names"', 'my "list"', [], bridge);
    expect(data).toEqual({ total: 3, nonNullCount: 2, filtered: null });
  });

  it('counts an empty relation as zero', async () => {
    await harness.conn.query(`CREATE TABLE empty_nested (l INTEGER[], s STRUCT(a INTEGER))`);
    const data = await fetchNestedSummaryData('empty_nested', 's', [], bridge);
    expect(data).toEqual({ total: 0, nonNullCount: 0, filtered: null });
  });

  it('reports a failed query as a QueryError naming the column', async () => {
    await expect(fetchNestedSummaryData('t', 'no_such_column', [], bridge)).rejects.toMatchObject({
      code: 'QUERY_RUNTIME',
      details: { column: 'no_such_column' },
    });
  });
});
