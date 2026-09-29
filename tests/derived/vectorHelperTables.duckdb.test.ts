/**
 * Vector helper tables are named per derived-column manager, and a manager
 * is numbered per bridge. They were named by column alone, so two tables
 * sharing a bridge, each with a vector column `v`, shared one helper table:
 * the second add dropped and refilled the first's, and removing either
 * column took the other's values with it. A table that loads new data or
 * undoes a change gets a new manager, and a new name, too.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { DerivedColumnManager } from '@/derived/DerivedColumnManager';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;
let bridge: ReturnType<typeof makeNodeBridge>;

beforeAll(async () => {
  harness = await createNodeDuckDB();
  for (const name of ['t1', 't2', 't3']) {
    await harness.conn.query(
      `CREATE TABLE ${name} AS SELECT range::INTEGER AS id, range AS __rowid__ FROM range(3)`,
    );
  }
}, 30_000);

beforeEach(async () => {
  // A bridge of its own for each test, over the one database, which a test
  // that failed part-way may have left helper tables in.
  bridge = { ...makeNodeBridge(harness.conn), clearQueryCache: () => {} } as ReturnType<
    typeof makeNodeBridge
  >;
  for (const name of await helperTables()) await bridge.query(`DROP TABLE "${name}"`);
});

afterAll(async () => {
  await harness?.cleanup();
});

/** A table on the shared bridge, as `createDataTable({ bridge })` makes one. */
function tableOn(name: string) {
  const state = createTableState();
  state.tableName.set(name);
  state.baseTableName.set(name);
  state.totalRows.set(3);
  initializeColumnsFromSchema(state, [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  ]);
  return { state, actions: new StateActions(state, bridge) };
}

async function valuesOf(table: ReturnType<typeof tableOn>, column: string): Promise<unknown[]> {
  const rows = await bridge.query<{ v: unknown }>(
    `SELECT "${column}" AS v FROM "${table.state.tableName.get()}" ORDER BY __rowid__`,
  );
  return rows.map((row) => row.v);
}

async function helperTables(): Promise<string[]> {
  const rows = await bridge.query<{ name: string }>(
    `SELECT table_name AS name FROM duckdb_tables() WHERE table_name LIKE '__dt_vec_%' ORDER BY 1`,
  );
  return rows.map((row) => row.name);
}

const vector = (values: number[]) =>
  ({ kind: 'vector', name: 'v', vectorType: 'integer', values }) as const;

describe('vector helper tables on a shared bridge', () => {
  it('keeps each table its own values for a vector column of one name', async () => {
    const first = tableOn('t1');
    const second = tableOn('t2');

    await expect(first.actions.addDerivedColumn(vector([10, 20, 30]))).resolves.toEqual({
      success: true,
    });
    await expect(second.actions.addDerivedColumn(vector([7, 8, 9]))).resolves.toEqual({
      success: true,
    });
    expect(await valuesOf(first, 'v')).toEqual([10, 20, 30]);
    expect(await valuesOf(second, 'v')).toEqual([7, 8, 9]);

    await second.actions.removeDerivedColumn('v');
    expect(await valuesOf(first, 'v')).toEqual([10, 20, 30]);

    await first.actions.removeDerivedColumn('v');
    expect(await helperTables()).toEqual([]);
  });

  it('names the helper tables of two managers of one table apart', async () => {
    // A load that keeps the table name, or an undo, gives a table a new
    // manager: the DROPs the old one sends must not reach the new one's
    // helper table, however late they land.
    const previous = new DerivedColumnManager(bridge, 't3', () => 3);
    await previous.addColumn(vector([1, 2, 3]));
    const next = new DerivedColumnManager(bridge, 't3', () => 3);
    await next.addColumn(vector([4, 5, 6]));
    expect(await helperTables()).toEqual(['__dt_vec_0_v_0__', '__dt_vec_1_v_0__']);

    await previous.destroy();
    expect(await helperTables()).toEqual(['__dt_vec_1_v_0__']);
    await next.destroy();
    expect(await helperTables()).toEqual([]);
  });

  it('drops on destroy the helper table an add that failed part-way left', async () => {
    const manager = new DerivedColumnManager(bridge, 't1', () => 3);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // The table is created, and the INSERT fails on the value that is no integer.
      await expect(
        manager.addColumn({
          kind: 'vector',
          name: 'v',
          vectorType: 'integer',
          values: [1, 'not a number', 3] as unknown as number[],
        }),
      ).rejects.toThrow();
      expect(await helperTables()).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }

    await manager.destroy();
    expect(await helperTables()).toEqual([]);
  });
});
