/**
 * Expressions a derived column cannot be, on real DuckDB.
 *
 * A derived column is a column of the VIEW, `SELECT *, (<expr>) AS "name"
 * FROM …`: one value for each row of the table. Validation bound the
 * expression alone, `SELECT (<expr>) FROM t`, which takes two kinds of
 * expression that break that.
 *
 * - One that returns several rows for a row, or none: `unnest(tags)`. The
 *   VIEW had more rows than the table, or fewer, and `__rowid__` repeated;
 *   `getCellValue` read one of a row's values, the grid's blocks stayed
 *   placeholders, and a filtered count read more rows than the table had.
 * - An aggregate: `sum(price)` binds alone, and not beside the other
 *   columns. The VIEW failed, and the column it was for stayed in the
 *   manager's list: every later add and extract failed, and so did the
 *   removal of any other derived column.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { DerivedColumnError } from '@/core/errors';

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
      (0::BIGINT, ['a', 'b'], 1.5::DOUBLE, 'x y', 1, {'x': 1.0, 'y': 2.0}),
      (1::BIGINT, ['c'], 2.5::DOUBLE, 'z', 1, {'x': 3.0, 'y': 4.0}),
      (2::BIGINT, []::VARCHAR[], 3.5::DOUBLE, 'w', 2, {'x': 5.0, 'y': 6.0})
    ) AS v(__rowid__, tags, price, name, g, point)`);
}, 30_000);

afterAll(async () => {
  await harness?.cleanup();
});

/** A table of its own, a copy of `source`, loaded in a fresh state. */
async function freshTable() {
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
    ...(column_name === '__rowid__' ? { system: true } : {}),
  }));
  const state = createTableState();
  state.tableName.set(name);
  state.baseTableName.set(name);
  state.totalRows.set(3);
  state.filteredRows.set(3);
  initializeColumnsFromSchema(state, schema);
  return { name, state, actions: new StateActions(state, bridge) };
}

type Table = Awaited<ReturnType<typeof freshTable>>;

/** How many rows the relation the table reads has, and how many distinct row ids. */
async function rowsOf(table: Table): Promise<{ rows: number; ids: number }> {
  const [row] = await bridge.query<{ rows: number; ids: number }>(
    `SELECT count(*) AS rows, count(DISTINCT __rowid__) AS ids FROM "${table.state.tableName.get()}"`,
  );
  return row!;
}

/** The derived columns the manager lists, and the ones DuckDB's relation has. */
async function derivedColumnsOf(table: Table): Promise<{ manager: string[]; duckdb: string[] }> {
  const manager = table.actions
    .getCompletionContext()
    .columns.filter((c) => c.isDerived)
    .map((c) => c.name);
  const described = await bridge.query<{ column_name: string }>(
    `DESCRIBE "${table.state.tableName.get()}"`,
  );
  const base = new Set(['__rowid__', 'tags', 'price', 'name', 'g', 'point']);
  const duckdb = described.map((r) => r.column_name).filter((name) => !base.has(name));
  return { manager, duckdb };
}

const SET_RETURNING = /several rows for each row, such as unnest\(\), cannot be a column/;
const AGGREGATE = /aggregates need a window to be a column/;

