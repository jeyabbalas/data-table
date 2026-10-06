/**
 * Derived columns of nested types, on real DuckDB.
 *
 * A derived column's type comes from `DESCRIBE SELECT (<expr>) AS v`, which
 * binds without reading a row: the `typeof()` it replaced read one, and on
 * an empty table had none, so every derived column there came out VARCHAR.
 * And two nested types are both `'nested'`: an edit from a STRUCT to a LIST
 * is a type change, and drops the filters on the column, though the
 * library's type stays the same.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;
let bridge: ReturnType<typeof makeNodeBridge>;

beforeAll(async () => {
  harness = await createNodeDuckDB();
  bridge = { ...makeNodeBridge(harness.conn), clearQueryCache: () => {} } as ReturnType<
    typeof makeNodeBridge
  >;
  await harness.conn.query(
    `CREATE TABLE full_t AS SELECT range::INTEGER AS id, range AS __rowid__ FROM range(3)`,
  );
  await harness.conn.query(`CREATE TABLE empty_t (id INTEGER, __rowid__ BIGINT)`);
}, 30_000);

afterAll(async () => {
  await harness?.cleanup();
});

function tableOn(name: string, rows: number) {
  const state = createTableState();
  state.tableName.set(name);
  state.baseTableName.set(name);
  state.totalRows.set(rows);
  initializeColumnsFromSchema(state, [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  ]);
  return { state, actions: new StateActions(state, bridge) };
}

const schemaOf = (table: ReturnType<typeof tableOn>, name: string) =>
  table.state.schema.get().find((c) => c.name === name);

describe('derived columns of nested types', () => {
  it('types an expression on an empty table by its DuckDB type', async () => {
    const table = tableOn('empty_t', 0);
    await expect(
      table.actions.addDerivedColumn({ kind: 'expression', name: 'pair', expression: '[id, id]' }),
    ).resolves.toEqual({ success: true });
    await expect(
      table.actions.addDerivedColumn({
        kind: 'expression',
        name: 'half',
        expression: 'id / 2',
      }),
    ).resolves.toEqual({ success: true });
    expect(schemaOf(table, 'pair')).toMatchObject({ type: 'nested', originalType: 'INTEGER[]' });
    expect(schemaOf(table, 'half')).toMatchObject({ type: 'float', originalType: 'DOUBLE' });
  });

  it.each([
    ["{'x': id, 'tags': ['a', 'b']}", 'STRUCT(x INTEGER, tags VARCHAR[])'],
    ["MAP {'k': id}", 'MAP(VARCHAR, INTEGER)'],
    ['[id, id]::INTEGER[2]', 'INTEGER[2]'],
    ['union_value(n := id)::UNION(n INTEGER, s VARCHAR)', 'UNION(n INTEGER, s VARCHAR)'],
    ['id::VARIANT', 'VARIANT'],
    ['to_json(id)', 'JSON'],
  ])('types %s as %s', async (expression, originalType) => {
    const table = tableOn('full_t', 3);
    await expect(
      table.actions.addDerivedColumn({ kind: 'expression', name: 'c', expression }),
    ).resolves.toEqual({ success: true });
    expect(schemaOf(table, 'c')).toMatchObject({
      type: originalType === 'JSON' ? 'string' : 'nested',
      originalType,
    });
    await table.actions.removeDerivedColumn('c');
  });

  it('drops the filters on a nested column whose DuckDB type an edit changes', async () => {
    const table = tableOn('full_t', 3);
    await table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'n',
      expression: "{'x': id}",
    });
    table.actions.addFilter({ type: 'not-null', column: 'n' });

    // Same DuckDB type: the filter stays.
    await table.actions.updateDerivedColumn('n', {
      kind: 'expression',
      name: 'n',
      expression: "{'x': id + 1}",
    });
    expect(table.state.filters.get()).toEqual([{ type: 'not-null', column: 'n' }]);

    // A STRUCT made a LIST: both 'nested', but the filter goes.
    await table.actions.updateDerivedColumn('n', {
      kind: 'expression',
      name: 'n',
      expression: '[id]',
    });
    expect(schemaOf(table, 'n')).toMatchObject({ type: 'nested', originalType: 'INTEGER[]' });
    expect(table.state.filters.get()).toEqual([]);

    // And through replaceDerivedColumn.
    table.actions.addFilter({ type: 'not-null', column: 'n' });
    const replaced = await table.actions.replaceDerivedColumn('n', {
      kind: 'expression',
      name: 'n',
      expression: "MAP {'k': id}",
    });
    expect(replaced.success).toBe(true);
    expect(table.state.filters.get()).toEqual([]);
    await table.actions.removeDerivedColumn('n');
  });
});
