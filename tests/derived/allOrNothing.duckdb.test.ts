/**
 * Every change the derived-column manager makes is all or nothing, on real
 * DuckDB: when the VIEW cannot be built for it, or any step before fails,
 * the manager keeps the columns, the VIEW and the helper tables it had.
 *
 * An add pushed its column onto the list before building the VIEW, and
 * left it there when the build failed: every later add was validated
 * against that phantom and failed, and no removal could take it out. A
 * removal dropped a vector column's helper table, and the column from the
 * list, before the build; and an update dropped the helper table before it
 * had validated the new definition, leaving a VIEW that read a table no
 * longer there.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DerivedColumnManager } from '@/derived/DerivedColumnManager';
import type { DerivedColumnDef } from '@/derived/types';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;
let bridge: ReturnType<typeof makeNodeBridge>;
/** Statements to refuse, once each, before DuckDB sees them. */
let refuse: RegExp[] = [];

const VIEW = '__dt_view_t__';

beforeAll(async () => {
  harness = await createNodeDuckDB();
  await harness.conn.query(
    `CREATE TABLE t AS SELECT range::INTEGER AS id, range AS __rowid__ FROM range(3)`,
  );
}, 30_000);

beforeEach(async () => {
  // A bridge of its own for each test, so that its manager is the first on
  // it, over the one database: drop what a test that failed part-way left.
  refuse = [];
  const base = makeNodeBridge(harness.conn);
  bridge = {
    ...base,
    async query<T>(sql: string): Promise<T[]> {
      const index = refuse.findIndex((pattern) => pattern.test(sql));
      if (index !== -1) {
        refuse.splice(index, 1);
        throw new Error('Binder Error: refused by the test');
      }
      return base.query<T>(sql);
    },
    clearQueryCache: () => {},
  } as ReturnType<typeof makeNodeBridge>;
  await harness.conn.query(`DROP VIEW IF EXISTS ${VIEW}`);
  for (const name of await helperTables()) await harness.conn.query(`DROP TABLE "${name}"`);
});

afterAll(async () => {
  await harness?.cleanup();
});

async function helperTables(): Promise<string[]> {
  const rows = await makeNodeBridge(harness.conn).query<{ name: string }>(
    `SELECT table_name AS name FROM duckdb_tables() WHERE table_name LIKE '__dt_vec_%' ORDER BY 1`,
  );
  return rows.map((row) => row.name);
}

/** Each derived column of the VIEW, with its values in row order; `null` without a VIEW. */
async function viewValues(): Promise<Record<string, unknown[]> | null> {
  const [exists] = await bridge.query<{ n: number }>(
    `SELECT count(*) AS n FROM duckdb_views() WHERE view_name = '${VIEW}'`,
  );
  if (!exists!.n) return null;
  const rows = await bridge.query<Record<string, unknown>>(
    `SELECT * EXCLUDE (id, __rowid__) FROM ${VIEW} ORDER BY __rowid__`,
  );
  const values: Record<string, unknown[]> = {};
  for (const row of rows) {
    for (const [name, value] of Object.entries(row)) (values[name] ??= []).push(value);
  }
  return values;
}

const names = (manager: DerivedColumnManager) => manager.getColumns().map((c) => c.def.name);

const expression = (name: string, expr: string): DerivedColumnDef => ({
  kind: 'expression',
  name,
  expression: expr,
});

const vector = (name: string, values: number[]): DerivedColumnDef => ({
  kind: 'vector',
  name,
  vectorType: 'integer',
  values,
});

