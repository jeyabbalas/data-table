/**
 * The filters on a derived column across an edit of its expression, on real
 * DuckDB: kept when the edit cannot change how DuckDB reads their values,
 * dropped when it can.
 *
 * Only a change of the library's type dropped them, or, between two nested
 * types, of the DuckDB type. Edited from VARCHAR to JSON, both `'string'`,
 * a column kept a set filter `['active']` from a value-count bar, which
 * DuckDB then cast to JSON: every grid, count and chart query failed with
 * `Conversion Error: Malformed JSON` until the filter was removed. A BIT,
 * BIGNUM or GEOMETRY column did the same.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { filtersToWhereClause } from '@/filters/FilterSQL';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;
let bridge: ReturnType<typeof makeNodeBridge>;
let tables = 0;

beforeAll(async () => {
  harness = await createNodeDuckDB();
  bridge = { ...makeNodeBridge(harness.conn), clearQueryCache: () => {} } as ReturnType<
    typeof makeNodeBridge
  >;
  await harness.conn.query(`
    CREATE TABLE source AS SELECT * FROM (VALUES
      (0::BIGINT, '{"status": "active"}', 3, 1.25::DECIMAL(10,2), 0.5::DOUBLE),
      (1::BIGINT, '{"status": "gone"}', 30, 2.50::DECIMAL(10,2), 1.5::DOUBLE)
    ) AS v(__rowid__, payload, n, d, f)`);
}, 30_000);

afterAll(async () => {
  await harness?.cleanup();
});

/** A table of its own, a copy of `source`, with a derived column `c` of `expression`. */
async function tableWith(expression: string) {
  const name = `t${++tables}`;
  await harness.conn.query(`CREATE TABLE ${name} AS SELECT * FROM source`);
  const described = await bridge.query<{ column_name: string; column_type: string }>(
    `DESCRIBE ${name}`,
  );
  const schema: ColumnSchema[] = described.map(({ column_name, column_type }) => ({
    name: column_name,
    type: mapDuckDBType(column_type),
    nullable: true,
    originalType: column_type,
  }));
  const state = createTableState();
  state.tableName.set(name);
  state.baseTableName.set(name);
  state.totalRows.set(2);
  state.filteredRows.set(2);
  initializeColumnsFromSchema(state, schema);
  const actions = new StateActions(state, bridge);
  await expect(
    actions.addDerivedColumn({ kind: 'expression', name: 'c', expression }),
  ).resolves.toEqual({ success: true });
  return { state, actions };
}

type Table = Awaited<ReturnType<typeof tableWith>>;

const typeOf = (table: Table) =>
  table.state.schema.get().find((column) => column.name === 'c')?.originalType;

/** The rows the filters keep, counted as the filtered-row count is: it fails when they do. */
async function filteredCount(table: Table): Promise<number> {
  const where = filtersToWhereClause(table.state.filters.get());
  const [row] = await bridge.query<{ n: number }>(
    `SELECT count(*) AS n FROM "${table.state.tableName.get()}"${where ? ` WHERE ${where}` : ''}`,
  );
  return row!.n;
}

/** Edit `c` to `expression`, by an update or by a replacement. */
async function edit(table: Table, by: 'update' | 'replace', expression: string): Promise<void> {
  const def = { kind: 'expression', name: 'c', expression } as const;
  const result =
    by === 'update'
      ? await table.actions.updateDerivedColumn('c', def)
      : await table.actions.replaceDerivedColumn('c', def);
  expect(result.success).toBe(true);
}

const STATUS = `json_extract_string(payload, '$.status')`;

describe.each(['update', 'replace'] as const)('a derived column edited by an %s', (by) => {
  it.each<[string, string, string, Filter]>([
    [
      'JSON',
      `json_extract(payload, '$.status')`,
      'JSON',
      { type: 'set', column: 'c', values: ['active'] },
    ],
    ['JSON', 'to_json(n)', 'JSON', { type: 'point', column: 'c', value: 'active' }],
    ['BIT', `CAST('101' AS BIT)`, 'BIT', { type: 'not-set', column: 'c', values: ['active'] }],
    ['BIGNUM', 'CAST(n AS BIGNUM)', 'BIGNUM', { type: 'point', column: 'c', value: 'active' }],
    [
      'GEOMETRY',
      `CAST('POINT (1 2)' AS GEOMETRY)`,
      'GEOMETRY',
      { type: 'point', column: 'c', value: 'active' },
    ],
  ])('drops the filters on it when VARCHAR becomes %s: %s', async (_to, after, type, filter) => {
    const table = await tableWith(STATUS);
    table.actions.addFilter(filter);
    expect(await filteredCount(table)).toBe(1);

    await edit(table, by, after);
    expect(typeOf(table)).toBe(type);
    expect(table.state.filters.get()).toEqual([]);
    expect(await filteredCount(table)).toBe(2);
  });

  it('drops the filters on it when DOUBLE becomes FLOAT, which compares a value otherwise', async () => {
    const table = await tableWith('f * 2');
    table.actions.addFilter({ type: 'point', column: 'c', value: 1 });
    expect(await filteredCount(table)).toBe(1);

    await edit(table, by, 'CAST(f * 2 AS FLOAT)');
    expect(typeOf(table)).toBe('FLOAT');
    expect(table.state.filters.get()).toEqual([]);
  });

  it.each<[string, string, string, string, Filter, number]>([
    [
      'n * 2',
      'INTEGER',
      'n * 2::BIGINT',
      'BIGINT',
      { type: 'range', column: 'c', min: 10, max: 100 },
      1,
    ],
    [
      'n::BIGINT',
      'BIGINT',
      'n::SMALLINT',
      'SMALLINT',
      { type: 'point', column: 'c', value: 30 },
      1,
    ],
    [
      'd * 1.0',
      'DECIMAL(12,3)',
      'd * 1.00',
      'DECIMAL(13,4)',
      { type: 'range', column: 'c', min: 2, max: 3 },
      1,
    ],
    [
      STATUS,
      'VARCHAR',
      `upper(${STATUS})`,
      'VARCHAR',
      { type: 'set', column: 'c', values: ['ACTIVE'] },
      1,
    ],
  ])(
    'keeps the filters on it across %s (%s) made %s (%s)',
    async (before, typeBefore, after, typeAfter, filter, kept) => {
      const table = await tableWith(before);
      expect(typeOf(table)).toBe(typeBefore);
      table.actions.addFilter(filter);

      await edit(table, by, after);
      expect(typeOf(table)).toBe(typeAfter);
      expect(table.state.filters.get()).toEqual([filter]);
      expect(await filteredCount(table)).toBe(kept);
    },
  );
});