describe('an expression that returns several rows for a row', () => {
  it.each([
    'unnest(tags)',
    'unlist(tags)',
    "unnest(tags) || 'x'",
    'CASE WHEN price > 1 THEN unnest(tags) END',
    "unnest({'a': 1})",
    "unnest(string_split(name, ' '))",
    'generate_subscripts(tags, 1)',
  ])('is refused: %s', async (expression) => {
    const table = await freshTable();
    const added = await table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'tag',
      expression,
    });
    expect(added.success).toBe(false);
    expect(added.error).toMatch(SET_RETURNING);
    const validated = await table.actions.validateExpression(expression);
    expect(validated).toEqual({ valid: false, error: added.error });

    expect(table.state.schema.get().some((c) => c.name === 'tag')).toBe(false);
    expect(table.state.tableName.get()).toBe(table.name);
    expect(await rowsOf(table)).toEqual({ rows: 3, ids: 3 });
  });

  it('is refused as the new expression of an update or a replacement', async () => {
    const table = await freshTable();
    await expect(
      table.actions.addDerivedColumn({ kind: 'expression', name: 'tag', expression: 'tags[1]' }),
    ).resolves.toEqual({ success: true });

    const updated = await table.actions.updateDerivedColumn('tag', {
      kind: 'expression',
      name: 'tag',
      expression: 'unnest(tags)',
    });
    expect(updated.success).toBe(false);
    expect(updated.error).toMatch(SET_RETURNING);

    const replaced = await table.actions.replaceDerivedColumn('tag', {
      kind: 'expression',
      name: 'tag',
      expression: 'unnest(tags)',
    });
    expect(replaced.success).toBe(false);
    if (replaced.success) return;
    expect(replaced.error).toBeInstanceOf(DerivedColumnError);
    expect(replaced.error.code).toBe('EXPRESSION_INVALID');
    expect(replaced.error.message).toMatch(SET_RETURNING);

    // The column is as it was, one value for each row.
    expect(await rowsOf(table)).toEqual({ rows: 3, ids: 3 });
    expect(await table.actions.getColumnValues('tag')).toEqual(['a', 'c', null]);
  });

  it.each([
    'price * 2',
    'avg(price) OVER (PARTITION BY g)',
    'row_number() OVER ()',
    '[x FOR x IN tags]',
    'list_transform(tags, x -> upper(x))',
    '(SELECT max(u) FROM unnest(tags) AS x(u))',
    "COLUMNS('price') * 2",
  ])('takes one that returns one: %s', async (expression) => {
    const table = await freshTable();
    await expect(
      table.actions.addDerivedColumn({ kind: 'expression', name: 'c', expression }),
    ).resolves.toEqual({ success: true });
    expect(await rowsOf(table)).toEqual({ rows: 3, ids: 3 });
    expect(await table.actions.getColumnValues('__rowid__')).toEqual(
      new BigInt64Array([0n, 1n, 2n]),
    );
  });
});

describe('an aggregate', () => {
  it.each(['sum(price)', 'count(*)', 'price + sum(price)'])(
    'is refused, with what to write instead: %s',
    async (expression) => {
      const table = await freshTable();
      const added = await table.actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression,
      });
      expect(added.success).toBe(false);
      expect(added.error).toMatch(AGGREGATE);
      expect(await table.actions.validateExpression(expression)).toEqual({
        valid: false,
        error: added.error,
      });
      expect(await derivedColumnsOf(table)).toEqual({ manager: [], duckdb: [] });
    },
  );

  it('is taken with a window', async () => {
    const table = await freshTable();
    await expect(
      table.actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'sum(price) OVER ()',
      }),
    ).resolves.toEqual({ success: true });
    expect(await table.actions.getColumnValues('total')).toEqual(new Float64Array([7.5, 7.5, 7.5]));
  });

  it('leaves the derived columns working once refused', async () => {
    const table = await freshTable();
    await expect(
      table.actions.addDerivedColumn({ kind: 'expression', name: 'p2', expression: 'price * 2' }),
    ).resolves.toEqual({ success: true });
    const refused = await table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'total',
      expression: 'sum(price)',
    });
    expect(refused.success).toBe(false);

    // The next add, an extract, and the removal of another derived column.
    await expect(
      table.actions.addDerivedColumn({ kind: 'expression', name: 'p3', expression: 'price * 3' }),
    ).resolves.toEqual({ success: true });
    await expect(table.actions.addNestedFieldColumn('point', ['x'])).resolves.toEqual({
      success: true,
      name: 'point_x',
    });
    await table.actions.removeDerivedColumn('p2');
    expect(await derivedColumnsOf(table)).toEqual({
      manager: ['p3', 'point_x'],
      duckdb: ['p3', 'point_x'],
    });
    expect(await table.actions.getColumnValues('point_x')).toEqual(new Float64Array([1, 3, 5]));

    // A refused first derived column leaves the base table to read.
    const first = await freshTable();
    expect(
      (
        await first.actions.addDerivedColumn({
          kind: 'expression',
          name: 'total',
          expression: 'sum(price)',
        })
      ).success,
    ).toBe(false);
    expect(first.state.tableName.get()).toBe(first.name);
    await expect(
      first.actions.addDerivedColumn({ kind: 'expression', name: 'p2', expression: 'price * 2' }),
    ).resolves.toEqual({ success: true });
    await first.actions.removeDerivedColumn('p2');
    expect(first.state.tableName.get()).toBe(first.name);
  });
});
