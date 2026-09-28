/**
 * @vitest-environment jsdom
 *
 * Tables on a bridge they share, against DuckDB: what each leaves in the
 * database. `destroy()` dropped the base table but left the derived
 * columns' VIEW and every vector helper table behind, for as long as the
 * bridge lived. The multi-table guide says a table cleans up after itself.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type DataTable } from '@/index';
import type { SessionStore } from '@/persistence/SessionStore';

import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { makeNodeBridge } from './helpers/nodeBridge';

let harness: NodeDuckDBHarness;

beforeAll(async () => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  harness = await createNodeDuckDB();
}, 30_000);

afterAll(async () => {
  await harness?.cleanup();
});

beforeEach(async () => {
  for (const name of await objects()) {
    await harness.conn.query(`DROP VIEW IF EXISTS "${name}"`);
    await harness.conn.query(`DROP TABLE IF EXISTS "${name}"`);
  }
});

function sessionStore(): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

/** The library's tables and views in the database, derived ones and base ones alike. */
async function objects(): Promise<string[]> {
  const result = await harness.conn.query(
    `SELECT table_name AS name FROM duckdb_tables() WHERE table_name LIKE '__dt_%' OR table_name LIKE 'lt%'
     UNION ALL SELECT view_name FROM duckdb_views() WHERE view_name LIKE '__dt_%' ORDER BY 1`,
  );
  return result.toArray().map((row) => String(row.toJSON().name));
}

/**
 * A bridge the tables share, whose loads each make a table `lt<n>`, and
 * whose queries `hold` can stop until released.
 */
function sharedBridge() {
  const base = makeNodeBridge(harness.conn);
  let loads = 0;
  let gate: { match: (sql: string) => boolean; waiting: (() => void)[] } | null = null;
  const bridge = {
    ...base,
    query: async (sql: string) => {
      if (gate?.match(sql)) await new Promise<void>((resolve) => gate!.waiting.push(resolve));
      return base.query(sql);
    },
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
    loadData: async () => {
      const name = `lt${++loads}`;
      await harness.conn.query(
        `CREATE OR REPLACE TABLE ${name} AS SELECT range::INTEGER AS id, range AS __rowid__ FROM range(3)`,
      );
      return {
        tableName: name,
        rowCount: 3,
        columns: ['id'],
        schema: [{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }],
      };
    },
    dropTable: async (name: string) => {
      await harness.conn.query(`DROP TABLE IF EXISTS "${name}"`);
    },
  } as unknown as ReturnType<typeof makeNodeBridge>;
  const hold = (match: (sql: string) => boolean) => {
    const g = { match, waiting: [] as (() => void)[] };
    gate = g;
    return {
      held: () => g.waiting.length,
      release: () => {
        gate = null;
        for (const resolve of g.waiting.splice(0)) resolve();
      },
    };
  };
  return { bridge, hold };
}

async function tableOn(bridge: ReturnType<typeof makeNodeBridge>): Promise<DataTable> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge,
    persistence: { sessionStore: sessionStore() },
    presets: false,
    expressionFilter: false,
    visualizations: false,
    exportDialog: false,
  });
  await table.loadData('id\n1\n2', { sourceFormat: 'csv' });
  return table;
}

const vector = { kind: 'vector', name: 'v', vectorType: 'integer', values: [1, 2, 3] } as const;

describe('a table on a shared bridge leaves nothing behind', () => {
  it('when destroyed, with a vector column and an expression column', async () => {
    const { bridge } = sharedBridge();
    const table = await tableOn(bridge);
    await expect(table.actions.addDerivedColumn(vector)).resolves.toEqual({ success: true });
    await expect(
      table.actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' }),
    ).resolves.toEqual({ success: true });
    expect(await objects()).toEqual(['__dt_vec_0_v_0__', '__dt_view_lt1__', 'lt1']);

    await table.destroy();
    expect(await objects()).toEqual([]);
  });

  it('when destroyed while a vector add is still inserting', async () => {
    const { bridge, hold } = sharedBridge();
    const table = await tableOn(bridge);
    const insert = hold((sql) => sql.startsWith('INSERT INTO'));
    const add = table.actions.addDerivedColumn(vector);
    await vi.waitFor(() => expect(insert.held()).toBe(1));

    const destroying = table.destroy();
    // The add goes on to its end before the DROPs, so it cannot build its
    // helper table or VIEW again after them.
    insert.release();
    await destroying;
    await expect(add).resolves.toEqual({ success: false, error: 'DataTable is destroyed' });
    expect(await objects()).toEqual([]);
  });

  it('when its session is cleared, and when it loads new data', async () => {
    const { bridge } = sharedBridge();
    const table = await tableOn(bridge);
    const derivedChanges: unknown[] = [];
    table.on('derivedChange', (payload) => derivedChanges.push(payload));
    await table.actions.addDerivedColumn(vector);
    expect(derivedChanges).toHaveLength(1);

    await table.clearSession();
    // The derived columns went with the rest, and a SQL editor refreshing
    // its completions on `derivedChange` hears of it. The base table stays
    // queryable until the next load drops it.
    expect(await objects()).toEqual(['lt1']);
    expect(derivedChanges.at(-1)).toEqual({ derivedColumns: [], kind: 'updated' });

    await table.loadData('id\n1\n2', { sourceFormat: 'csv' });
    expect(await objects()).toEqual(['lt2']);
    await table.actions.addDerivedColumn(vector);
    await table.loadData('id\n1\n2', { sourceFormat: 'csv' });
    expect(await objects()).toEqual(['lt3']);

    await table.destroy();
    expect(await objects()).toEqual([]);
  });

  it('beside another table with a vector column of the same name', async () => {
    const { bridge } = sharedBridge();
    const first = await tableOn(bridge);
    const second = await tableOn(bridge);
    await first.actions.addDerivedColumn(vector);
    await second.actions.addDerivedColumn({ ...vector, values: [7, 8, 9] });

    await first.destroy();
    expect(await objects()).toEqual(['__dt_vec_1_v_0__', '__dt_view_lt2__', 'lt2']);
    const rows = await bridge.query<{ v: number }>(
      'SELECT v FROM "__dt_view_lt2__" ORDER BY __rowid__',
    );
    expect(rows.map((row) => row.v)).toEqual([7, 8, 9]);

    await second.destroy();
    expect(await objects()).toEqual([]);
  });
});