describe('a change whose VIEW cannot be built', () => {
  it('adds nothing, the first derived column or a later one', async () => {
    const manager = new DerivedColumnManager(bridge, 't', () => 3);
    refuse = [/^CREATE OR REPLACE VIEW/];
    await expect(manager.addColumn(expression('a', 'id + 1'))).rejects.toThrow('refused');
    expect(names(manager)).toEqual([]);
    expect(manager.getEffectiveTableName()).toBe('t');
    expect(await viewValues()).toBeNull();

    await manager.addColumn(expression('a', 'id + 1'));
    refuse = [/^CREATE OR REPLACE VIEW/];
    await expect(manager.addColumn(vector('v', [7, 8, 9]))).rejects.toThrow('refused');
    expect(names(manager)).toEqual(['a']);
    expect(await viewValues()).toEqual({ a: [1, 2, 3] });
    // The helper table made for the vector column went with it.
    expect(await helperTables()).toEqual([]);

    // And the next add is validated against the columns there are.
    await manager.addColumn(expression('b', 'a * 10'));
    expect(await viewValues()).toEqual({ a: [1, 2, 3], b: [10, 20, 30] });
    await manager.destroy();
  });

  it('keeps the definition an update or a replacement was to change', async () => {
    const manager = new DerivedColumnManager(bridge, 't', () => 3);
    await manager.addColumn(expression('a', 'id + 1'));
    await manager.addColumn(vector('v', [7, 8, 9]));

    for (const change of [
      () => manager.updateColumn('a', expression('a', 'id + 100')),
      () => manager.updateColumn('a', expression('renamed', 'id + 100')),
      () => manager.replaceColumn('a', expression('a', 'id + 100')),
      () => manager.updateColumn('v', vector('v', [1, 1, 1])),
      () => manager.replaceColumn('v', vector('v', [1, 1, 1])),
      () => manager.updateColumn('v', expression('v', 'id * 0')),
      () => manager.replaceColumn('a', vector('a', [0, 0, 0])),
    ]) {
      refuse = [/^CREATE OR REPLACE VIEW/];
      await expect(change()).rejects.toThrow('refused');
      expect(names(manager)).toEqual(['a', 'v']);
      expect(await viewValues()).toEqual({ a: [1, 2, 3], v: [7, 8, 9] });
      expect(await helperTables()).toHaveLength(1);
    }
    await manager.destroy();
    expect(await helperTables()).toEqual([]);
  });

  it('removes nothing, and keeps the helper table of a vector column', async () => {
    const manager = new DerivedColumnManager(bridge, 't', () => 3);
    await manager.addColumn(vector('v', [7, 8, 9]));
    await manager.addColumn(expression('a', 'id + 1'));

    refuse = [/^CREATE OR REPLACE VIEW/];
    await expect(manager.removeColumn('v')).rejects.toThrow('refused');
    expect(names(manager)).toEqual(['v', 'a']);
    expect(await viewValues()).toEqual({ v: [7, 8, 9], a: [1, 2, 3] });

    // The last one, whose removal drops the VIEW.
    await manager.removeColumn('a');
    refuse = [/^DROP VIEW/];
    await expect(manager.removeColumn('v')).rejects.toThrow('refused');
    expect(names(manager)).toEqual(['v']);
    expect(manager.getEffectiveTableName()).toBe(VIEW);
    expect(await viewValues()).toEqual({ v: [7, 8, 9] });

    await manager.removeColumn('v');
    expect(await viewValues()).toBeNull();
    expect(await helperTables()).toEqual([]);
  });
});

describe('an update that fails before the VIEW is built', () => {
  it('keeps the helper table of the vector column it was to change', async () => {
    const manager = new DerivedColumnManager(bridge, 't', () => 3);
    await manager.addColumn(vector('v', [7, 8, 9]));

    const [helper] = await helperTables();

    // Values of the wrong length, an expression that does not bind, values
    // that are no integers.
    await expect(manager.updateColumn('v', vector('v', [1, 2]))).rejects.toMatchObject({
      code: 'VECTOR_LENGTH_MISMATCH',
    });
    await expect(manager.updateColumn('v', expression('v', 'nope * 2'))).rejects.toThrow('nope');
    await expect(
      manager.replaceColumn('v', vector('v', [1, 'x', 3] as unknown as number[])),
    ).rejects.toThrow();

    expect(names(manager)).toEqual(['v']);
    expect(await viewValues()).toEqual({ v: [7, 8, 9] });
    // The table the last one made, part-way, is left for the next change.
    expect(await helperTables()).toEqual([helper, expect.any(String)]);

    await manager.updateColumn('v', vector('v', [4, 5, 6]));
    expect(await viewValues()).toEqual({ v: [4, 5, 6] });
    expect(await helperTables()).toHaveLength(1);
    expect(await helperTables()).not.toContain(helper);

    // And into an expression column.
    await manager.updateColumn('v', expression('v', 'id * 0'));
    expect(await viewValues()).toEqual({ v: [0, 0, 0] });
    expect(await helperTables()).toEqual([]);
    await manager.destroy();
  });
});

describe('a restore', () => {
  it('restores the columns that can be, around one whose VIEW cannot be built', async () => {
    const manager = new DerivedColumnManager(bridge, 't', () => 3);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // The VIEW with b is refused.
      refuse = [/^CREATE OR REPLACE VIEW .*"b"/];
      const restored = await manager.restoreColumns([
        expression('a', 'id + 1'),
        expression('b', 'id + 2'),
        vector('v', [7, 8, 9]),
      ]);
      expect(restored.map((schema) => schema.name)).toEqual(['a', 'v']);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
    expect(names(manager)).toEqual(['a', 'v']);
    expect(await viewValues()).toEqual({ a: [1, 2, 3], v: [7, 8, 9] });
    await manager.destroy();
  });
});
